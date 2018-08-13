const mongoose = require('mongoose');
const inspect =	require('./utility.js').makeInspect({ depth: 2, compact: false /* true */ });
var artefactSchema = require('./artefact-schema.js');

var dataArray = artefactSchema.path('data');
console.log(`artefact-data-schema.js: dataArray: ${inspect(dataArray)}`);
module.exports = function ArtefactDataSchema(schemaName, schema) {
	// new mongoose.Schema({
	// dataType: { type: String, required: true },
	// _ts: timestampSchema,
	// data: 
	schema.set('_id', false);
	var model = dataArray.add({ [schemaName]: schema });
	//dataArray.discriminator(schemaName, /*new mongoose.Schema({ data:*/ schema /*}, { _id: false })*/);
	// console.log(`ArtefactDataSchema(): schemaName='${schemaName}' schema=${inspect(schema, { compact: false })}\n\treturn ${inspect(model, { compact: false })}`);
	return model;	// TODO: should probably rename this fn because it returns a model and not a schema
};
