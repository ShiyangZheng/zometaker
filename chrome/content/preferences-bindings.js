/*
	Zometaker — preferences-bindings.js

	Auto-loaded by preferences.xhtml. Wires each form widget to
	its backing Zotero.Prefs key.

	The bindings are intentionally programmatic (rather than via
	a `<preferences>` block) so they work the same way in Zotero 6
	and Zotero 7.
*/

(function () {
	var PREFIX = 'extensions.zometaker.';
	var document_ = null;

	function whenReady(cb) {
		// We get called synchronously from the inline <script>, so the
		// DOM is already there in most cases. Otherwise, wait one tick.
		if (document.readyState === 'complete' ||
			document.readyState === 'interactive') {
			setTimeout(cb, 0);
		} else {
			document.addEventListener('DOMContentLoaded', cb, { once: true });
		}
	}

	function bindCheckbox(id, key) {
		var el = document_.getElementById(id);
		if (!el) return;
		var fullKey = PREFIX + key;
		try {
			el.checked = !!Zotero.Prefs.get(fullKey, true);
		} catch (e) {
			el.checked = false;
		}
		el.addEventListener('command', function () {
			Zotero.Prefs.set(fullKey, !!el.checked, true);
		});
	}

	function bindTextbox(id, key, type) {
		var el = document_.getElementById(id);
		if (!el) return;
		var fullKey = PREFIX + key;
		try {
			var v = Zotero.Prefs.get(fullKey, true);
			el.value = v == null ? '' : String(v);
		} catch (e) {
			el.value = '';
		}
		var evt = type === 'number' ? 'input' : 'input';
		el.addEventListener(evt, function () {
			var val = el.value;
			if (type === 'number') {
				var n = parseInt(val, 10);
				if (isNaN(n)) return;
				Zotero.Prefs.set(fullKey, n, true);
			} else {
				Zotero.Prefs.set(fullKey, val, true);
			}
		});
	}

	function bindMenulist(id, key) {
		var el = document_.getElementById(id);
		if (!el) return;
		var fullKey = PREFIX + key;
		try {
			var v = Zotero.Prefs.get(fullKey, true);
			if (v != null) el.value = String(v);
		} catch (e) {}
		el.addEventListener('command', function () {
			Zotero.Prefs.set(fullKey, el.value, true);
		});
	}

	whenReady(function () {
		document_ = window.document;

		bindMenulist('pref-api-primary', 'api.primary');
		bindMenulist('pref-api-fallback', 'api.fallback');
		bindTextbox('pref-mailto', 'mailto', 'string');
		bindTextbox('pref-rps', 'rate.requestsPerSecond', 'number');

		bindCheckbox('pref-norm-names', 'normalize.names');
		bindCheckbox('pref-norm-journal', 'normalize.journal');
		bindCheckbox('pref-norm-pages', 'normalize.pages');
		bindCheckbox('pref-norm-title', 'normalize.title');
		bindCheckbox('pref-norm-publisher', 'normalize.publisher');
		bindCheckbox('pref-norm-doi', 'normalize.doi');
		bindCheckbox('pref-norm-isbn', 'normalize.isbn');
		bindCheckbox('pref-norm-edition', 'normalize.edition');
		bindCheckbox('pref-norm-volissue', 'normalize.volumeIssue');

		bindMenulist('pref-names-mode', 'names.mode');

		bindCheckbox('pref-complete-missing', 'complete.missing');
		bindCheckbox('pref-complete-abstract', 'complete.abstract');

		bindCheckbox('pref-dry-run', 'dryRun');
		bindCheckbox('pref-skip-non-journals', 'skipNonJournals');

		bindCheckbox('pref-apa-strict', 'apa.strict');
		bindTextbox('pref-apa-rules', 'apa.rules', 'string');
	});
})();