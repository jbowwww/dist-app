"use strict";
var console = require('../stdio.js').Get('tests/audio', { minLevel: 'verbose' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: true });
const inspectPretty = require('../utility.js').makeInspect({ depth: 3, compact: false /* true */ });
const _ = require('lodash');
const mm = require('music-metadata');

console.log(`process: argv=${inspectPretty(process.argv)}`);

function parseMetadata(path) {
    var debugPrefix = `parseMetadata('${path}')`;
    console.verbose(`${debugPrefix}: start`);
    return mm.parseFile(path).then(metadata => {
        console.verbose(`${debugPrefix}: metadata=${inspectPretty(metadata)}`);
    });
}


if (process.argv.length > 2) {
    _.each(process.argv.slice(2), arg => parseMetadata(arg));
}//    parseMetadata(process.argv[2]);