/*
	NameNormalizer tests (APA 7 aware).
	Run with: `node tests/name-normalizer.test.js`
*/

const { loadModule } = require('./harness.js');

const { NameNormalizer } = loadModule('../content/name-normalizer.js');

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

// ----- Default mode (APA 7 initials) -----
eq(NameNormalizer.normalise('JOHN SMITH'), 'Smith, J.', 'initials mode ALL CAPS');
eq(NameNormalizer.normalise('john smith'), 'Smith, J.', 'initials mode all lower');
eq(NameNormalizer.normalise('John Smith'), 'Smith, J.', 'initials mode already given');
eq(NameNormalizer.normalise('  JOHN   SMITH  '), 'Smith, J.', 'initials mode whitespace');
eq(NameNormalizer.normalise('J.R.R. Tolkien'), 'Tolkien, J. R. R.', 'initials preserved (space-separated)');
eq(NameNormalizer.normalise('c. s. lewis'), 'Lewis, C. S.', 'lowercase initials');
eq(NameNormalizer.normalise('JEAN-PAUL SARTRE'), 'Sartre, J.-P.', 'hyphenated given → J.-P.');
eq(NameNormalizer.normalise("O'CONNOR, PETER"), "O'Connor, P.", 'apostrophe surname');
eq(NameNormalizer.normalise('JANE M SMITH'), 'Smith, J. M.', 'multi-word given');

// ----- Particles in surname -----
eq(NameNormalizer.normalise('JOHN VON SMITH'), 'von Smith, J.', 'particle in surname');
eq(NameNormalizer.normalise('LUDWIG VAN BEETHOVEN'), 'van Beethoven, L.', 'van particle');
eq(NameNormalizer.normalise('MARIA DE LOPEZ'), 'de Lopez, M.', 'de particle');
eq(NameNormalizer.normalise('VON GOETHE'), 'Von Goethe', 'particle at start stays capital (single-name)');

// ----- Title-case mode (legacy, still surname-first per APA 7) -----
eq(NameNormalizer.normalise('JOHN SMITH', 'titlecase'), 'Smith, John', 'titlecase ALL CAPS');
eq(NameNormalizer.normalise('john smith', 'titlecase'), 'Smith, John', 'titlecase all lower');
eq(NameNormalizer.normalise('JOHN VON SMITH', 'titlecase'), 'von Smith, John', 'titlecase particle');

// ----- Celtic prefixes (surname only) -----
eq(NameNormalizer.normalise('MACDONALD'), 'MacDonald', 'Mac prefix surname');
eq(NameNormalizer.normalise('MCCARTHY'), 'McCarthy', 'Mc prefix surname');

// ----- Last, First format -----
eq(NameNormalizer.normalise('SMITH, JOHN'), 'Smith, J.', 'inverted input initials mode');
eq(NameNormalizer.normalise('VON RICHTER, ANNA MARIA'), 'von Richter, A. M.', 'inverted particle + multi given');
eq(NameNormalizer.normalise('SMITH, JOHN MICHAEL', 'titlecase'), 'Smith, John Michael', 'inverted titlecase mode');

// ----- CJK passthrough -----
eq(NameNormalizer.normalise('张伟'), '张伟', 'CJK passthrough');
eq(NameNormalizer.normalise('陈志强'), '陈志强', 'CJK passthrough 2');

// ----- Suffixes -----
eq(NameNormalizer.normalise('JOHN SMITH JR'), 'Smith, J., Jr.', 'Jr suffix');
eq(NameNormalizer.normalise('JOHN SMITH III'), 'Smith, J., III', 'Roman III suffix');
eq(NameNormalizer.normalise('HENRY VIII'), 'Henry VIII', 'regnal name Henry VIII');

// ----- Edge cases -----
eq(NameNormalizer.normalise(null), null, 'null pass-through');
eq(NameNormalizer.normalise(''), '', 'empty string');

// ----- Idempotency (initials mode) -----
const samples = [
	'JOHN SMITH',
	'jean-paul sartre',
	'VON RICHTER, ANNA MARIA',
	'陈志强',
	"O'CONNOR, PETER",
	'MCCARTHY',
	'JANE M SMITH',
];
for (const s of samples) {
	const once = NameNormalizer.normalise(s);
	const twice = NameNormalizer.normalise(once);
	eq(twice, once, `idempotent initials: ${s} → ${once}`);
}

// ----- Idempotency (titlecase mode) -----
for (const s of ['JOHN SMITH', 'jean-paul sartre']) {
	const once = NameNormalizer.normalise(s, 'titlecase');
	const twice = NameNormalizer.normalise(once, 'titlecase');
	eq(twice, once, `idempotent titlecase: ${s} → ${once}`);
}

// ----- splitForZotero -----
eq(NameNormalizer.splitForZotero('John Smith'), { firstName: 'John', lastName: 'Smith' }, 'split non-inverted');
eq(NameNormalizer.splitForZotero('Smith, John'), { lastName: 'Smith', firstName: 'John' }, 'split inverted');
eq(NameNormalizer.splitForZotero('Plato'), { firstName: '', lastName: 'Plato' }, 'split single token');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);