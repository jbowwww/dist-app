"use strict";
// const process = require('process');
const console = require('../../../stdio.js').Get('bin/fs/tasks/hash', { minLevel: 'verbose' });	// verbose debug log
const _ = require('lodash');
// const { formatSize, promisifyEmitter, makeInspect } = require('../utility.js');
// const inspect =	makeInspect({ depth: 1, compact: true });
// const inspectPretty = makeInspect({ depth: 2, compact: false });
const inspectPretty = require('util').inspect;
const inspect = inspectPretty;
const fs = require('../../../fs.js');
const Q = require('../../../q.js');
Q.longStackSupport = true;
const mongoose = require('mongoose');
mongoose.connect("mongodb://localhost:27017/ArtefactsJS", { useNewUrlParser: true });
// const app = require('../app.js');
const sourcePipe = require('../../source-pipe.js')
const artefactModel = require('../model.js');

console.debug(`artefactModel = ${inspectPretty(artefactModel)}`);

var debugInterval = setInterval(() => console.verbose(`---- stats ---- ${artefactModel.stats.format(1)}`), 10000);

sourcePipe(
	 artefactModel.artefactTypes.fs.find({ fileType: "file" }).cursor(),
	 data => data.fs.ensureCurrentHash().then(
	 data => data.bulkSave()
))
.then(() => {
	console.log('Finished processing all FS scans');
	clearInterval(debugInterval);
}).done();
