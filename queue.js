"use strict";
const console = require('./stdio.js').Get('queue', { minLevel: 'verbose' });	// verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 1, compact: false });		// false true
const util = require('./util');
const EventEmitter = require('events');
const _ = require('lodash');
const Q = require('./q.js');

module.exports = util.inherits(EventEmitter, function Queue(concurrency, worker) {
	this.options = _.assign({ concurrency: 1 }, { concurrency });
	// 1708070136: Below doesn't work. Prob something to do with my own util.inherits
	// if (!(this instanceof Cargo)) return new Cargo(worker, payload, options);
	this._workerCount = 0;
	this._worker = worker;
	this._queue = [];
	console.debug(`queue: ${inspect(this)}`);
}, {
	push(data) {
		return (function innerPush() {
			if (++this._workerCount >= this.options.concurrency) {
				this._workerCount = 0;
				Q.any(this._queue).then(innerPush());
			}
			this._queue[this._workerCount] = this._worker(data);
			return this._queue[this._workerCount];
		})();
	}	
	});
				
		// console.debug(`_queue.length = ${this._queue.length} after push`);
		// process.nextTick(() => {