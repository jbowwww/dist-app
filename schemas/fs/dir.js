"use strict";
const console = require('../../stdio.js').Get('schemas/fs/dir', { minLevel: 'verbose' });	// log verbose debug
const inspect = require('../../utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const inspectPretty = require('../../utility.js').makeInspect({ depth: 2, compact: false });

let fsEntry = require('./fsEntry.js');

let dirSchema = fsEntry.clone();

module.exports = dirSchema;
