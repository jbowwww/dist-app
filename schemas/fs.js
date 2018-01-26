"use strict";
var console = require('../stdio.js').Get('modules/fs/file', { minLevel: 'log' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const baseFs = require('../fs.js');
const _ = require('lodash');
const Q = require('q');
const ArtefactSchema = require('../artefact-schema.js');
const mongoose = require('mongoose');
const moment = require('moment');

var fsStats = new mongoose.Schema({
	"dev" : Number,
	"mode" : Number,
	"nlink" : Number,
	"uid" : Number,
	"gid" : Number,
	"rdev" : Number,
	"blksize" : { type: Number, required: true, default: null },
	"ino" : Number,
	"size" : Number,
	"blocks" : { type: Number, required: true, default: null },
	"atime" : Date,
	"mtime" : Date,
	"ctime" : Date,
	"birthtime" : Date,
	"atimeMs" : Number,
	"mtimeMs" : Number,
	"ctimeMs" : Number,
	"birthtimeMs" : Number
}, { _id: false});
var	fs = _.assign(new ArtefactSchema({
	path: { type: String, unique: true, index: true },
	stats : fsStats,
}, { discriminatorKey: 'type' }), {
	query: {
		findByPath(path) { return this.where('path', path); },
		older(age, currentTime = moment().utc()) { return this.where('updatedAt').lt(currentTime - age); },
		younger(age, currentTime = Date.now()) { return this.where('deletedAt').gt(currentTime - age); }
	}
});
var file = _.assign(new ArtefactSchema({
	hash: { type: String, required: false, default: null }
}), {
	query: {
		hasHash() { return this.exists('hash'); }
	},
	methods: {
		/* Ensures the file doc ('this') has a hash value, and that the doc's updatedAt is more recent than the file's mtime ('stats.mtime')
		 * returns: the file/this, with hash calculated
		 */
		ensureCurrentHash(cb) {
			var debugPrefix = `[${typeof this} ${this.constructor.name}]`;
			var file = this;
			var model = this.constructor;
			if (!model.stats.ensureCurrentHash) {
				model.stats.ensureCurrentHash = { hashValid: 0, hashUpdated: 0, hashCreated: 0, errors: [], get total() { return this.hashValid + this.hashUpdated + this.hashCreated + this.errors.length; } };
			}
			if (!model._hashQueue) {
				model._hashQueue = {
					push(data) {
						return fs.hash(file.path).then((hash) => {
							file.hash = hash;
							console.verbose(`${debugPrefix}.ensureCurrentHash: computed file.hash=..${hash.substr(-6)}`);
							return file;
						});//.catch(err=>reject(err))//done();
					}
				};
			}
			return Q.Promise((resolve, reject, notify) => {
				var oldHash = file.hash;
				console.verbose(`${debugPrefix}.ensureCurrentHash: file='${file.path}' modifiedPaths=${file.modifiedPaths().join(' ')} tsu=${file.updatedAt} mtime=${file.stats.mtime} tsu-mtime=${file.updatedAt - file.stats.mtime}`);
				if (!oldHash || !file.updatedAt || file.isModified('stats.mtime')  || (file.updatedAt < (file.stats.mtime))) {	// need to add file.isModified() to this list of conditions?
					if (!oldHash) { console.verbose(`${debugPrefix}.ensureCurrentHash: undefined file.hash, hashing...`); }
					else { console.verbose(`${debugPrefix}.ensureCurrentHash: outdated file.hash=..${file.hash.substr(-6)}, hashing...`); }
					// return model._hashQueue.push(file).then(file => { if (cb) cb(null, file); return file; });
					baseFs.hash(file.path).then((hash) => {
						if (!oldHash) { model.stats.ensureCurrentHash.hashCreated++; }
						else { model.stats.ensureCurrentHash.hashUpdated++; }
						file.hash = hash;
						console.verbose(`${debugPrefix}.ensureCurrentHash: computed file.hash=..${hash.substr(-6)}`);
						resolve(file);
					})
					.catch(err => ensureCurrentHashHandleError(err, 'hash error', reject))
					.done();
				} else {
					model.stats.ensureCurrentHash.hashValid++;
					console.verbose(`${debugPrefix}.ensureCurrentHash: current file.hash=..${file.hash.substr(-6)}, no action required`);
					resolve(file);
				}
			});

			function ensureCurrentHashHandleError(err, prefix, cb) {
				if (typeof prefix === 'function') {
					cb = prefix;
					prefix = 'Error';
				}
				console.warn(prefix + ': ' + err);//.stack||err.message||err);
				model.stats.ensureCurrentHash.errors.push(err);
				if (cb) process.nextTick(() => cb(err));
			}
		}
	},
	/* 1612949298: TOOD: instead of storing raw aggregation operation pipeline arrays, if you could somehow hijack/override the Aggregate(?) returned by
	 * model.aggregate, and set its prototype to a new object that contains functions of the same names as below, and inherits from the original
	 * prototype of the Aggregate object. The funcs can then take parameters too (e.g. sizeMoreThan(1024) or duplicates({minimumGroupSize: 3})) and gives
	 * a nice intuitive syntax with method chaining, like :
	 * models.fs.file.aggregate.match({path: / *regex to match e.g. video extensions like mpg * /}).groupBySizeAndHash().minimumDuplicateCount(2)
	*/
	aggregates: {
		groupBySizeAndHash() {
			return [		 /* , path: /^\/mnt\/wheel\/Trapdoor\/media\/.*$/ } */
				{ $match: { hash: { $exists : 1 }, deletedAt: { $exists: 0 }, 'stats.size': { $gt: 1024*1024 } } },
				{ $group : { '_id':{'size': '$stats.size', 'hash': '$hash'}, paths: { $push: "$path" }, groupSize: { $sum: "$stats.size" }, count: { $sum: 1 } } }
			];
		},
		duplicates() {
			return this.groupBySizeAndHash().concat([
				{ $match: { "count" : { $gt: 1 }, groupSize: { $gt: 1024*1024 } } },
				{ $sort: { "groupSize": -1 } }
			]);
		},
		duplicatesSummary() {
			return [
				{ $match: { /* path: /^.*\.(avi|mpg|mpeg|mov|wmv|divx|mp4|flv|mkv|zip|rar|r[0-9]{2}|tar\.gz|iso|img|part|wav|au|flac|ogg|mp3)$/ig,  */  hash: { $ne : null } } },
				{ $group : { '_id':{'size': '$stats.size', 'hash': '$hash'}, paths: { $push: "$path" }, groupSize: { $sum: "$stats.size" }, count: { $sum: 1 } } },
				{ $match: { "count" : { $gt: 1 } } },
			  { $group: { _id: null, totalSize: { $sum: { $divide: [ '$groupSize', 1024*1024*1024 ] } }, totalCount: { $sum: "$count" }, totalGroups: {$sum: 1} } },
			  { $project: { totalSize: { $concat: [{ $substr: ['$totalSize', 0, 100 ]}, ' GB' ] }, totalCount: '$totalCount', totalGroups: '$totalGroups', avgGroupSize: {$concat: [ { $substr: [{ $divide: [ '$totalSize', '$totalGroups' ] }, 0, 10] }, ' GB']} } }
		  	];
		}
	}
});

var FS = mongoose.model('fs', fs);
var File = FS.discriminator('file', file);
var Dir = FS.discriminator('dir', new ArtefactSchema({}));
var Unknown = FS.discriminator('unknown', new ArtefactSchema({}));

module.exports = { fs: FS, file: File, dir: Dir, unknown: Unknown };
