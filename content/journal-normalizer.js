/*
	Zometaker - journal-normalizer.js

	Field-by-field normalisers for non-name metadata, aligned with APA 7.

	APA 7 capitalisation rules in a nutshell:
	  - Article titles, book titles, chapter titles: **sentence case**
	    (only first word, first word after colon/dash, and proper nouns).
	  - Journal names: **title case** (all major words capitalised).
	  - Sub-titles: first word capitalised regardless.

	Other rules:
	  - Page range: en-dash (`–`, U+2013) between numbers, NOT hyphen.
	  - DOI: prefer `https://doi.org/...` URL form (no `doi:` prefix).
	  - ISBN: 10 or 13 digits, hyphens ignored; ends in X allowed.
	  - Publisher: no city/location (APA 7 dropped the city).
	  - Edition: `(2nd ed.)` in parentheses after title, not italicised.
	  - Date: ISO `YYYY-MM-DD` for Zotero's date field.
*/

// `var` so the symbol attaches to the loadSubScript sandbox.
var FieldNormalizer = (function () {
	// Title-case particles (kept lowercase in the *middle* of a journal
	// title). Same conventions as APA 7 §6.17.
	const PARTICLES = new Set([
		'a', 'an', 'and', 'the', 'of', 'or', 'for', 'in', 'on', 'at',
		'to', 'with', 'by', 'from', 'as', 'but', 'nor',
		'de', 'del', 'dela', 'della', 'der', 'des', 'di', 'do', 'da',
		'dos', 'das', 'du',
		'la', 'le', 'les', 'el', 'los', 'las', 'al',
		'von', 'vom', 'van', 'ten', 'ter', 'te',
		'y',
	]);

	// Known acronyms that should be preserved in upper-case regardless of
	// input case (in Title Case the acronym is also fine upper-case).
	const KNOWN_ACRONYMS = new Set([
		'ieee', 'acm', 'aaai', 'ijcai', 'neurips', 'acl', 'emnlp', 'naacl',
		'aaas', 'pnas', 'plos', 'jama', 'nejm', 'bmj', 'jbi',
		'nih', 'nsf', 'nasa', 'nist', 'nato', 'unesco',
		'who', 'fbi', 'cia', 'nsa', 'iso', 'ansi', 'din',
		'dna', 'rna', 'mrna', 'pcr', 'mri', 'ct', 'pet', 'ecg', 'eeg',
		'mla', 'apa', 'pmla', 'aera',
		'un', 'eu', 'us', 'uk', 'usa', 'ussr', 'uae',
		'ai', 'ml', 'nlp', 'cv', 'ir', 'rl', 'dl', 'hci',
		'lp', 'lsa', 'lda',
	]);

	function trim(s) {
		return (s || '').replace(/\s+/g, ' ').trim();
	}

	function capWord(word, opts) {
		if (!word) return word;
		if (!/[a-zA-Z]/.test(word)) return word;

		// Acronym: preserve upper-case.
		if (KNOWN_ACRONYMS.has(word.toLowerCase())) {
			return word.toUpperCase();
		}

		const lower = word.toLowerCase();
		const cleanLower = lower.replace(/\./g, '');

		// Particles lowercase in Title Case unless first/last word.
		if (!opts.isFirst && !opts.isLast && PARTICLES.has(cleanLower)) {
			return lower;
		}

		return lower.charAt(0).toUpperCase() + lower.slice(1);
	}

	// ----- Sentence case (for article / book / chapter titles) -----

	function isAllCaps(s) {
		// Has any Latin letters AND all of them are upper-case.
		const letters = s.replace(/[^a-zA-Z]/g, '');
		if (!letters.length) return false;
		return letters === letters.toUpperCase();
	}

	function isMostlyCaps(s) {
		// ≥80% upper-case letters.
		const letters = s.replace(/[^a-zA-Z]/g, '');
		if (letters.length < 4) return false;
		const upper = letters.replace(/[^A-Z]/g, '').length;
		return upper / letters.length >= 0.8;
	}

	function splitOnColonDash(s) {
		// Returns array of segments split on ":" or "—" / " - "
		// Each segment's first word is capitalised in sentence case.
		return s.split(/(:|—|\s-\s)/);
	}

	function normaliseSentenceCase(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);
		if (!s) return input;

		// Strip surrounding quotes that some importers leave behind.
		s = s.replace(/^["'“”]+|["'“”]+$/g, '').trim();

		// Decide whether to intervene:
		//   1. All-caps / mostly-caps → clearly Title Case → fix.
		//   2. Mixed case with several Title-Case tokens (Word starts
		//      with capital + lowercase tail) AFTER the first word → fix.
		//   3. Otherwise (already sentence-case-ish) → still re-capitalise
		//      the first word of each segment (start + after ":" / "—").
		const looksAllCaps = isMostlyCaps(s);
		const looksTitleCase = (() => {
			const words = s.split(/\s+/);
			if (words.length < 3) return false;
			let titleCaseish = 0;
			for (let i = 1; i < words.length; i++) {
				const w = words[i].replace(/[^A-Za-z]/g, '');
				if (w.length < 3) continue;
				if (/^[A-Z][a-z]+$/.test(w)) titleCaseish += 1;
			}
			return titleCaseish >= 2;
		})();
		const intervene = looksAllCaps || looksTitleCase;

		const segs = splitOnColonDash(s);
		let isFirstWordOfSegment = true;
		let result = '';
		for (let i = 0; i < segs.length; i++) {
			const seg = segs[i];
			if (/^(:|—|\s-\s)$/.test(seg)) {
				result += seg;
				isFirstWordOfSegment = true;
				continue;
			}
			const words = seg.split(/(\s+)/);
			for (let j = 0; j < words.length; j++) {
				const w = words[j];
				if (/^\s+$/.test(w)) {
					result += w;
					continue;
				}
				if (isFirstWordOfSegment && w.length > 0) {
					// APA 7: always capitalise the first word of each segment.
					result += capWord(w, { isFirst: true });
					isFirstWordOfSegment = false;
				} else if (intervene) {
					result += w.toLowerCase();
				} else {
					result += w;
				}
			}
		}

		return result;
	}

	// ----- Title Case (for journal / proceedings / book series names) -----

	function normaliseTitleCase(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);
		if (!s) return input;

		// Strip trailing period (CSL convention).
		s = s.replace(/\.\s*$/, '');

		// Keep "&" in journal titles per APA 7 (e.g. "Memory &
		// Cognition", "Brain & Language"). Only collapse double
		// whitespace around the ampersand.
		s = s.replace(/\s*&\s*/g, ' & ');

		const tokens = s.split(/(\s+)/);
		const letterTokens = tokens.filter((t) => !/^\s+$/.test(t));
		const lastLetterIdx = letterTokens.length - 1;

		let letterIdx = 0;
		return tokens
			.map((tok) => {
				if (/^\s+$/.test(tok)) return tok;
				const isFirst = letterIdx === 0;
				const isLast = letterIdx === lastLetterIdx;
				letterIdx += 1;
				return capWord(tok, { isFirst, isLast });
			})
			.join('');
	}

	// ----- Specific fields -----

	function normaliseJournal(input) {
		return normaliseTitleCase(input);
	}

	function normalisePublication(input) {
		// Same as journal: title case.
		return normaliseTitleCase(input);
	}

	function normaliseTitle(input) {
		// Sentence case for article / book / chapter titles.
		return normaliseSentenceCase(input);
	}

	function normaliseShortTitle(input) {
		// shortTitle / journalAbbreviation: keep as supplied (these are
		// usually abbreviated forms intentionally).
		return trim(input);
	}

	// ----- Page range -----

	function normalisePages(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input).replace(/\s+/g, '');

		// Detect "digits (any dash variant / whitespace) digits" — the
		// APA-7 page-range pattern. Replace just the separator with en-dash.
		const range = s.match(/^(\d+)[‐‑‒–—―\-\s]+(\d+)$/);
		if (range) {
			return range[1] + '–' + range[2];
		}

		// Single number or article number — leave as-is.
		if (/^\d+$/.test(s)) return s;
		if (/^e?\d+$/i.test(s)) return s;
		if (/^Article\s*\d+/i.test(s)) return s;

		// Otherwise, just collapse duplicate dashes (e.g. "12--34" → "12-34").
		s = s.replace(/[‐‑‒–—―]/g, '-');
		s = s.replace(/-+/g, '-');
		s = s.replace(/^-+|-+$/g, '');
		return s;
	}

	// ----- Volume / Issue -----

	function normaliseVolume(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);
		s = s.replace(/^vol(?:ume|\.)?\s*/i, '');
		return trim(s);
	}

	function normaliseIssue(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);
		s = s.replace(/^(?:number|num\.?|issue|no\.?)\s*/i, '');
		return trim(s);
	}

	// ----- DOI -----

	function normaliseDOI(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);

		// Strip common prefixes (case-insensitive for the "doi:" variant).
		s = s.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
		s = s.replace(/^doi:\s*/i, '');

		// Extract the bare DOI (per CrossRef pattern: 10.NNNN/...)
		const m = s.match(/10\.\d{4,9}\/\S+/);
		const bare = m ? m[0] : trim(s).replace(/[.,;]+$/, '');

		// Return URL form per APA 7 preference.
		if (!bare) return input;
		if (/^https?:\/\//i.test(bare)) return bare;
		return 'https://doi.org/' + bare;
	}

	// ----- ISBN -----

	function normaliseISBN(input) {
		if (!input || typeof input !== 'string') return input;
		const s = input.replace(/[\s-]/g, '').toUpperCase();
		if (s.length === 10 || s.length === 13) return s;
		return trim(input);
	}

	// ----- Date / Year -----

	function extractYear(input) {
		if (!input) return null;
		if (typeof input === 'number') {
			return input >= 1000 && input <= 9999 ? input : null;
		}
		if (typeof input !== 'string') return null;
		const m = input.match(/\b(1[5-9]\d{2}|20\d{2}|21\d{2})\b/);
		return m ? parseInt(m[1], 10) : null;
	}

	// ----- Publisher (APA 7: no city/location) -----

	function normalisePublisher(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);
		// Strip trailing period.
		s = s.replace(/\.\s*$/, '');

		// Strip leading "City:" or "City, ST:" patterns. APA 7 dropped
		// the publisher location; if some importer left it in, drop it.
		// E.g. "New York, NY: Routledge" → "Routledge".
		const colonIdx = s.indexOf(':');
		if (colonIdx > 0) {
			const before = s.slice(0, colonIdx).trim();
			const after = s.slice(colonIdx + 1).trim();
			// Heuristic: if the part before ":" looks like "City" or
			// "City, ST" (comma present, short), treat as location.
			if (
				before.length < 60 &&
				(/^[,A-Za-z .'-]+$/.test(before)) &&
				!/\d/.test(before)
			) {
				s = after;
			}
		}

		// Strip "Inc.", "Co.", "Publishers" suffixes that APA 7 says to
		// drop ("Routledge Publishers" → "Routledge").
		s = s.replace(/,?\s+(Inc\.?|Incorporated|Co\.?|LLC|Ltd\.?|Publishers?|Publishing Company|Publishing)$/i, '');

		return s;
	}

	// ----- Edition statement -----

	function normaliseEdition(input) {
		if (!input || typeof input !== 'string') return input;
		let s = trim(input);
		// Strip leading "Edition"/"Ed." labels.
		s = s.replace(/^(?:edition|ed\.?)\s*/i, '');
		// Capitalise ordinal suffix.
		const num = parseInt(s, 10);
		if (!isNaN(num) && String(num) === s) {
			const ord = num + (
				(num % 100 >= 11 && num % 100 <= 13) ? 'th' :
				(num % 10 === 1) ? 'st' :
				(num % 10 === 2) ? 'nd' :
				(num % 10 === 3) ? 'rd' : 'th'
			);
			return ord + ' ed.';
		}
		return trim(input);
	}

	return {
		normaliseJournal,
		normalisePublication,
		normaliseTitle,
		normaliseShortTitle,
		normalisePages,
		normaliseVolume,
		normaliseIssue,
		normaliseDOI,
		normaliseISBN,
		normalisePublisher,
		normaliseEdition,
		extractYear,
		// internals for tests
		_normaliseTitleCase: normaliseTitleCase,
		_normaliseSentenceCase: normaliseSentenceCase,
	};
})();