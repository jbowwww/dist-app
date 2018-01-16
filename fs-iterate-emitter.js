"use strict";

const console = require('./stdio.js').Get('fs', { minLevel: 'log' });	// debug verbose log
// console.debug(`utility.inspect: ${typeof require('./utility.js').makeInspect}`);

const	inspect = require('./utility.js').makeInspect({ depth: 2, breakLength: 0 })//()=>undefined
,	mixin = require('./utility.js').mixin
, bindMethods = require('./utility.js').bindMethods
, pipeline = require('./utility.js').pipeline
,	util = require('util')
,	fs = mixin(require('fs'), {  })
, EventEmitter = require('events')//emitter3');
,	stream = require('stream')
,	Q = require('./q.js')
,	promisifyEmitter = require('./utility.js').promisifyEmitter
,	crypto = require('crypto')
;

module.exports = mixin(fs, {
	iterate
,	hash
,	path: mixin(require('path'), { depth: pathDepth })
});

function pathDepth(path) {
	var depth = 0;
	for (var ch of path.slice(0, path.length - 1)) {	// remove last ch incase it is a path separator with no name following it
		if (ch == '/' || ch == '\\')
			depth++;
	}
	return depth;
	// return path.split(path.sep).length - 1;
}

function pathTrimTrailingSeparators(path) {
	console.verbose(`pathTrim: path=${path} length=${path.length}`);
	var i = path.length;
	while (i >= 0 && (path[i] === '/' || path[i] === '\\'))
		i--;
	path = path.slice(0, i);
	console.verbose(`pathTrim: path=${path} length=${path.length}`);
	return path;
}

/* fs.iterate
// options is optinoal
// options.filter: can be a function that takes a path and returns boolean, or a regex
// pipeStream (optional): a writeable stream that the fs.iterate readable stream will pipe too, except fs.iterate will still return its own readable unlike
*/
function iterate(path, options/* , pipeStream */) {
	path = fs.path.resolve(path);
  options = mixin({ queueMethod: 'shift', filter: undefined, maxDepth: 1, objectMode: true, highWaterMark: 8 }, options);
	console.verbose(`iterate('${path}', ${inspect(options)})`);
	var self = mixin(new EventEmitter(), {
		root: path,
		rootDepth: pathDepth(path),
		paths: [path], //	{ push() {} },
		errors: []
	});
	(function next() {
		if (!self.paths.length) {
			if (self.errors.length) {
				console.warn(`iterate('${self.root}'): stream end: ${self.errors.length} errors: ${self.errors.join('\n\t')}`);
			} else {
				console.debug(`iterate('${self.root}'): stream end`);
			}
			process.nextTick(() => {
				self.emit('end');
			});
		}
		var path = self.paths[options.queueMethod]();
		try {
			fs.lstat(path, (err, stats) => {
				if (err) return nextHandleError(err);
				var item = { path, stats, type: stats.isDirectory() ? 'dir' : stats.isFile() ? 'file' : '' };
				var currentDepth = pathDepth(item.path) - self.rootDepth + 1;	// +1 because below here next files are read from this dir
				if ((options.maxDepth === 0) || (currentDepth <= options.maxDepth)) {
					if (item.type !== '') {
						self.emit(item.type, item);
					}
					fs.readdir(path, (err, names) => {
						if (err) return nextHandleError(err);
						if (options.filter) names = names.filter(typeof options.filter !== 'function' ? name => name.match(options.filter): options.filter);
						console.verbose(`${names.length} entries at depth=${currentDepth}${options.filter ? ' matching \'' + options.filter + '\'' : ''} in dir:${item.path} self.paths=[${self.paths.length}]`);
						names.forEach(name => self.paths.push(fs.path.join(path, name)));
					});
				}
			});
		} catch (err) {
			return nextHandleError(err);
		}
		function nextHandleError(err) {
			console.warn(`iterate: ${err.stack||err}`);
			self.errors.push(err);
			return next();//1;
		}
	})();
	.on('close', (...args) => console.verbose(`iterate:close: ${inspect(args)}`))
	.on('end', (...args) => console.verbose(`iterate:end: ${inspect(args)}`))
	.on('error', (err, ...args) => console.warn(`iterate:error: err=${err.stack||err} ${inspect(args)}`));
	return self;
}

// Returns promise for a hash string
function hash(path, options) {
	var options = Object.assign({}, { algorithm: 'sha256', encoding: 'hex' }, options);
	var hashStream = crypto.createHash(options.algorithm);
	// console.debug(`hashStream: ${inspect(hashStream)}`);
	hashStream.setEncoding(options.encoding);
	// console.debug(`hashStream: ${inspect(hashStream)}`);
	var input = fs.createReadStream(path, options);
	input.on('open', () => console.debug(`fs.hash('${path}'): file opened`));
	return promisifyEmitter(pipeline(input, hashStream), { resolveEvent: 'data' })
		.then(hashData => hashData.toString(options.encoding))	// don't think this is strictly necessary but to avoid unexpected confusion make it a string
		.then(hashValue => {
			// console.debug(`fs.hash: hashData: ${(hashData)} options: ${inspect(options)} hashStream: ${inspect(hashStream)}`);
			// var hash = hashData.toString(options.encoding);
			console.verbose(`hash('${path}'): ..${hashValue.toString().substr(-8)}`);
			return hashValue;
		});
}

/*
// return Q.Promise((resolve, reject) => {
		// var input = fs.createReadStream(path, options)
			// .on('data', data => {
				// console.debug(`fs.hash('${path}'): push data: ${data}`);
				// hashStream.update(data);
			// })
			// .on('end', () => {
				// var hash = hashStream.digest();
				// console.debug(`fs.hash('${path}'): ${hash}`);
				// resolve(hash);
			// });
	// });
*/
