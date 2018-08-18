
const console = require('./stdio.js').Get('artefact-model', { minLevel: 'debug' });	// log verbose debug
const inspect = require('./utility.js').makeInspect({ depth: 2, compact: true /* false */ });
const inspectPretty = require('./utility.js').makeInspect({ depth: 2, compact: false });
const mongoose = require('mongoose');
var artefactSchema = require('./artefact-schema.js');

module.exports = function makeModel(modelName, schemas) {
	var newSchema = artefactSchema.clone();
	// var newSchemaData = newSchema.path('data');
	// console.debug(`makeModel: modelName='${modelName}': newSchemaData=${inspectPretty(newSchemaData)}`);
	if (schemas && typeof schemas === 'object') {
		newSchema.data = schemas;
	}
	console.debug(`makeModel: modelName='${modelName}': newSchema=${inspectPretty(newSchema)}`);
	// ${inspect(schemas)}
	var newModel = mongoose.model(modelName, newSchema);
	console.verbose(`makeModel: modelName='${modelName}': newModel=${inspectPretty(newSchema)}`);
	return newModel;	
}
