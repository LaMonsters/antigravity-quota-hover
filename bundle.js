'use strict';

// Combined Windows installer for Antigravity Desktop. Uses only Node's standard library.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');
const { readAsarLayout, patchAsarArchive, validateAsarCandidate } = require('./localization/src/asar_patcher');
const patches = require('./localization/src/main_patches');

const CN_START = '/* --- ANTIGRAVITY CHINESE LOCALIZATION START --- */';
const CN_END = '/* --- ANTIGRAVITY CHINESE LOCALIZATION END --- */';
const USAGE_START = '/* --- ANTIGRAVITY SIDEBAR USAGE START --- */';
const USAGE_END = '/* --- ANTIGRAVITY SIDEBAR USAGE END --- */';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = file => sha(fs.readFileSync(file));

function normalizeLabel(text) {
    return text.replace(/\s+/g, ' ').trim().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/…/g, '...');
}

function localizationScript() {
    const dictionary = Object.create(null);
    const folder = path.join(__dirname, 'localization', 'dicts');
    for (const name of fs.readdirSync(folder).filter(n => n.endsWith('.json')).sort()) {
        const entries = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
        for (const [key, value] of Object.entries(entries)) dictionary[normalizeLabel(key)] = value;
    }
    delete dictionary.Antigravity;
    const template = fs.readFileSync(path.join(__dirname, 'localization', 'src', 'preload_runtime.js'), 'utf8');
    return [CN_START, template.replace('__USE_TW_PLACEHOLDER__', 'false')
        .replace('DICT_PLACEHOLDER', () => JSON.stringify(dictionary)), CN_END].join('\n');
}

function blockRange(text, start, end) {
    const a = text.indexOf(start), b = text.indexOf(end);
    if (a === -1 && b === -1) return null;
    if (a === -1 || b < a || text.lastIndexOf(start) !== a || text.lastIndexOf(end) !== b) {
        throw new Error('发现残缺或重复的插件标记。请先恢复客户端备份。');
    }
    return [a, b + end.length];
}

function inspect(file) {
    const { files } = readAsarLayout(file);
    const pkg = JSON.parse(files.get('package.json')?.body?.toString() || '{}');
    const preload = files.get('dist/preload.js')?.body?.toString();
    if (pkg.name !== 'antigravity' || pkg.main !== 'dist/main.js' || !preload) {
        throw new Error('请选择 Antigravity 桌面客户端安装目录。');
    }
    return { version: pkg.version, chinese: !!blockRange(preload, CN_START, CN_END),
        quota: !!blockRange(preload, USAGE_START, USAGE_END) };
}

function buildCandidate(source, output) {
    const before = inspect(source);
    const widget = fs.readFileSync(path.join(__dirname, 'src', 'sidebar-usage-widget.js'), 'utf8').trim();
    if (!blockRange(widget, USAGE_START, USAGE_END)) throw new Error('额度组件不完整。');
    const edits = new Map();
    if (!before.chinese) {
        edits.set('dist/utils.js', text => patches.patchUtilsJs(text, CN_START, CN_END));
        for (const [name, patch] of Object.entries({ menu: patches.patchMenuJs, tray: patches.patchTrayJs,
            loadingOverlay: patches.patchLoadingOverlayJs, updater: patches.patchUpdaterJs })) {
            edits.set('dist/' + name + '.js', text => patch(text, false));
        }
        for (const name of patches.MAIN_PROCESS_PATCH_TARGETS) {
            edits.set(name, text => patches.patchMainProcessModule(name, text, false));
        }
    }
    edits.set('dist/preload.js', text => {
        const range = blockRange(text, USAGE_START, USAGE_END);
        if (range) text = text.slice(0, range[0]) + text.slice(range[1]);
        if (!before.chinese) text = patches.patchPreloadJs(text, localizationScript(), CN_START, CN_END);
        return text.trimEnd() + '\n\n' + widget;
    });
    const modified = patchAsarArchive(source, output, edits);
    for (const [name, body] of modified) new vm.Script(body.toString(), { filename: name });
    validateAsarCandidate(source, output, CN_START);
    const result = inspect(output);
    if (!result.chinese || !result.quota || result.version !== before.version) throw new Error('双组件验证失败。');
}

function getBackup(store, installedHash) {
    const receipt = path.join(store, installedHash + '.json');
    if (!fs.existsSync(receipt)) return null;
    const record = JSON.parse(fs.readFileSync(receipt, 'utf8'));
    if (record.installed !== installedHash || !/^[a-f0-9]{64}$/.test(record.original)) {
        throw new Error('恢复记录校验失败。');
    }
    const file = path.join(store, record.original + '.asar');
    if (fileHash(file) !== record.original) throw new Error('原始资源备份校验失败。');
    return file;
}

function publish(file, destination, expected) {
    if (fileHash(destination) !== expected) throw new Error('客户端文件已发生变化。请退出客户端后重新运行。');
    fs.renameSync(file, destination);
}

function run(action, live) {
    const current = inspect(live);
    console.log('Antigravity ' + current.version + '  |  ' + live);
    if (action === 'status') {
        console.log('中文界面：' + (current.chinese ? '已安装' : '未安装'));
        console.log('侧栏额度：' + (current.quota ? '已安装' : '未安装'));
        return;
    }
    const currentHash = fileHash(live);
    const store = path.join(path.dirname(live), '.antigravity-zh-quota');
    const backup = getBackup(store, currentHash);
    if (action === 'uninstall' && !backup) {
        if (current.chinese || current.quota) throw new Error('当前文件没有匹配的整合版恢复记录。单独安装的插件请使用原安装器卸载。');
        console.log('当前版本未安装这两个插件。');
        return;
    }
    const staging = fs.mkdtempSync(path.join(path.dirname(live), '.zh-quota-tmp-'));
    try {
        const next = path.join(staging, 'next.asar');
        if (action === 'uninstall') {
            fs.copyFileSync(backup, next);
            if (fileHash(next) !== path.basename(backup, '.asar')) throw new Error('还原副本校验失败。');
            publish(next, live, currentHash);
            console.log('已恢复到首次运行本整合版之前的状态。');
            return;
        }
        // A byte-for-byte snapshot gives both the build and rollback the same input.
        const original = path.join(staging, 'original.asar');
        fs.copyFileSync(backup || live, original);
        const originalHash = fileHash(original);
        if (originalHash !== (backup ? path.basename(backup, '.asar') : currentHash)) throw new Error('源文件已改变。');
        buildCandidate(original, next);
        const installedHash = fileHash(next);
        if (installedHash === currentHash) {
            console.log('两个插件均已就绪。');
            return;
        }
        fs.mkdirSync(store, { recursive: true });
        const saved = path.join(store, originalHash + '.asar');
        if (!fs.existsSync(saved)) fs.renameSync(original, saved);
        if (fileHash(saved) !== originalHash) throw new Error('原始资源备份校验失败。');
        const existing = getBackup(store, installedHash);
        if (!existing || path.basename(existing, '.asar') !== originalHash) {
            const receipt = path.join(staging, 'receipt.json');
            fs.writeFileSync(receipt, JSON.stringify({ original: originalHash, installed: installedHash }));
            fs.renameSync(receipt, path.join(store, installedHash + '.json'));
        }
        publish(next, live, currentHash);
        console.log('简体中文和侧栏额度已安装。请打开 Antigravity，在左下角「设置」右侧查看额度。');
    } finally {
        fs.rmSync(staging, { recursive: true, force: true });
    }
}

async function main() {
    const { values, positionals } = parseArgs({ options: { 'install-dir': { type: 'string' } }, allowPositionals: true });
    const action = positionals[0] || 'install';
    if (positionals.length > 1 || !['install', 'uninstall', 'status'].includes(action)) {
        throw new Error('用法：bundle.js [install|uninstall|status] [--install-dir 安装目录]');
    }
    const root = values['install-dir'] || path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity');
    const live = fs.realpathSync(path.join(root, 'resources', 'app.asar'));
    if (action === 'status') return run(action, live);
    const exe = path.join(path.dirname(path.dirname(live)), 'Antigravity.exe');
    if (fs.existsSync(exe)) {
        const systemShell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
        const running = execFileSync(systemShell, ['-NoProfile', '-NonInteractive', '-Command',
            "if (Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Where-Object { !$_.Path -or $_.Path -eq $env:AG_QUOTA_TARGET }) { 'running' }"],
            { encoding: 'utf8', windowsHide: true, env: { ...process.env, AG_QUOTA_TARGET: exe } });
        if (running.trim() === 'running') throw new Error('请先保存工作，并完全退出 Antigravity（含系统托盘）。');
    }
    // Windows releases the named pipe automatically when the owning process exits.
    const lock = net.createServer(socket => socket.destroy());
    const name = '\\\\.\\pipe\\antigravity-zh-quota-' + sha(live.toLowerCase()).slice(0, 24);
    await new Promise((resolve, reject) => { lock.once('error', reject); lock.listen(name, resolve); });
    try { run(action, live); } finally { lock.close(); }
}

main().catch(error => {
    const message = { EADDRINUSE: '另一个安装器正在操作此客户端。', ENOENT: '找不到所需文件。请检查解压目录和客户端安装路径。',
        EBUSY: '请完全退出 Antigravity 后重试。', EPERM: '请完全退出 Antigravity，并检查安装目录写权限。' };
    console.error(message[error.code] || error.message);
    process.exitCode = 1;
});
