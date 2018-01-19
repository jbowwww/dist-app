
const _ = require('lodash');
const padString = require('./utility.js').padString;
const moment = require('moment');
require('moment-duration-format');

module.exports = Timestamps;

function Timestamps(start = true) {
	if (!(this instanceof Timestamps)) {
		return new Timestamps(start);
	}
	this.created = moment();
	start && this.markStart();
}

Timestamps.prototype.markStart = function() {
	this.start = moment();
	this.end = {};
}

Timestamps.prototype.mark = function(markName = 'end') {
	this.end[markName] = moment();
}

var durationFormat = 'd [days] h [hours] m [mins] s [secs]';
Timestamps.prototype.toString = function() {
	var now = moment();
	var s = `Timestamps:\n  Created:\t${this.created.format()} ( ${moment.duration(now - this.created).format(durationFormat)} ago )\n  Start:\t${this.start.format()} ( ${moment.duration(now - this.start).format(durationFormat)} ago )${_.keys(this.end).length?'\n  Marks:':''}`;
	for (var e in this.end) {
		var v = this.end[e];
		s += '\n    ' + padString(12, e + ':') + '   ' + v.format() + ' ( ' + moment.duration(v - this.start).format(durationFormat) + ' from start )';
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
