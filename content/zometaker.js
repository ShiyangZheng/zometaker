/*
	Zometaker - zometaker.js

	Top-level orchestrator. Loaded last (depends on NameNormalizer,
	FieldNormalizer, APAChecker, MetadataFetcher). All top-level
	declarations attach to the loadSubScript sandbox
	(Zotero.Zometaker), which is why this file uses `var`
	and `function` rather than `const` / block-scoped arrow functions
	for its public surface.

	Public API (called by bootstrap.js):
	  - initUI() / shutdownUI()
	  - runOnLibrary() / runOnSelection() / runOnItem(item)
	  - showLastSummary()
	  - Prefs (object with pref accessors)
*/

// =================================================================
// Preferences
// =================================================================

var PREF_PREFIX = 'extensions.zometaker.';

function mcGetPref(key, fallback) {
	try {
		return Zotero.Prefs.get(PREF_PREFIX + key, true);
	} catch (e) {
		return fallback;
	}
}

function mcSetPref(key, val) {
	Zotero.Prefs.set(PREF_PREFIX + key, val, true);
}

var Prefs = {
	register() {
		// defaults.js handles default registration.
	},
	get mailto() { return mcGetPref('mailto', '') || ''; },
	get primaryAPI() { return mcGetPref('api.primary', 'crossref'); },
	get fallbackAPI() { return mcGetPref('api.fallback', 'openalex'); },
	get normalizeNames() { return !!mcGetPref('normalize.names', true); },
	get normalizeJournal() { return !!mcGetPref('normalize.journal', true); },
	get normalizePages() { return !!mcGetPref('normalize.pages', true); },
	get normalizeTitle() { return !!mcGetPref('normalize.title', true); },
	get completeMissing() { return !!mcGetPref('complete.missing', true); },
	get completeAbstract() { return !!mcGetPref('complete.abstract', true); },
	get completeTags() { return !!mcGetPref('complete.tags', false); },
	get rps() { return Number(mcGetPref('rate.requestsPerSecond', 5)) || 5; },
	get dryRun() { return !!mcGetPref('dryRun', false); },
	get skipNonJournals() { return !!mcGetPref('skipNonJournals', false); },
	get nameMode() { return mcGetPref('names.mode', 'initials') || 'initials'; }, // "initials" | "titlecase"
	get apaStrict() { return !!mcGetPref('apa.strict', true); },
	get apaRules() {
		// Comma-separated rule ids, e.g. "R1,R3,R4,R5,R6,R7,R8,R9,R11,R12,R14,R15"
		const def = 'R1,R4,R5,R6,R7,R8,R9,R11,R12,R13,R14,R15,R17,R18,R19,R20';
		const raw = mcGetPref('apa.rules', def) || def;
		const out = {};
		raw.split(',').forEach((r) => { r = r.trim(); if (r) out[r] = true; });
		return out;
	},
};

// =================================================================
// Field mapping
// =================================================================

var FIELD_CONFIG = {
	title:             { remote: 'title',           normaliser: 'normaliseTitle' },
	publicationTitle:  { remote: 'journal',         normaliser: 'normaliseJournal' },
	shortTitle:        { remote: 'journalAbbrev',   normaliser: 'normaliseShortTitle' },
	volume:            { remote: 'volume',          normaliser: 'normaliseVolume' },
	issue:             { remote: 'issue',           normaliser: 'normaliseIssue' },
	pages:             { remote: 'pages',           normaliser: 'normalisePages' },
	DOI:               { remote: 'doi',             normaliser: 'normaliseDOI' },
	ISBN:              { remote: 'isbn',            normaliser: 'normaliseISBN' },
	publisher:         { remote: 'publisher',       normaliser: 'normalisePublisher' },
	edition:           { remote: null,              normaliser: 'normaliseEdition' },
	abstract:          { remote: 'abstract',        normaliser: null },
	date:              { remote: 'year',            normaliser: null },
	ISSN:              { remote: 'issn',            normaliser: null },
};

function isNormaliserEnabled(name) {
	if (name === 'normaliseTitle') return Prefs.normalizeTitle;
	if (name === 'normaliseJournal') return Prefs.normalizeJournal;
	if (name === 'normalisePages') return Prefs.normalizePages;
	if (name === 'normalisePublisher') return !!mcGetPref('normalize.publisher', true);
	if (name === 'normaliseDOI') return !!mcGetPref('normalize.doi', true);
	if (name === 'normaliseISBN') return !!mcGetPref('normalize.isbn', true);
	if (name === 'normaliseEdition') return !!mcGetPref('normalize.edition', true);
	if (name === 'normaliseVolume' || name === 'normaliseIssue') {
		return !!mcGetPref('normalize.volumeIssue', true);
	}
	return true;
}

function buildDateString(remote) {
	if (!remote.year) return null;
	var y = String(remote.year).padStart(4, '0');
	var m = remote.month ? String(remote.month).padStart(2, '0') : null;
	var d = remote.day ? String(remote.day).padStart(2, '0') : null;
	if (d && m) return y + '-' + m + '-' + d;
	if (m) return y + '-' + m;
	return y;
}

// =================================================================
// Per-item helpers
// =================================================================

function mcReadField(item, field) {
	try {
		var v = item.getField(field, false, true);
		return v === null || v === undefined ? '' : String(v).trim();
	} catch (e) {
		return '';
	}
}

function mcSetField(item, field, value, ctx, bucket) {
	var current = mcReadField(item, field);
	var normalised = value == null ? '' : String(value).trim();
	if (!normalised) return false;
	if (current === normalised) return false;
	if (Prefs.dryRun) {
		ctx.changes[bucket].push({ field: field, from: current, to: normalised });
		return true;
	}
	try {
		item.setField(field, normalised);
		ctx.changes[bucket].push({ field: field, from: current, to: normalised });
		return true;
	} catch (e) {
		Zotero.debug('[Zometaker] setField(' + field + ') failed: ' + e);
		return false;
	}
}

function mcFillField(item, field, value, ctx) {
	return mcSetField(item, field, value, ctx, 'filled');
}

function mcUpdateField(item, field, value, ctx) {
	return mcSetField(item, field, value, ctx, 'updated');
}

function mcNormaliseField(item, field, ctx) {
	var cfg = FIELD_CONFIG[field];
	if (!cfg || !cfg.normaliser) return false;
	if (!isNormaliserEnabled(cfg.normaliser)) return false;
	var current = mcReadField(item, field);
	if (!current) return false;

	// R19: strip stray HTML / collapse weird whitespace *before* the
	// normaliser runs, so R6 / R7 detect Title Case on the cleaned
	// input and don't get fooled by connector scraper artefacts.
	var tidy = APAChecker.helpers.tidyString(current);

	var normaliser = FieldNormalizer[cfg.normaliser];
	if (!normaliser) return false;
	var normalised = normaliser(tidy != null ? tidy : current);

	// Pick the result that actually changed. If both tidy and
	// normalise changed the string, use the normaliser's output (which
	// applies R6/R7 sentence-case / title-case).
	var final = (normalised !== current) ? normalised : (tidy != null && tidy !== current ? tidy : current);
	if (final === current) return false;
	if (Prefs.dryRun) {
		ctx.changes.normalized.push({ field: field, from: current, to: final });
		return true;
	}
	try {
		item.setField(field, final);
		ctx.changes.normalized.push({ field: field, from: current, to: final });
		return true;
	} catch (e) {
		Zotero.debug('[Zometaker] normalise(' + field + ') failed: ' + e);
		return false;
	}
}

function mcNormaliseCreators(item, ctx) {
	if (!Prefs.normalizeNames) return false;
	var creators = item.getCreators() || [];
	var changed = false;
	var mode = Prefs.nameMode || 'initials';
	var updated = creators.map(function (c) {
		var next = {
			firstName: c.firstName || '',
			lastName: c.lastName || '',
			fieldMode: c.fieldMode || 0,
			creatorType: c.creatorType,
		};

		// ----- R19: tidy stray HTML / weird whitespace -----
		var tidyFN = APAChecker.helpers.tidyString(next.firstName);
		var tidyLN = APAChecker.helpers.tidyString(next.lastName);
		if (tidyFN !== null) next.firstName = tidyFN;
		if (tidyLN !== null) next.lastName = tidyLN;

		// ----- Single-field → two-field split (R18) -----
		// Zotero stores some authors as fieldMode=1 with the whole
		// "Surname, Given" string crammed into lastName. Word/Google
		// Docs citations then render as "D. A. Titone" instead of
		// "Titone". Use Zotero's own cleanAuthor (with useComma=true)
		// to split, then run our normaliser over each part.
		if (next.fieldMode === 1 && next.lastName) {
			var split = NameNormalizer._splitSingleFieldAuthor(
				next.lastName, next.creatorType, mode,
			);
			if (split) {
				next = {
					firstName: split.firstName,
					lastName: split.lastName,
					fieldMode: 0,
					creatorType: next.creatorType,
				};
				changed = true;
			}
		}

		// ----- Normalise each part (APA 7 initials / particles / R20) -----
		// Only run `normalise` on the *given name* if it already looks
		// like initials (single letter or letter+dot). Otherwise the
		// normaliser would treat a single-token all-caps given name
		// like "ERMAN" as a surname and return "Erman" instead of
		// the proper APA-7 initial "E.".
		if (next.firstName && /^[A-Za-z]/.test(next.firstName)) {
			// Try the full normaliser; if it routes to the surname
			// path (single token), fall back to initials conversion.
			var normGiven = NameNormalizer.normalise(next.firstName, mode);
			var letters = normGiven.replace(/[^A-Za-z]/g, '');
			// Heuristic: if the input was all-caps and the normaliser
			// returned a multi-letter word (not an initial), reduce
			// it to a single initial.
			if (next.firstName.replace(/[^A-Za-z]/g, '') ===
			    next.firstName.replace(/[^A-Za-z]/g, '').toUpperCase() &&
			    next.firstName.replace(/[^A-Za-z]/g, '').length >= 2 &&
			    letters.length > 1) {
				normGiven = letters.charAt(0).toUpperCase() + '.';
			}
			if (normGiven !== next.firstName) {
				next.firstName = normGiven;
			}
		}

		// ----- R20: all-caps family name -----
		if (next.lastName && next.fieldMode === 0) {
			var lnLetters = next.lastName.replace(/[^A-Za-z]/g, '');
			if (lnLetters.length >= 2 &&
			    lnLetters === lnLetters.toUpperCase()) {
				// Title-case the family name: first letter cap, rest lower.
				// (Particles like "von" stay lowercase via NameNormalizer.)
				var normSurname = NameNormalizer.normalise(next.lastName, mode);
				if (normSurname !== next.lastName) {
					next.lastName = normSurname;
				}
			}
		}

		// ----- Compare against original to detect change -----
		var before = JSON.stringify({
			firstName: c.firstName,
			lastName: c.lastName,
			fieldMode: c.fieldMode,
			creatorType: c.creatorType,
		});
		var after = JSON.stringify(next);
		if (after !== before) changed = true;
		return next;
	});
	if (!changed) return false;
	if (!Prefs.dryRun) {
		item.setCreators(updated);
	}
	ctx.changes.normalized.push({ field: 'creators', from: creators, to: updated });
	return true;
}

// =================================================================
// APA 7 rule fixes (apply checker recommendations)
// =================================================================

function mcApplyAPAFixes(item, issues, ctx) {
	if (!Prefs.apaStrict || !issues || !issues.length) return;
	var rules = Prefs.apaRules;

	for (const issue of issues) {
		if (!rules[issue.rule]) continue;
		if (issue.field === 'creators') {
			// R4 / R18 / R20: handled by mcNormaliseCreators (single
			// source of truth so we don't double-write). R19 creators
			// are too — same reason.
			continue;
		}
		if (!issue.after || issue.after === issue.before) continue;

		if (Prefs.dryRun) {
			ctx.changes.normalized.push({
				field: issue.field,
				from: issue.before,
				to: issue.after,
				rule: issue.rule,
			});
			continue;
		}
		try {
			item.setField(issue.field, issue.after);
			ctx.changes.normalized.push({
				field: issue.field,
				from: issue.before,
				to: issue.after,
				rule: issue.rule,
			});
		} catch (e) {
			Zotero.debug('[Zometaker] APA fix on ' + issue.field + ' failed: ' + e);
		}
	}
}

// =================================================================
// Item pipeline
// =================================================================

async function processItem(item, fetcher) {
	var ctx = {
		item: item,
		changes: { filled: [], normalized: [], updated: [], apaIssues: [] },
	};

	if (item.isAttachment?.() || item.isNote?.() || item.isAnnotation?.()) {
		return ctx.changes;
	}
	if (item.isFeedItem?.()) return ctx.changes;

	if (Prefs.skipNonJournals) {
		var t = item.itemType;
		if (t !== 'journalArticle' && t !== 'preprint') return ctx.changes;
	}

	// ----- 1. Fetch authoritative metadata -----
	var remote = null;
	var doi = mcReadField(item, 'DOI');
	var isbn = mcReadField(item, 'ISBN');

	if (doi) {
		remote = await fetcher.fetchByDOI(doi);
	} else if (isbn && Prefs.completeMissing) {
		remote = await fetcher.fetchByISBN(isbn);
	}

	// ----- 2. Fill empty fields from remote -----
	if (remote && Prefs.completeMissing) {
		for (var field in FIELD_CONFIG) {
			if (field === 'abstract' && !Prefs.completeAbstract) continue;
			var cfg = FIELD_CONFIG[field];
			if (field === 'date') {
				var dateVal = buildDateString(remote);
				if (dateVal) mcFillField(item, 'date', dateVal, ctx);
				continue;
			}
			if (cfg.remote && remote[cfg.remote] != null) {
				mcFillField(item, field, remote[cfg.remote], ctx);
			}
		}
	}

	// ----- 3. APA 7 rule check (before normalising, so we capture both) -----
	if (Prefs.apaStrict) {
		var issues = APAChecker.all(item, { rules: Prefs.apaRules });
		ctx.changes.apaIssues = issues;
		mcApplyAPAFixes(item, issues, ctx);
	}

	// ----- 4. Normalise existing values -----
	for (var f2 in FIELD_CONFIG) {
		mcNormaliseField(item, f2, ctx);
	}
	mcNormaliseCreators(item, ctx);

	// ----- 5. Update non-empty fields that disagree with remote -----
	if (remote) {
		for (var field2 in FIELD_CONFIG) {
			if (field2 === 'abstract' && !Prefs.completeAbstract) continue;
			var cfg2 = FIELD_CONFIG[field2];
			if (!cfg2.remote) continue;
			var remoteVal = remote[cfg2.remote];
			if (remoteVal == null) continue;
			if (field2 === 'date') {
				remoteVal = buildDateString(remote);
				if (!remoteVal) continue;
			}
			if (cfg2.normaliser && isNormaliserEnabled(cfg2.normaliser)) {
				var norm = FieldNormalizer[cfg2.normaliser];
				try { remoteVal = norm(remoteVal); } catch (e) {}
			}
			mcUpdateField(item, field2, remoteVal, ctx);
		}

		// Authors: only fill when local has none.
		if (remote.authors && remote.authors.length) {
			var creators = item.getCreators() || [];
			var hasAuthors = creators.some(function (c) {
				return c.creatorType === 'author' || c.creatorType === 'editor';
			});
			if (!hasAuthors) {
				var newCreators = remote.authors.map(function (a) {
					return {
						firstName: a.first || '',
						lastName: a.last || a.raw || '',
						creatorType: 'author',
						fieldMode: 0,
					};
				});
				if (!Prefs.dryRun) item.setCreators(newCreators);
				ctx.changes.filled.push({ field: 'creators', value: newCreators });
			}
		}
	}

	// ----- 6. Persist -----
	var total = ctx.changes.filled.length + ctx.changes.normalized.length + ctx.changes.updated.length;
	if (total > 0 && !Prefs.dryRun) {
		try {
			await item.saveTx();
		} catch (e) {
			Zotero.debug('[Zometaker] saveTx failed for ' + item.id + ': ' + e);
			ctx.changes.error = e.message;
		}
	}
	return ctx.changes;
}

// =================================================================
// Progress UI
// =================================================================

function makeProgress(headline) {
	var pw;
	try {
		pw = new Zotero.ProgressWindow({ closeOnClick: false, closeTime: -1 });
	} catch (e) {
		pw = new Zotero.ProgressWindow();
	}
	pw.changeHeadline(headline);
	var itemLine = new pw.ItemProgress(
		'chrome://zotero/skin/spinner-16px.png',
		'Initialising...',
	);
	pw.show();
	return {
		update: function (text, percent) {
			try {
				itemLine.setText(text);
				if (typeof percent === 'number') itemLine.setProgress(percent);
			} catch (e) {}
		},
		close: function () {
			try { pw.startCloseTimer(4000); } catch (e) {
				try { pw.close(); } catch (_) {}
			}
		},
	};
}

// =================================================================
// Runners
// =================================================================

var _lastSummary = null;

async function runOnItem(item) {
	var fetcher = MetadataFetcher.create({
		mailto: Prefs.mailto,
		rps: Prefs.rps,
	});
	return processItem(item, fetcher);
}

async function runOnItems(items, label) {
	var total = items.length;
	var progress = makeProgress(label);
	var fetcher = MetadataFetcher.create({
		mailto: Prefs.mailto,
		rps: Prefs.rps,
	});

	var summary = {
		total: total,
		processed: 0,
		skipped: 0,
		filled: 0,
		normalized: 0,
		updated: 0,
		apaIssues: 0,
		errors: 0,
		itemsChanged: 0,
		startTime: Date.now(),
	};

	for (var i = 0; i < items.length; i++) {
		var item = items[i];
		var title = (mcReadField(item, 'title') || ('Item ' + item.id)).slice(0, 60);
		progress.update(
			'(' + (i + 1) + '/' + total + ') ' + title,
			Math.round(((i + 1) / total) * 100),
		);
		try {
			var changes = await processItem(item, fetcher);
			summary.processed += 1;
			var totalChanges =
				changes.filled.length + changes.normalized.length + changes.updated.length;
			if (totalChanges > 0) summary.itemsChanged += 1;
			summary.filled += changes.filled.length;
			summary.normalized += changes.normalized.length;
			summary.updated += changes.updated.length;
			summary.apaIssues += (changes.apaIssues || []).length;
			if (changes.error) summary.errors += 1;
		} catch (e) {
			summary.errors += 1;
			Zotero.debug('[Zometaker] item ' + item.id + ' failed: ' + e);
		}
	}

	summary.elapsedMs = Date.now() - summary.startTime;
	progress.update(
		'Done. ' + summary.itemsChanged + ' of ' + summary.total + ' items updated. ' +
			'APA issues found: ' + summary.apaIssues + '.',
		100,
	);
	progress.close();
	_lastSummary = summary;
	return summary;
}

async function runOnLibrary() {
	var libraryID = Zotero.Libraries.userLibraryID;
	var all = await Zotero.Items.getAll(libraryID, true, true);
	var items = all.filter(function (it) {
		return it.isRegularItem() && !it.isAttachment() && !it.isNote();
	});
	if (!items.length) {
		makeProgress('Zometaker')
			.update('No items to process.', 100)
			.close();
		return null;
	}
	return runOnItems(items, 'Zometaker — Library');
}

// Scan + repair authors stored as single-field (fieldMode=1).
// This is the "fix the (D. A. Titone & Connine, 1999) bug" entry
// point. Runs over the whole library or a selection — anything with
// at least one single-field creator gets rewritten as two-field.
async function repairSingleFieldAuthors(items) {
	if (!items || !items.length) {
		var zp = Zotero.getActiveZoteroPane();
		var sel = (zp && zp.getSelectedItems) ? zp.getSelectedItems() : [];
		items = sel.filter(function (it) {
			return it.isRegularItem() && !it.isAttachment() && !it.isNote();
		});
		if (!items.length) {
			var libraryID = Zotero.Libraries.userLibraryID;
			var all = await Zotero.Items.getAll(libraryID, true, true);
			items = all.filter(function (it) {
				return it.isRegularItem() && !it.isAttachment() && !it.isNote();
			});
		}
	}
	var progress = makeProgress('Zometaker — Repair single-field authors');
	var summary = {
		scanned: items.length,
		repaired: 0,
		creatorsFixed: 0,
		errors: 0,
		startTime: Date.now(),
	};
	for (var i = 0; i < items.length; i++) {
		var item = items[i];
		var title = (mcReadField(item, 'title') || ('Item ' + item.id)).slice(0, 60);
		progress.update(
			'(' + (i + 1) + '/' + items.length + ') ' + title,
			Math.round(((i + 1) / items.length) * 100),
		);
		try {
			var creators = item.getCreators() || [];
			var changed = false;
			var updated = creators.map(function (c) {
				if ((c.fieldMode || 0) !== 1 || !c.lastName) return c;
				var split = NameNormalizer._splitSingleFieldAuthor(
					c.lastName, c.creatorType, Prefs.nameMode || 'initials',
				);
				if (!split) return c;
				changed = true;
				return {
					firstName: split.firstName,
					lastName: split.lastName,
					fieldMode: 0,
					creatorType: c.creatorType,
				};
			});
			if (changed) {
				if (!Prefs.dryRun) {
					item.setCreators(updated);
					await item.saveTx();
				}
				summary.repaired += 1;
				summary.creatorsFixed += updated.filter(function (c, idx) {
					return JSON.stringify(c) !== JSON.stringify(creators[idx]);
				}).length;
			}
		} catch (e) {
			summary.errors += 1;
			Zotero.debug('[Zometaker] repair failed for ' + item.id + ': ' + e);
		}
	}
	summary.elapsedMs = Date.now() - summary.startTime;
	progress.update(
		'Repaired ' + summary.repaired + ' of ' + summary.scanned +
			' items. ' + summary.creatorsFixed + ' creator(s) fixed.',
		100,
	);
	progress.close();
	return summary;
}

async function runOnSelection() {
	var zp = Zotero.getActiveZoteroPane();
	var selected = (zp && zp.getSelectedItems) ? zp.getSelectedItems() : [];
	if (!selected.length) {
		makeProgress('Zometaker')
			.update('No items selected.', 100)
			.close();
		return null;
	}
	var items = selected.filter(function (it) {
		return it.isRegularItem() && !it.isAttachment() && !it.isNote();
	});
	if (!items.length) {
		makeProgress('Zometaker')
			.update('Selection contains no regular items.', 100)
			.close();
		return null;
	}
	return runOnItems(items, 'Zometaker — Selection');
}

function showLastSummary() {
	var s = _lastSummary;
	if (!s) {
		Services.prompt?.alert?.(null, 'Zometaker', 'No run yet.');
		return;
	}
	var lines = [
		'Processed ' + s.processed + '/' + s.total + ' items in ' + (s.elapsedMs / 1000).toFixed(1) + 's',
		'Items changed: ' + s.itemsChanged,
		'Fields filled: ' + s.filled,
		'Fields normalised: ' + s.normalized,
		'Fields updated: ' + s.updated,
		'APA 7 issues found: ' + s.apaIssues,
		'Errors: ' + s.errors,
	];
	Services.prompt?.alert?.(null, 'Zometaker — Last run', lines.join('\n'));
}

function showLastSummaryOrAlert(msg) {
	Services.prompt?.alert?.(null, 'Zometaker', msg || 'Done.');
}

// =================================================================
// UI
// =================================================================

// Per-window bookkeeping of the menu elements we created so we can clean
// them up on window close / plugin shutdown.
var _managedElements = new Map(); // window -> Set<Element>
var _ftlInserted = new WeakSet(); // window -> boolean

const PLUGIN_ID = 'zometaker@senior-developer';
const FTL_FILE = 'zometaker.ftl';

function _addManagedElement(window, element) {
	var set = _managedElements.get(window);
	if (!set) { set = new Set(); _managedElements.set(window, set); }
	set.add(element);
}

function _removeAllManagedElements(window) {
	var set = _managedElements.get(window);
	if (!set) return;
	set.forEach(function (el) {
		try { el.remove(); } catch (e) {}
	});
	_managedElements.delete(window);
}

// initUI runs ONCE at startup (after Zotero.uiReadyPromise). It
// registers the preferences pane (singleton — shows up in Settings
// sidebar) and does NOT touch any window. Window-level UI (menus) is
// added by `addToWindow`, called per window from onMainWindowLoad.
function initUI() {
	if (typeof Zotero === 'undefined' || !Zotero.PreferencePanes) {
		Zotero.debug('[Zometaker] Zotero.PreferencePanes not available; pane not registered.');
		return;
	}

	const rootURI = Zotero.Zometaker.rootURI;

	// Zotero 7+ signature: src / scripts must be FULL URLs (rootURI +
	// path), not chrome:// paths. `defaultXUL: true` makes Zotero
	// treat the XHTML as a legacy XUL fragment (a <vbox>, not a full
	// window). Scripts are loaded into the pane's window via the
	// `scripts:` array — that's how preferences-bindings.js gets
	// access to `window.document` and `Zotero.Prefs`.
	try {
		const result = Zotero.PreferencePanes.register({
			pluginID: PLUGIN_ID,
			label: 'Zometaker',
			image: rootURI + 'chrome/skin/default/zometaker/icon.svg',
			src: rootURI + 'chrome/content/preferences.xhtml',
			scripts: [rootURI + 'chrome/content/preferences-bindings.js'],
			defaultXUL: true,
		});
		// Zotero 7+ returns a Promise; 6 returns sync. Either way, log.
		if (result && typeof result.then === 'function') {
			result.then(function (id) {
				Zotero.debug('[Zometaker] Preferences pane registered: ' + id);
			}).catch(function (e) {
				Zotero.debug('[Zometaker] Prefs pane register failed: ' + e);
			});
		} else {
			Zotero.debug('[Zometaker] Preferences pane registered (sync): ' + result);
		}
	} catch (e) {
		Zotero.debug('[Zometaker] Prefs pane register threw: ' + e);
	}
}

// addToWindow is called by bootstrap.js's `onMainWindowLoad({window})`
// hook (per-window). It inserts the FTL bundle into the window and
// appends our menu items to the Tools menu and the right-click item
// context menu.
function addToWindow(window) {
	if (!window || !window.document) return;
	var doc = window.document;

	// Idempotency: only inject once per window.
	if (_managedElements.has(window)) return;

	// Make the FTL strings resolvable inside this window's l10n context.
	if (window.MozXULElement && !_ftlInserted.has(window)) {
		try {
			window.MozXULElement.insertFTLIfNeeded(FTL_FILE);
			_ftlInserted.add(window);
		} catch (e) {
			Zotero.debug('[Zometaker] insertFTLIfNeeded failed: ' + e);
		}
	}

	_addToolsMenuItems(window);
	_addItemContextMenuItems(window);
	_addCollectionContextMenuItems(window);
}

function removeFromWindow(window) {
	_removeAllManagedElements(window);
}

function shutdownUI() {
	// removeFromWindow on each tracked window, then clear the registry.
	var wins = (Zotero.getMainWindows && Zotero.getMainWindows()) || [];
	wins.forEach(function (w) { removeFromWindow(w); });
	_managedElements.clear();
}

// -----------------------------------------------------------------
// Tools menu
// -----------------------------------------------------------------
function _addToolsMenuItems(window) {
	var doc = window.document;
	var toolsPopup = doc.getElementById('menu_ToolsPopup');
	if (!toolsPopup) {
		Zotero.debug('[Zometaker] menu_ToolsPopup not found; skipping Tools menu');
		return;
	}

	// Find a sensible insertion point. Zotero's Tools menu has the
	// Add-ons item near the bottom — we insert just before that so
	// our items appear grouped with other plugin entries.
	var insertBefore = _findInsertBefore(toolsPopup, [
		'menuitem[command="cmd_addons"]',
		'menuitem[label="Add-ons"]',
		'menuitem[label="Developer"]',
	]);

	function appendItem(l10nId, onCommand) {
		var mi = doc.createXULElement('menuitem');
		try {
			doc.l10n.setAttributes(mi, l10nId);
		} catch (e) {
			mi.setAttribute('label', l10nId);
		}
		mi.addEventListener('command', onCommand);
		if (insertBefore) {
			toolsPopup.insertBefore(mi, insertBefore);
		} else {
			toolsPopup.appendChild(mi);
		}
		_addManagedElement(window, mi);
		return mi;
	}

	function appendSep() {
		var sep = doc.createXULElement('menuseparator');
		if (insertBefore) {
			toolsPopup.insertBefore(sep, insertBefore);
		} else {
			toolsPopup.appendChild(sep);
		}
		_addManagedElement(window, sep);
		return sep;
	}

	// Separator before our block (so it visually groups with plugin items)
	appendSep();
	appendItem(
		'zometaker-menu-run-on-library',
		function () { runOnLibrary().catch(_logErr); }
	);
	appendItem(
		'zometaker-menu-run-on-selection',
		function () { runOnSelection().catch(_logErr); }
	);
	appendItem(
		'zometaker-menu-repair-authors',
		function () { repairSingleFieldAuthors(null).catch(_logErr); }
	);
	appendItem(
		'zometaker-menu-show-report',
		function () { showLastSummary(); }
	);
	appendItem(
		'zometaker-menu-preferences',
		function () { openPreferencesPane(); }
	);
}

function _findInsertBefore(parent, selectors) {
	for (var i = 0; i < selectors.length; i++) {
		var el = parent.querySelector(selectors[i]);
		if (el) return el;
	}
	return null;
}

// -----------------------------------------------------------------
// Right-click item context menu
// -----------------------------------------------------------------
function _addItemContextMenuItems(window) {
	var doc = window.document;
	var itemMenu = doc.getElementById('zotero-itemmenu');
	if (!itemMenu) {
		Zotero.debug('[Zometaker] zotero-itemmenu not found; skipping item context menu');
		return;
	}

	// Zotero 7+ rebuilds zotero-itemmenu on every popupshowing (calls
	// buildItemContextMenu, wiping any non-rebuilt children). To survive,
	// we hook popupshowing and re-inject if our marker is missing.
	function rebuild() {
		if (itemMenu.querySelector('[data-mc-context-item]')) return;
		// Defer to ensure menu is fully built.
		setTimeout(function () { _injectContextItem(itemMenu, window); }, 0);
	}

	itemMenu.addEventListener('popupshowing', rebuild);

	// Try once now in case menu is already built.
	_injectContextItem(itemMenu, window);
}

function _injectContextItem(itemMenu, window) {
	var doc = itemMenu.ownerDocument;

	var sep = doc.createXULElement('menuseparator');
	sep.setAttribute('data-mc-context-item', '1');
	itemMenu.appendChild(sep);
	_addManagedElement(window, sep);

	var mi = doc.createXULElement('menuitem');
	try {
		doc.l10n.setAttributes(mi, 'zometaker-menu-run-on-selection');
	} catch (e) {
		mi.setAttribute('label', 'Update & normalise selected items');
	}
	mi.setAttribute('data-mc-context-item', '1');
	mi.addEventListener('command', function () {
		runOnSelection().catch(_logErr);
	});
	itemMenu.appendChild(mi);
	_addManagedElement(window, mi);
}

// -----------------------------------------------------------------
// Right-click collection context menu
// -----------------------------------------------------------------
function _addCollectionContextMenuItems(window) {
	var doc = window.document;
	var collMenu = doc.getElementById('zotero-collectionmenu');
	if (!collMenu) return; // collection menu may not exist on every window

	function rebuild() {
		if (collMenu.querySelector('[data-mc-context-collection]')) return;
		setTimeout(function () {
			var sep2 = doc.createXULElement('menuseparator');
			sep2.setAttribute('data-mc-context-collection', '1');
			collMenu.appendChild(sep2);
			_addManagedElement(window, sep2);

			var mi2 = doc.createXULElement('menuitem');
			try {
				doc.l10n.setAttributes(mi2, 'zometaker-menu-run-on-collection');
			} catch (e) {
				mi2.setAttribute('label', 'Update & normalise this collection');
			}
			mi2.setAttribute('data-mc-context-collection', '1');
			mi2.addEventListener('command', function () {
				runOnActiveCollection().catch(_logErr);
			});
			collMenu.appendChild(mi2);
			_addManagedElement(window, mi2);
		}, 0);
	}

	collMenu.addEventListener('popupshowing', rebuild);
}

function runOnActiveCollection() {
	var zp = Zotero.getActiveZoteroPane();
	var coll = zp && zp.getSelectedCollection ? zp.getSelectedCollection(false) : null;
	if (!coll) {
		makeProgress('Zometaker')
			.update('No collection selected.', 100)
			.close();
		return null;
	}
	return coll.loadChildItems().then(function (children) {
		var items = (children || []).filter(function (it) {
			return it.isRegularItem && it.isRegularItem();
		});
		if (!items.length) {
			makeProgress('Zometaker — Collection')
				.update('Collection is empty.', 100)
				.close();
			return null;
		}
		return runOnItems(items, 'Zometaker — Collection: ' + coll.name);
	});
}

function openPreferencesPane() {
	// Switch to the Zometaker pane in Zotero's Settings dialog.
	try {
		var pw = (Zotero.getActiveZoteroPane && Zotero.getActiveZoteroPane()) || null;
		if (pw && pw.openPreferences) {
			pw.openPreferences('zometaker-pane');
			return;
		}
	} catch (e) {}
	// Fallback: open the Preferences window and let user navigate.
	try {
		var wm = Cc['@mozilla.org/appshell/window-mediator;1']
			.getService(Ci.nsIWindowMediator);
		var mainWin = wm.getMostRecentWindow('zotero-main-window');
		if (mainWin) {
			mainWin.ZoteroPane && mainWin.ZoteroPane.openPreferences
				? mainWin.ZoteroPane.openPreferences()
				: null;
		}
	} catch (e) {
		Zotero.debug('[Zometaker] openPreferencesPane fallback failed: ' + e);
	}
}

function _logErr(err) {
	try { Zotero.debug('[Zometaker] ' + (err && err.stack ? err.stack : err)); }
	catch (e) {}
}