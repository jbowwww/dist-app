
"use strict";

const console = require('../stdio.js').Get('bin/fs/source-pipe', { minLevel: 'log' });	// verbose debug log
const stream = new require('stream');
const _ = require('lodash');
const Q = require('../q.js');
const inspect = require('util').inspect;

function chainPromiseArray(chain) {
	return data => chain.reduce(
		(promiseChain, currentTask) =>
			promiseChain.then(currentTask),
			Q(data)
	);
}

module.exports = function sourcePipe(source, promisePipe, options) {

	options = _.defaultsDeep(options, {
		// caller may choose to throw the error in their own error handler, in which case it will reject the sourcePipe call. Default is simple warning.
		onError(err) {
			console.warn(`sourcePipe: ${err.stack||err.message||err}`);
		}
	});

	return Q.Promise((resolve, reject) => {	

		if (typeof source === 'function') {
			source = source();
		}
		if (typeof source !== 'object' || typeof source.emit !== 'function') {
			reject(new TypeError('source must be an emitter object or a function returning one'));
			// console.error('source =ust be a function or emitter object');
		}
		if (_.isArray(promisePipe) && _.every(promisePipe, element => _.isFunction(element))) {
			promisePipe = chainPromiseArray(promisePipe);
		}
		if (typeof promisePipe !== 'function') {
			reject(new TypeError('promisePipe must be a function'));
		}

		console.verbose(`sourcePipe: source=${source} promisePipe=${promisePipe}`);

		// The way this is set up, a promisePipe is potentially an array with multiple promise-returning func's
		// If it is, the func's are chained together in a way that is sort of similar to a thru-stream (i think)
		// Am I better piping to a series of thru streams, each representing one of the promisePipe functions (assuming an array of them) ?
		// - This way (promise-returning func's chained) may actually be at least as good as using thru-streams, but have a proper think of it/experiment/test
		// 	- Particularly with respect to buffering/stream flow control. As is, the aggregated promisePipe could potentially cause the source stream to pause
		// 	  and/or the stream data to get buffered, as it will not call the callback for stream.Writeable.write until the promiseChain is fulfilled
		// I think this is all ok, just give it a good proper think through and run experiemnts/tests if necessary

		// If you need any console output debug statements in the promisePipe stages, insert them into the promisePipe array programmatically, above.
		// Just means that this little bit of code can be nice and clean. Probably don't need any debug statements anytime soon anyway, just making a note

		source.pipe(new stream.Writable({
			objectMode: true,
			write(data, encoding, callback) {
				promisePipe(data)
				.then(newData => { callback(null /*, newData*/); })		// pass newData as 2nd arg if using a thru stream instead of a writeable
				// .catch(err => { callback(err); })		// callback(err) will emit('error') on the stream, handled by options.onError. User should catch() in their promisePipe to avoid erroring the stream
				.done();
			}
		}))
		.on('error', err => { options.onError(err); })	//console.error(`error: ${err.stack||err.message||err}`); })
		.on('finish', () => { console.verbose(`source.on('finish')`); resolve(); });

	});	
};
