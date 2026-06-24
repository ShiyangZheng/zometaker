/*
	MetadataFetcher tests.

	Tests the *parsing* helpers (no network calls) and runs a single
	live API call as a smoke test (skipped if --no-network).
*/

const { loadModule } = require('./harness.js');

const sandbox = loadModule('../content/metadata-fetcher.js');
const { MetadataFetcher } = sandbox;
const helpers = MetadataFetcher.create({})._helpers;

let passed = 0;
let failed = 0;

function eq(actual, expected, name) {
	const a = JSON.stringify(actual);
	const e = JSON.stringify(expected);
	if (a === e) {
		passed += 1;
	} else {
		failed += 1;
		console.error(`FAIL: ${name}`);
		console.error(`  expected: ${e}`);
		console.error(`  actual:   ${a}`);
	}
}

// ----- stripJATS -----
eq(
	helpers.stripJATS('<jats:p>Hello <jats:bold>world</jats:bold></jats:p>'),
	'Hello world',
	'stripJATS basic',
);
eq(
	helpers.stripJATS('<p>Plain &amp; simple</p>'),
	'Plain & simple',
	'stripJATS entities',
);
eq(helpers.stripJATS(undefined), undefined, 'stripJATS undefined');
eq(helpers.stripJATS(''), '', 'stripJATS empty');

// ----- reconstructAbstract -----
// OpenAlex returns abstract as inverted index
const idx = {
	'This': [0],
	'is': [1],
	'a': [2],
	'test': [3],
	'abstract': [4],
};
eq(helpers.reconstructAbstract(idx), 'This is a test abstract', 'reconstructAbstract');

// ----- openAlexTypeToCSL -----
eq(helpers.openAlexTypeToCSL('article'), 'journal-article', 'oAlex article');
eq(helpers.openAlexTypeToCSL('book'), 'book', 'oAlex book');
eq(helpers.openAlexTypeToCSL('dissertation'), 'thesis', 'oAlex dissertation');
eq(helpers.openAlexTypeToCSL('proceedings-article'), 'paper-conference', 'oAlex proceedings');
eq(helpers.openAlexTypeToCSL('dataset'), 'dataset', 'oAlex dataset');
eq(helpers.openAlexTypeToCSL('weird-type'), 'weird-type', 'oAlex unknown');

// ----- splitAuthorName -----
eq(helpers.splitAuthorName('John Smith'),
   { first: 'John', last: 'Smith' },
   'splitAuthorName first-last');
eq(helpers.splitAuthorName('Smith, John'),
   { first: 'John', last: 'Smith' },
   'splitAuthorName last-first');
eq(helpers.splitAuthorName('Cher'),
   { first: undefined, last: 'Cher' },
   'splitAuthorName single name');
eq(helpers.splitAuthorName('Jean-Paul Sartre'),
   { first: 'Jean-Paul', last: 'Sartre' },
   'splitAuthorName hyphenated first');

// ----- Live API smoke test (optional) -----
async function liveTest() {
	if (process.argv.includes('--no-network')) {
		console.log('Skipping live API test (--no-network)');
		return;
	}
	const fetcher = MetadataFetcher.create({ rps: 5, mailto: 'test@example.com' });

	// 1. CrossRef DOI lookup
	const DOI = '10.1371/journal.pcbi.1007536';
	console.log(`\nFetching ${DOI} from CrossRef…`);
	const cr = await fetcher.fetchByDOI(DOI);
	if (cr) {
		console.log(`  source:    ${cr.source}`);
		console.log(`  title:     ${cr.title}`);
		console.log(`  authors:   ${(cr.authors || []).length}`);
		console.log(`  journal:   ${cr.journal}`);
		console.log(`  year:      ${cr.year}`);
		passed += 1;
	} else {
		failed += 1;
		console.error('FAIL: live CrossRef fetch returned null');
	}

	// 2. OpenAlex by ISBN (book lookup)
	const ISBN = '9780262033848';  // "Introduction to Algorithms" (CLRS)
	console.log(`\nFetching ISBN ${ISBN} from OpenAlex…`);
	const book = await fetcher.fetchByISBN(ISBN);
	if (book) {
		console.log(`  source:    ${book.source}`);
		console.log(`  title:     ${book.title}`);
		console.log(`  authors:   ${(book.authors || []).length}`);
		console.log(`  publisher: ${book.publisher}`);
		console.log(`  year:      ${book.year}`);
		passed += 1;
	} else {
		failed += 1;
		console.error('FAIL: live ISBN fetch returned null');
	}
}

(async () => {
	await liveTest();
	console.log(`\n${passed} passed, ${failed} failed`);
	process.exit(failed === 0 ? 0 : 1);
})();