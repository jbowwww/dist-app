"use strict";
const console = require('../stdio.js').Get('bin/console', { minLevel: 'debug' });	// verbose debug log
const promisifyEmitter = require('../utility.js').promisifyEmitter;
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: true /* false */ });
const inspectPretty = require('../utility.js').makeInspect({ depth: 2, compact: false });
const formatSize = require('../utility.js').formatSize;
const _ = require('lodash');
const mixin = require('../utility.js').mixin;
const fs = require('../fs.js');
const mongo = require ('../mongo.js');
const objStream = mixin(require('through2'), {
	// spy: require('through2-spy'),
	// filter: require('through2-filter')
}).obj;
const Q = require('../q.js');
const app = require('../app.js');

var scanParameters = [
	{ path: '/mnt/wheel/Trapdoor', maxDepth: 0 },
	{ path: '/home', maxDepth: 0 }
];
var writers = {};

app.runTask(function appMain() {
	var startTime = new Date();
	// writers = _.mapValues(app.models.fs, (model, modelName) => model.bulkWriter({ asyncTimeResolution: 1200 }).asStream());
	app.status = {
		file: { current: { path: '' }, totals: { size: 0, count: 0, inc(size) { this.count++; this.size += size; } } },
		dir: { current: { path: '' }, totals: { size: 0, count: 0, inc(size) { this.count++; this.size += size; } } },
		unknown: { current: { path: '' }, totals: { size: 0, count: 0, inc(size) { this.count++; this.size += size; } } }
	};
	console.log(`${scanParameters.length} FS scan targets: ${inspectPretty(scanParameters)}`);
	return Q.all(scanParameters.map((scan, scanIndex) => Q.Promise((resolve, reject) => {
		console.log(`Scanning FS to depth=${scan.maxDepth} at '${scan.path}' ...`);
		fs.iterate(scan.path, scan)
		.on('end', () => app.markPoint('fsIterEnd', false))
		.pipe(objStream((data, enc, cb) => {
			app.status[data.type].totals.inc(data.stats.size || 0)
			app.models.fs.fs.findOrCreate({ type: data.type, path: data.path, isDeleted: { '$ne': true } }, data)
			.then(data => data.type === 'file' ? data.ensureCurrentHash() : data)
			.then(data => data.save())	//writers[data.type] /*, cb */); process.nextTick(cb); })		// doesn't seem to work if i pass cb to data.store() to use as a callback... nfi why..
			.catch(err => app.onWarning(err, `models.${data.type} op error`))
			.then(() => cb())
			.done();
		}))
		.on('finish', () => {
			app.markPoint('streamFinish', false);
			resolve(startTime);
		})
		.on('error', err => app.onWarning(err, 'through2 stream error'));
	}).then(() => {
		console.log(`Testing unmodified FS DB entries for existence...`)
		var deleted = {file: 0, dir: 0 };
		var unchanged = { file: 0, dir: 0 };
		var pathRegex = new RegExp(`^${(scan.path).replace(/\//, '\\/')}\/.*$`);
		console.verbose(`DB path Regex: new RegExp( ${pathRegex.toString()} )`);
		return Q.all([ 'file', 'dir' ].map(dataType => {
			return promisifyEmitter(app.models.fs[dataType].find({
				path: pathRegex,
				updatedAt: { $lte: app.timestamps.start },
				isDeleted: { $ne: true }
			})//, { $set: { deleted: true }})
			.cursor()
			.on('data', deletedFile => {
				console.debug(`testing [${dataType}] ${deletedFile.path}`)
				if (!fs.existsSync(deletedFile.path)) {//}, exists => {
					// if (!exists) {
						console.verbose(`DB record marked deleted: ${deletedFile.path}`);
						deletedFile.deleted = true;
						deletedFile.store(writers[dataType]);//save();
						deleted[dataType]++;
					} else {
						unchanged[dataType]++;
					}
				// });
			}));
		})).then(() => {
			console.log(`DB records marked deleted: deleted=${inspect(deleted)} unchanged=${inspect(unchanged)}`);
		});
	})))
	.then(() => { console.log(`Finished processing all paths`); app.markPoint('writers'); })
	.then(() => Q.all(_.values(writers).map(writer => writer.endWait())))
	.then(() => { console.verbose(`Closed writers`); app.markPoint('writers'); });

}, {
	//debug
	interval: 40000,
	fn(prefix = '') {
		console.verbose(`---- stats ---- ${prefix}\napp.models.fs.dir.stats: ${inspect(app.models.fs.dir.stats)}\napp.models.fs.file.stats: ${inspect(app.models.fs.file.stats)}\napp.status: ${inspect(app.status)}\n${app.timestamps}\n-- end stats --\n`);	//\n${writers.file._getDebug()}\n${writers.dir._getDebug()}
	}
});

				/*
				//1708130509: Another syntax I might work on but too hard rn
				// models.masterFiles.updateOrCreate(file).ensureCurrentHash().batchWrite().updateOne()

				// 1708111236: query helper syntax
				// find().findFile(file).hasHash().older(60*60*1000).then(file => {	//post('ensureCurrentHash')

				// 1708111235: This working, trying above
				// note: requires: var file = data;	// NOT new models.masterFiles(data);
				// models.masterFiles.updateOrCreate(file)
					// .then(file2 => file2.ensureCurrentHash())
					// .then(file => {	//post('ensureCurrentHash')
					// console.debug(`f: save success: doc=${inspect(file)} isNew=${file.isNew} isUpdated=${file.isUpdated}`);
					// masterFiles_updateOne.write(file, cb);
				// }).done();

				// 1708111235: 'Original' (previous) manual method of doing the hashing update logic
				// models.masterFiles.findByPathWithCurrentHash(data.path, data.stats.mtime).then(file => {
					// console.debug(`findPathWithHash: file=${inspect(file)}`);
					// if (file) {							// found a doc with matching path, a hash value, and a __ts_u not older than stats.ctime
						// stats.hashValid++;		// in *theory* those conditions should mean file contents or stats haven't changed, but practically could happen
						// return cb();
					// }
					// file = data;						// didn't find suitable
					// fs.hash(file.path).then(hash => {
						// file.hash = hash;
						// stats.hashComputed++;
						// masterFiles_updateOne.write(file, cb);
					// })
					// .catch(err => onError(err, `Error hashing '${data.path}': ${err.stack||err}`, cb)).done();
				// })
				// .catch(err => onError(err, `Error querying file '${data.path}': ${err.stack||err}`, cb)).done();
				*/

			// this getWriteOp should be dealt with less verbosely/elsewhere
			// 2 key bits of info that must be mapped correctly:
			//		. the type of bulkWriter Op(eg update[one],insert[one][many] etc) needed - that is this code's responsibility to choose
			//			- the type chosen mostly determines the "shape" of this op, ie { updateOne: { filter: $filter, update: data , upsert: $upsert } }
			//			- one or both $filter and $upsert could  also be entirely dictated from this =ode however conce8ivably could potentially be ....
			//		. the model that bw is building on - already captured
			// so yeh, how the fuck u wanna try this expressive stuff this time??
