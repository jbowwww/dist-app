"use strict";
const console = require('../../../stdio.js').Get('bin/fs/tasks/create', { minLevel: 'verbose' });	// verbose debug log
const _ = require('lodash');
const inspectPretty = require('util').inspect;
const inspect = function inspect(obj) { return (require('util').inspect)(obj, { compact: true }); }
const fs = require('../../../fs.js');
const Q = require('../../../q.js');
const mongoose = require('mongoose');
mongoose.connect("mongodb://localhost:27017/ArtefactsJS", { useNewUrlParser: true });
const sourcePipe = require('../../source-pipe.js')
const artefactModel = require('../model.js');

console.debug(`artefactModel = ${inspectPretty(_.pick(artefactModel, _.keys(artefactModel.prototype)))}`);

var scanParameters = [
	{ path: '/home', maxDepth: 3 }
	// { path: '/mnt/wheel/Trapdoor/mystuff/Moozik', maxDepth: 0 },
	// { path: '/media/jk/Storage/', maxDepth: 0 }
	// { path: '/', maxDepth: 4 }
];
console.log(`${scanParameters.length} FS scan targets: ${inspectPretty(scanParameters)}`);
var debugInterval = setInterval(() => console.verbose(`---- stats ---- ${inspect(artefactModel.stats)}`), 10000);

var sources = {
	fsScan: (scans) => fs.iterate.bind(null, scans.path, scans)
};

var actions = {
	dbFindOrCreate: (collectionName) => (data => artefactModel.fs.findOrCreate({ "path": data.path }, data )),
	dbBulkSave: () => (data => data.bulkSave()),
	fileHash: () => (data) => data.fs.fileType === 'file' ? data.fs.ensureCurrentHash().catch(err => { console.warn(`warning: ${err.stack||err.message||err}`); return data; }) : data
};

sourcePipe(sources.fsScan(scanParameters[0]), [
	actions.dbFindOrCreate('fs'),
	actions.fileHash(),
	actions.dbBulkSave()
])
.then(() => {
	console.log('Finished processing all FS scans');
}).catch(err => {
	console.warn(`warning: ${err.stack||err.message||err}`);
}).finally(() => {
	clearInterval(debugInterval);
}).done();
