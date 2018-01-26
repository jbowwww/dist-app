const _ = require('underscore');

const maskValuesForKeys = ['apikey', 'apisecret'];

module.exports = {
  'apikey' : '2bc66c9699a54560b7bd8764aef797b6',
  'apisecret' : 'a72c759b2a9e4bbf8d4ea01e203b028f',
  'inverse_callback_arguments' : true
  // inspect() {
    // var r = _.clone(this);
    // return _.mapObject(r, (val, key) => maskValuesForKeys.indexOf(key) < 0 ? val : '..' + val.slice(val.length - 4));
  // }
};
