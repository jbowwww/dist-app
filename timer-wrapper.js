// timerWrapper([enabled,][console,][name,]func|promise)
// enabled: boolean
// name: string
// func: function
module.exports = function timerWrapper() {
	function makeName(prefix = 'f_') {
		return prefix + Date.now().toString(36);
	}
	var args = Array.from(arguments);
	var enabled = typeof args[0] === 'boolean' ? args.shift() : true;
	var console = typeof args[0] === 'Console' ? args.shift() : require('./stdio.js');//.Get('default');
	var n = typeof args[0] === 'string' ? args.shift() : null;
	var f = args.shift();
	if (!enabled) return f;
	if (Q.isPromise(f)) {
		console.time(n);			// start early as poss, as promise could already be running(maybe??)
		var isPromise = true;
		if (!n)
			n = makeName('p_');
		f.catch((err) => {
			console.error(`timerWrapper() error: '${err.stack||err}'`);
		}).finally(() => {
			console.timeEnd(n);
		}).done();
		return f;
	}
	else if (typeof f !== 'function') throw new TypeError(`Couldn't parse promise or function from arguments`);
	else if (!n) n = f.name || makeName();
	var timer = function() {
		console.time(n);
		try {
			var r = f.apply(this, arguments);
		} catch (err) {
			console.error(err);
		} finally {
			console.timeEnd(n);
		}
		return r;
	}
	wrapped.name = 'timerWrapper_' + n;
	return wrapped;
}