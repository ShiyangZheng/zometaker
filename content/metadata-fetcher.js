/*
	Zometaker - metadata-fetcher.js

	Looks up bibliographic metadata from public APIs. Three providers are
	supported in a configurable priority chain:

	  1. CrossRef  — best for journal articles with a DOI
	  2. OpenAlex  — broadest coverage (incl. books, ISBN lookup)
	  3. DataCite  — fallback for non-journal items (datasets, theses)

	Each provider returns a *unified* record shape:

	  {
	    doi, type, title,
	    authors: [{first, last, raw, orcid}, ...],
	    journal, journalAbbrev, issn, isbn,
	    volume, issue, pages,
	    publisher, year, month, day,
	    abstract, url,
	    source: 'crossref' | 'openalex' | 'datacite' | 'openlibrary'
	  }

	All network calls are throttled, timeout-bounded, and never throw
	out of `fetchByDOI` / `fetchByISBN` — they return `null` on failure
	so the caller can just check the result.
*/

// `var` (not `const`) so the symbol attaches to the loadSubScript
// sandbox object (Zotero.Zometaker).
var MetadataFetcher = (function () {
	// Safe logger: works in Zotero, in tests (Node), and in any sandbox.
	function debugLog(msg) {
		try {
			if (typeof Zotero !== 'undefined' && Zotero.debug) {
				Zotero.debug(msg);
				return;
			}
		} catch (e) {}
		try {
			if (typeof console !== 'undefined' && console.log) {
				console.log(msg);
			}
		} catch (e) {}
	}

	const ENDPOINTS = {
		crossref: 'https://api.crossref.org/works/',
		openalex_works: 'https://api.openalex.org/works/',
		openalex_isbn: 'https://api.openalex.org/works/isbn:',
		datacite: 'https://api.datacite.org/dois/',
		openlibrary: 'https://openlibrary.org/api/books',
	};

	const TIMEOUT_MS = 15000;

	function buildUA(mailto) {
		if (mailto && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailto)) {
			// CrossRef etiquette: include a contact mailto in the UA.
			return `Zometaker/1.0 (mailto:${mailto})`;
		}
		return 'Zometaker/1.0 (https://github.com/senior-developer/zometaker)';
	}

	function throttle(rps) {
		// Returns a function that, when awaited, waits until it's safe
		// to make the next request.
		let lastCall = 0;
		const minInterval = rps > 0 ? 1000 / rps : 0;
		return async function wait() {
			const now = Date.now();
			const delay = Math.max(0, lastCall + minInterval - now);
			if (delay > 0) {
				await new Promise((r) => setTimeout(r, delay));
			}
			lastCall = Date.now();
		};
	}

	function timeoutFetch(url, opts = {}, timeoutMs = TIMEOUT_MS) {
		// Some Zotero builds ship a slightly older `fetch` (no AbortController).
		// We do best-effort timeout via a race against setTimeout.
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`Timeout after ${timeoutMs}ms`)),
				timeoutMs,
			);
			fetch(url, opts)
				.then((res) => {
					clearTimeout(timer);
					resolve(res);
				})
				.catch((err) => {
					clearTimeout(timer);
					reject(err);
				});
		});
	}

	function stripJATS(s) {
		if (s == null) return undefined;
		if (typeof s !== 'string') return undefined;
		// CrossRef returns abstracts wrapped in JATS XML.
		return s
			.replace(/<jats:[^>]*>/g, '')
			.replace(/<\/jats:[^>]*>/g, '')
			.replace(/<[^>]+>/g, '')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.trim();
	}

	function reconstructAbstract(invertedIndex) {
		if (!invertedIndex || typeof invertedIndex !== 'object') return undefined;
		const arr = [];
		for (const word in invertedIndex) {
			if (!Object.prototype.hasOwnProperty.call(invertedIndex, word)) continue;
			const positions = invertedIndex[word];
			if (!Array.isArray(positions)) continue;
			for (const p of positions) {
				arr[p] = word;
			}
		}
		return arr.join(' ').trim() || undefined;
	}

	function openAlexTypeToCSL(type) {
		const map = {
			article: 'journal-article',
			book: 'book',
			'book-chapter': 'chapter',
			dissertation: 'thesis',
			preprint: 'article',
			'review': 'review',
			'paratext': 'article',
			'editorial': 'editorial',
			letter: 'article',
			'erratum': 'article',
			'libguides': 'webpage',
			'supplementary-material': 'article',
			'report': 'report',
			'standard': 'standard',
			'book-part': 'chapter',
			'book-series': 'book',
			'book-set': 'book',
			'journal': 'periodical',
			'journal-issue': 'article',
			'journal-volume': 'article',
			'reference-book': 'book',
			'reference-entry': 'entry',
			'posted-content': 'manuscript',
			'proceedings': 'paper-conference',
			'proceedings-article': 'paper-conference',
			'proceedings-series': 'paper-conference',
			'database': 'dataset',
			'dataset': 'dataset',
			'component': 'article',
			'grant': 'report',
			'inbook': 'chapter',
			'inproceedings': 'paper-conference',
		};
		if (!type) return undefined;
		return map[type] || type;
	}

	function splitAuthorName(raw) {
		if (!raw) return { first: undefined, last: undefined };
		const s = String(raw).trim().replace(/\s+/g, ' ');
		// Try "Last, First"
		if (s.includes(',')) {
			const [last, first] = s.split(',', 2).map((x) => x.trim());
			if (last) return { first: first || undefined, last };
		}
		// Single token → surname
		const parts = s.split(' ');
		if (parts.length === 1) return { first: undefined, last: parts[0] };
		// "First Last" — assume last token is surname.
		return {
			first: parts.slice(0, -1).join(' ') || undefined,
			last: parts[parts.length - 1],
		};
	}

	// -------- CrossRef --------

	async function fetchCrossRef(doi, { mailto } = {}) {
		const url = `${ENDPOINTS.crossref}${encodeURIComponent(doi)}`;
		const res = await timeoutFetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': buildUA(mailto),
			},
		});
		if (!res.ok) {
			throw new Error(`CrossRef HTTP ${res.status}`);
		}
		const json = await res.json();
		const msg = json.message;
		if (!msg) return null;

		const issued = msg.issued?.['date-parts']?.[0] || [];
		return {
			doi: msg.DOI,
			type: msg.type,
			title: Array.isArray(msg.title) ? msg.title[0] : msg.title,
			authors: (msg.author || []).map((a) => ({
				first: a.given,
				last: a.family,
				raw: a.name,
				orcid: a.ORCID,
			})).filter((a) => a.first || a.last || a.raw),
			journal: Array.isArray(msg['container-title'])
				? msg['container-title'][0]
				: msg['container-title'],
			journalAbbrev: Array.isArray(msg['short-container-title'])
				? msg['short-container-title'][0]
				: msg['short-container-title'],
			issn: Array.isArray(msg.ISSN) ? msg.ISSN[0] : msg.ISSN,
			isbn: Array.isArray(msg.ISBN) ? msg.ISBN[0] : msg.ISBN,
			volume: msg.volume,
			issue: msg.issue,
			pages: msg.page,
			publisher: msg.publisher,
			year: issued[0],
			month: issued[1],
			day: issued[2],
			abstract: stripJATS(msg.abstract),
			url: msg.URL,
			source: 'crossref',
		};
	}

	// -------- OpenAlex --------

	async function fetchOpenAlex(doi, { mailto } = {}) {
		const url = `${ENDPOINTS.openalex_works}doi:${encodeURIComponent(doi)}`;
		const res = await timeoutFetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': buildUA(mailto),
			},
		});
		if (!res.ok) {
			// 404 is expected when DOI not in OpenAlex; don't throw.
			if (res.status === 404) return null;
			throw new Error(`OpenAlex HTTP ${res.status}`);
		}
		const data = await res.json();
		if (!data) return null;
		return parseOpenAlex(data);
	}

	async function fetchOpenAlexByISBN(isbn, { mailto } = {}) {
		const url = `${ENDPOINTS.openalex_isbn}${encodeURIComponent(isbn)}`;
		const res = await timeoutFetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': buildUA(mailto),
			},
		});
		if (!res.ok) {
			if (res.status === 404) return null;
			throw new Error(`OpenAlex HTTP ${res.status}`);
		}
		const data = await res.json();
		// OpenAlex returns a single work or {results: [...]} — handle both.
		if (data && data.id) return parseOpenAlex(data);
		if (data && Array.isArray(data.results) && data.results.length) {
			return parseOpenAlex(data.results[0]);
		}
		return null;
	}

	function parseOpenAlex(data) {
		const biblio = data.biblio || {};
		const src = data.primary_location?.source || {};
		const issued = data.publication_date || '';

		return {
			doi: data.doi
				? String(data.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
				: undefined,
			type: openAlexTypeToCSL(data.type || data.type_crossref),
			title: data.title || data.display_name,
			authors: (data.authorships || []).map((a) => {
				const name = a.author?.display_name;
				return {
					...splitAuthorName(name),
					raw: name,
					orcid: a.author?.orcid
						? String(a.author.orcid).replace(/^https?:\/\/orcid\.org\//, '')
						: undefined,
				};
			}).filter((a) => a.first || a.last || a.raw),
			journal: src.display_name,
			journalAbbrev: src.abbreviated_title,
			issn: src.issn_l,
			isbn: data.isbn?.find?.((x) => x),
			volume: biblio.volume,
			issue: biblio.issue,
			pages:
				biblio.first_page && biblio.last_page
					? `${biblio.first_page}-${biblio.last_page}`
					: biblio.first_page,
			publisher:
				src.host_organization_name ||
				data.host_venue?.publisher ||
				undefined,
			year: data.publication_year,
			month: issued ? parseInt(issued.slice(5, 7), 10) || undefined : undefined,
			day: issued ? parseInt(issued.slice(8, 10), 10) || undefined : undefined,
			abstract: reconstructAbstract(data.abstract_inverted_index),
			url: data.doi || data.id,
			source: 'openalex',
		};
	}

	// -------- DataCite --------

	async function fetchDataCite(doi, { mailto } = {}) {
		const url = `${ENDPOINTS.datacite}${encodeURIComponent(doi)}`;
		const res = await timeoutFetch(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': buildUA(mailto),
			},
		});
		if (!res.ok) {
			if (res.status === 404) return null;
			throw new Error(`DataCite HTTP ${res.status}`);
		}
		const json = await res.json();
		const d = json?.data;
		if (!d) return null;
		const attrs = d.attributes || {};
		const issued = attrs.publicationYear;
		return {
			doi: attrs.doi,
			type: attrs.types?.resourceTypeGeneral?.toLowerCase().replace(/\s+/g, '-'),
			title: attrs.titles?.[0]?.title,
			authors: (attrs.creators || []).map((c) => ({
				first: c.givenName,
				last: c.familyName,
				raw: c.name,
			})).filter((a) => a.first || a.last || a.raw),
			publisher: attrs.publisher,
			year: issued ? parseInt(issued, 10) : undefined,
			url: attrs.url,
			source: 'datacite',
		};
	}

	// -------- OpenLibrary (ISBN fallback for books) --------

	async function fetchOpenLibrary(isbn) {
		const url = `${ENDPOINTS.openlibrary}?bibkeys=ISBN:${encodeURIComponent(isbn)}&format=json&jscmd=data`;
		const res = await timeoutFetch(url, {
			headers: { Accept: 'application/json' },
		});
		if (!res.ok) {
			if (res.status === 404) return null;
			throw new Error(`OpenLibrary HTTP ${res.status}`);
		}
		const data = await res.json();
		const book = data[`ISBN:${isbn}`];
		if (!book) return null;
		return {
			isbn,
			title: book.title,
			authors: (book.authors || []).map((a) => ({
				...splitAuthorName(a.name),
				raw: a.name,
			})).filter((a) => a.first || a.last || a.raw),
			publisher: book.publishers?.[0]?.name,
			year: book.publish_date
				? parseInt(String(book.publish_date).match(/\d{4}/)?.[0], 10) || undefined
				: undefined,
			pages: book.number_of_pages ? String(book.number_of_pages) : undefined,
			url: book.url,
			source: 'openlibrary',
		};
	}

	// -------- Public API --------

	/**
	 * Build a fetcher with its own throttle window.
	 *
	 * @param {Object} opts
	 * @param {string} [opts.mailto]    contact e-mail (CrossRef etiquette)
	 * @param {number} [opts.rps=5]     requests per second cap
	 */
	function create(opts = {}) {
		const mailto = opts.mailto || '';
		const rps = opts.rps || 5;
		const wait = throttle(rps);

		/**
		 * Fetch metadata by DOI, trying providers in order.
		 * Returns null if every provider fails.
		 */
		async function fetchByDOI(doi, providers) {
			if (!doi) return null;
			const order = providers && providers.length
				? providers
				: ['crossref', 'openalex', 'datacite'];

			const errors = [];
			for (const name of order) {
				try {
					await wait();
					let r = null;
					if (name === 'crossref') r = await fetchCrossRef(doi, { mailto });
					else if (name === 'openalex') r = await fetchOpenAlex(doi, { mailto });
					else if (name === 'datacite') r = await fetchDataCite(doi, { mailto });
					if (r) return r;
				} catch (e) {
					errors.push(`${name}: ${e.message}`);
				}
			}
			if (errors.length) {
				debugLog('[Zometaker] All providers failed for ' + doi + ': ' + errors.join('; '));
			}
			return null;
		}

		/**
		 * Fetch metadata by ISBN (for books).
		 */
		async function fetchByISBN(isbn) {
			if (!isbn) return null;
			try {
				await wait();
				const r = await fetchOpenAlexByISBN(isbn, { mailto });
				if (r) return r;
			} catch (e) {
				debugLog('[Zometaker] OpenAlex ISBN failed: ' + e.message);
			}
			try {
				await wait();
				const r = await fetchOpenLibrary(isbn);
				if (r) return r;
			} catch (e) {
				debugLog('[Zometaker] OpenLibrary ISBN failed: ' + e.message);
			}
			return null;
		}

		return {
			fetchByDOI,
			fetchByISBN,
			// Expose internals for tests / advanced users.
			_apis: { fetchCrossRef, fetchOpenAlex, fetchDataCite, fetchOpenLibrary, fetchOpenAlexByISBN },
			_helpers: { stripJATS, reconstructAbstract, openAlexTypeToCSL, splitAuthorName },
		};
	}

	return { create };
})();