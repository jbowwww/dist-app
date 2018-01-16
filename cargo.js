"use strict";
const console = require('./stdio.js').Get('cargo', { minLevel: 'verbose' });	// verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 1, compact: false });		// false true
const util = require('./util');
const EventEmitter = require('events');
const _ = require('lodash');
const Q = require('./q.js');

module.exports = util.inherits(EventEmitter, function Cargo(worker, payload, options) {
	this.options = _.assign({ concurrency: 1, asyncTimeResolution: 500 }, options, { payload });
	// 1708070136: Below doesn't work. Prob something to do with my own util.inherits
	// if (!(this instanceof Cargo)) return new Cargo(worker, payload, options);
	this._workerCount = 0;
	this._worker = worker;
	this._queue = [];
	console.debug(`cargo: ${inspect(this)}`);
}, {
	push(data) {
		this._queue.push(data);
		// console.debug(`_queue.length = ${this._queue.length} after push`);
		// process.nextTick(() => {
			this._spawnWorkers();
		// });
	},
	_spawnWorker() {
		var cargo = this._queue.slice(0, this.options.payload);
		this._queue = this._queue.splice(cargo.length);
		console.debug(`dispatching cargo of size ${cargo.length}, now _queue.length=${this._queue.length}`);
		this._workerCount++;
		process.nextTick(() => {
			Q(this._worker.call(this, cargo, () => {
				this._workerCount--;
				if (this._queue.length === 0) {
					this.emit('empty');
					if ( this._workerCount === 0) {
						this.emit('drain');
					}
				} else {
					// process.nextTick(() => {
						this._spawnWorkers();
					// });
				}
			})).catch(err => {
				console.warn(`cargo: Error in _worker(): ${err}`);
			}).done();
		});
		console.debug(`this._queue.length=${this._queue.length} this._workerCount=${this._workerCount}`);
		if (this._queue.length === 0) {
			this.emit('empty');
			if (this._workerCount === 0) {
				this.emit('drain');
			}
		}
	},		
	_spawnWorkers() {
		console.debug(`spawnWorkers: _workerCount=${this._workerCount} _q.length=${this._queue.length} spawnTimer=${this._spawnTimer} ts=${this._spawnTimestamp}`);
		while ((this._workerCount < this.options.concurrency) && (this._queue.length >= this.options.payload)) {
			this._spawnWorker();
			this._spawnTimestamp = new Date();
		}
		if (!this._spawnTimer) {
			console.debug(`Setting spawnTimer`);
			this._spawnTimer = 
			Q.delay(this.options.asyncTimeResolution).then(() => {
				console.debug(`spawnTimer: _queue length=${this._queue.length}`);
				if (this._queue.length > 0) {
					var timeSinceSpawn = new Date() - (this._spawnTimestamp || 0);
					console.debug(`spawnTimer#2: timeSinceSpawn=${timeSinceSpawn}`);
					if (timeSinceSpawn >= this.options.asyncTimeResolution) {
						if (this._queue.length > this.options.payload) {
							console.warn(`_queue length=${this._queue.length} > payload=${this.options.payload}`);
						}
						while ((this._workerCount < this.options.concurrency) && (this._queue.length > 0)) {
							this._spawnWorker();
						}
					}
					else {
						Q.delay(timeSinceSpawn).then(() => this._spawnWorkers()).done();
					}
				}
				delete this._spawnTimer;
			});//.done();
		}
		// else {
			// console.warn(`spawnTimer already set`);
		// }
	}
});