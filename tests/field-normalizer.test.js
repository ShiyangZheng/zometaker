/*
	FieldNormalizer tests (APA 7 aware).
	Run with: `node tests/field-normalizer.test.js`
*/

const { loadModule } = require('./harness.js');

const { FieldNormalizer } = loadModule('../content/journal-normalizer.js');

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

// ----- Journal: title case (APA 7) -----
eq(FieldNormalizer.normaliseJournal('NATURE'), 'Nature', 'journal ALL CAPS');
eq(FieldNormalizer.normaliseJournal('nature'), 'Nature', 'journal all lower');
eq(FieldNormalizer.normaliseJournal('ieee transactions on pattern analysis'),
   'IEEE Transactions on Pattern Analysis', 'journal preserves IEEE acronym');
eq(FieldNormalizer.normaliseJournal('JAMA.'), 'JAMA', 'trailing period');
eq(FieldNormalizer.normaliseJournal('  cell  '), 'Cell', 'journal whitespace');
eq(FieldNormalizer.normaliseJournal('JOURNAL OF THE ACM'),
   'Journal of the ACM', 'journal particles (of/the) lowercase');
eq(FieldNormalizer.normaliseJournal('PROCEEDINGS OF THE 56TH ANNUAL MEETING'),
   'Proceedings of the 56th Annual Meeting', 'journal numbers + meeting');
eq(FieldNormalizer.normaliseJournal('past & present'),
   'Past & Present', 'journal keeps & (APA 7)');

// ----- Title: sentence case (APA 7) -----
eq(FieldNormalizer.normaliseTitle('the quick brown fox'),
   'The quick brown fox', 'title basic → sentence case');
eq(FieldNormalizer.normaliseTitle('"hello world"'),
   'Hello world', 'title quotes stripped, sentence case');
eq(FieldNormalizer.normaliseTitle('A DEEP LEARNING APPROACH'),
   'A deep learning approach', 'title all caps → sentence case');
eq(FieldNormalizer.normaliseTitle('Deep Learning: A Practitioner\'s Guide'),
   'Deep learning: A practitioner\'s guide', 'title with colon — first word after colon capitalised');
eq(FieldNormalizer.normaliseTitle('attention is all you need'),
   'Attention is all you need', 'title already sentence case preserved');

// ----- Pages: en-dash (APA 7) -----
eq(FieldNormalizer.normalisePages('123-129'), '123–129', 'pages hyphen → en-dash');
eq(FieldNormalizer.normalisePages('123--129'), '123–129', 'pages double dash → en-dash');
eq(FieldNormalizer.normalisePages(' 123 -- 129 '), '123–129', 'pages with spaces → en-dash');
eq(FieldNormalizer.normalisePages('e123-e129'), 'e123-e129', 'pages electronic (non-numeric) unchanged');
eq(FieldNormalizer.normalisePages('123–129'), '123–129', 'pages already en-dash');
eq(FieldNormalizer.normalisePages('123—129'), '123–129', 'pages em-dash → en-dash');

// ----- Volume / Issue -----
eq(FieldNormalizer.normaliseVolume('Vol. 12'), '12', 'volume prefix');
eq(FieldNormalizer.normaliseVolume('VOLUME 12'), '12', 'volume full word');
eq(FieldNormalizer.normaliseVolume('12'), '12', 'volume plain');
eq(FieldNormalizer.normaliseIssue('No. 3'), '3', 'issue prefix');
eq(FieldNormalizer.normaliseIssue('Issue 3'), '3', 'issue full word');

// ----- DOI: URL form (APA 7) -----
eq(FieldNormalizer.normaliseDOI('10.1234/ABC'),
   'https://doi.org/10.1234/ABC', 'doi bare → URL form');
eq(FieldNormalizer.normaliseDOI('https://doi.org/10.1234/XYZ'),
   'https://doi.org/10.1234/XYZ', 'doi URL preserved');
eq(FieldNormalizer.normaliseDOI('DOI: 10.1234/Abc'),
   'https://doi.org/10.1234/Abc', 'doi prefix stripped and URL form');
eq(FieldNormalizer.normaliseDOI(' 10.1234/ABC '),
   'https://doi.org/10.1234/ABC', 'doi whitespace');

// ----- ISBN -----
eq(FieldNormalizer.normaliseISBN('978-0-123456-78-9'), '9780123456789', 'isbn hyphens');
eq(FieldNormalizer.normaliseISBN('978 0 123456 78 9'), '9780123456789', 'isbn spaces');
eq(FieldNormalizer.normaliseISBN('123456789X'), '123456789X', 'isbn 10 with X');

// ----- Year extraction -----
eq(FieldNormalizer.extractYear('2020-01-15'), 2020, 'year ISO date');
eq(FieldNormalizer.extractYear('Published 2019'), 2019, 'year from string');
eq(FieldNormalizer.extractYear('not a year'), null, 'year missing');
eq(FieldNormalizer.extractYear('999'), null, 'year too small');
eq(FieldNormalizer.extractYear(2020), 2020, 'year from number');
eq(FieldNormalizer.extractYear(null), null, 'year null');

// ----- Publisher: no location (APA 7) -----
eq(FieldNormalizer.normalisePublisher('MIT Press.'), 'MIT Press', 'publisher trailing period');
eq(FieldNormalizer.normalisePublisher('  Springer  '), 'Springer', 'publisher whitespace');
eq(FieldNormalizer.normalisePublisher('New York, NY: Routledge'),
   'Routledge', 'publisher location stripped');
eq(FieldNormalizer.normalisePublisher('London: Verso'),
   'Verso', 'publisher London stripped');
eq(FieldNormalizer.normalisePublisher('Routledge Publishers'),
   'Routledge', 'publisher "Publishers" suffix stripped');
eq(FieldNormalizer.normalisePublisher('ACME Publishing Company'),
   'ACME', 'publisher "Publishing Company" stripped');

// ----- Edition -----
eq(FieldNormalizer.normaliseEdition('2'), '2nd ed.', 'edition numeric 2');
eq(FieldNormalizer.normaliseEdition('3'), '3rd ed.', 'edition numeric 3');
eq(FieldNormalizer.normaliseEdition('11'), '11th ed.', 'edition numeric 11 (th)');
eq(FieldNormalizer.normaliseEdition('1'), '1st ed.', 'edition numeric 1');

// ----- Idempotency -----
const samples = [
	['normaliseJournal', 'ieee transactions on foo'],
	['normaliseTitle', 'A DEEP LEARNING APPROACH'],
	['normalisePages', '123--129'],
	['normaliseDOI', 'DOI:10.1234/ABC'],
	['normalisePublisher', 'New York, NY: Routledge'],
];
for (const [fn, arg] of samples) {
	const once = FieldNormalizer[fn](arg);
	const twice = FieldNormalizer[fn](once);
	eq(twice, once, `idempotent: ${fn}(${JSON.stringify(arg)}) → ${JSON.stringify(once)}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);