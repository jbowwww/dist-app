"use strict";

const console = require('./stdio.js').Get('artefact', { minLevel: 'log' });	// log verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const util = require('util');
const _ = require('lodash');
const Q = require('q');
const mongoose = require('mongoose');

module.exports = ArtefactSchema;

function ArtefactSchema(...args) {
	if (!(this instanceof ArtefactSchema)) { return new ArtefactSchema(args); }
	console.debug(`ArtefactSchema: args=${inspect(args)}`);
	mongoose.Schema.call(this, ...args);

	this.add({
		createdAt: { type: Date, required: true },
		checkedAt: { type: Date, required: false },
		updatedAt: { type: Date, required: false },
		deletedAt: { type: Date, required: false }
	});
	this.pre('validate', function(next) {
		var model = this.constructor;
		console.debug(`${model.modelName}.pre('validate'): ${inspect(this._doc)}`);
		model.stats.saved++;
		if (!this.createdAt && !this.isNew) {
			var e = new Error(`presave, !doc.createdAt !this.isNew ${this.isModified()?'':'!'}this.isModified()`);
			model.stats.errors.push(e);
			return next(e);
		}
		var actionType = this.isNew ? 'created' : this.isModified() ? 'updated' : 'checked';
		model.stats[actionType]++;
		this[actionType + 'At']  = new Date();	// cascade current timestamp across the create,updated,checked TS's
		!this.updatedAt && (this.updatedAt = this.createdAt);
		!this.checkedAt && (this.checkedAt = this.updatedAt);
		return next();
	});
	this.method('create', function(doc) {
		console.debug(`${this.constructor.modelName}.create(${inspect(doc)})`);
		doc.model.prototype.create.call(doc, doc);
		model.emit('create', doc);
	});
	this.virtual('isDeleted', function() {
		return this.deletedAt && this.deletedAt <= Date.now();
	});
	this.method('markDeleted', function(timestamp = Date.now()) {
		if (this.deletedAt) { console.warn(`Doc being marked deleted already has deletedAt=${this.deletedAt}`); }
		this.deletedAt = timestamp;
		return Q(this);
	});
	this.method('updateDocument', function updateDocument(update, pathPrefix = '') {
		_.keys(update).forEach(k => {
			var docVal = this.get(pathPrefix + k);
			var updVal = update[k];
			if (this.schema.path(pathPrefix + k).instance === 'Embedded') {
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
	this.static('findOrCreate', function findOrCreate(query, data, cb) {
		var model = this;
		var debugPrefix = `[${typeof model} ${model.modelName}]`;
		console.debug(`${debugPrefix}.findOrCreate: data=${inspect(data)}`);
		return Q.Promise((resolve, reject, notify) => {
			model.findOne(query, (err, r) => {
				if (err) {
					this.stats.errors.push(err);
					console.warn(`${debugPrefix}.findOrCreate: findOne: ${err.stack||err}`);
					if (cb) { process.nextTick(() => cb(err)); }
					reject(err);
				} else {
					if (!r) {
						r = _.assign(model.create(data));	//, { type: data.type }
						this.stats.constructed++;
						console.debug(`${debugPrefix}.findOrCreate: new data=${inspect(r)}`);
					} else {
						this.stats.found++;
						console.debug(`${debugPrefix}.findOrCreate: db data=${inspect(r)}, update data=${inspect(data)}`);
						r.updateDocument(data);			// update only doc properties that have changed
					}
					if (cb)	cb(null, r);
					resolve(r);
				}
			});
		});
	});
	this.static
	this.on('init', function onSchemaInit(_model, ...args) {
		var debugPrefix = `model:${_model.modelName}:`;
		var schema = this;

		var baseAggregate = _model.aggregate;
		Object.defineProperty(_model, 'aggregate', { value: function aggregate(...args) {
			var model = this;
			var debugPrefix = `[${typeof model} ${model.modelName}]`;
			console.debug(`${debugPrefix} old aggregate: ${inspect(model.aggregate)}`);
			var agg = _.assign(baseAggregate.call(model, ...args), _.mapValues(model.schema.aggregates || {}, (aggValue, aggName) => (function (...args) {
				this.append(model.schema.aggregates[aggName](...args));
				return this;
			})));

			// Object.setPrototypeOf(agg, aggProto);
			console.debug(`${debugPrefix}.aggregate(${args.map(arg=>inspect(arg)).join(', ')})}: agg=${inspect(agg, { compact: false })}`);//`\naggProto=${inspect(aggProto)}`);
			return agg;
		}});

		Object.defineProperty(_model, 'aggregates', { value: _.bindAll(schema.aggregates || {}, _.keys(_model.aggregates)) });
		// _model.aggregates);

		Object.defineProperty(_model, 'stats', { value: {
			saved: 0,			// number of objects stored in db
			created: 0,			// number of objects stored in db were inserted because doc.isNew == true
			updated: 0,		// number of objects stored in db that were updated because doc.isNew == false, doc._id !== null && doc.isModified() === true
			checked: 0,		// number of objects that were passed to doc.store() that were not new or modified, and so did not require db actions
			found: 0,			// results found pre-existing in db in model.findOrCreate()
			constructed: 0,		// results from model.findOrCreate that were constructed using new Model()
			errors: []
			// get total() { return this.found + this.created + this.errors.length; },
			// toString() { return JSON.stringify(_.assign({}, this, { errors: this.errors.length })); }		//`found: ${this.found} created: ${this.created} errors: ${this.errors.length} total: ${this.total}`; } };
		} });

		Object.defineProperty(_model, 'bulkWriter', { value: function model_bulkWriter(options) {
			// var _model = this;
			var debugPrefix = `[${typeof _model} ${_model.modelName}]`;
			options = _.assign({
				payload: 120,
				concurrency: 1,
				BulkWriteTimeout: 3500,
				asyncTimeResolution: 3800,
				writeStreamFlushTimeout: 5000,
				getWriteOp(data) { return { insertOne: { document: data } }; },
				debugInterval: 8800
			}, options);
			console.verbose(`${debugPrefix}.bulkWriter(${inspect(options)}) getWriteOp=${options.getWriteOp}`);

			var self = _.assign(new cargo(bulkWrite, options.payload, options), {
				options, status: 'idle', finishing: false, finished: false, ended: false,
				_writes: 0, _writesDone: 0, _writesFail: 0, _ops: 0, _opsDone: 0, _opsFail: 0, _errors: [],
				_endDefer: Q.defer(),

				_debug(prefix = '', suffix = '') {
					console.verbose(self._getDebug(prefix, suffix));
				},
				_getDebug(prefix = '', suffix = '') {
					return `${debugPrefix}.bulkWriter: ${prefix}status=${self.status} writes=${self._writes} writesDone=${self._writesDone} writesFail=${self._writesFail} ops=${self._ops} opsDone=${self._opsDone} opsFail=${self._opsFail} ${suffix}`;
				},
				_debugInterval(interval = 10000) {
					// var delta = self.stats.delta(self.lastStats);
					self._debug();//`elapsed=${delta.elapsedSeconds}s`);//, `delta/s=${inspect(delta)}`);
					if (!self.finished && interval !== 0)
						Q.interval(interval, () => self._debugInterval(interval));
				},

				asStream() {
					var stream = _.assign(new Writable({
						objectMode: true,
						write(data, enc, cb) {
							self._writes++;
							self.push(data);
							cb();
						},
						final(cb) {
							self.finishing = true;
							self.status = 'finishing';
							self._debug(`flush #1`);
							self._spawnWorkers();
							if (self._queue.length === 0) {
								self.finished = self.ended = true;
								self.status = 'ended';
								self._debug(`self._queue.length === 0, finishing immediately`);
								process.nextTick(() => {
									self._endDefer.resolve();
									cb();
								})
							} else {
								self.once('empty', () => {
									self.finished = true;
									self.status = 'finished';
									self._debug(`flush #2`);
								});
								self.once('drain', () => {
									self.ended = true;
									self.status = 'ended';
									self._debug(`Last drain event, emitting end`);
									process.nextTick(() => {
										self._endDefer.resolve();
									cb();
									});
								});
							}
						}
					}), {
						waitFinishWrite() {
							return self._endDefer.promise;
						},
						endWait() {
							this.end();
							return self._endDefer.promise;
						},
						_getDebug(prefix = '', suffix = '') { return self._getDebug(prefix, suffix); }
					});
					stream.on('error', (err) => {
						console.warn(`${debugPrefix}.bulkWriter.error: ${err.writeErrors||inspect(err, { compact: false })||err.message||err.stack||err}`);//\n\n\top = ${inspect(err)}\n`);
						self._errors.push(err);
					});
					self.on('empty', () => stream.emit('empty'));
					self.on('drain', () => stream.emit('drain'));
					self.on('error', err => stream.emit('error', err));
					return stream;
				}
			});

			[ 'insertOne', 'updateOne', 'updateMany', 'deleteOne', 'deleteMany', 'replaceOne' ].forEach(op => {
				self[op] = (_options = {}) => {
					_.assign(self.options, {
						getWriteOp: (data) => {
							console.debug(`${debugPrefix}.bulkWriter.${op}: ${inspect(data)}`);
							return _model.schema.bulkWriterOps[op](data);
						}
					});
					console.debug(`${debugPrefix}.bulkWriter.${op}: options.getWriteOp=${self.options.getWriteOp}`);
					return self;
				};
				console.debug(`${debugPrefix}.bulkWriter.${op} = ${self[op].toString()}`);
			});
			console.debug(`${debugPrefix}.bulkWriter.options.getWriteOp = ${self.options.getWriteOp}`);

			self._debugInterval(self.options.debugInterval);
			return self;

			function bulkWrite(batchData, callback) {
				self._ops++;
				self.status = 'writing';
				var now = new Date();
				var result = _model.bulkWrite(batchData, {ordered: false});
				(self.options.BulkWriteTimeout === 0 ?result : result.timeout(self.options.BulkWriteTimeout))
				.then(r => {
					self._opsDone++;
					self._writesDone += batchData.length;
					self.status = 'idle';
					self._debug(`bulkWrite: batchData.length=${batchData.length}`);
				}).catch(err => {
					self._opsFail++;
					self._writesFail += batchData.length;
					self.status = 'error';
					process.nextTick(() => {
						console.warn(`${debugPrefix}.bulkWrite error: for op=${JSON.stringify(batchData)}:\n${err}`);
						self._debug();
						self.emit('error', err);
						callback(err);			// throw err;	// rethrow so promise chain doesn't continue executing
					});
				}).then(() => {
					callback();
				}).done();
			}
		} });

		console.verbose(`${debugPrefix} model=${inspect(_model, { compact: false })}`);
	});
}

util.inherits(ArtefactSchema, mongoose.Schema);
