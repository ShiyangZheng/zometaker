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
	R14: true, R15: true, R17: true,
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);