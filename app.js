
const console = require('./stdio.js').Get('app', { minLevel: 'verbose' });		// debug verbose log
const util = require('./util');
const inspect =	require('./utility.js').makeInspect({ depth: 1, compact: true });
// const inspect2 = require('./utility.js').makeInspect({ depth: 3, compact: false });
const mixin = require('./utility.js').mixin;
const promisifyEmitter = require('./utility.js').promisifyEmitter;
const _ = require('lodash');
const EventEmitter = require('events');
const objStream = mixin(require('through2'), {
	// spy: require('through2-spy'),
	// filter: require('through2-filter')
}).obj;
const fs = require('./fs.js');
const Collection = require('./Collection.js');
const Q = require('./q.js');
const mongo = require('./mongo.js');
const express = require('express');
const Timestamps = require('./timestamps.js');

var app = {

	options: require('./app-options.js'),
	timestamps: new Timestamps(),
	errors: [],	warnings: [],

	schemas: {},
	models: {},
	writers: {},

	runTask(task, debug){
		typeof task === 'function' && (task = { fn: task, options: { /* default task Options */ } });
		if (!task.fn) { throw new TypeError(`runTask: expected task object with fn method`); }
		var debugInterval = debug && debug.fn ? setInterval(debug.fn, debug.interval) : null;
		console.verbose(`runTask: starting task function ${task.fn.name||'[AnonFunc]'}`);
		return this.$init.then(task.fn).then(ret => {
			console.verbose(`runTask: task returned ${inspect(ret)}`);
			if (debugInterval) {
				clearInterval(debugInterval);
				debug.fn();
			}
		}).catch(err => this.onWarning(err));
	},
	exit(exitCode) {
		if (exitCode instanceof Error) {
			 console.error(`\n\napp.exit: ${exitCode.stack||exitCode}`);
			 exitCode = 1;
		} else {
			exitCode = exitCode || 0;
		}
		console.log(`exit: exitCode=${exitCode}`);
		(app.db ? app.db.connection.close : process.nextTick)(() => process.exit(exitCode));
	},

	get $init() {
		return Q.all(this._$inits).then(() => {
			console.verbose(`init done`);
			console.debug(`app = ${inspect(this, { depth: 4, compact: false })}`);
		}).catch(err => {
			this.exit(err);
		})
	},
	_init(propertyName, promise) {
		if (isPromise(propertyName)) {
			promise = propertyName;
			propertyName = null;
		} else if (!isPromise(promise)) {
			throw new TypeError('app._init: expected promise argument');
		}
		this._$inits.push(promise);
		promise.then(ret => propertyName && (app[propertyName] = ret)).done();	// careful proomise implementation doesnt effect that 'this' beccomes the promise nad not the app object
	},
	_$inits: [],

	markPoint(name, doStat) {
		this.timestamps.mark(name);
		console.verbose(`markPoint: ${name}: ${this.timestamps.end[name]} ( duration=${this.timestamps.end[name] - this.timestamps.start} start=${this.timestamps.start} )`)
		doStat && this._debugIntervalOptions && this._debugIntervalOptions.fn(name);
	},
	getStats() {
		return { options: app.options, timestamps: app.timestamps, errors: app.errors, warnings: app.warnings, schemas: app.schemas };
	},
	onWarning(err, prefix = 'Warn', cb) {
		console.warn(`${prefix}: ${err.stack||err}`);
		this.warnings.push(err);
		if (cb) {
			process.nextTick(() => cb(err));
		}
	},
	onError(err, prefix = 'Error', cb) {
		console.error(prefix + ': ' + err.stack||err.message||err);
		this.errors.push(err);
		cb && process.nextTick(() => cb(err));
	}

};

process.on('SIGINT', () => {																									// this should either e handled at app level, or only do the db
	console.warn(`Process got SIGINT, closing db and exiting`);									// disconnect here and let app do rquired cleanup&exit
	console.debug(`mongoose.connection: ${inspect(mongo.connection)}`);
	//mongoose.connection.close(() => process.exit(0));														// should exit code be !=0?
	app.exit(0);
});

app._init('db', mongo.connect(app.options.db.url).then(r => r));
app._init('baseHash', fs.hash(fs.path.resolve(__dirname, __filename)));

var $hashes = [];
app._init(promisifyEmitter(fs.iterate(app.options.schemaPath).on('data', file => {
	console.debug(`fs.iterate.on('data'): file.path='${file.path}'`);
	if (file.stats.isFile() && file.path.endsWith('.js')) {
		var module, moduleName = fs.path.basename(file.path, '.js');
		try {
			module = require(file.path);
			Object.defineProperty(module, 'name', { value: moduleName });
			Object.defineProperty(module, 'path', { value: file.path });
		} catch (err) {
			return console.warn(`Error in module '${moduleName}': ${err.stack||err}`);
		}
		$hashes.push( fs.hash(file.path).then(hash => {
			console.verbose(`Schema module '${moduleName}': hash=${hash}`);
			Object.defineProperty(module, 'hash', { value: hash });
			app.models[moduleName] = module;
		}));
	}
})).then(() => Q.all($hashes)));

function isPromise(pr) {
	return typeof pr === 'object' && typeof pr.then === 'function';// && pr.put;
}

app.h = express().use(function httpLogger(req, res, next) {	// dont think i need to call next() if i dont declare it?
	console.log(`HTTP ${req.method} ${req.originalUrl}`);
	next();
}).get('/quit', function (req, res) {
	res.send('Quit');
	console.log('Quit via HTTP GET');
	app._appExit.resolve();
}).get('/debug', function (req, res) { res.json(app.getStats()); })
.get('/db/:moduleName/:modelName', function(req, res) {
	var model = app.models[req.params.moduleName][req.params.modelName];
	model.find().then(results => {
		res.json(results);
	}).catch(err => app.onError(err)).done();
}).get('/db/:moduleName/:modelName/:aggregate', function(req, res) {
	var moduleName = req.params.moduleName;
	var modelName = req.params.modelName;
	var aggName = req.params.aggregate;
	var model = app.models[moduleName][modelName];
	var aggregatePipeline = model.aggregates[aggName];
	console.verbose(`aggregatePipeline: ${inspect(aggregatePipeline, { depth: 8, compact: false })}\nmodel.aggregates: ${inspect(model.aggregates, {depth:8,compact:false})}`);		//  moduleName=${moduleName} modelName=${modelName} aggName=${aggName}  agg=${inspect(agg)}
	var agg = model.aggregate(aggregatePipeline).option({allowDiskUse:true});//.stream();//cursor();
	agg.then(data => { //cursor();//.exec();
	// console.debug(`agg: ${inspect(agg, { depth: 2, compact: false })}`);
	// agg.each(data => {//.exec();
	// agg.pipe(objStream((data, enc, cb) => {
		// this.push(JSON.stringify(data));
		res.json(data);
		res.end();
		// cb();
	})//, (cb) => { res.end(); cb(); }));
	// agg.on('error',
	.catch(
	 err => app.onWarning(err, 'Aggregation error for pipeline ${moduleName}.${modelName}.{$aggName}'))
	/*
	var results = [];
	agg.each(result => results.push(result));
	res.json(results);
	*/
	//agg.on('error', err => { results.push({error: err}); agg.end(); });
	//agg.on('data', result => { results.push(result); });
	//agg.on('end', () => { res.json(results); });
}).use(function (err, req, res, next) {
	if (err) {
		var msg = `Error processing HTTP ${req.method} ${req.originalUrl}`;
		app.onWarning(err, msg);
		res.app.app.app.status(500).send(`${msg}: ${err.stack||err}`);
	} else {
		console.warn*(` --##-- express error handling MW gets called with err === null`);
	}
}).listen(3000);

module.exports = app;
