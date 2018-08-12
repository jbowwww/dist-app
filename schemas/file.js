"use strict";
var console = require('../stdio.js').Get('modules/fs/file', { minLevel: 'debug' });	// debug verbose log
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const baseFs = require('../fs.js');
const _ = require('lodash');
const Q = require('q');
const ArtefactDataSchema = require('../artefact-data-schema.js');
const mongoose = require('mongoose');
const moment = require('moment');

var fsStatsSchema = new mongoose.Schema({
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
}, {
	_id: false
});

var	fileSchema = new mongoose.Schema({
	stats : { type: fsStatsSchema, required: true },
	fileType: { type: String, required: true, default: 'unknown' },	// 'file', 'dir', or 'unknown' for now, although fs.Stats object provides others
	hash: { type: String, required: false, default: null }
});

fileSchema.virtual('extension').get(function extension() {
	var n = this.path.lastIndexOf('.');
	return n < 0 ? '' : this.path.slice(n);
});

fileSchema.query.older = function(age, currentTime = moment().utc()) { return this.where('updatedAt').lt(currentTime - age); };
fileSchema.query.younger = function(age, currentTime = Date.now()) { return this.where('deletedAt').gt(currentTime - age); };
fileSchema.query.hasHash = function() { return this.exists('hash'); };

/* Ensures the file doc ('this') has a hash value, and that the doc's updatedAt is more recent than the file's mtime ('stats.mtime')
 * returns: the file/this, with hash calculated
 */
fileSchema.methods.ensureCurrentHash = function(cb) {
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

/* 1612949298: TOOD: instead of storing raw aggregation operation pipeline arrays, if you could somehow hijack/override the Aggregate(?) returned by
 * model.aggregate, and set its prototype to a new object that contains functions of the same names as below, and inherits from the original
 * prototype of the Aggregate object. The funcs can then take parameters too (e.g. sizeMoreThan(1024) or duplicates({minimumGroupSize: 3})) and gives
 * a nice intuitive syntax with method chaining, like :
 * models.fs.file.aggregate.match({path: / *regex to match e.g. video extensions like mpg * /}).groupBySizeAndHash().minimumDuplicateCount(2)
*/
fileSchema.aggregates = {
	match(query) {
		return [ { $match: query } ];
	},
	matchExtension(extension) {
		return [ { $match: { path: new RegExp(`^.*\.${extension}+$`) } } ];
	},
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
};

var FileArtefact = ArtefactDataSchema('file', fileSchema);
// var create = FileArtefact.create;
// FileArtefact.create = function(data) 
// var FS = mongoose.model('fs', fs);
// var File = ArtefactDataSchema('file', file);
// var Dir = ArtefactDataSchema('dir', new mongoose.Schema({}));
// var Unknown = ArtefactDataSchema('unknown', new mongoose.Schema({}));

module.exports = FileArtefact;	//{ fs: FS, file: File, dir: Dir, unknown: Unknown };
