"use strict";
var console = require('../stdio.js').Get('modules/audio', { minLevel: 'verbose' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const baseFs = require('../fs.js');
const _ = require('lodash');
const Q = require('q');
const ArtefactDataSchema = require('../artefact-data-schema.js');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../app.js');

var audioSchema = new mongoose.Schema({
    // fileId: { type: mongoose.SchemaTypes.ObjectId, required: true, unique: true },
    length: { type: Number, required: true, default: 0 }
});
// , {
//     methods: {
//
//     }
// });
// var AudioArtefact = ArtefactDataSchema('audio', audioSchema);// mongoose.model('audio', audio);

app.$init.then(() => {
    console.debug(`Audio: register watch()`);
    app.models.fs.file.on('init', function (doc) { //watch(/*{ fullDocument: 'updateLookup' }*/).on('change', function(doc) {
        var model = doc.constructor;
        console.debug(`${model.modelName}.on('init'): ${inspect(doc._doc)}`);
        var fileExt = doc.extension.toLowerCase();
        if (fileExt === '.wav' || fileExt === '.mp3' || fileExt === '.au' || fileExt === '.m4a'  || fileExt === '.wma') {// && this.isModified('hash')) {
            console.verbose(`Found audio file: ${inspect(doc._doc)}`);
            Audio.findOrCreate({ fileId: doc._doc._id  }, { fileId: doc._doc._id, length: '1' }).then(docAudio => {
                console.verbose(`Audio: ${docAudio.isNew ? 'created' : 'found'} ${inspect(docAudio)} for path=''${doc._doc.path}''`);
                docAudio.bulkSave();
            })
        }
    });
});

module.exports = audioSchema;// AudioArtefact;//{ audio: Audio };
