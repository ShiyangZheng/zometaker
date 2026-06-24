/*
	APAChecker tests.
	Run with: `node tests/apa-checker.test.js`

	The checker reads from a fake `item` object that quacks like a
	Zotero item (has getField + getCreators). We don't need Zotero.
*/

const { loadModule } = require('./harness.js');

const sandbox = loadModule('../content/name-normalizer.js');
loadModule('../content/journal-normalizer.js', sandbox);
loadModule('../content/apa-checker.js', sandbox);
const { APAChecker } = sandbox;

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

function makeItem(fields, creators = []) {
	return {
		itemType: fields.itemType || 'journalArticle',
		getField(name) {
			const v = fields[name];
			return v == null ? '' : v;
		},
		getCreators() { return creators; },
	};
}

const ALL_RULES = {
	R1: true, R4: true, R5: true, R6: true, R7: true,
	R8: true, R9: true, R11: true, R12: true, R13: true,
	R14: true, R15: true, R17: true, R18: true,
	R19: true, R20: true,
};

// ===== R5: date =====
{
	const it = makeItem({ date: '2024' });
	const issues = APAChecker.all(it, { rules: {} }); // R5 disabled
	eq(issues.filter((i) => i.rule === 'R5').length, 0, 'R5: present date no issue');

	const bad = makeItem({ date: '' });
	const issues2 = APAChecker.all(bad, { rules: ALL_RULES });
	const r5 = issues2.find((i) => i.rule === 'R5');
	eq(r5 && r5.severity, 'error', 'R5: missing date is error severity');
}

// ===== R6: title sentence case =====
{
	const it = makeItem({ title: 'A Deep Learning Approach to NLP' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r6 = issues.find((i) => i.rule === 'R6');
	eq(!!r6, true, 'R6: Title Case title flagged');

	const ok = makeItem({ title: 'A deep learning approach to NLP' });
	const issues2 = APAChecker.all(ok, { rules: ALL_RULES });
	eq(issues2.find((i) => i.rule === 'R6') === undefined, true, 'R6: already sentence case');
}

// ===== R7: journal title case =====
{
	const it = makeItem({ publicationTitle: 'NATURE' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r7 = issues.find((i) => i.rule === 'R7');
	eq(r7 && r7.after, 'Nature', 'R7: ALL CAPS journal → Nature');

	const ok = makeItem({ publicationTitle: 'Nature' });
	eq(APAChecker.all(ok, { rules: ALL_RULES }).find((i) => i.rule === 'R7'), undefined, 'R7: already correct');
}

// ===== R11: en-dash pages =====
{
	const it = makeItem({ pages: '123-456' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r11 = issues.find((i) => i.rule === 'R11');
	eq(r11 && r11.after, '123–456', 'R11: hyphen → en-dash');

	const ok = makeItem({ pages: '123–456' });
	eq(APAChecker.all(ok, { rules: ALL_RULES }).find((i) => i.rule === 'R11'), undefined, 'R11: en-dash already');
}

// ===== R12: DOI URL form =====
{
	const it = makeItem({ DOI: 'doi:10.1038/nature12373' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r12 = issues.find((i) => i.rule === 'R12');
	eq(r12 && r12.after, 'https://doi.org/10.1038/nature12373', 'R12: doi: → URL form');

	const it2 = makeItem({ DOI: '10.1038/nature12373' });
	const r12b = APAChecker.all(it2, { rules: ALL_RULES }).find((i) => i.rule === 'R12');
	eq(r12b && r12b.after, 'https://doi.org/10.1038/nature12373', 'R12: bare DOI → URL form');
}

// ===== R14: publisher no location =====
{
	const it = makeItem({ publisher: 'New York, NY: Routledge' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r14 = issues.find((i) => i.rule === 'R14');
	eq(r14 && r14.after, 'Routledge', 'R14: location stripped');
}

// ===== R17: missing required =====
{
	const it = makeItem({ itemType: 'journalArticle', title: 'X', publicationTitle: 'Y', date: '2024' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r17 = issues.filter((i) => i.rule === 'R17').map((i) => i.field);
	eq(r17.includes('volume'), true, 'R17: missing volume flagged for journalArticle');
	eq(r17.includes('issue'), true, 'R17: missing issue flagged for journalArticle');
	eq(r17.includes('pages'), true, 'R17: missing pages flagged for journalArticle');
}

// ===== R4: caps given name =====
{
	const it = makeItem({ title: 'x' }, [{ firstName: 'JOHN', lastName: 'SMITH', creatorType: 'author', fieldMode: 0 }]);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r4 = issues.find((i) => i.rule === 'R4');
	eq(r4 && r4.field, 'creators', 'R4: ALL CAPS given name flagged');
}

// ===== R18: single-field author (fieldMode=1) — the (D. A. Titone & Connine, 1999) bug =====
{
	const it = makeItem(
		{ title: 'On the building blocks of words' },
		[
			{ firstName: '', lastName: 'Titone, D. A.', creatorType: 'author', fieldMode: 1 },
			{ firstName: '', lastName: 'Connine, C. M.', creatorType: 'author', fieldMode: 1 },
		],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r18s = issues.filter((i) => i.rule === 'R18');
	eq(r18s.length, 2, 'R18: two single-field creators flagged');
	eq(r18s[0].before, 'Titone, D. A.', 'R18: before = full single-field string');
	eq(r18s[0].field, 'creators', 'R18: field is creators');
	eq(r18s[0].severity, 'error', 'R18: severity = error');
}
{
	// Two-field creator should NOT be flagged.
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: 'D. A.', lastName: 'Titone', creatorType: 'author', fieldMode: 0 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	eq(issues.filter((i) => i.rule === 'R18').length, 0, 'R18: two-field creator not flagged');
}
{
	// R18 disabled → no issues even with single-field creators.
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: '', lastName: 'Titone, D. A.', creatorType: 'author', fieldMode: 1 }],
	);
	const issues = APAChecker.all(it, { rules: { R18: false } });
	eq(issues.filter((i) => i.rule === 'R18').length, 0, 'R18: disabled rule skips flag');
}

// ===== R4: all-caps given name → initial, not surname =====
{
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: 'ERMAN', lastName: 'B.', creatorType: 'author', fieldMode: 0 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r4 = issues.find((i) => i.rule === 'R4');
	eq(r4 && r4.after, 'E.', 'R4: ERMAN → E. (initial, not "Erman")');
}

// ===== R19: HTML tags / entities / weird whitespace =====
{
	const it = makeItem({
		title: 'Putting a Lexical                 Approach to the test',
	});
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r19 = issues.find((i) => i.rule === 'R19' && i.field === 'title');
	eq(r19 && r19.after, 'Putting a Lexical Approach to the test', 'R19: collapse multi-space');
}
{
	const it = makeItem({
		title: 'The Effect of Equal Versus Expanding Spacing Practice on the Deliberate Learning of                     <scp>L2</scp>                     Collocations',
	});
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r19 = issues.find((i) => i.rule === 'R19' && i.field === 'title');
	eq(r19 && r19.after,
		'The Effect of Equal Versus Expanding Spacing Practice on the Deliberate Learning of L2 Collocations',
		'R19: strip <scp> tags + collapse whitespace');
}
{
	const it = makeItem({
		publicationTitle: 'Memory &amp; Cognition',
	});
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r19 = issues.find((i) => i.rule === 'R19' && i.field === 'publicationTitle');
	eq(r19 && r19.after, 'Memory & Cognition', 'R19: decode &amp; in journal');
}
{
	const it = makeItem({ title: 'A normal sentence case title' });
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	eq(issues.filter((i) => i.rule === 'R19' && i.field === 'title').length, 0,
		'R19: clean title not flagged');
}
{
	// R19 in creator names (e.g. connector gave "ERMAN <i>B.</i>")
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: 'ERMAN <i>B.</i>', lastName: 'Smith', creatorType: 'author', fieldMode: 0 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r19 = issues.find((i) => i.rule === 'R19' && i.field === 'creators');
	eq(!!r19, true, 'R19: tagged creator name flagged');
}

// ===== R20: all-caps family name =====
{
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: 'B.', lastName: 'ERMAN', creatorType: 'author', fieldMode: 0 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r20 = issues.find((i) => i.rule === 'R20');
	eq(r20 && r20.after, 'Erman', 'R20: ERMAN → Erman');
}
{
	// Compound family name with particle should stay capitalised properly.
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: 'J.', lastName: 'VON GOETHE', creatorType: 'author', fieldMode: 0 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r20 = issues.find((i) => i.rule === 'R20');
	eq(r20 && r20.after, 'Von Goethe', 'R20: VON GOETHE → Von Goethe (particle cap)');
}
{
	// Single-field creators (R18 territory) should NOT trigger R20.
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: '', lastName: 'Titone, D. A.', creatorType: 'author', fieldMode: 1 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	eq(issues.filter((i) => i.rule === 'R20').length, 0, 'R20: skips fieldMode=1 (R18 handles)');
}

// ===== Real bibliography: ERMAN & WARREN (2000) =====
{
	// User's actual data: ERMAN all-caps author, "Text - Interdisciplinary
	// Journal for the Study of Discourse" already title-case.
	const it = makeItem(
		{
			title: 'The idiom principle and the open choice principle',
			publicationTitle: 'Text - Interdisciplinary Journal for the Study of Discourse',
			DOI: '10.1515/text.1.2000.20.1.29',
			date: '2000',
		},
		[
			{ firstName: 'ERMAN', lastName: 'B.', creatorType: 'author', fieldMode: 0 },
			{ firstName: 'WARREN', lastName: 'B.', creatorType: 'author', fieldMode: 0 },
		],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r4s = issues.filter((i) => i.rule === 'R4');
	eq(r4s.length, 2, 'ERMAN/WARREN: both R4 flagged');
	eq(r4s[0].after, 'E.', 'ERMAN: after = E.');
	eq(r4s[1].after, 'W.', 'WARREN: after = W.');
}

// ===== Real bibliography: Sonbul et al. (2024) with <scp> tags =====
{
	const it = makeItem({
		title: 'The Effect of Equal Versus Expanding Spacing Practice on the Deliberate Learning of                     <scp>L2</scp>                     Collocations',
		publicationTitle: 'TESOL Quarterly',
		date: '2024',
	});
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r19 = issues.find((i) => i.rule === 'R19' && i.field === 'title');
	eq(!!r19, true, 'Sonbul: <scp> flagged by R19');
}

// ===== Real bibliography: SPRENGER (all-caps family name) =====
{
	const it = makeItem(
		{ title: 'x' },
		[{ firstName: 'S.', lastName: 'SPRENGER', creatorType: 'author', fieldMode: 0 }],
	);
	const issues = APAChecker.all(it, { rules: ALL_RULES });
	const r20 = issues.find((i) => i.rule === 'R20');
	eq(r20 && r20.after, 'Sprenger', 'SPRENGER: R20 → Sprenger');
}

// ===== Helpers exposed for orchestrator use =====
{
	const h = APAChecker.helpers;
	eq(h.decodeHtmlEntities('Memory &amp; Cognition'), 'Memory & Cognition',
		'helpers.decodeHtmlEntities: &amp;');
	eq(h.decodeHtmlEntities('Don&#39;t go'), "Don't go",
		'helpers.decodeHtmlEntities: &#39;');
	eq(h.decodeHtmlEntities('foo&nbsp;bar'), 'foo bar',
		'helpers.decodeHtmlEntities: &nbsp;');
	eq(h.stripTags('a <scp>L2</scp> b'), 'a L2 b',
		'helpers.stripTags: <scp>');
	eq(h.collapseWs('foo    bar'), 'foo bar',
		'helpers.collapseWs: 4 spaces');
	eq(h.collapseWs('foo\u00A0\u00A0bar'), 'foo bar',
		'helpers.collapseWs: NBSP');
	eq(h.tidyString('foo <i>bar</i>  baz  &amp; qux'),
		'foo bar baz & qux',
		'helpers.tidyString: combined');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);