
var console = require('./stdio.js').Get('Collection', { minLevel: 'log' });		// debug verboseconst util = require('./util');
const util = require('./util');
const inspect = require('./utility.js').makeInspect({compact:false});//{showHidden: true, depth:0, breakLength: 32 });

module.exports = util.inherits(null, function Collection(values) {
	console.debug(`this.super: ${inspect(this.super)} this.count: ${this.count} proto: ${this.names}`);
}, {
	count() {
		console.debug(`in count: this=${(typeof this)} o.keys=${Object.keys(this).join()}`);
		return Object.keys(this).length;
	},
	get names() {
		return Object.keys(this);
	},
	add(name, item) {
		this[name] = item;
		// console.debug(`Collection.add('${name}', ${inspect(item,{depth:0})}): ${inspect(this)} ${this} ${this[name]} ${inspect(Object.getOwnPropertyDescriptor(this, name))}`);
	}//, writeable: true, configurable: true }
	// });
});
// Collection.prototype.constructor = Collection;
