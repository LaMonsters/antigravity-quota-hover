'use strict';

// Run on Windows with a disposable copy of a supported Antigravity Desktop archive:
// node tests/roundtrip.cjs path/to/clean/app.asar
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readAsarLayout, patchAsarArchive } = require('../localization/src/asar_patcher');
const project = path.resolve(__dirname, '..');
const source = process.argv[2];
if (!source || !fs.existsSync(source)) throw new Error('Pass the path to a clean app.asar');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Antigravity 整合测试 '));
const resources = path.join(root, 'resources');
fs.mkdirSync(resources);
const live = path.join(resources, 'app.asar');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const cli = (action, success = true) => {
    const result = spawnSync(process.execPath, [path.join(project, 'bundle.js'), action, '--install-dir', root], { encoding: 'utf8' });
    assert.equal(result.status === 0, success, result.stdout + result.stderr);
    return result.stdout;
};
const preload = () => readAsarLayout(live).files.get('dist/preload.js').body.toString();
const markerCount = (text, marker) => text.split(marker).length - 1;
try {
    fs.copyFileSync(source, live);
    const original = hash(live);
    assert.match(cli('status'), /中文界面：未安装/);
    cli('install');
    const combined = hash(live);
    assert.notEqual(combined, original);
    assert.equal(markerCount(preload(), 'ANTIGRAVITY CHINESE LOCALIZATION START'), 1);
    assert.equal(markerCount(preload(), 'ANTIGRAVITY SIDEBAR USAGE START'), 1);
    cli('install');
    assert.equal(hash(live), combined);
    assert.match(cli('status'), /侧栏额度：已安装/);
    // An updater replaces the archive while the old receipts still exist.
    fs.copyFileSync(source, live);
    cli('uninstall');
    assert.equal(hash(live), original);
    cli('install');
    cli('uninstall');
    assert.equal(hash(live), original);

    // Upgrade a quota-only install even if the same client has old receipts.
    const widget = fs.readFileSync(path.join(project, 'src/sidebar-usage-widget.js'), 'utf8');
    patchAsarArchive(source, live, new Map([['dist/preload.js', text => text + '\n' + widget]]));
    const quotaOnly = hash(live);
    cli('install');
    assert.equal(markerCount(preload(), 'ANTIGRAVITY SIDEBAR USAGE START'), 1);
    cli('uninstall');
    assert.equal(hash(live), quotaOnly);

    // Corrupt input must fail before replacing the target.
    fs.writeFileSync(live, 'not an asar');
    const invalid = hash(live);
    cli('install', false);
    assert.equal(hash(live), invalid);
    console.log('PASS: clean install, both components, repeat install, client update, legacy quota, rollback and invalid input.');
} finally {
    fs.rmSync(root, { recursive: true, force: true });
}
