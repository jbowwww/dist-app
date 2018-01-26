"use strict";
const console = require('../stdio.js').Get('bin/console', { minLevel: 'debug' });	// verbose debug log
const promisifyEmitter = require('../utility.js').promisifyEmitter;
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: true /* false */ });
const inspectPretty = require('../utility.js').makeInspect({ depth: 2, compact: false });
const formatSize = require('../utility.js').formatSize;
const _ = require('lodash');
const mixin = require('../utility.js').mixin;
const fs = require('../fs.js');
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
	app.status = {
		update(current) {
			if (!current.type) {
				console.error(`app.status.update: current should be a fs.iterate data item with a 'type' property`);
			} else {
				if (!this[current.type]) {
					this[current.type] = { current: { path: '' }, totals: { size: 0, count: 0, deletedSize: 0, deletedCount: 0 } };
				}
				this[current.type].totals.count++;
				this[current.type].totals.size += current.stats.size || 0;
			}
		},
		deleted(current) {
			if (!current.type || !current.isDeleted) {
				console.error(`app.status.update: current should be a fs.iterate data item with a 'type' property and marked deleted`);
			} else {
				if (!this[current.type]) {
					this[current.type] = { current: { path: '' }, totals: { size: 0, count: 0, deletedSize: 0, deletedCount: 0 } };
				}
				this[current.type].totals.deletedCount++;
				this[current.type].totals.deletedSize += current.stats.size || 0;
			}
		}
	};
	console.log(`${scanParameters.length} FS scan targets: ${inspectPretty(scanParameters)}`);
	return Q.all(scanParameters.map((scan, scanIndex) => {	//Q.Promise((resolve, reject) => {
		console.log(`Scanning FS to depth=${scan.maxDepth} at '${scan.path}' ...`);
		return promisifyEmitter(fs.iterate(scan.path, scan)
		.on('error', err => app.onWarning(err, `fs.iterate error`))
		.on('end', () => app.markPoint('fs.iterate', false))
		.pipe(objStream((data, enc, cb) => {
			app.status.update(data);
			app.models.fs.fs.findOrCreate({ type: data.type, path: data.path, isDeleted: { '$ne': true } }, data)
			.then(data => data.type === 'file' ? data.ensureCurrentHash() : data)
			.then(data => data.save())	// doesn't seem to work if i pass cb to data.store() to use as a callback... nfi why..
			.catch(err => app.onWarning(err, `models.${data.type} op error`))
			.then(() => cb()).done();
		})))
		.then(() => {
			app.markPoint('streamFinish', true);		// maybe timestamps needs to be done in pairs (start/end TS per name) instead of all relative to a single start TS
			console.log(`Testing unmodified FS DB entries for existence...`)
			var deleted = {file: 0, dir: 0 };
			var unchanged = { file: 0, dir: 0 };
			var pathRegex = new RegExp(`^${(scan.path).replace(/\//, '\\/')}\/.*$`);
			console.verbose(`DB path Regex: new RegExp( ${pathRegex.toString()} )`);
			return promisifyEmitter(app.models.fs.fs.find({
				path: pathRegex,
				updatedAt: { $lte: app.timestamps.start },
				isDeleted: { $ne: true }
			})
			.cursor().on('data', deletedFile => {
				console.debug(`testing [${deletedFile.type}] ${deletedFile.path}`)
				if (!fs.existsSync(deletedFile.path)) {
					deletedFile.markDeleted().save().then(deletedFile => {
						app.status.deleted(deletedFile);
						console.verbose(`DB record marked deleted: ${deletedFile.path}`);
					}).catch(err => app.onWarning(err, `deletedFile.markDeleted error for '${deletedFile.path}'`)).done();
				}				// 180120: Might have troubles with deletedFile.markDeleted().save() promise not having fulfilled but surrounding
			})).then(() => {	// app.models.fs.fs.find has fulfilled, proceeding to next below lines and app/task exit
				console.log(`DB records marked deleted: deleted=${inspect(deleted)} unchanged=${inspect(unchanged)}`);
			});
		});
	})).then(() => { console.log(`Finished processing all paths`); app.markPoint('task'); });
}, { //debug
	interval: 40000,
	fn(prefix = '') {
		console.verbose(`---- stats ---- ${prefix}\napp.models.fs.fs.stats: ${inspect(app.models.fs.fs.stats)}\n`
		 + `app.models.fs.file.stats: ${inspect(app.models.fs.file.stats)}\n`
		 + `app.models.fs.dir.stats: ${inspect(app.models.fs.dir.stats)}\n`
		 + `app.status: ${inspect(app.status)}\n${app.timestamps}\n-- end stats --\n`);
	}
});
