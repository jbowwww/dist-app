"use strict";

const console = require('./stdio.js').Get('artefact-schema', { minLevel: 'verbose' });	// log verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const inspectPretty = require('./utility.js').makeInspect({ depth: 2, compact: false });
const util = require('util');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');

var artefactSchema = new mongoose.Schema({ });

artefactSchema.plugin(require('./timestamp-plugin.js'));

Object.defineProperty(artefactSchema, 'plugins', { value: function artefactSchema_plugins(schemas) {
	_.forEach(schemas, (schema, schemaName) => {
		artefactSchema.plugin(schema, { typeName: schemaName });
	});
	return artefactSchema;
} });

Object.defineProperty(artefactSchema, 'model', { value: function artefactSchema_model(modelName, schemas) {
	if (schemas) {
		artefactSchema.plugins(schemas);
	}
	return mongoose.model(modelName, artefactSchema);
} });

artefactSchema.on('init', function onSchemaInit(_model, ...args) {
	var debugPrefix = `model:${_model.modelName}`;
	var schema = this;

	Object.defineProperty(_model, 'artefactTypes', { value: _.fromPairs(_.keys(schema.paths).filter(key => key[0] !== '_').map(key => [ key, {
		findOrCreate(query, data, cb) { return _model.findOrCreate(key, query, data, cb); }
	} ])) });

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

	Object.defineProperty(_model, 'stats', { value: {
		bulkOps: 0,			// how many bulksave operations have been done
		saved: 0,			// number of objects stored in db using save()
		created: 0,			// number of objects stored in db were inserted because doc.isNew == true
		updated: 0,			// number of objects stored in db that were updated because doc.isNew == false, doc._id !== null && doc.isModified() === true
		checked: 0,			// number of objects that were passed to doc.store() that were not new or modified, and so did not require db actions
		found: 0,			// results found pre-existing in db in model.findOrCreate()
		constructed: 0,		// results from model.findOrCreate that were constructed using new Model()
		errors: []
	} });
});

artefactSchema.pre('validate', function(next) {
	var model = this.constructor;
	model.stats.saved++;
	var actionType = this.isNew ? 'created' : (this.isModified() && this.modifiedPaths().length > 2) ? 'updated' : 'checked';
	model.stats[actionType]++;
	console.debug(`${model.modelName}.pre('validate'): action=${actionType}: modified=${this.modifiedPaths().join(' ')} doc=${inspectPretty(this._doc)}`);
	next();
});

artefactSchema.method('bulkSave', function(maxBatchSize = 10, batchTimeout = 750) {
	var model = this.constructor;
	var doc = this;
	return Q.Promise((resolve, reject, notify) => {
		this.validate(function(error) {
			if (error) {
				console.warn(`${model.modelName}.bulkSave(maxBatchSize=${maxBatchSize}, batchTimeout=${batchTimeout}): validation err=${error} for doc=${inspectPretty(doc._doc)}`);
				model.stats.errors.push(error);
				reject(error);
			} else {
				console.debug(`${model.modelName}.bulkSave(maxBatchSize=${maxBatchSize}, batchTimeout=${batchTimeout}): valid doc=${inspectPretty(doc._doc)}`);
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
					console.debug(`${model.modelName}.bulkSave(): bs[${bs.length}]=${inspectPretty(bs)}`);
					model.bulkWrite(bs)
					.catch(err => console.warn(`${model.modelName}.bulkSave error: ${inspectPretty(err)}`))
					.then(bulkWriteOpResult => {
						console.debug(`${model.modelName}.bulkSave(): bulkWriteOpResult=${inspectPretty(bulkWriteOpResult)}`);
					});
				}
			}
		});
	});

});

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

module.exports = artefactSchema;
