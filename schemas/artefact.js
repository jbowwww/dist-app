"use strict";

const console = require('../stdio.js').Get('schemas/artefact', { minLevel: 'verbose' });	// log verbose debug
const inspect = require('../utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const inspectPretty = require('../utility.js').makeInspect({ depth: 2, compact: false });
const util = require('util');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');
const timestampPlugin = require('./timestamp-plugin.js');

var artefactSchema = new mongoose.Schema({ });
var isBulkSave = false;

artefactSchema.plugin(timestampPlugin);

artefactSchema.on('init', function onSchemaInit(_model, ...args) {
	var debugPrefix = `model:${_model.modelName}`;
	var schema = this;

	// Object.defineProperty(_model, 'artefactTypes', { value: _.fromPairs(_.keys(schema.paths).filter(key => key[0] !== '_').map(key => [ key, {
	// 	findOrCreate(query, data, cb) { return _model.findOrCreate(key, query, data, cb); }
	// } ])) });

	// Fairly sure I have to assign the new aggregate function using defineProperty, pretty sure I can't override it using schema.static() etc
	var baseAggregate = _model.aggregate;
	Object.defineProperty(_model, 'aggregate', { value: function aggregate(...args) {
		var model = this;
		var debugPrefix = `[${typeof model} ${model.modelName}]`;
		console.debug(`${debugPrefix} baseAggregate=${inspect(baseAggregate)}`);
		var agg = _.assign(baseAggregate.call(model, ...args), _.mapValues(model.schema.aggregates || {}, (aggValue, aggName) => (function (...args) {
			this.append(model.schema.aggregates[aggName](...args));
			return this;
		})));

		// Object.setPrototypeOf(agg, aggProto);
		console.debug(`${debugPrefix}.aggregate(${args.map(arg=>inspect(arg)).join(', ')})}: agg=${inspect(agg, { compact: false })}`);//`\naggProto=${inspect(aggProto)}`);
		return agg;
	}});

	Object.defineProperty(_model, 'stats', { value: {	// 180902 TODO: These stats could do with a little re-think - how what & where/when can i collect best stats - theyre a bit inconsistent atm e.g. saved count is pre-error/success where bulkWrites is only on success  
		bulkOps: 0, bulkOpSuccess: 0,	bulkWrites: 0,	// how many bulksave operations have been done, how many operations succeeded, how many documents have been written
		saved: 0, validated: 0,							// number of objects stored in db using save()
		created: 0,										// number of objects stored in db were inserted because doc.isNew == true
		updated: 0,										// number of objects stored in db that were updated because doc.isNew == false, doc._id !== null && doc.isModified() === true
		checked: 0,										// number of objects that were passed to doc.store() that were not new or modified, and so did not require db actions
		found: 0,										// results found pre-existing in db in model.findOrCreate()
		constructed: 0,									// results from model.findOrCreate that were constructed using new Model()
		errors: [],
		_extraFields: [],							// extra field names to include in inspect() 'e.g. ensureCurrentHash' on file artefact
		format(indent = 1) {
			return `\n${'\t'.repeat(indent)}bulkOps: ${this.bulkOps}, bulkOpSuccess: ${this.bulkOpSuccess}, bulkWrites: ${this.bulkWrites},\n`
			 +	`${'\t'.repeat(indent)}saved: ${this.saved}, validated: ${this.validated},\n`
			 +	`${'\t'.repeat(indent)}created: ${this.created}, updated: ${this.updated}, checked: ${this.checked}\n`
			 +	`${'\t'.repeat(indent)}found: ${this.found}, constructed: ${this.constructed},\n`
			 +	`${'\t'.repeat(indent)}errors (${this.errors.length}):`
			 +	this.errors.map(errString => '\n' + '\t'.repeat(indent) + errString)
			 +	this._extraFields.map(field => '\n' + '\t'.repeat(indent) + field + ': '
			 	+ (this[field].format ? this[field].format(indent + 1)
			 	: this[field].toString()));
		}
	} });
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
	// var hasParent = !!this.$parent;
	// console.verbose(`${model.modelName}.pre('validate'): ${isBulkSave == !this.isNew ? '!! clocked !!' : '-- no bulksave --'}`);
	model.stats.validated++;
	// var actionType = this.isNew ? 'created' : (this.isModified() && this.modifiedPaths().length > 2) ? 'updated' : 'checked';
	// model.stats[actionType]++;
	// console.debug(`${model.modelName}.pre('validate'): action=${actionType}: modified=${this.modifiedPaths().join(' ')} doc=${inspectPretty(this._doc)}`);
	next();
});

artefactSchema.method('bulkSave', function(maxBatchSize = 10, batchTimeout = 750) {
	var model = this.constructor;
	var doc = this;
	return Q.Promise((resolve, reject, notify) => {
		isBulkSave = true;
		this.validate(function(error) {	// 180902: Shuold I really be validating here? does mongoose validate automagically on create/update? see model.stats
			isBulkSave = false;
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
					}).done();
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

artefactSchema.static('findOrCreate', function findOrCreate(dataTypeName, query, data, cb) {
	let mappedQuery = _.mapKeys(query, (value, key, obj) => key[0] === '$' ? key : dataTypeName + '.' + key);
	return this.findOne(mappedQuery)
	.then(r =>	r
	?	r.updateDocument(data, dataTypeName)
	:  	(new this({ [dataTypeName]: data })))
	.tap(r => console.debug(`artefactSchema.findOrCreate('${dataTypeName}', ${inspect(query)}, data=${data?"...":data===null?"null":"undefined"}: mappedQuery=${inspect(mappedQuery)}, r = ${inspectPretty(r)}`));
});

module.exports = function artefactMakeModel(modelName, artefactTypes) {
	let _artefactSchema = artefactSchema.clone();
	if (artefactTypes) {
		_.forEach(artefactTypes, (plugin, name) => {
			_artefactSchema.plugin(plugin, { typeName: name });
			// _artefactSchema.path(name).schema.plugin(timestampPlugin);
		});
	}
	let m = mongoose.model(modelName, _artefactSchema);
	Object.defineProperty(m, 'artefactTypes', {
		value: _.fromPairs(_.keys(artefactTypes).map(typeName => [typeName, _.assign({
			findOrCreate(query, data, cb) { return m.findOrCreate(typeName, query, data, cb); }
		}, artefactTypes[typeName]._statics || {}) ])),
		writeable: false,
		configurable: false
	});
	console.debug(`artefactMakeModel('${modelName}', ${inspectPretty(artefactTypes)}, m.artefactTypes=${inspectPretty(m.artefactTypes)}`);
	return m;
};