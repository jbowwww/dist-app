
var console = require('./stdio.js').Get('httplog');

module.exports = function timeLog (req, res, next) {
  console.info(req.method + ': ' + req.url);
  next();
};
