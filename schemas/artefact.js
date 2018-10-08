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
	
	validated: 0,									// validate() calls

	created: 0, updated: 0,	checked: 0,				// #of new docs in db (doc.isNew==true), # updated (doc.isModifed()==true), #docs save()'d bulkSave()'d but were not modifed
	get saved() { return this.created + this.updated + this.checked; },	// # of save() calls is total of above
	updateSaved(doc) {								// update stats for doc being saved;
		model._stats[
			doc.isNew ? 'created' :
			doc.isModified() && doc.modifiedPaths().length > 2 ? 'updated' :
			'checked'
		]++;
	},

	bulkOps: 0, bulkOpSuccess: 0, bulkWrites: 0,	// how many bulksave operations have been done, how many operations succeeded, how many documents have been written
	updateBulkOp(bulkOps) {
		this.bulkOps++;
		this.bulkWrites += bulkOps.length;
	},

	errors: [],
	updateError(err, msg = '') {								// log an error and give a warning (maybe provide a callback/event for client code to handle optionally?)
		console.warn((msg !== '' ? msg + ': ' : '') + (err.stack||err.message||err));
		this.errors.push(err);
	}
} };

// is this worth being made a static func on th emodel??
function mapQuery(dataTypeName, query) {
	return _.mapKeys(query, (value, key, obj) => key[0] === '$' ? key : dataTypeName + '.' + key);
}

module.exports = function artefactMakeModel(collectionName, artefactTypes) {
	
	var artefactSchema = new mongoose.Schema({ });
	artefactSchema.plugin(timestampPlugin);
	
	_.forEach(artefactTypes, (type, typeName) => {
		console.log(`artefactMakeModel('${collectionName}', artefactTypes.${typeName}): ${type} ${_.keys(type).join(', ')}`);
		artefactSchema.plugin(type, { typeName });
		//artefactSchema.path(name).schema.plugin(timestampPlugin);
	});

	artefactSchema.post('save', function(next) {
		this.constructor._stats.updateSaved(this);
		next();		// 180926: This next() call wasn't here ??? prob didnt notice coz i use bulkSave instead
	});

	artefactSchema.pre('validate', function(next) {
		this.constructor._stats.validated++;
		next();
	});

	artefactSchema.method('bulkSave', function(maxBatchSize = 10, batchTimeout = 750) {

		var model = this.constructor;
		var doc = this;

		return Q.Promise((resolve, reject, notify) => {
			this.validate(function(error) {		// 180902: Shuold I really be validating here? does mongoose validate automagically on create/update? see model._stats

				if (error) {
					model._stats.updateError(error, `${model.modelName}.bulkSave(${maxBatchSize}, ${batchTimeout}): validation error for doc=${doc._id}`);
					reject(error);
				} else {
					// 180926: These calls to model._stats could be more in line with _stats.updateSaved: ie check and record how many docs
					// are updated, created & checked. But then you may want to integrate the functionality better somehow so that check isn't done
					// twice, ie the second time to determine the bsOp. Think it thru properly, it almost seems to like the stats are getting so tied
					// to the artefact class they should just be the same thing, but you do want to use stats on the artefact subtypes
					// Another one of those things that can get very confusing and unwieldy if not careful
					model._stats.updateBulkOp(doc, `${model.modelName}.bulkSave`);
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
						model._stats.updateBulkOp(bs.length);
						console.debug(`${model.modelName}.bulkWrite([${bulkOps.length}]=${inspectPretty(bulkOps)}`);
						model.bulkWrite(bs)
						.catch(err => {
							model._stats.updateError(err, `${model.modelName}.bulkSave error: ${inspectPretty(err)}`);
						})
						.then(bulkWriteOpResult => {
							model._stats.bulkOpSuccess++;
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
	artefactSchema.method('updateDocument', function(update, pathPrefix = '') {
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

	artefactSchema.static('findOrCreate', function(dataTypeName, query, data, cb) {
		let mappedQuery = mapQuery(dataTypeName, query);// _.mapKeys(query, (value, key, obj) => key[0] === '$' ? key : dataTypeName + '.' + key);
		return Q(this.findOne(mappedQuery)
		.then(r =>	r
		?	r.updateDocument(data, dataTypeName)
		:  	(new this({ [dataTypeName]: data }))))
		// .tap(r => console.debug(`artefactSchema.findOrCreate('${dataTypeName}', ${inspect(query)}, data=${data?"...":data===null?"null":"undefined"}: mappedQuery=${inspect(mappedQuery)}, r = ${inspectPretty(r)}`));
	});

	var m = mongoose.model(collectionName, artefactSchema);
	var baseAggregate = m.aggregate;

	// Create a static property on the nmodel for each artefact sub-type, kind of as if they were a separate mongoose model with their own collections
	Object.defineProperties(m, _.assign(

		_.mapValues(artefactTypes, (type, typeName) => ({
			value: {
				findOrCreate(query, data, cb) { return m.findOrCreate(typeName, query, data, cb); },
				find(query, cb) { return m.find(mapQuery(typeName, query)); },

				aggregate(...args) {
					var agg = _.assign(
						m.prototype.aggregate.call(m, ...args),
						_.mapValues(m.schema.aggregates || {},
						(aggValue, aggName) => (function (...args) {
							this.append(m.schema.aggregates[aggName](...args));
							return this;
						}))
					);
					console.debug(`m:${m.modelName}.aggregate(${args.map(arg=>inspect(arg)).join(', ')})}: agg=${inspect(agg, { compact: false })}`);
					return agg;
				},

				_stats: getNewStatsObject()
			},

			writeable: false,
			configurable: false
			
		})), {

			_stats: { value: getNewStatsObject() }

		}

	));

	console.log(`artefactMakeModel('${collectionName}', ${_.keys(artefactTypes).join(', ')}, m=${inspectPretty(m)}`);
	return m;
};
