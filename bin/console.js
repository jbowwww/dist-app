//"use strict";
const console = require('../stdio.js').Get('bin/console', { minLevel: 'debug' });	// verbose debug log
const _ = require('lodash');
const promisifyPipeline = require('../utility.js').promisifyPipeline;
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: true /* false */ });
const inspectPretty = require('../utility.js').makeInspect({ depth: 4, compact: false });
const { formatSize, promisifyEmitter } = require('../utility.js');//.formatSize;
// const mixin = require('../utility.js').mixin;
const fs = require('../fs.js');
const Q = require('../q.js');
const app = require('../app.js');
const objStream = require('through2').obj;
const doFsScan = function(scan, promiseTransform) {
	console.log(`FS scan maxDepth=${scan.maxDepth} path='${scan.path}'`);
	// return promisifyEmitter(
	return Q.Promise((resolve, reject) => {
		fs.iterate(scan.path, scan).pipe(new require('stream').Writable({
			objectMode: true,
			write(data, encoding, callback) {
				promiseTransform(data)
				.then(newData => {
				 // process.nextTick(() => {
				  callback(null, newData);
				   // });
				    })
					// console.verbose(`promiseTransform.then(): newData=${newData}`);
					// process.nextTick(() => 
					// this.push(newData);
				 	// cb(null,newData);
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

/*
const groove = require('groove');
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
	// { path: '/mnt/wheel/Trapdoor/mystuff/Moozik', maxDepth: 0 },
	// { path: '/home', maxDepth: 2 }
	// { path: '/home', maxDepth: 0 },
	// { path: '/mnt/wheel/Trapdoor', maxDepth: 0 },
	// { path: '/media/jk/System Image/', maxDepth: 0 },
	// { path: '/media/jk/Storage/', maxDepth: 0 }
	// { path: '/', maxDepth: 4 }
	{ path: '/home', maxDepth: 2 }
	// { path: '/mnt/wheel/Trapdoor', maxDepth: 1 },
	// { path: '/media/jk/System Image/', maxDepth: 1 },
	// { path: '/media/jk/Storage/', maxDepth: 1 }
];
var writers = {};

app.runTask(function appMain() {
/*	app.status = _.create({
		update(current) {
			if (typeof current !== 'object') { current = {}; }
			current = _.defaults(current, { type: 'blank', path: 'blank' });
			console.debug(`app.status.update( { type: '${current.type}', .., path: '${current.path}' } )`);
			if (!current.type) {
				console.error(`app.status.update: current should be a fs.iterate data item with a 'type' property`);
			} else {
				if (!this[current.type]) {
					this[current.type] = { current: { path: '' }, totals: { size: 0, count: 0, deletedSize: 0, deletedCount: 0 } };
				}
				this[current.type] = current;
				this[current.type].totals.count++;
				this[current.type].totals.size += current.stats.size || 0;
			}
			return current;
		},
		deleted(current) {
			console.debug(`app.status.delete( { type: '${current.type}', .., path: '${current.path}' } )`);
			if (!current.type || !current.deletedAt) { //isDeleted) {
				console.error(`app.status.update: current should be a fs.iterate data item with a 'type' property and marked deleted : ${inspect(current, { compact: false })}`);
			} else {
				if (!this[current.type]) {
					this[current.type] = { current: { path: '' }, totals: { size: 0, count: 0, deletedSize: 0, deletedCount: 0 } };
				}
				this[current.type].totals.deletedCount++;
				this[current.type].totals.deletedSize += current.stats.size || 0;
			}
			return current;
		}
	});*/
	console.log(`${scanParameters.length} FS scan targets: ${inspectPretty(scanParameters)}`);
	return Q.allSettled(scanParameters.map(scan =>
		doFsScan(scan, data =>
			app.models.fs.fs.findOrCreate({ type: data.type, path: data.path, isDeleted: { '$ne': true } }, data)
			.then(data => data.type === 'file' ? data.ensureCurrentHash() : data)
				// .then(file => app.models.audio.validFileExtensions.indexOf(file.extension) < 0 ? file
				// :	Q.nfcall(groove.open, "danse-macabre.ogg")
				// 	.then(audio => app.models.audio.findOrCreate({ filedId: file._id }, _.assign({ fileId: file._id }, audio)))
				// 	.then(audio => audio.bulkSave()))
				// .then(audio => file)
			// .then(data => { console.verbose(`data2 = ${inspect(data)}`); return data; })
			.then(data => data.bulkSave())
			// .then(bsResult => { console.verbose(`bulkSaveResult: ${inspectPretty(bsResult)}`); })
			// .then(data => { console.verbose(`data3 = ${inspect(data)}`); return data; })
			.catch(err => { app.onWarning(err, `models.${data.type} op error`); })
		)
		.then(() => {
			app.markPoint(`streamFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true);		// maybe timestamps needs to be done in pairs (start/end TS per name) instead of all relative to a single start TS
			console.log(`Testing unmodified FS DB entries for existence...`)
			var pathRegex = new RegExp(`^${(scan.path).replace(/\//, '\\/')}(\\/[^\/]*){1,${scan.maxDepth === 0 ? '' : scan.maxDepth}}$`);
			var query = {
				path: pathRegex,
				$and: [ { updatedAt: { $lte: app.timestamps.start.toISOString() } }, { checkedAt: { $lte: app.timestamps.start.toISOString() } } ],
				isDeleted: { $ne: true }
			};
			console.verbose(`query: ${inspectPretty(query)}`);//DB path Regex: new RegExp( ${pathRegex.toString()} )\napp.timestamps.start: ${app.timestamps.start} , ${app.timestamps.start.toISOString()}`);
			return promisifyEmitter(app.models.fs.fs.find(query)
			.cursor().on('data', deletedFile => {
				console.debug(`testing [${deletedFile.type}] ${deletedFile.path}`)
				if (!fs.existsSync(deletedFile.path)) {
					deletedFile.markDeleted().then(() => deletedFile.bulkSave()).then(deletedFile => {
						app.status.deleted(deletedFile);
						console.debug(`DB record marked deleted: ${deletedFile.path}`);
					}).catch(err => app.onWarning(err, `deletedFile.markDeleted error for '${deletedFile.path}'`)).done();
				} else {
					console.debug(`DB record tested and still exists`);
				}				// 180120: Might have troubles with deletedFile.markDeleted().save() promise not having fulfilled but surrounding
					// app.models.fs.fs.find has fulfilled, proceeding to next below lines and app/task exit
			})).delay(2500);//.then(() => {	// delay() is hack workaround because resolves on end of find() cursor, not after markDeleted() calls
				// console.log(`DB records marked deleted: deleted=${inspect(deleted)} unchanged=${inspect(unchanged)}`);
			// });
		})
		.then(() => {
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
				// .then(() => cb())
				.catch(err => app.onWarning(err, 'audio.findOrCreate.save error')).done();
			});
		})		
		.then(() => {
			app.markPoint(`audioFinish for doFsScan maxDepth=${scan.maxDepth} path='${scan.path}'`, true);
		})
	)).then(() => { console.log(`Finished processing all paths`); app.markPoint('task'); });
}, { //debug
	interval: 30000,
	doImmediate: true,	// runs the debug fn immediately on task start, without waiting for interval
	fn(prefix = '') {
		console.verbose(`---- stats ---- ${prefix}\n`//app.models.fs.fs.stats: ${JSON.stringify(app.models.fs.fs.stats)}\n`
		 + `app.models.fs.file.stats: ${inspectPretty(app.models.fs.file.stats)}\n`
		 + `app.models.fs.dir.stats: ${inspectPretty(app.models.fs.dir.stats)}\n`
		 // + `app.status: ${inspect(app.status, { depth: 3 })}\n${app.timestamps}\n-- end stats --\n`
		);
	}
});
