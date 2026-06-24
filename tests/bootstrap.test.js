/*
	Bootstrap lifecycle test.

	Verifies that bootstrap.js wires the right hooks for Zotero 7+ legacy
	bootstrap (works on Zotero 6, 7, 8, 9):

	  install / startup / shutdown         - app / addon events
	  onMainWindowLoad / onMainWindowUnload - per main-window events

	The test enforces BOTH halves of the pattern: startup() runs once and
	seeds already-open windows, AND onMainWindowLoad fires for windows
	opened later (e.g. macOS where the dock-icon click creates the first
	main window AFTER startup() has returned).
*/

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, name) {
	if (cond) { pass++; console.log(`  PASS  ${name}`); }
	else      { fail++; failures.push(name); console.log(`  FAIL  ${name}`); }
}

console.log('\nbootstrap.js — Zotero 7+ legacy bootstrap lifecycle\n');

const bootPath = path.resolve(__dirname, '..', 'bootstrap.js');
const boot = fs.readFileSync(bootPath, 'utf-8');

// 1. Required Zotero 7+ bootstrap hooks -----------------------------------
assert(/^\s*function\s+install\s*\(/m.test(boot),
	'bootstrap.js defines `function install()`');
assert(/^\s*async\s+function\s+startup\s*\(/m.test(boot),
	'bootstrap.js defines `async function startup()`');
assert(/^\s*function\s+shutdown\s*\(/m.test(boot),
	'bootstrap.js defines `function shutdown()`');
assert(/^\s*function\s+onMainWindowLoad\s*\(/m.test(boot),
	'bootstrap.js defines `function onMainWindowLoad({ window })` (Zotero 7+ per-window hook)');
assert(/^\s*function\s+onMainWindowUnload\s*\(/m.test(boot),
	'bootstrap.js defines `function onMainWindowUnload({ window })`');

// 2. Forbidden / dead hooks (Firefox WebExtension hooks are NOT in
//    Zotero legacy bootstrap) --------------------------------------------
assert(!/^\s*function\s+onShutdown\s*\(/m.test(boot),
	'bootstrap.js does NOT define `onShutdown` (Zotero calls `shutdown`, not `onShutdown`)');

// 3. startup() must await uiReadyPromise + initializationPromise --------
const startupMatch = boot.match(/async function startup[\s\S]*?^\}/m);
assert(startupMatch, 'startup() body found');
if (startupMatch) {
	const body = startupMatch[0];
	assert(/await\s+Zotero\.uiReadyPromise/.test(body),
		'startup() awaits Zotero.uiReadyPromise');
	assert(/Zotero\.initializationPromise/.test(body),
		'startup() awaits Zotero.initializationPromise');
}

// 4. startup() must seed already-open main windows AND onMainWindowLoad
//    must handle future-opened windows (macOS dock-click case) -----------
if (startupMatch) {
	const body = startupMatch[0];
	assert(/Zotero\.getMainWindows\s*\(\s*\)/.test(body),
		'startup() enumerates current windows via Zotero.getMainWindows() (canonical API)');
	assert(/addToWindow/.test(body),
		'startup() calls addToWindow for each current window');
}
const onMWL = boot.match(/function\s+onMainWindowLoad\s*\(\s*\{\s*window\s*\}\s*\)\s*\{[\s\S]*?^\}/m);
assert(onMWL, 'onMainWindowLoad body found');
if (onMWL) {
	assert(/addToWindow/.test(onMWL[0]),
		'onMainWindowLoad calls addToWindow');
}

// 5. Metadata caretaker .js must register the prefs pane inline ----------
const mcPath = path.resolve(__dirname, '..', 'content', 'zometaker.js');
const mc = fs.readFileSync(mcPath, 'utf-8');
assert(/Zotero\.PreferencePanes\.register/.test(mc),
	'zometaker.js calls Zotero.PreferencePanes.register');
assert(/defaultXUL\s*:\s*true/.test(mc),
	'preferences register call uses defaultXUL: true (Zotero treats pane as XUL fragment)');
assert(/scripts\s*:\s*\[/.test(mc),
	'preferences register call uses scripts:[] (NOT a chrome:// <script> tag)');
assert(/src\s*:\s*rootURI\s*\+/.test(mc),
	'preferences src uses rootURI+path (NOT chrome:// path that depends on mapping)');
assert(!/chrome\/content\/preferences\.js['"]/.test(mc),
	'zometaker.js does NOT loadSubScript a separate preferences.js (sandbox isolation bug)');

// 6. zometaker.js must implement addToWindow / removeFromWindow -
assert(/^\s*function\s+addToWindow\s*\(/m.test(mc),
	'zometaker.js defines addToWindow(window)');
assert(/^\s*function\s+removeFromWindow\s*\(/m.test(mc),
	'zometaker.js defines removeFromWindow(window)');

// 7. Menu items use createXULElement + document.l10n.setAttributes -------
assert(/createXULElement\s*\(\s*['"]menuitem['"]/.test(mc),
	'menu items created via document.createXULElement("menuitem")');
assert(/doc\.l10n\.setAttributes/.test(mc) || /document\.l10n\.setAttributes/.test(mc),
	'menu items labelled via document.l10n.setAttributes (FTL-driven)');
assert(/insertFTLIfNeeded/.test(mc),
	'addToWindow calls window.MozXULElement.insertFTLIfNeeded');

// 8. Zotero access uses safe pattern (no `Zotero?.`) -------------------
assert(!/\bZotero\?\./.test(mc),
	'zometaker.js does NOT use `Zotero?.` (throws ReferenceError on undeclared Zotero)');

// 9. FTL file exists in locale/en-US/ -----------------------------------
const ftlPath = path.resolve(__dirname, '..', 'locale', 'en-US', 'zometaker.ftl');
assert(fs.existsSync(ftlPath), 'locale/en-US/zometaker.ftl exists');

// 10. preferences.xhtml root element is <vbox> (NOT <window>) ---------
const prefsPath = path.resolve(__dirname, '..', 'chrome', 'content', 'preferences.xhtml');
const prefs = fs.readFileSync(prefsPath, 'utf-8');
// Allow any whitespace + comments between <?xml ?> and the root element.
assert(/<\?xml[\s\S]*?\?>\s*(?:<!--[\s\S]*?-->\s*)?<vbox\b/m.test(prefs),
	'preferences.xhtml root is <vbox> (Zotero expects XUL fragment, not <window>)');
assert(!/<script[^>]+chrome:\/\//.test(prefs),
	'preferences.xhtml does NOT use <script src="chrome://..."/> (would 404 with current chrome.manifest)');

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) {
	console.log('\nFailures:');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
