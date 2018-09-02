"use strict";
// var console = require('../stdio.js').Get('modules/fs/file', { minLevel: 'log' });	// debug verbose log
// const inspect =	require('../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
// const inspectPretty =	require('../utility.js').makeInspect({ depth: 3, compact: true });
const mongoose = require('mongoose');

module.exports = new mongoose.Schema({
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
