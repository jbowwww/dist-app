
const _ = require('lodash');
const padString = require('./utility.js').padString;
const moment = require('moment');
require('moment-duration-format');

module.exports = Timestamps;

function Timestamps(start = true) {
	if (!(this instanceof Timestamps)) {
		return new Timestamps(start);
	}
	var m = moment();
	this.created = m;
	start && this.markStart(m);
}

Timestamps.prototype.markStart = function(mark) {
	this.start = mark || moment();
	this.end = {};
}

Timestamps.prototype.mark = function(markName = 'end') {
	this.end[markName] = moment();
}

var durationFormat = 'd [days] h [hours] m [mins] s [secs]';
Timestamps.prototype.toString = function() {
	var now = moment();
	var s = `Timestamps @ ${now.format()}:\n  Created${this.start===this.created?'/Start:':':\t'}${this.created.format()} (${moment.duration(now - this.created).format(durationFormat)} ago)`;
	if (this.start !== this.created) {
		s += `\nStart:\t${this.start.format()} (${moment.duration(now - this.start).format(durationFormat)} ago)${_.keys(this.end).length?'\n  Marks:':''}`;
	}
	for (var e in this.end) {
		var v = this.end[e];
		s += '\n    ' + padString(12, e + ':') + '   ' + v.format() + ' (' + moment.duration(v - this.start).format(durationFormat) + ' from start)';
	}
	return s;
}
