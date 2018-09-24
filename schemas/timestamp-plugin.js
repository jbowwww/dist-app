"use strict";
const console = require('../stdio.js').Get('schemas/timestamp-plugin', { minLevel: 'log' });	// log verbose debug
// const inspect = require('./utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const inspectPretty = require('../utility.js').makeInspect({ depth: 2, compact: false });
// const util = require('util');
const _ = require('lodash');
const Q = require('q');
// const mongoose = require('mongoose');

module.exports = function timestampSchemaPlugin(schema, options) {
	schema.add({
		_ts: {
		createdAt: { type: Date, required: true, default: () => Date.now() },
		checkedAt: { type: Date, required: false },
		updatedAt: { type: Date, required: false },
		deletedAt: { type: Date, required: false }
	} });

	schema.pre('validate', function(next) {
		var model = this.constructor;
		if (!this._ts.createdAt && !this.isNew) {
			return next(new Error(`${model.modelName}.pre('validate')#timestampSchemaPlugin: !doc._ts.createdAt !this.isNew ${this.isModified()?'':'!'}this.isModified()`));
		} else if (this._ts.created && this.isNew) {
			return next(new Error(`${model.modelName}.pre('validate')#timestampSchemaPlugin: doc._ts.createdAt && this.isNew ${this.isModified()?'':'!'}this.isModified()`));
		}
		var actionType = this.isNew ? 'created' : this.isModified() ? 'updated' : 'checked';
		var now = Date.now();
		// this._ts[actionType + 'At']  = new Date();	// cascade current timestamp across the create,updated,checked TS's
		if (actionType === 'updated') {
			this._ts.updatedAt = now;
		} else if (!this._ts.updatedAt) {
			this._ts.updatedAt = this._ts.createdAt;
		}
		this._ts.checkedAt = now;	// changing semantics slightly to always update checkedAt, even if updatedAt updated. Hopefully makes querying for outdated data simpler by only requireing one comparison
		console.verbose(`${model.modelName}.pre('validate')#timestampSchemaPlugin: actionType=${actionType} isNew=${this.isNew} ${this.modifiedPaths().join(' ')}`); //this=${inspectPretty(this.schema)} parent=${inspectPretty(this.$parent)}`);
		return next();
	});

	schema.virtual('isDeleted', function() {
		return this._ts.deletedAt && this._ts.deletedAt <= Date.now();
	});
	
	schema.method('markDeleted', function(timestamp = Date.now()) {
		if (this._ts.deletedAt) { console.warn(`Doc being marked deleted already has deletedAt=${this._ts.deletedAt}`); }
		this._ts.deletedAt = timestamp;
		return Q(this);
	});
}
