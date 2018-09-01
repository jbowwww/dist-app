"use strict";
var console = require('../stdio.js').Get('modules/audio', { minLevel: 'verbose' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: true });
const inspectPretty = require('../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const baseFs = require('../fs.js');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');
const moment = require('moment');
const mm = require('music-metadata');
const app = require('../app.js');

var audioSchema = new mongoose.Schema({
    // fileId: { type: mongoose.SchemaTypes.ObjectId, required: true, unique: true },
    length: { type: Number, required: true, default: 0 },
    metadata: {}
}, { _id: false });

// , {
//     methods: {
//
//     }
// });
// var AudioArtefact = ArtefactDataSchema('audio', audioSchema);// mongoose.model('audio', audio);

// app.$init.then(() => {
//     console.debug(`Audio: register watch()`);
//     app.models.fs.file.on('init', function (doc) { //watch(/*{ fullDocument: 'updateLookup' }*/).on('change', function(doc) {
//         var model = doc.constructor;
//         console.debug(`${model.modelName}.on('init'): ${inspect(doc._doc)}`);
//         var fileExt = doc.extension.toLowerCase();
//         if (fileExt === '.wav' || fileExt === '.mp3' || fileExt === '.au' || fileExt === '.m4a'  || fileExt === '.wma') {// && this.isModified('hash')) {
//             console.verbose(`Found audio file: ${inspect(doc._doc)}`);
//             Audio.findOrCreate({ fileId: doc._doc._id  }, { fileId: doc._doc._id, length: '1' }).then(docAudio => {
//                 console.verbose(`Audio: ${docAudio.isNew ? 'created' : 'found'} ${inspect(docAudio)} for path=''${doc._doc.path}''`);
//                 docAudio.bulkSave();
//             })
//         }
//     });
// });

audioSchema.method('loadMetadata', function loadMetadata() {
    var audio = this;
    var artefact = this.$parent;
    var model = this.$parent.constructor;
    // var debugPrefix = `[${typeof audio} ${model.name}]`;
    console.verbose(`: audio=${inspectPretty(audio)} artefact=${inspectPretty(artefact)}`);
    return mm.parseFile(artefact.file.path).then(metadata => {
        console.verbose(`${debugPrefix}: metadata=${inspectPretty(metadata)}`);
        audio.metadata = metadata;
        return artefact;
    });
});

function audioPlugin(artefactSchema, options) {
    options = options || {};
    var typeName = options.typeName || 'audio';
    artefactSchema.add({ [typeName]: audioSchema });
}

Object.defineProperty(audioPlugin, 'fileExtensions', { value: [ 'wav', 'mp3' ]});

module.exports = audioPlugin;// audioSchema;// AudioArtefact;//{ audio: Audio };
