//"use strict";
const console = require('../stdio.js').Get('bin/console', { minLevel: 'verbose' });	// verbose debug log
const _ = require('lodash');
const { formatSize, promisifyEmitter, makeInspect } = require('../utility.js');
const inspect =	makeInspect({ depth: 1, compact: true });
const inspectPretty = makeInspect({ depth: 4, compact: false });
const fs = require('../fs.js');
const Q = require('../q.js');
const mongoose = require('mongoose');
const app = require('../app.js');
const artefactSchema = require('../artefact-schema.js');
// const artefactMakeModel = require('../artefact-model.js');

const doFsScan = function(scan, promiseTransform) {

	console.log(`FS scan maxDepth=${scan.maxDepth} path='${scan.path}'`);
	
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

/* const groove = require('groove');
groove.open("danse-macabre.ogg", function(err, file) {
  if (err) throw err;
  console.log(file.metadata());
  console.log("duration:", file.duration());
  file.close(function(err) {
    if (err) throw err;
  });
});
*/

var scanParameters = [
	{ path: '/home', maxDepth: 3 }
	// { path: '/mnt/wheel/Trapdoor/mystuff/Moozik', maxDepth: 0 },
	// { path: '/media/jk/Storage/', maxDepth: 0 }
	// { path: '/', maxDepth: 4 }
];
// var writers = {};


artefactModel = mongoose.model('fs', artefactSchema
// new mongoose.Schema({
	// audio: require('../schemas/audio.js'),
	// filesystem: require('../schemas/filesystem.js')
// })
.plugin(require('../schemas/filesystemplugin.js')));

console.verbose(`artefactModel = ${inspectPretty(artefactModel)}`);

app.runTask(function appMain() {

	console.log(`${scanParameters.length} FS scan targets: ${inspectPretty(scanParameters)}`);
	console.debug(`app.models = ${inspect(app.models, { compact: false, depth: 3})}`);

	return Q.allSettled(scanParameters.map(scan =>

		doFsScan(scan, data =>
			artefactModel.findOrCreate("file", { "file.path": data.path }, { path: data.path, fileType: data.type, stats: data.stats })
			/* app.models.filesystem.create({ data:*/
			/* (new (app.artefact)({
				data: { path: {
					path: data.path,
					fileType: data.type,
					stats: data.stats
				} }
			})))*/
			// .then(data => data.type === 'file' ? data.ensureCurrentHash() : data)
			/*	.then(file => app.models.audio.validFileExtensions.indexOf(file.extension) < 0 ? file
					:	Q.nfcall(groove.open, "danse-macabre.ogg")
						.then(audio => app.models.audio.findOrCreate({ filedId: file._id }, _.assign({ fileId: file._id }, audio)))
						.then(audio => audio.bulkSave()))
					.then(audio => file)*/
			.then(data => data.bulkSave())
			.catch(err => { app.onWarning(err, `models.${data.type} '${data.path}' op error`); }) )
	
		.then(() => {
			app.markPoint(`streamFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true);
			console.log(`Testing unmodified FS DB entries for existence...`)
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

		// .then(() => {
		// 	app.markPoint(`deleteFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true);
		// 	console.log(`Scanning DB for .wav files`);
		// 	return app.models.fs.file.aggregate()
		// 	.option({ allowDiskUse: true })
		// 	.matchExtension('.wav')
		// 	.cursor({ batchSize: 20 })
		// 	.exec().eachAsync(wavFile => {
		// 		app.models.audio.findOrCreate({fileId: wavFile._id}, { fileId: wavFile._id })
		// 		.then(audio => {
		// 			console.debug(`audio: ${inspect(audio, { depth: 2, compact: true })}`);
		// 			return audio.bulkSave();
		// 		})
		// 		.catch(err => app.onWarning(err, 'audio.findOrCreate.save error')).done();
		// 	})
		// 	.tap(() => app.markPoint(`audioFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true));
		// })

	))

	.tap(() => app.markPoint('Finished processing all FS scans'));

}, {
	// debug
	interval: 30000,	// delay between calling the debug fn below
	doImmediate: true,	// runs the debug fn immediately on task start, without waiting for interval
	fn(prefix = '') { console.verbose(`---- stats ---- ${prefix}\napp.artefact.stats: ${inspect (artefactModel.stats)}\n`); }
});
