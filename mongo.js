"use strict";

const console = require('./stdio.js').Get('mongodb', { minLevel: 'log' });	// log verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 2, compact: false /* false */ });
const util = require('./util');
const mixin = require('./utility.js').mixin;
const _ = require('lodash');
const { Writable } = require('stream');
const miss = require('mississippi');
const cargo = require('./cargo.js');
const Q = require('./q.js');
const mongoose = require('mongoose');
mongoose.Promise = Q.Promise;

var _mongooseSchema = mongoose.Schema;
var _mongooseModel = mongoose.model;

mongoose.plugin(function globalPlugin(schema, options) {
	console.debug(`global schema: schema=${inspect(schema)}`);

	schema.__ts_c = { type: Date, required: true };//, default: Date.now };
	schema.__ts_u = { type: Date, required: true };//, default: Date.now };

	schema.methods.updateDocument = function updateDocument(update, pathPrefix = '') {
		console.verbose(`updateDocument: ${update.path}`);
		_.keys(update).forEach(k => {
			console.verbose(`updateDocument: ${k}`);
			var docVal = this.get(pathPrefix + k);
			var updVal = update[k];
			if (this.schema.path(pathPrefix + k).instance === 'Embedded') {
				console.verbose(`${pathPrefix + k}: Embedded`);
				this.updateDocument(updVal, pathPrefix + k + '.');
			} else if (!_.isEqual(docVal, updVal)) {
				console.verbose(`${pathPrefix + k}: Updating ${docVal} to ${updVal}`);
				this.set(pathPrefix + k, updVal);
			} else {
				console.verbose(`${pathPrefix + k}: No update to ${docVal}`);
			}
		});
		return Q(this);
	};

	schema.methods.store = function store(writer, cb) {
		//data = self.options.getWriteOp(data);

		console.verbose(`store: ${this.path}`);
		var model = this.constructor;
		model.stats.stored++;
		var defer = Q.defer();
		var doc = this;
		var rawData = this.toObject();
		var output;
		if (typeof writer === 'function') {
			cb = writer;
			output = model;
		} else {
			output = writer;
		}
		var innerCb = (err) => {
			if (err) { defer.reject(err); }
			else { defer.resolve(doc); }
			if (cb) { cb(err, doc); }
		};
		if (this.isNew) {
			model.stats.created++;
			console.verbose(`isNew: ${this.path}`);
			rawData.__ts_c = rawData.__ts_u = new Date();
			output.write({ insertOne: { document: rawData } }, innerCb);
		} else if (this.isModified()) {
			model.stats.modified++;
			console.verbose(`isNotNew: ${this.path}`);
			var id = rawData._id;
			delete rawData._id;
			delete rawData.__ts_c;
			rawData.__ts_u = new Date();
			output.write({ updateOne: { filter: { _id: id }, update: { $setOnInsert: { '__ts_c': new Date() }, $set: rawData }, upsert: true } }, '', innerCb);
		} else {
			model.stats.unmodified++;
			innerCb();
		}
		return defer.promise;
	};

	schema.statics.findOrCreate = function  findOrCreate(query, file, cb) {
		var model = this;
		var debugPrefix = `[${typeof model} ${model.modelName}]`;
		console.debug(`${debugPrefix}.findOrCreate: file=${inspect(file)}`);
		return Q.Promise((resolve, reject, notify) => {
			model.findOne(query, (err, r) => {
				if (err) return findOrCreateHandleError(err, cb);
				if (!r) {
					r = _.assign(new model(file));	//, { type: file.type }
					this.stats.constructed++;
					console.debug(`${debugPrefix}.findOrCreate: new file=${inspect(r)}`);
				} else {
					this.stats.found++;
					console.debug(`${debugPrefix}.findOrCreate: db file=${inspect(r)}, update file=${inspect(file)}`);
					r.updateDocument(file);			// update only doc properties that have changed
				}
				if (cb)	cb(null, r);
				resolve(r);
			});
		});
		function findOrCreateHandleError(err, prefix, cb) {
			this.stats.errors.push(err);
			if (typeof prefix === 'function') {
				cb = prefix;
				prefix = 'Error';
			} else if (!prefix) {
				prefix = 'Error';
			}
			console.warn(prefix + ': ' + err);	//.stack||err.message||err);
			if (cb) process.nextTick(() => cb(/* err */));
		}
	};

	schema.on('init', function onSchemaInit(_model, ...args) {
		var debugPrefix = `model:{_model.modelName}: `;
		var schema = this;

		Object.defineProperty(_model, 'aggregates', { value: schema.aggregates || {} });
		Object.defineProperty(_model, 'stats', { value: {
			found: 0,			// results found pre-existing in db in model.findOrCreate()
			constructed: 0,		// results from model.findOrCreate that were constructed using new Model()
			stored: 0,			// number of objects stored in db
			created: 0,			// number of objects stored in db were inserted because doc.isNew == true
			modified: 0,		// number of objects stored in db that were updated because doc.isNew == false, doc._id !== null && doc.isModified() === true
			unmodified: 0,		// number of objects that were passed to doc.store() that were not new or modified, and so did not require db actions
			errors: [],
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

		console.verbose(`${debugPrefix} model='${inspect(_model)}' args=${inspect(args)}`);	// : ${inspect(_model)}`);
	});
});
module.exports = mongoose;
// module.exports = mixin(mongoose, {
/*
	//connection: null, 				// mongoose.connection,
	connect(url, options = {}) {
		console.debug(`connect(url='${url}', options=${JSON.stringify(options)})`);
		options = mixin({ connectTimeout: 5000 }, options);
		//mongoose.connection.url = url;
		var isConnected = false;
		return Q.Promise((resolve, reject, notify) => {																	// this.connection = mongoose.createConnection(url, options)
			mongoose.connect(url).then(() => this.connection = mongoose.connection);			// return Q(mongoose.connect(url)).timeout(5000).then(() => {
			mongoose.connection.on('open', () => {																				// should i be assigning event handlers efore calling connect?
				isConnected = true;
				console.verbose(`db connected on '${url}': ${this.connection}`);
				resolve(mongoose.connection);
			}).on('error', err => {
				console.error(`db connection error on '${url}': ${err.stack||err}`);
				reject(err);
			}).on('disconnected', () => {
				console.warn(`db disconnected from '${url}'`);
			});
			process.on('SIGINT', () => {																									// this should either e handled at app level, or only do the db
				console.warn(`Process got SIGINT, closing db and exiting`);									// disconnect here and let app do rquired cleanup&exit
				console.debug(`mongoose.connection: ${inspect(mongoose.connection)}`);
				mongoose.connection.close(() => process.exit(0));														// should exit code be !=0?
			});
			Q.delay(options.connectTimeout).then(() => {
				if (!isConnected) {
					var err = new Error(`db connect timed out for '${url}' after ${options.connectTimeout} ms`);
					console.error(err.message);
					reject(err);
				}
			});
		});
	},
	disconnect() {
		return Q.ninvoke(mongoose.connection, 'close');
	},

	// 1708130329: Can probably remove this now. Maybe the model.bulkWriter stuff to if schema plugin approach works
	// Schema: function(paths, options) {
		// options = mixin({ timestamps: { createdAt: '_ts_c', updatedAt: '_ts_u' } }, options);
	// 	console.debug(`schema: paths=${inspect(paths)} options=${inspect(options)}`);
	// 	return _mongooseSchema.call(this, paths, options);
	// },

	// maybe 'name' should be less ambiguous ie 'modelName'
	// model: function(name, schema, ...args) {
	// 	var _model = _mongooseModel.call(mongoose, name, schema, ...args);
    //
	// }
});
*/
	/*
	schema.query = {

	// idea for doing chaining-style method calls eg model.find(). ... .batchWrites().updateOne()
	// but too hard to get my head around right now
		batchWrites(options, cb) {
			this._batchWriteOptions = _.assign({		// other bulk write query methods require this property to be set on the query or will error
				batchSize: 100,					// how many operations to batch together
				batchTimeout: 1000			// once the first op is added to a batch, the batch will execute after this timeout even if its size is < batchSize
			});
			this._batchWrite = [];
		},

		updateOne(
	};*/
