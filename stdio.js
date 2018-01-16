
// TODO: make more flexible ability to select messages (and level-based) and direct to process.std* and/or arbitrary streams (eg files, or add option to specify filename directly?)

// Examples:
// // Default console:
// var console = require('./stdio.js');
// // Custom source name (TODO doc other otions?)
// var console = new (require('./stdio.js').Console)('index');
// below alternative syntaxes should also work
	// source: 'index'
// ,	minLevel: 'debug'
//, testLevels: true*/
// });
//console.testLevels();

// require('./string.js');
var nodeConsole = require('console');

// require('./utility.js');
String.prototype.pad = padString;
function padString(length, padChar = ' ') {
	var len = this.length;
	return length > len ?	padChar.repeat(length - len) + this	:	this;
};
	
var util = require('util');
var process = require('process');
var BaseNodeConsole = nodeConsole.Console;
var defaultConsole;
var timerWrapper = require('./timer-wrapper.js');		// TODO: integrate into options.js

var _cache = new WeakMap();

// Custom Console inherits from standard Node.js console to provide all same methods
// TODO: but those methods wont write to custom out/err streams if sulied (?ithink?)
class Console extends BaseNodeConsole {
	// TODO: move to options.js (TODO options.js specs)
	static get defaultOptions() {
		return {
			source: 'default', //undefined,	//null,
			minLevel: 'debug', //'debug',	//-1
			// testLevels: true,
			// logging levels available on each Console instance, as a method of that name
			levels: {
				debug:		{ n: -2, ch: 'D' },
				verbose:	{ n: -1, ch: 'V' },
				info:			{ n:  0, ch: 'I' },
				log:			{ n:  0, ch: 'I' },//this.levels.info
				warn:			{ n: +1, ch: 'W' },
				error:		{ n: +2, ch: 'E' },
				fatal:		{ n: +3, ch: 'F' }
			},
			stdio: {
				out: process.stdout,
				err: process.stderr
			},
			format: timerWrapper(false, /*null,*/ 'timestamp', (source, level, args) => {
				var dt = new Date();
				return [
				// var a1 =
				
					[
						dt.getFullYear().toString().substring(2),
						dt.getMonth().toString().pad(2, '0'),
						dt.getDate().toString().pad(2, '0'),
						':',
						dt.getHours().toString().pad(2, '0'),
						dt.getMinutes().toString().pad(2, '0'),
						dt.getSeconds().toString().pad(2, '0'),
						'.',
						dt.getMilliseconds().toString().pad(3, '0')
					].join(''),
					process.pid,
					source,
					'[' + level.ch + ']',
					// typeof msg !== 'object' ? msg : util.inspect(msg),
					...args.map(arg => {
						if (typeof arg === 'object') {
							try {
								arg = JSON.stringify(arg);
							} catch (e) {
								arg = util.inspect(arg);
							}
						}
						return arg;
					})
				].join(' ');
				// var a2 = args.join(' ');
				// return a1 + a2;
			})
		};
	}
	
	// fmt(obj, depth) { var _depth = 0; return () => ++_depth < (depth||2) ? JSON.stringify(o) : ""; }
	
	/*
	// TODO: Test at some point later ish (soon tho) to check cache func
	// and/or if still don't actually seem to require because all js files seem to just name consoles after themselves
	// and/or no other sharing of console across files is used (ie cache not used), consider remove?
	// and/or if source is always named as filename (wo .js) there must be a way to use a closure or fn scope somehow
	// to automatically get the filename/name calling this fn/console fn's. WOuld save the ugly&awkward&fragile call to
	// Console.get('[name]') when name is often just filename. This may also apply to message logging fn's if you
	// decide to include source file names & line numbers for log messages (prob good idea - like other stuff,
	// this verbose data can be filtered outfor a std console configuration and just turn on when needed for debug etc)
	*/
	static Get(source = 'default', options) {
		if (!defaultConsole)
			defaultConsole = global.console = new Console('default', { minLevel: 'verbose' });
		if (typeof source !== 'string' || source.length == 0)
			throw new Error('source must be a non-empty string');
		var hit = _cache.has(source);
		if (!hit)
			_cache[source] = new Console(source, options || {});
		var _c = _cache[source];
		defaultConsole.debug(`Console.get('${_c.source}', ${JSON.stringify(options)}): cached=${hit}`);
		return _cache[source];
	}
	
	// new Console([outstream, errstream,] options)
	// (attempt to keep parameters compatibility with constructor for node's base console class)
	constructor(source, options) {		
		var options = Object.assign({}, Console.defaultOptions, options);
		if (typeof options.minLevel === 'string')
			options.minLevel = options.levels[options.minLevel].n;
		super(options.stdio.out, options.stdio.err);
		this.options = options;
		this.source = source;
		// this.messages = [];			// TODO : Log messages as array of arrays (or objects?)

		/*
		// Probably abstract out to a listener class/type/whatev.
		// By default any new console unless spec'd otherwise in options has one listener - 
		// which takes the log message array/object item and writes to stdio.
		// Maybe this Console class can just deal with listeners and not have to handle stdio directly?
		// Listeners more than likely will use EventEmitter base type or data member 
		// TODO: ** Perfect example on nodejs api docs see util.inherits for EventEmitter based 'MyStream' object
		// could also have level option on source (ie keep this class as is) and also have level filter in listener.
		// or listener is just a fn? just ideas
		*/
		// this		//this.options.source?"'"+this.options.source+"'":""})`);
		if (!defaultConsole)
			defaultConsole = this;
		
		// for each defined level, give the Console class a memr with that name that outputs at that level
		Object.keys(options.levels).forEach((level) => {
			this[level] = _log.bind(this, this.options.levels[level]);
		});

		// defaultConsole.verbose(`new Console('${source}', ${util.inspect(options)})`);
		// this.debug(util.inspect(this));
		if (options.testLevels)
			this.testLevels();
	}
	
	replace() {
		Object.defineProperty(global, 'console', { value: this });
	}
	
	// debug/dev use
	testLevels() {
		this.debug('Debug start');
		this.debug('Debug second');
		this.info('Information');
		// this.log('LogInfo');
		this.verbose('Verbose');
		this.warn('Warning!');
		this.error('Error!');
		this.fatal('Fatal!!');
	}
}

module.exports = Console;
defaultConsole = new Console('default', { minLevel: 'verbose' });
// defaultConsole
// 	mixin(new Console('default', { minLevel: 'verbose' }), Console);
// module.exports.Get = Console.Get;
// module.exports.Get = Console.Get;
// module.exports.Console = Console.Get;
// module.exports.format = format;
// module.exports.formatAll = formatAll;
// module.exports.formatPublic = formatPublic;

var replacers = {
	'all': (name, value) => value
,	'public': (name, value) => name.startsWith('_') ? undefined : value
};
function getReplacer(maxDepth = 0, replacer = null) {
	if (typeof replacer === 'string')
		replacer = replacers[replacer];
	else if (replacer == null)	// param is null, typeof null === 'undefined'
		replacer = replacers['all'];
	else if (typeof replacer !== 'function')
		throw new TypeError(`'replacer' should be a function or a name of a standard replacer (${util.inspect(replacers)})`);
	//need a closure around this?
	var depth = 0;
	var instances = new Set();	// detect circular references
	return (name, value) => {
		if (depth >= 6)
			throw Error(`depth = ${depth}`);
		if ((maxDepth == 0 || depth++ < maxDepth)) {
			if (value && instances.has(value))
				return '' + value + ' [circular reference]';
			if (value)
				instances.add(value);
			return replacer(name, value);
		}
	}
}

function format(obj, maxDepth = 0, space = '', replacer = null) {
	return JSON.stringify(obj, getReplacer(replacer), space);
}
function formatAll(obj, maxDepth = 0, space = '') {
	return JSON.stringify(obj, getReplacer('all'), space);
}
function formatPublic(obj, maxDepth = 0, space = '') {
	return JSON.stringify(obj, getReplacer('public'), space);
}

function _log(level, ...args) {
		var options = this.options;	// TODO: for curiousity sometime, try timing func's with and w/o locally cached vars
		if (level.n < options.minLevel) return;
		var source = this.source;
		(level.n > 0 ? options.stdio.err : options.stdio.out)		// choose stdoout or stderr ased on level
			.write(options.format(source, level, args) + '\r\n');
}
