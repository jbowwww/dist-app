
const console = require('./stdio.js').Get('routes', { minLevel: 'debug' });		// debug verbose log
var util = require('util');
var path = require('path');
const inspect = (subject, ...args) => subject ? subject.toString(...args) : "(null)";
const Q = require('./q.js');
var express = require('express');
// var favicon = require('serve-favicon');
// var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
// var httplog = require('./routes/httplog.js');

module.exports = function run(app) {
	console.debug(`this: ${typeof this}`);
	// app.setupScreen();
	// Middlewares
	// app.use(httplog);
	// app.use(bodyParser.json());
	// app.use(bodyParser.urlencoded({ extended: false }));
	// app.use(cookieParser());
	app.use(express.static(path.join(__dirname, 'public')));
	app.get('/', function(req, res, next) {
		console.verbose('GET /: ' + util.inspect(app));
		res.json(app);
	});
	app.use('/test', (req, res, next) => {
		// res.render('tree', { title: 'Test', root: {} });
		res.send('TEST');
	});
	app.use('/test2', (req, res, next) => {
		res.render('pages/tree', { title: 'Test', root: { a: {b:"beee", c:1, ud: undefined}} });
	});
	app.use('/modules/:path', (req, res, next) => {
		var paths = req.params.path.split('/\\');
		for (var o = app.modules /* Module.all.types */; paths.length; o = o[paths.shift()])
			;
		res.render('pages/tree', { title: 'Modules', root: o });
	});
	
	/* app.use('/modules/:moduleName/:instanceIndex', (req, res, next) => {
		// var moduleName = req.params.moduleName;
		// var instanceIndex = parseInt(req.params.instanceIndex);
		// if (isNaN(instanceIndex)) {
			// next();
		// } else {
			// var module = Object.values(Module.all.types).filter(m => m.name === moduleName)[0];
			// if (module) {
				// var instance = module.instances[instanceIndex];
				// if (instance) {
					// instance.getRouter()(req, res, next);
				// } else {
					// next(mixin(new Error(`Module '${moduleName}' instance ${instanceIndex} not found`), { status: 404 }));
				// }
			// } else {
				// next(mixin(new Error(`Module '${moduleName}' not found`), { status: 404 }));
			// }	
		// }
	// });
	// app.use('/modules/:instanceIndex', (req, res, next) => {
		// var instanceIndex = parseInt(req.params.instanceIndex);
		// if (isNaN(instanceIndex))	{
			// next();
		// } else {
			// var instance = Module.all.instances[instanceIndex];
			// if (instance) {
				// instance.getRouter()(req, res, next);
			// } else {
				// next(mixin(new Error(`Module instance ${instanceIndex} not found`), { status: 404 }));
			// }
		// }
	// });
	// app.use('/modules/:moduleName', (req, res, next) => {
		// var moduleName = req.params.moduleName;
		// var module = Module.all.types[moduleName];//.filter(m => m.name === moduleName)[0];
		// if (module) {
			// res.render('pages/tree', { title: 'Modules', root: module });
		// } else {
			// next(mixin(new Error(`Module '${moduleName}' not found`), { status: 404 }));
		// }
	// });
	// app.use('/modules/', (req, res, next) => {
		// res.render('pages/tree', { title: 'Modules', root: Module.all });
	// });
	// app.use('/', routeRestCollection('module', Module.all));
	// app.use('/', routeRestCollection('module', Module.all));	
		*/
		
	// catch 404 and forward to error handler
	app.use(function(req, res, next) {
		var err = new Error(`Not Found ${req.url}`);
		err.status = 404;
		next(err);
	});

	// error handler
	app.use(function(err, req, res, next) {
		res.locals.message = err.message;
		res.locals.error = err;//req.app.get('env') === 'development' ? err : {};
		console.error(err.stack||err);
		res.status(err.status || 500);
		res.send(err.status + ' ' + err);
	});
};
