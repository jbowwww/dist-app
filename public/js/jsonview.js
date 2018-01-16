
var masterInstances = new WeakMap();
var defaults = {
	nodeFunc: (node) => (node.name.charAt(0) !== '_' || node.name === '__type') && node.name !== 'constructor',
	nodeIdGenerator: (node) => (new Date().getMilliseconds() + Math.floor(Math.random() * 1e8) + 1e8).toString(16).toUpperCase();
};

function getNodeParser(nodeFunc, nodeIdGenerator) {
	// if (/*!root || */typeof root !== 'object' && typeof root !== 'function')	// typeof should actuallly cover case where root == null or root == undefined??
		// throw new Error(`jsonview() EJS called with root == '${root?root.toString():'(null)'} (type '${typeof root}'`);
	var instances = new WeakMap();
	return function parseNode(name, value) {
		var nameFirstChar = value.name.charAt(0);
		var node = {
			opts: Object.assign({}, defaults, { nodeFunc, nodeIdGenerator }),
			name,
			value
			isNull: value === null,
			valueType: typeof value,
			isObject: typeof value === 'object',
			isFunction: typeof value === 'function',
			isUndefined: typeof value === 'undefined',
			isClass: nameFirstChar >= 'A' && nameFirstChar <= 'Z',
			isDate: value instanceof Date,
			subValueCount: Object.keys(value).length,
			isCached: false,
			formatValue() {
				return
					this.isUndefined ? '(undefined)' :
					this.isNull ? '(null)' :
					this.isDate ? this.value.toISOString() :
					this.valueType === 'string' ? `"${this.value}"` :
					this.isClass ? `<span class="type">class ${this.value.name}</span> <span class="count">(${this.subValueCount})</span>` :
					this.isFunction ? `<span class="type">Function( ${this.value.length} )</span> <span class="count"><a href="#" alt="Function code">...</a></span>` :
					this.isObject ? `<span class="type">${(this.value.prototype||Object).name}</span> <span class="id">#${this.objectId}</span> <span class="count">(${this.subValueCount})</span>` :
					this.value.toString();
			}
		};
		// node.isClass = node.isFunction && typeof value.prototype.constructor === 'undefined';//(value.prototype.constructor === value);
		// node.isDate = node.isObject && (value instanceof Date);
		// node.subValueCount = (!node.isNull && !node.isUndefined && (node.isObject || node.isClass) ? Object.keys(value).length : undefined);
		node.isCached = (node.isObject || node.isClass) && !node.isNull && !node.isUndefined && !node.isDate && instances.has(value);
		node.objectId = (node.isCached || masterInstances.has(value)) ?
			masterInstances.get(value) : ((node.isObject || node.isClass) ?
				nodeIdGenerator(node) : undefined);
		// console.debug(`node: ${JSON.stringify(node)}`);
		if (!node.isCached && (node.isObject || node.isClass) && !node.isNull && !node.isUndefined && !node.isDate) {
			masterInstances.set(value, node.objectId);
			instances.set(value, node.objectId);		// TODO: Parameterize the object isntance cache too? meh
		}
		node.isLeafNode = () => node.isCached || node.isNull || node.isUndefined || node.isDate || (!node.isObject && !node.isClass);
		return node.opts.nodeFunc ? (node.opts.nodeFunc(node) ? node : false) : node;
	};
}