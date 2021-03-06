//"use strict";
const console = require('../stdio.js').Get('bin/console', { minLevel: 'verbose' });	// verbose debug log
const _ = require('lodash');
const { formatSize, promisifyEmitter, makeInspect } = require('../utility.js');
const inspect =	makeInspect({ depth: 1, compact: true });
const inspectPretty = makeInspect({ depth: 2, compact: false });
const fs = require('../fs.js');
const Q = require('../q.js');
const mongoose = require('mongoose');
const app = require('../app.js');

const artefactMakeModel = require('../schemas/artefact.js');
artefactModel = artefactMakeModel('fs', {
	fs: require('../schemas/fs'),
	audio: require('../schemas/audio.js')
});

/*artefactSchema.path('file').validate(function(v) {
	console.log(`artefactSchema.path('file').validate(${inspect(v)})`);
	if (v.fileType === 'file' && (!v.hash || !file.updatedAt || file.isModified('stats.mtime') || (file.updatedAt < (file.stats.mtime)))) {
		return fs.hash(v.path).then(hash => v.hash = hash).then(() => v);
	}
	this./*$parent.* /audio = { length: 100 };
	return true;
});*/

console.debug(`artefactModel = ${inspectPretty(artefactModel)}`);
console.verbose(`mongoose.modelNames() = ${inspectPretty(mongoose.modelNames())}`);

function doFsScan(scan, promiseTransform) {
	console.verbose(`FS scan maxDepth=${scan.maxDepth} path='${scan.path}'`);
	return Q.Promise((resolve, reject) => {	
		fs.iterate(scan.path, scan).pipe(new require('stream').Writable({
			objectMode: true,
			write(data, encoding, callback) {
				promiseTransform(data)
				.then(newData => { callback(null, newData); })
				.catch(err => { callback(err); })
				.done();
			}
		}))
		.on('error', err => { app.onWarning(err, `doFsScan.error: (maxDepth=${scan.maxDepth} path='${scan.path}'`); })
		.on('finish', () => {
			app.markPoint(`doFsScan.end (maxDepth=${scan.maxDepth} path='${scan.path}')`);
			resolve();
		});	
	});	
};

app.runTask(function appMain() {

	var scanParameters = [
		{ path: '/home', maxDepth: 3 }
		// { path: '/mnt/wheel/Trapdoor/mystuff/Moozik', maxDepth: 0 },
		// { path: '/media/jk/Storage/', maxDepth: 0 }
		// { path: '/', maxDepth: 4 }
	];

	console.log(`${scanParameters.length} FS scan targets: ${inspectPretty(scanParameters)}`);

	return Q.allSettled(scanParameters.map(scan =>

		// 180902 TODO: Make this app logic more declarative
		// Define the app/task-specific artefact logic (e.g. file/audio scenario) by creating a new artefactSchema instance
		// and adding the desired custom artefact data types as members (see above, "schemas" variable used for artefactSchema.plugin())
		// These types can utilise suitable hooks/middleware/events on the model/schema to listen for create/update/delete/..? of
		// artefacts and/or other custom artefact data type instances associated with them.
		// The app-specific artefactSchema instance is used to construct the model (and therefore mongo db collection) used by
		// the application/task/library/suite/domain/other scenario.

		// 180909 OK so new approach. The file system scan(s) by doFsScan will be one, separate, distinct, standalone task.
		// All it does is scan for fs entries (files&dirs) and uses findOrCreate to save them to the DB
		// (TODO: Decide if hash should be called before saving to DB, or whether should save to DB then populate hashes separately, perhaps only selectively depending on file characteristics eg size, extension)
		// Once the fsEntry (ie file or dir) objects are created, they can be periodically queried (using aggregation is probably best) by other data types -
		// e.g. audio would want fs.fileType=='file', audio.fileExtensions.contains(fs.extension)
		// it would also want (perhaps handled somehwat automatically by some of my plumbing code) to ignore artefacts where data.audio._ts
		doFsScan(scan, data => artefactModel.artefactTypes.fs.findOrCreate({ "path": data.path }, data)
			.then(data => data.fs.fileType !== 'file' ?	data
			: 	data.fs.ensureCurrentHash()
			 	.then(data => artefactModel.artefactTypes.audio.fileExtensions.indexOf(data.fs.extension.toLowerCase()) < 0 ? data
			 	: 	!data.audio || data.isNew || data.isModified('file')
			 		?	_.assign(data, { audio: { length: 100 }}).audio.loadMetadata()
			 		: 	data 	)	)
			.then(data => data.bulkSave())
			.catch(err => { app.onWarning(err, `models.${data.type} '${data.path}' op error`); }) )
	
		.then(() => {
			console.verbose(`Testing unmodified FS DB entries for existence...`)
			var pathRegex = new RegExp(`^${(scan.path).replace(/\//, '\\/')}(\\/[^\/]*){1,${scan.maxDepth === 0 ? '' : scan.maxDepth}}$`);
			var query = {
				path: {
					path: pathRegex,
					$and: [ { updatedAt: { $lte: app.timestamps.start.toISOString() } }, { checkedAt: { $lte: app.timestamps.start.toISOString() } } ],
					isDeleted: { $ne: true }
				}
			};
			console.debug(`query: ${inspectPretty(query)}`);	//DB path Regex: new RegExp( ${pathRegex.toString()} )\napp.timestamps.start: ${app.timestamps.start} , ${app.timestamps.start.toISOString()}`);
			return promisifyEmitter(
				// app.models.fs.fs
				app.artefact.find(query)
				.cursor()
				.on('data', deletedFile => {
					console.debug(`testing [${deletedFile.type}] ${deletedFile.path}`)
					if (!fs.existsSync(deletedFile.path)) {
						deletedFile.markDeleted()
						.then(() => deletedFile.bulkSave())
						.tap(deletedFile => console.debug(`DB record marked deleted: ${deletedFile.path}`))
						.catch(err => app.onWarning(err, `deletedFile.markDeleted error for '${deletedFile.path}'`))
						.done();
					} else {
						console.debug(`DB record tested and still exists`);
					}				// 180120: Might have troubles with deletedFile.markDeleted().save() promise not having fulfilled but surrounding
									// app.models.fs.fs.find has fulfilled, proceeding to next below lines and app/task exit
				}) )
			.delay(2500);			//.then(() => {	// delay() is hack workaround because resolves on end of find() cursor, not after markDeleted() calls
		})

		/*.then(() => {
			app.markPoint(`deleteFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true);
			console.log(`Scanning DB for .wav files`);
			return app.models.fs.file.aggregate()
			.option({ allowDiskUse: true })
			.matchExtension('.wav')
			.cursor({ batchSize: 20 })
			.exec().eachAsync(wavFile => {
				app.models.audio.findOrCreate({fileId: wavFile._id}, { fileId: wavFile._id })
				.then(audio => {
					console.debug(`audio: ${inspect(audio, { depth: 2, compact: true })}`);
					return audio.bulkSave();
				})
				.catch(err => app.onWarning(err, 'audio.findOrCreate.save error')).done();
			})
			.tap(() => app.markPoint(`audioFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true));
		})*/

	))

	.tap(() => app.markPoint('Finished processing all FS scans'));

}, {
	// debug
	interval: 13000,	// delay between calling the debug fn below
	doImmediate: true,	// runs the debug fn immediately on task start, without waiting for interval
	fn(prefix = '') { console.verbose(`---- stats ---- ${prefix}${artefactModel.stats.format(1)}`); }
});
