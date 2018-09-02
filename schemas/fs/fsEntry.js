"use strict";
// var console = require('../stdio.js').Get('modules/fs/file', { minLevel: 'log' });	// debug verbose log
// const inspect =	require('../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
// const inspectPretty =	require('../utility.js').makeInspect({ depth: 3, compact: true });
const mongoose = require('mongoose');

let fsStatsSchema = require('./stats.js');

// A file system entry object: Base schema class for file and directory schemas
module.exports = new mongoose.Schema({
	path: { type: String, unique: true, index: true, required: true },
	stats : { type: fsStatsSchema, required: true }
}, {
	discriminatorKey: 'fileType',
	_id: false
});
