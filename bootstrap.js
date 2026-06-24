/**
 * Zometaker - bootstrap.js
 *
 * Plugin lifecycle. Loads content scripts, registers menus, settings pane.
 * Compatible with Zotero 6 + 7 + 8 + 9.
 *
 * Zotero 7+ lifecycle (legacy bootstrap):
 *   install / startup / onMainWindowLoad / onMainWindowUnload / shutdown / uninstall
 *
 * The four hooks `install / startup / shutdown / uninstall` are called by
 * Zotero on app / addon events. `onMainWindowLoad({window})` and
 * `onMainWindowUnload({window})` are called for EACH main Zotero window
 * opening / closing — they're how we get access to the live XUL document
 * to inject menubar items. We also enumerate already-open windows inside
 * `startup()` so existing windows don't miss out.
 */

var ZometakerBootstrapped = false;

function log(msg) {
	Zotero.debug('[Zometaker] ' + msg);
}

function warn(msg) {
	Zotero.logError('[Zometaker] ' + msg);
}

async function startup({ id, version, rootURI }) {
	log('Starting v' + version);

	// Initialise the singleton on the Zotero namespace
	Zotero.Zometaker = {
		rootURI,
		version,
		loaded: false,
		initialized: false,
		prefs: null,
	};

	// Wait for main Zotero components
	await Zotero.initializationPromise;
	await Zotero.uiReadyPromise;

	// Load scripts in dependency order. They attach themselves to
	// Zotero.Zometaker so we don't pollute the global scope.
	const scripts = [
		'content/name-normalizer.js',
		'content/journal-normalizer.js',
		'content/apa-checker.js',
		'content/metadata-fetcher.js',
		'content/zometaker.js',
	];

	for (const script of scripts) {
		try {
			Services.scriptloader.loadSubScript(rootURI + script, Zotero.Zometaker);
			log('Loaded ' + script);
		} catch (e) {
			warn('Failed to load ' + script + ': ' + e);
		}
	}

	// Default preferences (registered once)
	try {
		Zotero.Zometaker.Prefs.register();
	} catch (e) {
		warn('Failed to register prefs: ' + e);
	}

	// Register the preferences pane (singleton — registers once,
	// shows up in Settings sidebar under "Zometaker")
	try {
		Zotero.Zometaker.initUI();
		Zotero.Zometaker.initialized = true;
	} catch (e) {
		warn('UI init failed: ' + e);
	}

	// Inject UI into any windows that are ALREADY open (rare on macOS,
	// but common on Win/Linux when Zotero starts with a visible window).
	// `Zotero.getMainWindows()` is the canonical API — equivalent to
	// enumerating window-mediator but Zotero-aware.
	try {
		const wins = (Zotero.getMainWindows && Zotero.getMainWindows())
			|| [];
		wins.forEach(function (win) {
			if (win && win.document) {
				Zotero.Zometaker.addToWindow(win);
			}
		});
		log('Injected UI into ' + wins.length + ' already-open window(s)');
	} catch (e) {
		warn('Window injection at startup failed: ' + e);
	}

	Zotero.Zometaker.loaded = true;
	log('Startup complete');
}

function onMainWindowLoad({ window }) {
	// Called by Zotero 7+ for each main window that becomes ready. By
	// this point the XUL document is fully built so getElementById() on
	// menu_ToolsPopup / zotero-itemmenu is reliable.
	try {
		if (Zotero.Zometaker?.addToWindow) {
			Zotero.Zometaker.addToWindow(window);
		}
	} catch (e) {
		warn('addToWindow failed: ' + e);
	}
}

function onMainWindowUnload({ window }) {
	try {
		if (Zotero.Zometaker?.removeFromWindow) {
			Zotero.Zometaker.removeFromWindow(window);
		}
	} catch (e) {
		warn('removeFromWindow failed: ' + e);
	}
}

function shutdown() {
	log('Shutting down');
	try {
		if (Zotero.Zometaker?.shutdownUI) {
			Zotero.Zometaker.shutdownUI();
		}
	} catch (e) {
		warn('Shutdown error: ' + e);
	}
	Zotero.Zometaker = undefined;
	ZometakerBootstrapped = false;
}

function install() {
	log('Installed');
}
