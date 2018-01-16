
// To require this file (at './util/index.js') use <code>require('./util')</code>

const console = require('../stdio.js').Get('util', { minLevel: 'log' /* verbose debug log */ });
var util = require('util');
const inspect = require('../utility.js').makeInspect({compact:false});//{showHidden: true, depth:0, breakLength: 32 });
const fs = require('../fs.js');
const padNumber = require('../utility.js').padNumber;
const bindMethods = require('../utility.js').bindMethods;
var anonClassCount = 0;

module.exports = {
	inherits : function util_inherits(sup, sub, proto) {
		console.debug(`inherit(${inspect(sup)}, ${inspect(sub)}, ${inspect(proto)})`);
		var newClass, newClassName;
		// 1706071224: May be possible to replace this awkward boolean choice of two methods by using new Function() then can just use the boolean test for the sup.call() line
		if (sup) {
			newClass = function(...args) {
				sup.call(this);
				Object.defineProperty(this, 'super', { value: bindMethods(this, sup.prototype), enumerable: false, configurable: true /* , writable: false */ });
				return sub.call(this, ...args);
			};
			newClass.prototype = proto;//new sup;
		} else {
			newClass = function(...args) {
				Object.defineProperty(this, 'super', { value: null, enumerable: false, configurable: true /* , writable: false */ });
				return sub.call(this, ...args);
			};
			newClass.prototype = proto;//{};
		}
		if (!sub.name) {
			console.warn(`util.inherits: Created unnamed anonymous class (inherits from '${sup.name||'\'(unnamed)\''}')`);
			newClassName = '__newClass_' + padNumber.call(anonClassCount++, 2, '0');
		} else {
			newClassName = sub.name;
		}
		Object.defineProperty(newClass, 'name', { value: newClassName });
		// if (sup) newClass.prototype = sup();
		if (typeof proto !== 'undefined') {
			// Object.keys(proto).forEach(function(key) {
					// if (typeof proto[key].get === 'function') {
						// proto[key].get = proto[key].get.bind(sub.prototype);
					// } else if (typeof proto[key].value === 'function') {
						// proto[key].value = proto[key].value.bind(sub.prototype);
					// }
					// Object.defineProperty(newClass.prototype, key, proto[key]);
			// });
		}
		// util.inherits(sub, sup);
		newClass.prototype._super = sup;
		// console.debug(`sup: ${sup.name} sub: ${sub.name} ${Object.keys(sub.prototype).join()}`);
		var supers = [], iter;
		for (iter = sup; iter; iter = iter.super) {
			supers.push(iter.name || '(unnamed)');
		}
		console.verbose(`inherit: new class${newClass.name ? ' \'' + newClass.name + '\'' : ''}: ${supers.join()}`);
		// }
			// sub.prototype = sup;//.call(this);//.prototype.constructor.call(this);
			// // Object.setPrototypeOf(sub.prototype, sup);	
		return newClass;
	},
	
	// This is an assign function that copies full descriptors
	completeAssign: function util_completeAssign(target, ...sources) {
		sources.forEach(source => {
			let descriptors = Object.keys(source).reduce((descriptors, key) => {
				descriptors[key] = Object.getOwnPropertyDescriptor(source, key);
				return descriptors;
			}, {});
			// by default, Object.assign copies enumerable Symbols too
			Object.getOwnPropertySymbols(source).forEach(sym => {
				let descriptor = Object.getOwnPropertyDescriptor(source, sym);
				if (descriptor.enumerable) {
					descriptors[sym] = descriptor;
				}
			});
			Object.defineProperties(target, descriptors);
		});
		return target;
	},

	clone: function util_clone(...sources) {
		return this.completeAssign({}, ...sources);
	}

};