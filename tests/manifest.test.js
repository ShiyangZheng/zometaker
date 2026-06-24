/*
	Manifest validation test.

	Working schema for Zotero 9 (verified by previous xpi installing
	successfully vs MV3 failing with "Property 'applications' is
	unsupported in Manifest Version 3"):

	  manifest_version: 2
	  applications.zotero.{id, update_url, strict_min_version, strict_max_version}

	Zotero 9's XPIInstall.sys.mjs uses Firefox's loadManifestFromWebManifest.
	That parser rejects `browser_specific_settings` differently from how
	some docs imply, and explicitly rejects `applications` under MV3.
	Therefore: MV2 + applications.zotero.* is the only compatible schema.
*/

const fs = require('fs');
const path = require('path');

let pass = 0;
let fail = 0;
const failures = [];

function assert(cond, name) {
	if (cond) {
		pass++;
		console.log(`  PASS  ${name}`);
	} else {
		fail++;
		failures.push(name);
		console.log(`  FAIL  ${name}`);
	}
}

function assertEq(actual, expected, name) {
	if (actual === expected) {
		pass++;
		console.log(`  PASS  ${name}`);
	} else {
		fail++;
		failures.push(`${name} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
		console.log(`  FAIL  ${name}  got=${JSON.stringify(actual)}  expected=${JSON.stringify(expected)}`);
	}
}

console.log('\nmanifest.json — Zotero 9 install compatibility\n');

const manifestPath = path.resolve(__dirname, '..', 'manifest.json');
const m = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

// 1. Basic fields --------------------------------------------------------
assertEq(m.manifest_version, 2, 'manifest_version is 2 (MV3 is rejected by Zotero 9)');
assert(typeof m.name === 'string' && m.name.length > 0, 'name is set');
assert(typeof m.version === 'string' && /^\d+\.\d+\.\d+$/.test(m.version), 'version is semver');
assert(m.icons && m.icons['48'] && m.icons['96'], 'icons 48 and 96 set');
assert(m.icons['48'].startsWith('chrome/') || m.icons['48'].startsWith('./'),
	'icons path uses chrome/ or ./ prefix');

// 2. MV3 forbidden blocks (must NOT be present) ---------------------------
assert(!m.browser_specific_settings,
	'browser_specific_settings NOT present (MV3 schema breaks Zotero 9)');

// 3. applications.zotero (the only block Zotero 9 actually inspects) -----
assert(m.applications, 'applications present');
assert(m.applications.zotero, 'applications.zotero present');
assertEq(m.applications.zotero.id, 'zometaker@senior-developer',
	'applications.zotero.id is correct');
assert(typeof m.applications.zotero.update_url === 'string' && /^https?:\/\//.test(m.applications.zotero.update_url),
	'applications.zotero.update_url is an http(s) URL');
assert(typeof m.applications.zotero.strict_min_version === 'string',
	'applications.zotero.strict_min_version present');
assert(typeof m.applications.zotero.strict_max_version === 'string',
	'applications.zotero.strict_max_version present');

// 4. strict_max_version must accept Zotero 9 -------------------------------
const zoteroMax = m.applications.zotero.strict_max_version;
assert(/^[0-9]+/.test(zoteroMax) && parseInt(zoteroMax) >= 9,
	'zotero.strict_max_version >= 9');

// 5. update.json exists and references this version -----------------------
const updatePath = path.resolve(__dirname, '..', 'update.json');
assert(fs.existsSync(updatePath), 'update.json exists');
if (fs.existsSync(updatePath)) {
	const u = JSON.parse(fs.readFileSync(updatePath, 'utf-8'));
	const id = m.applications.zotero.id;
	assert(u.addons && u.addons[id], `update.json references ${id}`);
	if (u.addons && u.addons[id]) {
		const updates = u.addons[id].updates || [];
		const hasThisVersion = updates.some(up => up.version === m.version);
		assert(hasThisVersion, `update.json lists version ${m.version}`);
	}
}

console.log(`\n${pass} pass, ${fail} fail`);
if (fail > 0) {
	console.log('\nFailures:');
	for (const f of failures) console.log('  - ' + f);
	process.exit(1);
}
