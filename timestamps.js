
const _ = require('lodash');
const padString = require('./utility.js').padString;
const moment = require('moment');
require('moment-duration-format');

module.exports = Timestamps;

function Timestamps(start = true) {
	if (!(this instanceof Timestamps)) {
		return new Timestamps(start);
	}
	this._created = moment();
	if (start) {
		this.start();
	}
	this._end = {};
}

Timestamps.prototype.start = function() {
	this._start = moment();
}

Timestamps.prototype.mark = function(markName = 'end') {
	this._end[markName] = moment();
}

var durationFormat = 'd [days] h [hours] m [mins] s [secs]';
Timestamps.prototype.toString = function() {
	var now = moment();
	var s = `Timestamps:\n  Created:\t${this._created.format()} ( ${moment.duration(now - this._created).format(durationFormat)} ago )\n  Start:\t${this._start.format()} ( ${moment.duration(now - this._start).format(durationFormat)} ago )${_.keys(this._end).length?'\n  Marks:':''}`;
	for (var e in this._end) {
		var v = this._end[e];
		s += '\n    ' + padString(12, e + ':') + '   ' + v.format() + ' ( ' + moment.duration(v - this._start).format(durationFormat) + ' from start )';
	}
	return s;
}

// util.inherits
// var _ts = {
	// start: new Date(),
	// endFsIter: null,
	// endBulkWriters: null,
	// endAll: null,
	// toString() {
		// return `Start=${this.start}` + (this.endFsIter != null ? ` endFsIter=${this.endFsIter.toTimeString()}(${this.endFsIter-this.start})` : '') + (this.endBulkWriters != null ? ` endBulkWriters=${this.endBulkWriters.toTimeString()}(${this.endBulkWriters-this.start})` : '') + (this.endAll != null ? ` endAll=${this.endAll}(${this.endAll-this.start})` : '');
	// }
// };
