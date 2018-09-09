"use strict";
var console = require('../stdio.js').Get('modules/audio', { minLevel: 'debug' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: true });
const inspectPretty = require('../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const baseFs = require('../fs.js');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');
// const moment = require('moment');
const mm = require('music-metadata');
// const app = require('../app.js');

var audioSchema = new mongoose.Schema({
    // fileId: { type: mongoose.SchemaTypes.ObjectId, required: true, unique: true },
    length: { type: Number, required: true, default: 0 },
    metadata: {}
}, { _id: false });

audioSchema.plugin(require('./timestamp-plugin.js'));

audioSchema.method('loadMetadata', function loadMetadata() {
    var audio = this;
    var artefact = this.$parent;
    var model = this.$parent.constructor;
    console.verbose(`audio=${inspectPretty(audio)} artefact=${inspectPretty(artefact)}`);
    return mm.parseFile(artefact.fs.path).then(metadata => {
        console.verbose(`metadata=${inspectPretty(metadata)}`);
        audio.metadata = metadata;
        return artefact;
    });
});

function audioPlugin(artefactSchema, options) {
    options = options || {};
    var typeName = options.typeName || 'audio';
    artefactSchema.add({ [typeName]: audioSchema });
}

audioPlugin._statics = {
    fileExtensions: [ 'wav', 'mp3', 'au', 'm4a', 'wma' ]
};

module.exports = audioPlugin;
