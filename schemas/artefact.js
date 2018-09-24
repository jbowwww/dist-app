"use strict";
const console = require('../stdio.js').Get('schemas/artefact', { minLevel: 'log' });	// log verbose debug
const inspect = require('../utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const inspectPretty = require('../utility.js').makeInspect({ depth: 2, compact: false });
const util = require('util');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');
const timestampPlugin = require('./timestamp-plugin.js');



function getNewStatsObject() { return {				// 180902 TODO: These stats could do with a little re-think - how what & where/when can i collect best stats - theyre a bit inconsistent atm e.g. saved count is pre-error/success where bulkWrites is only on success  
	bulkOps: 0, bulkOpSuccess: 0, bulkWrites: 0,	// how many bulksave operations have been done, how many operations succeeded, how many documents have been written
	saved: 0, validated: 0,							// # of save() calls, validate() calls
	created: 0, updated: 0,	checked: 0,				// #of new docs in db (doc.isNew==true), # updated (doc.isModifed()==true), #docs save()'d bulkSave()'d but were not modifed
	errors: []
} };

artefactSchema.on('init', function onSchemaInit(model, ...args) {
	
	var schema = model.schema;
	console.debug(`artefactSchema.on(init): modelName=${model.modelName}, args=${inspectPretty(args)}`);
	
	var baseAggregate = model.aggregate;
	Object.defineProperty(model, 'aggregate', { value: function aggregate(...args) {	// Fairly sure I have to assign the new aggregate function using defineProperty, pretty sure I can't override it using schema.static() etc
		var agg = _.assign(baseAggregate.call(model, ...args), _.mapValues(model.schema.aggregates || {}, (aggValue, aggName) => (function (...args) {
			this.append(model.schema.aggregates[aggName](...args));
			return this;
		})));
		console.debug(`model:${model.modelName}.aggregate(${args.map(arg=>inspect(arg)).join(', ')})}: agg=${inspect(agg, { compact: false })}`);
		return agg;
	}});

});

artefactSchema.post('save', function(next) {
	var model = this.constructor;
	// 180902 TODO: Refactor stats code with one common function for updating saved counter (used here and artefactSchema.bulkSave)
	model.stats.saved++;
	var actionType = this.isNew ? 'created' : (this.isModified() && this.modifiedPaths().length > 2) ? 'updated' : 'checked';
	model.stats[actionType]++;
});

artefactSchema.pre('validate', function(next) {
	var model = this.constructor;
	model.stats.validated++;
	next();
});

artefactSchema.method('bulkSave', function(maxBatchSize = 10, batchTimeout = 750) {
	var model = this.constructor;
	var doc = this;
	return Q.Promise((resolve, reject, notify) => {
		this.validate(function(error) {	// 180902: Shuold I really be validating here? does mongoose validate automagically on create/update? see model.stats
			if (error) {
				console.warn(`${model.modelName}.bulkSave(maxBatchSize=${maxBatchSize}, batchTimeout=${batchTimeout}): validation err=${error} for doc=${inspectPretty(doc._doc)}`);
				model.stats.errors.push(error);
				reject(error);
			} else {
				console.debug(`${model.modelName}.bulkSave(maxBatchSize=${maxBatchSize}, batchTimeout=${batchTimeout}): valid doc=${inspectPretty(doc._doc)}`);
				// 180902 TODO: Refactor stats code with one common function for updating saved counter (used here and artefactSchema.post('save') for non-bulk doc saves)
				model.stats.saved++;
				var actionType = doc.isNew ? 'created' : (doc.isModified() && doc.modifiedPaths().length > 2) ? 'updated' : 'checked';
				model.stats[actionType]++;
				!model._bulkSave && (model._bulkSave = []);
				var bsOp = null;
				if (doc.isNew) {
					bsOp = { insertOne: { document: doc.toObject() } };
				} else if (doc._id !== null && doc.isModified()) {
					bsOp = { updateOne: { filter: { _id: doc.get('_id') }, update: { $set: doc } } };	// TODO: should i only be updating the modified fields? (always includes _ts and _ts.checkedAt)
				} else {
					console.debug(`${model.modelName}.bulkSave unmodified doc=${inspectPretty(doc._doc)}`);
				}
				if (bsOp) {
					model._bulkSave.push(bsOp);
					if (model._bulkSave.length >= maxBatchSize) {
						if (model._bulkSaveTimeout) {
							clearTimeout(model._bulkSaveTimeout);
						}
						innerBulkSave();
					} else {
						if (!model._bulkSaveTimeout) {
							model._bulkSaveTimeout = setTimeout(innerBulkSave, batchTimeout);
						}
					}
				}
				resolve(doc);
				function innerBulkSave() {
					var bs = model._bulkSave;
					model._bulkSave = [];
					delete model._bulkSaveTimeout;
					model.stats.bulkOps++;
					model.stats.bulkWrites += bs.length;
					console.debug(`${model.modelName}.bulkSave(): bs[${bs.length}]=${inspectPretty(bs)}`);
					model.bulkWrite(bs)
					.catch(err => {
						model.stats.errors.push(err);
						console.warn(`${model.modelName}.bulkSave error: ${inspectPretty(err)}`);
					})
					.then(bulkWriteOpResult => {
						model.stats.bulkOpSuccess++;
						console.debug(`${model.modelName}.bulkSave(): bulkWriteOpResult=${inspectPretty(bulkWriteOpResult)}`);
					});//.done();
				}
			}
		});
	});
});

/* This will update a (sub)document while only marking paths modified if a value has changed.
 * Mongoose was marking the entire FS stats member of fsEntry docs as modified when the values hadn't
 * actually changed, simply because it was a new instance. IIRC mongoose will mark any path as modified
 * if it is included in a call to doc.set({...}), even for simple types - there is no comparison test */ 
artefactSchema.method('updateDocument', function updateDocument(update, pathPrefix = '') {
	if (!pathPrefix.endsWith('.')) {
		pathPrefix += '.';
	}
	_.keys(update).forEach(k => {
		var docVal = this.get(pathPrefix + k);
		var updVal = update[k];
		var schemaType = this.schema.path(pathPrefix + k);
		if (schemaType && schemaType.instance === 'Embedded') {
			console.debug(`updateDocument: ${pathPrefix + k}: Embedded`);
			this.updateDocument(updVal, pathPrefix + k + '.');
		} else if (!_.isEqual(docVal, updVal)) {
			console.debug(`updateDocument: ${pathPrefix + k}: Updating ${docVal} to ${updVal}`);
			this.set(pathPrefix + k, updVal);
		} else {
			console.debug(`updateDocument:${pathPrefix + k}: No update to ${docVal}`);
		}
	});
	return Q(this);
});

function mapQuery(dataTypeName, query) {
	return _.mapKeys(query, (value, key, obj) => key[0] === '$' ? key : dataTypeName + '.' + key);
}

artefactSchema.static('findOrCreate', function findOrCreate(dataTypeName, query, data, cb) {
	let mappedQuery = mapQuery(dataTypeName, query);// _.mapKeys(query, (value, key, obj) => key[0] === '$' ? key : dataTypeName + '.' + key);
	return Q(this.findOne(mappedQuery)
	.then(r =>	r
	?	r.updateDocument(data, dataTypeName)
	:  	(new this({ [dataTypeName]: data }))))
	// .tap(r => console.debug(`artefactSchema.findOrCreate('${dataTypeName}', ${inspect(query)}, data=${data?"...":data===null?"null":"undefined"}: mappedQuery=${inspect(mappedQuery)}, r = ${inspectPretty(r)}`));
});

module.exports = function artefactMakeModel(collectionName, artefactTypes) {
	var artefactSchema = new mongoose.Schema({ });
artefactSchema.plugin(timestampPlugin);
	if (artefactTypes) {
		_.forEach(artefactTypes, (type, typeName) => {
			console.log(`artefactMakeModel('${collectionName}', ${inspect(artefactTypes)}): artefactType: ${name}: ${plugin}`);
			_artefactSchema.plugin(type, { typeName: name });
			// _artefactSchema.path(name).schema.plugin(timestampPlugin);
		});
	}
	let m = mongoose.model(collectionName, _artefactSchema);
	Object.defineProperties(m, _.mapValues(artefactTypes, (type, typeName) => ({
		 typeName, {
			value: _.assign({
					findOrCreate(query, data, cb) { return m.findOrCreate(typeName, query, data, cb); },
					find(query, cb) { return m.find(mapQuery(typeName, query)); },
					_stats: getNewStatsObject()
				},
				artefactTypes[typeName]._statics || {} ),
			writeable: false,
			configurable: false
		}
	})))
	] )));
	console.debug(`artefactMakeModel('${collectionName}', ${inspectPretty(artefactTypes)}, m.artefactTypes=${inspectPretty(m.artefactTypes)}`);
	return m;
};
