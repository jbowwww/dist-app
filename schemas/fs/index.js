"use strict";
var console = require('../../stdio.js').Get('schemas/fs', { minLevel: 'log' });	// debug verbose log
const inspect =	require('../../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const inspectPretty =	require('../../utility.js').makeInspect({ depth: 3, compact: true });
const baseFs = require('../../fs.js');
const _ = require('lodash');
// const Q = require('q');
// const mongoose = require('mongoose');
// const moment = require('moment');

let fsEntrySchema = require('./fsEntry.js');
let dirSchema = require('./dir.js');
let fileSchema = require('./file.js');

function fileSystemPlugin(artefactSchema, options) {
	options = options || {};
	var typeName = options.typeName;// || 'fs';
	artefactSchema.add({ [typeName]: fsEntrySchema });
	artefactSchema.path(typeName).discriminator('dir', dirSchema);
	artefactSchema.path(typeName).discriminator('file', fileSchema);
}

fileSystemPlugin._statics = {
	
}
module.exports = fileSystemPlugin;
