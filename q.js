
const console = require('./stdio.js').Get('Q', { minLevel: 'debug' });		// debug verbose
//const inspect =	require('./utility.js').makeInspect({depth: 1/* , compact: false */}

const _ = require('lodash');
const mixin = require('./utility.js').mixin;
const Q = require('q');

module.exports = mixin(Q, {
	
	longStackSupport: true,
	
	// onerror(err) { console.error(`\n! Q.onerror: ${err.stack||err}\n`); },
	
	_appExit: false,
	
	// Set up a recurring interval timer (a la setInterval) using Q
	interval(delay, options, cb) {
		if (typeof options === 'function') {
			options = { firstCallImmediate: false };
			cb = options;
		} else {
			options = _.assign({ firstCallImmediate: false }, options);
		}
		var end = false, cancel = false;
		var m = mixin(
			Q.delay(delay).then(() => this.run()), {
				run() {
					if (this._appExit) {
						console.warn(`interval(${delay}, [Function ${cb.name}]): end=${end} cancel=${cancel} appExit=${module.exports._appExit}: Not executing due to process.exit`);
					} else {
						console.debug(`interval(${delay}, [Function ${cb.name}]): end=${end} cancel=${cancel} appExit=${module.exports._appExit}`);	//this=${inspect(this)}`);
						if (!cancel) {
							cb();
							if (!end) {
								process.nextTick(() => {		// give process a chance to exit() if needed before setting another interval
									Q.delay(delay).then(run);//interval(cb, delay);
								});
							}
						}
					}
				},
				// ends the interval but lets the previously scheduled cb to still fire
				end() { end = true; },
				cancel() { end = cancel = true; }	
			});
		if (options.firstCallImmediate) {
			process.nextTick(() => m.run());
		}
		return m;
	}
	
});
