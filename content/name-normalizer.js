/*
	Zometaker - name-normalizer.js

	Author-name normalisation aligned with APA 7th edition rules.

	APA 7 says: author names in the reference list are formatted as
	"Lastname, F. M." — surname first, given names reduced to initials
	with periods and a space between consecutive initials. Hyphenated
	given names stay hyphenated (Jean-Paul → J.-P.). Suffixes like
	Jr., III, II are kept as-is and follow the initials after a comma.

	Examples:
	  - "JOHN SMITH"           → "Smith, J."
	  - "JOHN MICHAEL SMITH"   → "Smith, J. M."
	  - "JOHN VON SMITH"       → "von Smith, J."
	  - "JEAN-PAUL SARTRE"     → "Sartre, J.-P."
	  - "MACDONALD"            → "MacDonald"
	  - "VON GOETHE"           → "Von Goethe"      (single-name particle capitalised)
	  - "JOHN SMITH JR"        → "Smith, J., Jr."
	  - "张三"                 → "张三"            (CJK passthrough)

	Mode is selected via the `mode` argument: "initials" (APA default)
	or "titlecase" (legacy).

	The normaliser is idempotent: running it twice yields the same result.
*/

// `var` (not `const`) so the symbol attaches to the loadSubScript
// sandbox object (Zotero.Zometaker).
var NameNormalizer = (function () {
	const PARTICLES = new Set([
		'a', 'an', 'the',
		'de', 'del', 'dela', 'della', 'der', 'des',
		'di', 'do', 'da', 'dos', 'das', 'du',
		'la', 'le', 'les', 'el', 'los', 'las', 'al',
		'von', 'vom', 'van', 'ten', 'ter', 'te', 't',
		'y',
		'st', 'st.', 'saint',
		'bin', 'ibn',
		'af', 'av', 'zu', 'zur',
	]);

	const SUFFIXES = new Set([
		'jr', 'jr.', 'sr', 'sr.',
		'ii', 'iii', 'iv', 'v', 'vi',
	]);

	const ROMAN_RE = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

	function hasLatin(s) {
		return /[a-zA-Z]/.test(s);
	}

	function cap(s) {
		if (!s) return s;
		return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
	}

	function isInitialToken(tok) {
		// "J", "J.", "J.R", "J.R.", "J.R.R", "J.R.R."
		return /^[A-Za-z](\.[A-Za-z])*\.?$/.test(tok);
	}

	function capInitialToken(tok) {
		return tok.split('').map((c) =>
			(/[a-zA-Z]/.test(c) ? c.toUpperCase() : c)
		).join('');
	}

	function normaliseGivenToken(tok, mode) {
		if (!tok) return tok;
		if (!hasLatin(tok)) return tok;

		if (mode === 'titlecase') {
			return titleCaseToken(tok, { isFirst: true });
		}

		// initials mode
		if (isInitialToken(tok)) {
			const capped = capInitialToken(tok);
			const withDot = /[.]$/.test(capped) ? capped : capped + '.';
			// Space-separate multi-initials: "J.R.R." → "J. R. R."
			const body = withDot.slice(0, -1);
			if (/\./.test(body)) {
				const spaced = body.replace(/\./g, '. ').replace(/\s+$/, '').replace(/\s+/g, ' ');
				return spaced + '.';
			}
			return withDot;
		}

		// Hyphenated given name
		if (tok.includes('-')) {
			return tok.split('-').map((p) => normaliseGivenToken(p, mode)).join('-');
		}

		const letter = tok.charAt(0);
		if (!/[a-zA-Z]/.test(letter)) return tok;
		return letter.toUpperCase() + '.';
	}

	function titleCaseToken(tok, ctx) {
		if (!tok) return tok;
		if (!hasLatin(tok)) return tok;

		if (tok.includes('-')) {
			return tok.split('-')
				.map((p, i) => titleCaseToken(p, { isFirst: ctx.isFirst && i === 0 }))
				.join('-');
		}

		if (tok.includes("'") || tok.includes('\u2019')) {
			const ap = tok.includes("'") ? "'" : '\u2019';
			const parts = tok.split(ap);
			return [
				titleCaseToken(parts[0], ctx),
				ap,
				parts.slice(1).map((p) => titleCaseToken(p, { isFirst: false })).join(ap),
			].join('');
		}

		if (isInitialToken(tok)) return capInitialToken(tok);

		const lower = tok.toLowerCase();
		const cleanLower = lower.replace(/\./g, '');

		if (ROMAN_RE.test(cleanLower)) return tok.toUpperCase();
		if (cleanLower === 'jr' || cleanLower === 'sr') return cap(lower) + '.';

		if (/^mac[a-z]/.test(lower)) return 'Mac' + cap(lower.slice(3));
		if (/^mc[a-z]/.test(lower) && lower.length >= 4) return 'Mc' + cap(lower.slice(2));

		if (!ctx.isFirst && PARTICLES.has(cleanLower)) return lower;

		return cap(lower);
	}

	function normaliseSurnameToken(tok, ctx) {
		if (!tok) return tok;
		if (!hasLatin(tok)) return tok;

		if (tok.includes('-')) {
			return tok.split('-')
				.map((p, i) => normaliseSurnameToken(p, {
					isFirst: ctx.isFirst && i === 0,
					isParticle: ctx.isParticle,
				}))
				.join('-');
		}

		if (tok.includes("'") || tok.includes('\u2019')) {
			const ap = tok.includes("'") ? "'" : '\u2019';
			const parts = tok.split(ap);
			return [
				normaliseSurnameToken(parts[0], ctx),
				ap,
				parts.slice(1).map((p) => normaliseSurnameToken(p, { isFirst: false, isParticle: true })).join(ap),
			].join('');
		}

		if (isInitialToken(tok)) return capInitialToken(tok);

		const lower = tok.toLowerCase();
		const cleanLower = lower.replace(/\./g, '');

		if (ROMAN_RE.test(cleanLower)) return tok.toUpperCase();
		if (cleanLower === 'jr' || cleanLower === 'sr') return cap(lower) + '.';

		if (/^mac[a-z]/.test(lower)) return 'Mac' + cap(lower.slice(3));
		if (/^mc[a-z]/.test(lower) && lower.length >= 4) return 'Mc' + cap(lower.slice(2));

		if (PARTICLES.has(cleanLower)) {
			return ctx.isFirst ? cap(lower) : lower;
		}

		return cap(lower);
	}

	// Strip a trailing suffix token (Jr / Sr / II / III / IV) if any.
	function splitSuffix(tokens) {
		if (!tokens.length) return { head: tokens, suffix: null };
		const last = tokens[tokens.length - 1].toLowerCase().replace(/\.$/, '');
		if (SUFFIXES.has(last)) {
			const s = tokens[tokens.length - 1];
			let fixed;
			if (/^(Jr|Sr)\.?$/i.test(s)) {
				fixed = cap(s.replace(/\.$/, '')) + '.';
			} else {
				fixed = s.toUpperCase().replace(/\.$/, '');
			}
			return { head: tokens.slice(0, -1), suffix: fixed };
		}
		return { head: tokens, suffix: null };
	}

	// A token is "surname-attached" if it's a particle (lowercase
	// connector), Roman numeral, or a recognised surname suffix
	// (Jr / Sr / II / III / IV). These extend the surname backward.
	// Plain initials are NOT included.
	function isSurnameParticle(tok) {
		const t = tok.toLowerCase().replace(/\.$/, '');
		if (PARTICLES.has(t)) return true;
		if (ROMAN_RE.test(t)) return true;
		if (SUFFIXES.has(t)) return true;
		return false;
	}

	// Find the boundary between given names and surname, walking
	// backwards from the last token. The surname is the trailing run
	// of tokens where each preceding token is a particle/initial/Roman.
	function findSurnameStart(tokens) {
		if (!tokens.length) return { given: [], surname: [] };
		let i = tokens.length - 1;
		while (i > 0 && isSurnameParticle(tokens[i - 1])) i -= 1;
		return { given: tokens.slice(0, i), surname: tokens.slice(i) };
	}

	function normaliseSurname(surnameStr, opts) {
		opts = opts || {};
		const toks = surnameStr.split(/\s+/).filter(Boolean);
		// In a compound surname, particles stay lowercase (APA 7).
		// Exception: if the WHOLE input is a single name (no given),
		// the first token is capitalised even if it's a particle
		// ("VON GOETHE" → "Von Goethe").
		const forceFirstCap = !!opts.singleName;
		return toks
			.map((tok, i) => {
				const t = tok.toLowerCase().replace(/\.$/, '');
				const isParticle = PARTICLES.has(t);
				const isFirst = i === 0;
				const useCap = isFirst && (forceFirstCap || !isParticle);
				return normaliseSurnameToken(tok, {
					isFirst: useCap,
					isParticle: !useCap,
				});
			})
			.join(' ');
	}

	function normaliseGiven(givenStr, mode) {
		if (!givenStr) return '';
		const toks = givenStr.split(/\s+/).filter(Boolean);
		const { head, suffix } = splitSuffix(toks);
		const normGiven = head.map((tok) => normaliseGivenToken(tok, mode));
		const formatted = normGiven.join(' ');
		return suffix ? formatted + ', ' + suffix : formatted;
	}

	function normaliseOne(raw, mode) {
		if (!raw || typeof raw !== 'string') return raw;
		const s = raw.trim().replace(/\s+/g, ' ');
		if (!s) return raw;
		if (!hasLatin(s)) return s;

		// ---- Inverted form ("Last, First ...").
		const commaIdx = s.indexOf(',');
		if (commaIdx >= 0) {
			const surname = s.slice(0, commaIdx).trim();
			const rest = s.slice(commaIdx + 1).trim();
			const surnameNorm = normaliseSurname(surname);
			const givenNorm = normaliseGiven(rest, mode);
			return surnameNorm + ', ' + givenNorm;
		}

		// ---- Non-inverted form.
		const tokens = s.split(/\s+/).filter(Boolean);
		if (tokens.length === 1) {
			return normaliseSurname(s, { singleName: true });
		}

		// Historical / regnal names ("Henry VIII", "Louis XIV"):
		// 2 tokens, second is Roman → keep as a single display name.
		// First token: title case (capitalise first letter, lowercase rest).
		// Second token: Roman numerals conventionally stay upper-case.
		if (tokens.length === 2 && ROMAN_RE.test(tokens[1].toLowerCase().replace(/\.$/, ''))) {
			const first = tokens[0].charAt(0).toUpperCase() + tokens[0].slice(1).toLowerCase();
			const second = tokens[1].toUpperCase();
			return first + ' ' + second;
		}

		// Strip a trailing suffix from the input as a whole, so it
		// attaches to the given side, not the surname.
		// (E.g. "JOHN SMITH JR" → core=["JOHN","SMITH"], suffix="Jr.")
		const { head: coreTokens, suffix } = splitSuffix(tokens);
		const { given, surname } = findSurnameStart(coreTokens);
		const surnameStr = surname.join(' ');
		const givenStr = given.join(' ');
		const singleName = givenStr.length === 0;
		const surnameNorm = normaliseSurname(surnameStr, { singleName });
		if (singleName) return surnameNorm;
		const givenNorm = normaliseGiven(givenStr, mode);
		if (suffix) return surnameNorm + ', ' + givenNorm + ', ' + suffix;
		return surnameNorm + ', ' + givenNorm;
	}

	// ----- Public API -----

	function normalise(input, mode) {
		mode = mode || 'initials';
		return normaliseOne(input, mode);
	}

	function normaliseList(input, mode) {
		if (!input || typeof input !== 'string') return input;
		const parts = input
			.split(/\s*(?:;|\band\b)\s*/i)
			.map((p) => p.trim())
			.filter(Boolean);
		if (parts.length <= 1) return normalise(input, mode);
		return parts.map((p) => normalise(p, mode)).join('; ');
	}

	function splitForZotero(raw) {
		if (!raw || typeof raw !== 'string') return null;
		const s = raw.trim().replace(/\s+/g, ' ');
		if (!s) return null;
		if (s.includes(',')) {
			const idx = s.indexOf(',');
			return {
				lastName: s.slice(0, idx).trim(),
				firstName: s.slice(idx + 1).trim(),
			};
		}
		const toks = s.split(/\s+/);
		if (toks.length === 1) return { firstName: '', lastName: toks[0] };
		return {
			firstName: toks.slice(0, -1).join(' '),
			lastName: toks[toks.length - 1],
		};
	}

	// Split a single-field author string ("Titone, D. A.") into a
	// clean two-field object. Uses Zotero's own Zotero.Utilities.cleanAuthor
	// when available (the path every Zotero translator uses); falls
	// back to a local routine when running under Node tests.
	function _splitSingleFieldAuthor(raw, creatorType, mode) {
		if (!raw || typeof raw !== 'string') return null;
		const s = raw.trim().replace(/\s+/g, ' ');
		if (!s) return null;
		let split = null;
		try {
			if (typeof Zotero !== 'undefined' && Zotero.Utilities && typeof Zotero.Utilities.cleanAuthor === 'function') {
				const ct = creatorType || 'author';
				// useComma=true tells cleanAuthor to prefer a comma split.
				split = Zotero.Utilities.cleanAuthor(s, ct, true);
			}
		} catch (e) {
			split = null;
		}
		if (!split) {
			// Local fallback: smart split based on comma presence.
			split = _localSplitAuthor(s, creatorType);
		}
		if (!split) return null;

		// ----- Post-process the surname -----
		// Don't run `normalise` (it'd re-interpret as full author
		// string). Instead, light cleanup: trim, collapse whitespace,
		// title-case particles properly.
		let lastName = (split.lastName || '').trim().replace(/\s+/g, ' ');
		if (lastName && hasLatin(lastName)) {
			const lastTokens = lastName.split(/\s+/);
			lastName = lastTokens.map((w, i) => {
				const lower = w.toLowerCase().replace(/\.$/, '');
				if (i > 0 && PARTICLES.has(lower)) return w.toLowerCase();
				return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
			}).join(' ');
		}

		// ----- Post-process the given name -----
		// cleanAuthor produces "D. A." already; local fallback may
		// produce "John Michael" form. For "initials" mode, reduce
		// multi-token given names to APA-7 initials.
		let firstName = (split.firstName || '').trim().replace(/\s+/g, ' ');
		if (mode === 'initials' && firstName && hasLatin(firstName)) {
			firstName = normaliseGiven(firstName, 'initials');
		}

		return {
			firstName,
			lastName,
			creatorType: split.creatorType || creatorType || 'author',
		};
	}

	// Local fallback for Zotero.Utilities.cleanAuthor. Logic mirrors
	// what cleanAuthor does for the most common shapes:
	//   "Surname, Given"       → split at first comma
	//   "Surname Given1 Given2"→ split at last space (surname = last)
	//   "Multi Word Institutional" → single name (institutional)
	//   single token           → single name
	// Heuristic: if the whole input has no comma and more than 2
	// tokens, treat as institutional (single field, lastName = whole).
	function _localSplitAuthor(s, creatorType) {
		if (!s) return null;
		if (s.includes(',')) {
			const idx = s.indexOf(',');
			return {
				lastName: s.slice(0, idx).trim(),
				firstName: s.slice(idx + 1).trim(),
				creatorType: creatorType || 'author',
			};
		}
		const toks = s.split(/\s+/).filter(Boolean);
		if (toks.length === 1) {
			return { lastName: toks[0], firstName: '', creatorType: creatorType || 'author' };
		}
		// Roman numeral trailing → regnal name, single field
		if (toks.length === 2 && ROMAN_RE.test(toks[1].toLowerCase().replace(/\.$/, ''))) {
			return { lastName: s, firstName: '', creatorType: creatorType || 'author' };
		}
		// 3+ tokens with no comma → likely institutional / multi-word name
		// (e.g. "World Health Organization", "Royal Society of Chemistry").
		// Default to single-field surname.
		if (toks.length >= 3) {
			return { lastName: s, firstName: '', creatorType: creatorType || 'author' };
		}
		// 2 tokens: assume inverted ("John Smith" → surname="Smith",
		// given="John"). Exception: if the would-be given name is a
		// particle, treat the whole input as a single compound surname
		// ("von Goethe" → lastName="Von Goethe", firstName="").
		if (PARTICLES.has(toks[0].toLowerCase().replace(/\.$/, ''))) {
			return { lastName: s, firstName: '', creatorType: creatorType || 'author' };
		}
		return {
			lastName: toks[toks.length - 1],
			firstName: toks.slice(0, -1).join(' '),
			creatorType: creatorType || 'author',
		};
	}

	return {
		normalise,
		normaliseList,
		splitForZotero,
		_splitSingleFieldAuthor,
		_normaliseOne: normaliseOne,
	};
})();