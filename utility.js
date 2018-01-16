
const console = require('./stdio.js').Get('utility', { minLevel: 'log' });	// debug verbose log
const Q = require('q');
const EventEmitter = require('events');//eventemitter3');
const util = require('util');

var _defaultInspectOptions = { depth: 1, breakLength: 77 /* Infinity */, colors: false, compact: true };
var makeInspect = (defaultOptions) => {
	var baseOptions = mixin({}, _defaultInspectOptions, defaultOptions);
	console.debug(`makeInspect: baseOptions=${inspect(baseOptions)}`);//_innerInspect=${_innerInspect}`);
	return (subject, options) => {
		var opts = mixin({}, baseOptions, options);
		console.verbose(`_innerInspect(subject: ${inspect(subject)}, options: ${inspect(options)}):\n\tbaseOptions=${inspect(baseOptions)}\n\topts=${inspect(opts)}`);
		var r = util.inspect(subject, opts);
		return opts.compact ? r.replace(/\ *\n\ */g, ' ') : r;
	};
};
var inspect = (subject, options) => util.inspect(subject, mixin({}, _defaultInspectOptions, options));

// var mainPath = require('./fs').path.dirname(require.main.filename);
// console.verbose(`mainPath: ${mainPath}`);

module.exports = {
	// require()'s a file using a path relative to the main module's location
	// include: function(path) {
		// return require(fs.path.join(mainPath, path));
	// },
	formatSize
,	padNumber
,	roundNumber
, padString
, isEmptyString
, isNullOrEmptyString
,	isNullOrWhitespaceString
, makeInspect
,	inspect
// ,	inspectOwn: (require('util').inspect)//inspectOwn
,	mixin
, pipeline
, bindMethods
,	promisifyEmitter
};

// return a string with the supplied size in bytes, formatted as B, KB, MB, GB or TB
function formatSize(size, options = { precision: 2, spacer: ' ' }) {
	var units = [ 'B', 'KB', 'MB', 'GB', 'TB' ];
	for (var unit = 0; unit < units.length && size >= 1024; unit++) {
		size /= 1024;
	}
	return '' + size.toFixed(options.precision) + options.spacer + units[unit];
}

//pro shouldnt mod the proto eh??
// 1704050209: Case in point: Spent ages figureing out why mongoose had weird error using find() (castforquery not a fn) - was due to modification of Object.prototype
// String.prototype.pad = padString;
function padString(length, str, padChar = ' ') {
	var len = str.length;
	return length > len ?	str + padChar.repeat(length - len) : str;
};

// String.prototype.isEmpty = isEmptyString;
function isEmptyString() {
	return typeof this === 'string' && this.length == 0;
};

// String.prototype.isNullOrEmpty = isNullOrEmptyString;
function isNullOrEmptyString() {
	return !this || (typeof this === 'string' && this.length == 0);
};

// String.prototype.isNullOrWhitespace = isNullOrWhitespaceString;
function isNullOrWhitespaceString() {
	return !this || (typeof this === 'string' && this.trim().length == 0);
};

// Number.prototype.pad = padNumber;
function padNumber(length, padChar = ' ') {
	return this.toString().pad(length, padChar);
}

// Number.prototype.round = roundNumber;
function roundNumber(number, precision = 1) {
    var factor = Math.pow(10, precision);
    var tempNumber = number * factor;
    var roundedTempNumber = Math.round(tempNumber);
    return roundedTempNumber / factor;
};
/* 1705200422: Another example of modification of built in prototypes causing issues - these
// were being enumerated in for .. in blocks. Not actually in use anyway so commented but leaving
// here with thsi comment for now as lesson to self
*/
// Array.prototype.first = first;
function first() {
	return this[0];
}
// Array.prototype.last = last;
function last() {
	return this[this.length - 1];
}

function mixin(target, ...sources) {
	for (var source of sources) {
		for (var name in source) {
			target[name] = source[name];
		}
	}
	return target;
}

function bindMethods(target, ...sources) {
	for (var source of sources) {
		for (var name in source) {
			var srcProp = source[name];
			target[name] = typeof srcProp !== 'function' ? srcProp : srcProp.bind(target)		/* source.hasOwnProperty(name) ? srcProp : */
			/* Object.defineProperty(target, name, {
				// value: typeof srcProp !== 'function' ? srcProp : srcProp.bind(target),		// source.hasOwnProperty(name) ? srcProp :
				// configurable: true,
				// writeable: false,
				// enumerable: true
			// });
			*/
		}
	}
	return target;
}

/* 1703060158: TODO: As always consider more first, but what may be more useful (or maybe replace promisifyEmitter or others)
// is a fn which can be used in situations like fs.iterate (where you tried promisifyEmitter and mixin), that allows
// to construct a new EventEmitter (and/or mixin w promises) that 'inherits' or 'composes' from another EE. Consider whether you
// personally prefer EE or promise syntax, and relative merits of each - EE intuitively seems more flexible due to arbitrary event
// names, but the advantage of promises (to my so far limited understanding) is composibility - so this hypothetical new fn would
// pass events from the original EE to the new one, possibly other features
// 1705200425: With a little more understanding and trial and error etc the above is sort of what the 'pipeline' func below does
// Also several libs available that do similar sorts of things - chaining emitters - like through2, es/event-stream (TODO: try that it looks handy), mississipi(?)
*/
function promisifyEmitter(emitter, options) {		// 1705200429: replaced following with 'options' param(and added errorEvent) - resolveEvent = 'end', resolveTransform, errorTransform) {
	options = mixin({ resolveEvent: 'end', errorEvent: 'error' }, options || {});		// with resolveEvent or errorEvent set to null, will disable resolve/reject
	console.debug(`promisifyEmitter: options: ${inspect(options)} emitter.on=${emitter.on}`);
	var deferred = Q.defer();
	var promise = deferred.promise;
	if (typeof options.errorEvent === 'string') {
		emitter.on(options.errorEvent, function(...args) {
			if (options.errorTransform)
				args = options.errorTransform.apply(deferred, args);
			console.debug(`promisifyEmitter(): on '${options.errorEvent}': rejecting promise${options.errorTransform?' (via transform):':''}:${inspect(args)} this=${inspect(this)}`);
			process.nextTick(() =>
			deferred.reject(args)
			);
		});
	}
	if (typeof options.resolveEvent === 'string') {
		emitter.on(options.resolveEvent, function(...args) {
			if (options.resolveTransform)
				args = options.resolveTransform.apply(deferred, args);		//options.resolveTransform.toString()
			console.debug(`promisifyEmitter(): on '${options.resolveEvent}': resolving promise${options.resolveTransform?' (via transform):':''}:${inspect(args)} this=${inspect(this)}`);
			// process.nextTick(() =>
			deferred.resolve(options.resolveTransform ? options.resolveTransform(args) : args)
			// );
		});
	}
	var r = mixin(emitter, promise);
	console.debug(`promisifyEmitter: options: ${inspect(options)} emitter.on=${emitter.on}`);
	console.debug(`r = ${inspect(r)}`);
	return r;
}

function pipeline(...transforms) {
	var transform, stage;
	// console.debug(`pipeline: transforms: ${(transforms).map(t => t.constructor.name).join(', ')}`);///${transforms.map(t => 'through2(options: ' + JSON.stringify(t.options) + ')\n').join()}`);
	for (stage = transforms.shift(); transform = transforms.shift(); stage = stage.pipe(transform)) {
		((stage, transform) => {
			stage.on('error', err => { /* console.error(` !! ${err.stack||err}`); */ process.nextTick(()=> {transform.emit('error', err); }); });
			stage.on('end', function(...args) {
				console.debug(`stream end: this=${inspect(this)}`);//._writableState.pendingcb}`);
				transform.end();		//destroy();//emit('end')
			});

		})(stage, transform);
	}
	return stage;
}
