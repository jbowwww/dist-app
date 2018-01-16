
module.exports = mixin({}, mongoose, {

	connection: null, //mongoose.connection,
	connect(url, options = {}) {
		console.debug(`connect(url='${url}', options=${JSON.stringify(options)})`);
		options = mixin({ connectTimeout: 5000 }, options);
		mongoose.connection.url = url;
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

	// 1708130329: Can probably remove this now. Maybe the model.bulkWriter stuff to if schema plugin approach works
	Schema: function(paths, options) {
		// options = mixin({ timestamps: { createdAt: '_ts_c', updatedAt: '_ts_u' } }, options);
		console.debug(`schema: paths=${inspect(paths)} options=${inspect(options)}`);
		return mixin(_mongooseSchema.call(this, paths, options), {
			projectAll: (() => {
				var p = {};
				for (var path in paths)
					p[path] = 1;
				return p;
			})()
		});
	},
	
	// maye 'name' should be less ambiguous ie 'modelName'
	model: function(name, schema, ...args) {
		console.verbose(`model: name=${name} schema='${schema}' args=${inspect(args)}`);
		var _model = _mongooseModel.call(mongoose, name, schema, ...args);
		// ((_model) => {
		console.debug(`_model: ${inspect(_model)}`);

		/* 1707200103: Is there any better way (there are many, i imagine) syntactically to define 'classes' ?
		// might also be nice / worth sepaating this sorta thing into its own src file(or folder a la ./util)
		*/
		var BulkWriterStats = util.inherits(null, function Stats() {
			this.writes = 0;
			this.writesDone = 0;
			this.ops = 0;
			this.opsDone = 0;
		}, {
			_baseDeltaStamp: { value: new Date(), enumerable: false, writable: true },
			delta: { value: function BulkWriterStats_delta(referenceStats) {
				var deltaStamp = new Date();
				var elapsedSeconds = (deltaStamp - (referenceStats.deltaStamp || this._baseDeltaStamp)) / 1000;
				if (elapsedSeconds < 1) elapsedSeconds = 1;
				/* 1707200059: TODO: Consider simplifying this object declaration by removing Object.create, hate that syntax - like you did
				 * in a couple other places in this file. Main use it has is declaring non-enumerale etc properties, maye you can write a 
				 * helper fn if u have need for that */
				var d = Object.create(Object.prototype, {	
					elapsedSeconds: { value: elapsedSeconds, enumerable: false },
					writes: { value: roundNumber((this.writes - referenceStats.writes) / elapsedSeconds), enumerable: true },
					writesDone: { value: roundNumber((this.writesDone - referenceStats.writesDone) / elapsedSeconds), enumerable: true },
					ops: { value: roundNumber((this.ops - referenceStats.ops) / elapsedSeconds), enumerable: true },
					opsDone: { value: roundNumber((this.opsDone - referenceStats.opsDone) / elapsedSeconds), enumerable: true }
				});
				referenceStats.writes = this.writes;
				referenceStats.writesDone = this.writesDone;
				referenceStats.ops = this.ops;
				referenceStats.opsDone = this.opsDone;
				referenceStats.deltaStamp = deltaStamp;
				return d;
			} }
		});

		/* 1705180949: Currently not working?
		// 1706230428: Maybe working now
		// 1707190043: Working in (2) prev backups (170718****)
		// 1707190452: With large dataset seems to do 1 op per batch, after inital async cargo pause .. need cargo batch timeout resolution support (options.asyncTimeResolution)
		// 1707212200: OK. but stream seems to ecome unreliable on ig fs scans (eg never closing as if its backed up, ut no errors
		// 1708111126: After fair bit of use/testing I think this is more or less good now - has worked repeatedly for entire network drive scans on H: and I:
		*/
		// _model.bulkWriter = 
		
		// Builds a _model.bulkWriters object that has a member for each standard op in the object below
		var bulkWriterOps = {
			updateOne: data => ({ updateOne: { filter: { path: data.path }, update: data, upsert: true } })
			// 1708020944: TODO: the other writers/ops
		};
		_model.bulkWriters = {};
		_.forEach(bulkWriterOps, (opFunc, opName) => {
			_model.bulkWriters[opName] = (options = {}) => model.bulkWriter(Object.assign(options, { getWriteOp: opFunc }));
		});
	
		return _model;
	}
});

