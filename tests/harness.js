/*
	Test harness — loads Zotero plugin source files into a Node `vm`
	sandbox so the `var X = ...` exports are accessible as properties
	of the returned object.

	Usage (single module):
	    var sb = loadModule('./content/name-normalizer.js');
	    sb.NameNormalizer.normalise('JOHN SMITH');

	Usage (multiple modules sharing globals like NameNormalizer/FieldNormalizer):
	    var sb = loadModule('./content/name-normalizer.js');
	    loadModule('./content/journal-normalizer.js', sb);
	    loadModule('./content/apa-checker.js', sb);
	    sb.APAChecker.all(...);
*/

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeSandbox() {
	return {
		setTimeout,
		clearTimeout,
		setInterval,
		clearInterval,
		Promise,
		Date,
		Math,
		JSON,
		console,
		fetch: globalThis.fetch,
	};
}

function loadModule(filePath, sandbox) {
	const abs = path.resolve(__dirname, filePath);
	const code = fs.readFileSync(abs, 'utf-8');
	if (!sandbox) sandbox = makeSandbox();
	if (!sandbox.__created) {
		vm.createContext(sandbox);
		sandbox.__created = true;
	}
	vm.runInContext(code, sandbox, { filename: abs });
	return sandbox;
}

module.exports = { loadModule, makeSandbox };