var exampleTemplate = require('./template.jade')	// may need -t jadeify as args to CLI browserify (if package.json stuff doesnt work?)

document.getElementById('exampleTemplate').innerHTML = exampleTemplate({title: 'Example'});
