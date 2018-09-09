"use strict";
var console = require('../../stdio.js').Get('schemas/fs/fsEntry', { minLevel: 'verbose' });	// debug verbose log
const inspect =	require('../../utility.js').makeInspect({ depth: 2, compact: true });
const inspectPretty =	require('../../utility.js').makeInspect({ depth: 2, compact: false });
const mongoose = require('mongoose');

let fsStatsSchema = require('./stats.js');

// A file system entry object: Base schema class for file and directory schemas
var fsSchema = new mongoose.Schema({
	path: { type: String, unique: true, index: true, required: true },
	stats : { type: fsStatsSchema, required: true }
}, {
	discriminatorKey: 'fileType',
	_id: false
});

fsSchema.plugin(require('../timestamp-plugin.js'));
module.exports = fsSchema;
console.verbose(`fsSchema: ${inspectPretty(fsSchema)}`);
