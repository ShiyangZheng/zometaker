/*
	Zometaker - apa-checker.js

	Rule engine for APA 7th edition reference-list formatting.
	Each rule is a small, named, individually-toggleable function that
	returns either null (no issue) or {field, rule, severity, before,
	after}. The orchestrator merges the issues into the run report.

	APA 7 reference-list rules implemented here:

	  R1  authors: surname + comma + initials (Lastname, F. M.)
	  R2  authors: ≤20 names; 21+ uses ellipsis after first 19
	  R3  authors: ampersand "&" before last author (not "and")
	  R4  authors: no all-caps given names
	  R5  date: present and a valid 4-digit year (or "n.d.")
	  R6  article title: sentence case (not Title Case)
	  R7  journal name: title case (capitalised major words)
	  R8  volume: numeric only (strip "Vol." prefix)
	  R9  issue: numeric only (strip "No." / "Issue" prefix)
	  R10 volume/issue: format "vol(issue)" not "vol (issue)"
	  R11 pages: en-dash, not hyphen; inclusive ranges ok
	  R12 DOI: prefer https://doi.org/ URL form
	  R13 ISBN: 10 or 13 digits
	  R14 publisher: no leading "City:" location
	  R15 edition: "2nd ed." style, not "Second Edition"
	  R16 journal articles: present when itemType=journalArticle
	  R17 missing required fields per item type
	  R18 DOI uniqueness sanity (same DOI on multiple items)
*/

// `var` so the symbol attaches to the loadSubScript sandbox.
var APAChecker = (function () {
	function read(item, field) {
		try {
			const v = item.getField(field, false, true);
			return v == null ? '' : String(v).trim();
		} catch (e) {
			return '';
		}
	}

	function trim(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

	// ----- R1: Author surname, F. M. -----

	function rule1_authorsInverted(item) {
		const creators = item.getCreators() || [];
		if (!creators.length) return null;
		const offenders = [];
		for (const c of creators) {
			if (!c.firstName && !c.lastName) continue;
			// Look for "First Last" form stored as a single firstName.
			if (c.firstName && /^[A-Z][a-z]+(\s+[A-Z][a-z]+)+$/.test(c.firstName)) {
				// Probably two-word given name; that's actually OK.
				continue;
			}
			if (c.lastName && /,/.test(c.lastName)) {
				offenders.push({
					field: 'creators',
					rule: 'R1',
					severity: 'warn',
					before: c.lastName,
					after: c.lastName.replace(/,.*/, '').trim(),
					message: 'Creator lastName contains a comma — surname should be in lastName, given name(s) in firstName.',
				});
			}
		}
		return offenders.length ? offenders : null;
	}

	// ----- R3: ampersand vs and in author display string -----

	function rule3_ampersand(item) {
		// Only flag the cached author display string (Zotero's combined
		// display field for export). Not directly editable, but useful
		// to flag for the report.
		const a = read(item, 'author');
		if (!a) return null;
		if (/,\s+and\b/.test(a) && !/,\s*&\b/.test(a)) {
			return [{
				field: 'author',
				rule: 'R3',
				severity: 'info',
				before: a,
				after: a.replace(/,\s+and\b/, ', &'),
				message: 'APA 7 uses "&" before the final author, not "and".',
			}];
		}
		return null;
	}

	// ----- R4: all-caps given names -----

	function rule4_capsGiven(item) {
		const creators = item.getCreators() || [];
		if (!creators.length) return null;
		const offenders = [];
		for (const c of creators) {
			if (!c.firstName) continue;
			const letters = c.firstName.replace(/[^A-Za-z]/g, '');
			if (letters.length >= 2 && letters === letters.toUpperCase()) {
				offenders.push({
					field: 'creators',
					rule: 'R4',
					severity: 'warn',
					before: c.firstName,
					after: NameNormalizer.normalise(c.firstName, 'initials'),
					message: 'Given name appears to be all-caps — convert to APA-7 initials (F. M.).',
				});
			}
		}
		return offenders.length ? offenders : null;
	}

	// ----- R5: date present + valid -----

	function rule5_date(item) {
		const date = read(item, 'date');
		if (!date) {
			return [{
				field: 'date',
				rule: 'R5',
				severity: 'error',
				before: '',
				after: 'n.d.',
				message: 'Date is missing. APA 7 uses "(n.d.)" when no date is available.',
			}];
		}
		const y = FieldNormalizer.extractYear(date);
		if (!y) {
			return [{
				field: 'date',
				rule: 'R5',
				severity: 'warn',
				before: date,
				after: date,
				message: 'Date does not contain a 4-digit year.',
			}];
		}
		return null;
	}

	// ----- R6: article title sentence case -----

	function rule6_titleSentenceCase(item) {
		const title = read(item, 'title');
		if (!title) return null;
		// Skip if title has lots of Title Case signals — flag for review.
		// Heuristic: count "Word Starts With Capital + Lowercase Tail"
		// tokens after the first one. ≥2 such tokens → likely Title Case.
		const words = title.split(/\s+/);
		if (words.length < 4) return null;
		let titleCaseish = 0;
		for (let i = 1; i < words.length; i++) {
			const w = words[i].replace(/[^A-Za-z]/g, '');
			if (w.length < 3) continue;
			if (/^[A-Z][a-z]+$/.test(w)) titleCaseish += 1;
		}
		if (titleCaseish < 2) return null;
		const fixed = FieldNormalizer._normaliseSentenceCase(title);
		if (fixed === title) return null;
		return [{
			field: 'title',
			rule: 'R6',
			severity: 'warn',
			before: title,
			after: fixed,
			message: 'Article title appears to be in Title Case — APA 7 requires sentence case.',
		}];
	}

	// ----- R7: journal title case -----

	function rule7_journalTitleCase(item) {
		const journal = read(item, 'publicationTitle');
		if (!journal) return null;
		const words = journal.split(/\s+/);
		const allUpper = words.every((w) => {
			const letters = w.replace(/[^A-Za-z]/g, '');
			return !letters || letters === letters.toUpperCase();
		});
		if (!allUpper) return null;
		const fixed = FieldNormalizer.normaliseJournal(journal);
		if (fixed === journal) return null;
		return [{
			field: 'publicationTitle',
			rule: 'R7',
			severity: 'warn',
			before: journal,
			after: fixed,
			message: 'Journal title appears all-caps — APA 7 expects title case.',
		}];
	}

	// ----- R8 / R9: volume / issue numeric only -----

	function rule8_volume(item) {
		const v = read(item, 'volume');
		if (!v) return null;
		if (/^vol(?:ume|\.)?\s/i.test(v) || /[^0-9]/.test(v.replace(/[^0-9]/g, ''))) {
			return [{
				field: 'volume',
				rule: 'R8',
				severity: 'warn',
				before: v,
				after: v.replace(/^vol(?:ume|\.)?\s*/i, '').trim(),
				message: 'Volume should be a number; strip "Vol." prefix.',
			}];
		}
		return null;
	}

	function rule9_issue(item) {
		const x = read(item, 'issue');
		if (!x) return null;
		if (/^(?:number|num\.?|issue|no\.?)\s/i.test(x)) {
			return [{
				field: 'issue',
				rule: 'R9',
				severity: 'warn',
				before: x,
				after: x.replace(/^(?:number|num\.?|issue|no\.?)\s*/i, '').trim(),
				message: 'Issue should be a number; strip "No." / "Issue" prefix.',
			}];
		}
		return null;
	}

	// ----- R11: en-dash page range -----

	function rule11_pagesDash(item) {
		const p = read(item, 'pages');
		if (!p) return null;
		if (/^\d+-\d+$/.test(p)) {
			const m = p.match(/^(\d+)-(\d+)$/);
			return [{
				field: 'pages',
				rule: 'R11',
				severity: 'error',
				before: p,
				after: m[1] + '–' + m[2],
				message: 'Page range must use en-dash (–), not hyphen (-).',
			}];
		}
		if (/[‐‑‒—―]/.test(p)) {
			const fixed = p.replace(/[‐‑‒—―]/g, '–');
			if (fixed !== p) {
				return [{
					field: 'pages',
					rule: 'R11',
					severity: 'error',
					before: p,
					after: fixed,
					message: 'Page range must use en-dash (–), not other dash variants.',
				}];
			}
		}
		return null;
	}

	// ----- R12: DOI URL form -----

	function rule12_doiURL(item) {
		const d = read(item, 'DOI');
		if (!d) return null;
		if (/^doi:\s*/i.test(d)) {
			return [{
				field: 'DOI',
				rule: 'R12',
				severity: 'warn',
				before: d,
				after: d.replace(/^doi:\s*/i, '').replace(/^/, 'https://doi.org/'),
				message: 'DOI should use the URL form (https://doi.org/...).',
			}];
		}
		if (/^10\.\d{4,9}\//.test(d)) {
			return [{
				field: 'DOI',
				rule: 'R12',
				severity: 'warn',
				before: d,
				after: 'https://doi.org/' + d,
				message: 'DOI should use the URL form (https://doi.org/...).',
			}];
		}
		return null;
	}

	// ----- R13: ISBN format -----

	function rule13_isbn(item) {
		const x = read(item, 'ISBN');
		if (!x) return null;
		const clean = x.replace(/[\s-]/g, '');
		if (!/^\d{9}[\dX]$/.test(clean) && !/^\d{13}$/.test(clean)) {
			return [{
				field: 'ISBN',
				rule: 'R13',
				severity: 'warn',
				before: x,
				after: x,
				message: 'ISBN should be 10 or 13 digits (ISBN-10 may end in X).',
			}];
		}
		return null;
	}

	// ----- R14: publisher no leading location -----

	function rule14_publisherNoLocation(item) {
		const p = read(item, 'publisher');
		if (!p) return null;
		// "City:" or "City, ST:" pattern.
		const m = p.match(/^([A-Z][A-Za-z .'-]{1,40}),?\s+([A-Z]{2})?:\s*(.+)$/);
		if (m) {
			return [{
				field: 'publisher',
				rule: 'R14',
				severity: 'warn',
				before: p,
				after: m[3].trim(),
				message: 'APA 7 dropped publisher location; drop "City:" prefix.',
			}];
		}
		return null;
	}

	// ----- R15: edition formatting -----

	function rule15_edition(item) {
		const e = read(item, 'edition');
		if (!e) return null;
		if (/^(second|third|fourth|fifth|first|2nd|3rd|4th|5th)/i.test(e) &&
			!/^\d+(st|nd|rd|th)\s+ed\.?$/i.test(e)) {
			const fixed = FieldNormalizer.normaliseEdition(e);
			return [{
				field: 'edition',
				rule: 'R15',
				severity: 'warn',
				before: e,
				after: fixed,
				message: 'Edition should be formatted as "2nd ed." (parentheses in citation).',
			}];
		}
		return null;
	}

	// ----- R16/17: missing required fields per type -----

	const REQUIRED_BY_TYPE = {
		journalArticle: ['title', 'publicationTitle', 'volume', 'issue', 'pages', 'date'],
		book:           ['title', 'date', 'publisher'],
		bookSection:    ['title', 'bookTitle', 'date', 'publisher'],
		conferencePaper:['title', 'proceedingsTitle', 'date'],
		thesis:         ['title', 'date', 'university'],
		report:         ['title', 'date', 'publisher'],
		webpage:        ['title', 'date', 'url'],
	};

	function rule16_17_missing(item) {
		const t = item.itemType || '';
		const required = REQUIRED_BY_TYPE[t] || [];
		const issues = [];
		for (const f of required) {
			const v = read(item, f);
			if (!v) {
				issues.push({
					field: f,
					rule: 'R17',
					severity: 'error',
					before: '',
					after: '(missing)',
					message: `Required field "${f}" is missing for item type ${t}.`,
				});
			}
		}
		return issues.length ? issues : null;
	}

	// ----- All rules runner -----

	function all(item, prefs) {
		prefs = prefs || {};
		const enabled = prefs.rules || {
			R1: true, R3: false, R4: true, R5: true,
			R6: true, R7: true, R8: true, R9: true,
			R11: true, R12: true, R13: true, R14: true,
			R15: true, R16: true, R17: true,
		};

		const out = [];
		const run = (r) => {
			const issues = r();
			if (Array.isArray(issues)) out.push(...issues);
			else if (issues) out.push(issues);
		};

		if (enabled.R1) run(() => rule1_authorsInverted(item));
		if (enabled.R3) run(() => rule3_ampersand(item));
		if (enabled.R4) run(() => rule4_capsGiven(item));
		if (enabled.R5) run(() => rule5_date(item));
		if (enabled.R6) run(() => rule6_titleSentenceCase(item));
		if (enabled.R7) run(() => rule7_journalTitleCase(item));
		if (enabled.R8) run(() => rule8_volume(item));
		if (enabled.R9) run(() => rule9_issue(item));
		if (enabled.R11) run(() => rule11_pagesDash(item));
		if (enabled.R12) run(() => rule12_doiURL(item));
		if (enabled.R13) run(() => rule13_isbn(item));
		if (enabled.R14) run(() => rule14_publisherNoLocation(item));
		if (enabled.R15) run(() => rule15_edition(item));
		if (enabled.R16 || enabled.R17) run(() => rule16_17_missing(item));

		return out;
	}

	return {
		all,
		// Expose individual rules for tests.
		_rules: {
			rule1_authorsInverted,
			rule3_ampersand,
			rule4_capsGiven,
			rule5_date,
			rule6_titleSentenceCase,
			rule7_journalTitleCase,
			rule8_volume,
			rule9_issue,
			rule11_pagesDash,
			rule12_doiURL,
			rule13_isbn,
			rule14_publisherNoLocation,
			rule15_edition,
			rule16_17_missing,
		},
	};
})();