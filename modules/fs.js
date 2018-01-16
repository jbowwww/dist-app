
// const util = require('util');
var console = require('../stdio.js').Get('modules/fs/file', { minLevel: 'debug' });	// debug verbose
const fs = require('../fs.js');
// const through2 = require('through2');
// const async = require('async');
const mongo = require('../mongo.js');

module.exports = {
	schemas: {
		file : new mongo.Schema({
			path : { type: String, unique: true },
			hash : { type: String, required: false },
			stats : Object
			/* 1704041836: Doesn't seem to work specifying 'stats' sub members as below, maybe because it is not an Object.prototype but a fs.Stat or whatev? look into pre/post triggers and .toObject() maybe
			// {
				// "dev" : Number,
				// "mode" : Number,
				// "nlink" : Number,
				// "uid" : Number,
				// "gid" : Number,
				// "rdev" : Number,
				// "blksize" : { type: Number, required: false },
				// "ino" : Number,
				// "size" : Number,
				// "blocks" : { type: Number, required: false },
				// "atime" : Date,
				// "mtime" : Date,
				// "ctime" : Date,
				// "birthtime" : Date
			// }
			*/
		})
	},
	operations: {
		'Scan file system': {
			method: fs.iterate,
			options: [
				{ name: 'path', description: 'Root path to scan', required: true, default: '.' },
				{ name: 'options', description: 'Options for fs.iterate', required: false, default: undefined }
			],
			schema: 'file'
		}
	}
};
