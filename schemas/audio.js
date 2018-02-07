"use strict";
var console = require('../stdio.js').Get('modules/fs/audio', { minLevel: 'debug' });	// debug verbose
const inspect =	require('../utility.js').makeInspect({ depth: 1, compact: false /* true */ });
const baseFs = require('../fs.js');
const _ = require('lodash');
const Q = require('q');
const ArtefactSchema = require('../artefact-schema.js');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../app.js');

var audio = _.assign(new ArtefactSchema({
    length: { type: Number, required: true, default: 0 }
}), {
    methods: {

    }
});
var  Audio = mongoose.model('audio', audio);

app.$init.then(() => {
    console.debug(`Audio: register watch()`);
    app.models.fs.file.watch({ fullDocument: 'updateLookup' }).on('change', function(doc) {
        var model = doc.constructor;
        console.debug(`${model.modelName}.pre('validate'): ${inspect(doc._doc)}`);
        var fileExt = doc.extension;
        if (fileExt === '.wav' || fileExt === '.mp3' || fileExt === '.au' || fileExt === '.m4a'  || fileExt === '.wma') {// && this.isModified('hash')) {
            Audio.findOrCreate({ root: this._id  }, { root: this._id, length: '1' }).then(docAudio => {
                console.verbose(`Audio: ${docAudio.isNew ? 'created' : 'found'} ${inspect(docAudio)} for path=''${doc.path}''`);
            })
        }
    });
});

module.exports = { audio: Audio };
