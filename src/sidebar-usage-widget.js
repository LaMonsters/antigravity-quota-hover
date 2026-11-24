/* --- ANTIGRAVITY SIDEBAR USAGE START --- */
(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.__agySidebarUsageStarted) return;
    window.__agySidebarUsageStarted = true;

    const pPath = window.location.pathname || '';
    if (
        pPath.startsWith('/settings-standalone') ||
        pPath.startsWith('/artifact') ||
        pPath.startsWith('/terminal-standalone')
    ) {
        return;
    }
    try {
        if (window.self !== window.top && !window.__AGY_USAGE_PREVIEW__) {
            return;
        }
    } catch {
        return;
    }

    const HOST_ID = 'agy-sidebar-usage-host';
    const CACHE_MS = 10000;
    let cachedCsrfToken = '';
    let settings, host, button, tooltip, watcher;
    let groups = [], loadedAt = 0, loadFailed = false, pending = null;
    let mountScheduled = false;

    function formatWindowLabel(rawWindow) {
        const w = String(rawWindow || '').trim().toLowerCase();
        if (!w) return '';
        if (w === 'daily') return '每日';
        if (w === 'weekly') return '每周';
        const m = /^(\d+)\s*([smhd])$/i.exec(w);
        if (m) {
            const unitMap = { s: '秒', m: '分钟', h: '小时', d: '天' };
            return `${m[1]}${unitMap[m[2].toLowerCase()] || m[2]}`;
        }
        return rawWindow;
    }

    function parseTimestampMs(ts) {
        if (!ts) return null;
        if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000;
        if (typeof ts === 'string') {
            const ms = Date.parse(ts);
            return Number.isFinite(ms) ? ms : null;
        }
        if (typeof ts === 'object' && ts.seconds != null) {
            const sec = Number(ts.seconds) || 0;
            const nanos = Number(ts.nanos) || 0;
            return sec * 1000 + Math.floor(nanos / 1e6);
        }
        return null;
    }

    async function readMainWorldCsrf() {
        try {
            if (window.__APP_CONFIG__ && window.__APP_CONFIG__.csrfToken) {
                return String(window.__APP_CONFIG__.csrfToken);
            }
        } catch {
            // ignore
        }
        try {
            if (typeof require === 'function') {
                const electronMod = require('electron');
                if (electronMod?.webFrame?.executeJavaScript) {
                    const tok = await electronMod.webFrame.executeJavaScript(
                        '(function(){try{return window.__APP_CONFIG__&&window.__APP_CONFIG__.csrfToken||""}catch(e){return ""}})()'
                    );
                    if (tok) return String(tok);
                }
            }
        } catch {
            // ignore when outside Electron preload
        }
        return '';
    }

    async function fetchCsrfFromPage() {
        try {
            const res = await fetch(`${window.location.origin}/`, {
                credentials: 'include',
                cache: 'no-store',
            });
            if (!res.ok) return '';
            const html = await res.text();
            const match = html.match(/"?csrfToken"?\s*:\s*"([^"]+)"/);
            return match ? match[1] : '';
        } catch {
            return '';
        }
    }

    async function getCsrfToken(forceRefresh = false) {
        if (!forceRefresh && cachedCsrfToken) return cachedCsrfToken;

        const mainTok = await readMainWorldCsrf();
        if (mainTok) {
            cachedCsrfToken = mainTok;
            return cachedCsrfToken;
        }

        try {
            const lsTok = window.localStorage?.getItem('agy_session_csrf_token');
            if (lsTok) {
                cachedCsrfToken = lsTok;
                return cachedCsrfToken;
            }
        } catch {
            // ignore
        }

        try {
            const cookieMatch = document.cookie.match(/(?:^|;\s*)csrfToken=([^;]+)/);
            if (cookieMatch && cookieMatch[1]) {
                cachedCsrfToken = decodeURIComponent(cookieMatch[1]);
                return cachedCsrfToken;
            }
        } catch {
            // ignore
        }

        if (forceRefresh || !cachedCsrfToken) {
            const pageTok = await fetchCsrfFromPage();
            if (pageTok) {
                cachedCsrfToken = pageTok;
                return cachedCsrfToken;
            }
        }

        return cachedCsrfToken;
    }

    async function lsRpc(method, body = {}) {
        if (typeof window.__AGY_MOCK_RPC__ === 'function') {
            return await window.__AGY_MOCK_RPC__(method, body);
        }

        const attempt = async (forceTokenRefresh) => {
            const token = await getCsrfToken(forceTokenRefresh);
            const headers = {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
            };
            if (token) {
                headers['x-codeium-csrf-token'] = token;
            }
            const res = await fetch(
                `${window.location.origin}/exa.language_server_pb.LanguageServerService/${method}`,
                {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify(body),
                }
            );
            return res;
        };

        let res = await attempt(false);
        if (res.status === 401 || res.status === 403 || res.status === 412) {
            cachedCsrfToken = '';
            res = await attempt(true);
        }
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            if (text.toLowerCase().includes('csrf')) {
                cachedCsrfToken = '';
                res = await attempt(true);
            }
            if (!res.ok) {
                throw new Error(`${method}: HTTP ${res.status}`);
            }
        }
        return await res.json();
    }

    const GENERIC_QUOTA_NAMES = new Set([
        '',
        '模型配额',
        '每周限额',
        '每日限额',
        '5小时限额',
        '每周',
        '每日',
        '5小时',
        'weekly',
        '5h',
        'daily',
        '7d',
        '1w',
        'quota',
    ]);

    function stripWindowSuffix(str) {
        return String(str || '')
            .trim()
            .replace(/\(\s*(?:5h|300m|weekly|daily|7d|1w|5小时|每周|每日|7天)\s*\)$/i, '')
            .replace(/(?:5小时限额|每周限额|每日限额)$/i, '')
            .trim();
    }

    function isGenericQuotaName(str) {
        return GENERIC_QUOTA_NAMES.has(String(str || '').trim().toLowerCase());
    }

    function extractQuotaSeriesKey(groupDisplayName, title) {
        const g = stripWindowSuffix(groupDisplayName);
        if (!isGenericQuotaName(g)) return g;
        const t = stripWindowSuffix(title);
        if (!isGenericQuotaName(t)) return t;
        return String(groupDisplayName || '').trim() || '模型配额';
    }

    function normalizeBucket(bucket, groupDisplayName) {
        const rawWindow = String(bucket.window || '').trim();
        const windowLabel = formatWindowLabel(rawWindow);
        let frac = null;
        if (typeof bucket.remainingFraction === 'number') {
            frac = bucket.remainingFraction;
        } else if (typeof bucket.remainingFraction === 'string' && bucket.remainingFraction !== '') {
            frac = Number(bucket.remainingFraction);
        } else if (bucket.remaining && bucket.remaining.case === 'remainingFraction') {
            frac = Number(bucket.remaining.value);
        }
        if (frac != null && !Number.isFinite(frac)) frac = null;
        const pct = frac != null ? Math.round(Math.max(0, Math.min(1, frac)) * 100) : null;
        const resetTimeMs = parseTimestampMs(bucket.resetTime);

        let title = bucket.displayName || '';
        const lowerWin = rawWindow.toLowerCase();
        if (!title) {
            if (lowerWin === 'daily') title = '每日限额';
            else if (lowerWin === 'weekly') title = '每周限额';
            else if (/^\d+[smhd]$/i.test(lowerWin)) title = `${windowLabel}限额`;
            else title = groupDisplayName || bucket.bucketId || '模型配额';
        }

        const shortLabel = groupDisplayName && groupDisplayName !== title
            ? (windowLabel ? `${groupDisplayName} (${windowLabel})` : `${groupDisplayName} · ${title}`)
            : (windowLabel && !title.includes(windowLabel) ? `${title} (${windowLabel})` : title);

        const seriesKey = extractQuotaSeriesKey(groupDisplayName, title);
        const trackerKey = `${groupDisplayName || ''}::${bucket.bucketId || title}::${lowerWin}`;

        return {
            id: bucket.bucketId || `${groupDisplayName || ''}:${title}:${rawWindow}`,
            trackerKey,
            seriesKey,
            title,
            groupName: groupDisplayName || '',
            rawWindow: lowerWin,
            windowLabel,
            shortLabel,
            remainingFraction: frac,
            remainingPct: pct,
            remainingAmount: bucket.remainingAmount != null ? Number(bucket.remainingAmount) : null,
            resetTimeMs,
            description: bucket.description || '',
            disabled: Boolean(bucket.disabled),
        };
    }

    function isWeeklyBucket(b) {
        if (!b) return false;
        const win = String(b.rawWindow || '').toLowerCase();
        if (win === 'weekly' || win === '7d' || win === '1w' || win === '1week') {
            return true;
        }
        if (b.windowLabel === '每周' || b.windowLabel === '7天') {
            return true;
        }
        const text = `${b.id || ''} ${b.title || ''} ${b.shortLabel || ''}`;
        if (/weekly|每周|周额度|7\s*d|7\s*天|1\s*w/i.test(text)) {
            return true;
        }
        if (!win && b.resetTimeMs && (b.resetTimeMs - Date.now() > 24 * 3600 * 1000)) {
            return true;
        }
        return false;
    }

    function isFiveHourBucket(b) {
        if (!b || isWeeklyBucket(b)) return false;
        const win = String(b.rawWindow || '').toLowerCase();
        if (win === '5h' || win === '300m') {
            return true;
        }
        if (b.windowLabel === '5小时') {
            return true;
        }
        const text = `${b.id || ''} ${b.title || ''} ${b.shortLabel || ''}`;
        if (/5\s*h|5\s*小时|300\s*m/i.test(text)) {
            return true;
        }
        if (!win && (!b.resetTimeMs || (b.resetTimeMs - Date.now() <= 24 * 3600 * 1000))) {
            return true;
        }
        return false;
    }

    function findSettingsButton() {
        const byTestId = document.querySelector('[data-testid="settings-button"]');
        if (byTestId) return byTestId;

        const nav = document.querySelector('[role="navigation"][aria-label="Sidebar"]') || document.querySelector('[role="navigation"]');
        if (!nav) return null;
        const candidates = nav.querySelectorAll('button, a');
        for (const el of candidates) {
            const text = (el.textContent || '').trim();
            const label = (el.getAttribute('aria-label') || '').trim();
            if (text === 'Settings' || text === '设置' || text === '設定' || label === 'Settings' || label === '设置') {
                return el;
            }
        }
        return null;
    }

    async function refreshQuota() {
        if (pending || Date.now() - loadedAt < CACHE_MS) return pending;
        pending = (async () => {
            try {
                const result = await lsRpc('RetrieveUserQuotaSummary', { forceRefresh: false });
                const data = result?.response || result || {};
                const source = data.groups?.length ? data.groups : [{ buckets: data.buckets || [] }];
                groups = source.map(g => {
                    const entries = (g.buckets || []).map(b => normalizeBucket(b, g.displayName || ''));
                    return { name: g.displayName || '', week: entries.find(isWeeklyBucket), five: entries.find(isFiveHourBucket) };
                }).filter(g => g.week || g.five);
                loadFailed = false;
            } catch {
                groups = [];
                loadFailed = true;
            } finally {
                loadedAt = Date.now();
                pending = null;
                if (tooltip?.matches(':popover-open')) { drawQuota(); placeTooltip(); }
            }
        })();
        return pending;
    }

    function groupTitle(rawName) {
        if (!rawName) return '模型';
        return rawName.replace(/\s*(?:&|\band\b|和)\s*/gi, ' 和 ')
            .replace(/\s+models?$/i, ' 模型');
    }

    function resetLabel(resetTime) {
        const remaining = resetTime - Date.now();
        if (!resetTime || remaining <= 0) return '';
        const minutes = Math.ceil(remaining / 60000);
        const hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
        const duration = days ? [days + ' 天', hours % 24 && hours % 24 + ' 小时'] :
            hours ? [hours + ' 小时', minutes % 60 && minutes % 60 + ' 分钟'] : [minutes + ' 分钟'];
        return duration.filter(Boolean).join(' ') + ' 后重置';
    }

    function drawQuota() {
        const list = tooltip.querySelector('.groups');
        list.replaceChildren();
        if (!groups.length) {
            list.textContent = loadFailed ? '暂时无法查询额度' : loadedAt ? '暂无额度数据' : '正在查询…';
            return;
        }
        for (const group of groups) {
            const section = document.createElement('section');
            const heading = document.createElement('strong');
            heading.textContent = groupTitle(group.name);
            section.append(heading);
            for (const [label, bucket] of [['每周限额', group.week], ['5 小时限额', group.five]]) {
                if (!bucket) continue;
                const row = document.createElement('div');
                row.className = 'quota-row';
                row.innerHTML = '<div class="quota-line"><span class="label"></span><span class="value"></span>' +
                    '<svg class="ring" viewBox="0 0 20 20" aria-hidden="true"><circle class="track" cx="10" cy="10" r="7.4"/>' +
                    '<circle class="arc" cx="10" cy="10" r="7.4" pathLength="100" transform="rotate(-90 10 10)"/></svg></div>';
                row.querySelector('.label').textContent = label;
                const pct = bucket.remainingPct ?? (bucket.disabled ? 0 : null);
                row.querySelector('.value').textContent = pct == null ? '暂无数据' : pct + '% 剩余';
                row.querySelector('.arc').setAttribute('stroke-dasharray', (pct ?? 0) + ' 100');
                const reset = resetLabel(bucket.resetTimeMs);
                if (reset) {
                    const time = document.createElement('div');
                    time.textContent = reset;
                    row.append(time);
                }
                section.append(row);
            }
            list.append(section);
        }
    }

    function placeTooltip() {
        if (!tooltip?.matches(':popover-open')) return;
        const r = button.getBoundingClientRect(), panel = tooltip.getBoundingClientRect();
        tooltip.style.left = Math.max(8, Math.min(innerWidth - panel.width - 8, r.right - panel.width)) + 'px';
        tooltip.style.top = (r.top >= panel.height + 12 ? r.top - panel.height - 7 :
            Math.max(8, Math.min(r.bottom + 7, innerHeight - panel.height - 8))) + 'px';
    }

    function showQuota() {
        if (!button?.isConnected || host.hidden) return;
        drawQuota();
        if (!tooltip.matches(':popover-open')) tooltip.showPopover();
        placeTooltip();
        refreshQuota();
    }

    function hideQuota() {
        if (tooltip?.matches(':popover-open')) tooltip.hidePopover();
    }

    // The native tooltip is portalled and can outlive pointerleave while it fades.
    // Mark its own element so the exit animation uses the same position as entry.
    let waitingForSettingsHint = false;
    function markSettingsHint() {
        if (!waitingForSettingsHint || !settings?.isConnected) return;
        const ids = (settings.getAttribute('aria-describedby') || '').split(/\s+/);
        const label = (settings.textContent || '').replace(/\s+/g, '');
        for (const tip of document.querySelectorAll('.compact-tooltip[role="tooltip"]')) {
            const text = tip.textContent.replace(/\s+/g, '');
            const shortcut = label && text.startsWith(label) && /^(?:(?:Ctrl|Control|Cmd|Command)\+?|⌘)[,，]$/i.test(text.slice(label.length));
            if (!(tip.id && ids.includes(tip.id)) && !shortcut) continue;
            tip.dataset.agySettingsHint = '';
            waitingForSettingsHint = false;
            break;
        }
    }

    function awaitSettingsHint() {
        waitingForSettingsHint = true;
        markSettingsHint();
    }

    function stopWaitingForHint() {
        waitingForSettingsHint = false;
    }

    function mount() {
        mountScheduled = false;
        const anchor = findSettingsButton();
        if (host?.isConnected && settings === anchor) return;
        watcher?.disconnect();
        hideQuota();
        host?.remove();
        settings = anchor;
        if (!settings?.parentElement) return;

        host = document.createElement('div');
        host.id = HOST_ID;
        const row = settings.parentElement;
        if (!document.getElementById('agy-split-footer-style')) {
            const style = document.createElement('style');
            style.id = 'agy-split-footer-style';
            style.textContent = '.compact-tooltip[data-agy-settings-hint] {' +
                'translate: calc(-100% - 4px) calc(-100% - 8px); }';
            document.head.append(style);
        }
        settings.addEventListener('pointerenter', awaitSettingsHint);
        settings.addEventListener('focusin', awaitSettingsHint);
        settings.addEventListener('pointerleave', stopWaitingForHint);
        settings.addEventListener('focusout', stopWaitingForHint);
        if (settings.matches(':hover, :focus-within')) awaitSettingsHint();
        // Keep the original settings control and its native shortcut/tooltip.
        // Its border box defines both hit areas, including during sidebar resizing.
        Object.assign(settings.style, {
            width: '50%', flexGrow: '0', flexShrink: '0', boxSizing: 'border-box',
            justifyContent: 'center', marginInlineEnd: 'auto'
        });
        const name = '--agy-quota-settings';
        const anchors = getComputedStyle(settings).anchorName;
        if (!anchors.split(/,\s*/).includes(name)) {
            settings.style.anchorName = !anchors || anchors === 'none' ? name : anchors + ', ' + name;
        }
        Object.assign(host.style, {
            position: 'absolute', positionAnchor: name, left: 'anchor(right)', top: 'anchor(top)',
            width: 'anchor-size(width)', height: 'anchor-size(height)', zIndex: '2',
            positionVisibility: 'anchors-visible', borderRadius: getComputedStyle(settings).borderRadius
        });
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <style>
            :host {font-family:inherit;color:var(--foreground,#c6c7ca)}
            * {box-sizing:border-box}
            button {width:100%;height:100%;padding:0;border:0;border-radius:inherit;display:grid;place-items:center;
              background:transparent;color:var(--secondary-foreground,inherit);cursor:pointer;-webkit-app-region:no-drag}
            button:hover,button:focus-visible {color:var(--foreground,inherit);background:var(--sidebar-muted,color-mix(in srgb,currentColor 9%,transparent))}
            button:focus-visible {outline:1px solid currentColor;outline-offset:1px}
            svg {display:block;width:18px;height:18px}
            #quota-tip {position:fixed;inset:auto;margin:0;width:316px;max-width:calc(100vw - 16px);
              max-height:calc(100vh - 16px);overflow:auto;padding:6px 10px 10px;border-radius:12px;
              border:1px solid color-mix(in srgb,var(--foreground,#ccc) 14%,transparent);
              background:var(--popover,var(--card,#17171a));color:var(--popover-foreground,var(--foreground,#e8e8eb));
              font:inherit;font-size:12px;line-height:1.4;box-shadow:0 4px 14px #0002;pointer-events:none}
            .heading,.quota-row,.groups {color:var(--muted-foreground,#9a9aa3)}
            section {margin-top:8px}section+section {margin-top:12px}
            strong {font-size:12.5px;font-weight:600;color:var(--popover-foreground,var(--foreground,#e8e8eb))}
            .quota-row {margin-top:4px}.quota-row+.quota-row {margin-top:8px}
            .quota-line {display:flex;align-items:center;gap:5px}.value {margin-left:auto;font-variant-numeric:tabular-nums}
            svg.ring {width:17px;height:17px;fill:none;stroke-width:2.1}.track {stroke:color-mix(in srgb,currentColor 25%,transparent)}
            .arc {stroke:var(--success,#54843e)}
            </style>
            <button type="button" aria-label="额度" aria-describedby="quota-tip">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.65"/><path d="M7.1 13.6a5.15 5.15 0 0 1 8.65-5.25M12 12l3.55-3.55"/>
                <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </button>
            <div id="quota-tip" role="tooltip" popover="manual">
              <div class="heading">使用量</div><div class="groups"></div>
            </div>`;
        button = shadow.querySelector('button');
        tooltip = shadow.querySelector('[role=tooltip]');
        button.addEventListener('pointerenter', showQuota);
        button.addEventListener('pointerleave', hideQuota);
        button.addEventListener('focus', () => { if (button.matches(':focus-visible')) showQuota(); });
        button.addEventListener('blur', hideQuota);
        button.addEventListener('click', e => { e.stopPropagation(); showQuota(); });
        settings.after(host);
        const check = () => {
            host.hidden = row.clientWidth < 64;
            if (host.hidden) hideQuota();
            else placeTooltip();
        };
        watcher = new ResizeObserver(check);
        watcher.observe(settings);
        watcher.observe(row);
        check();
    }

    function start() {
        mount();
        new MutationObserver(() => {
            if (waitingForSettingsHint) markSettingsHint();
            if (mountScheduled || (settings?.isConnected && host?.isConnected)) return;
            mountScheduled = true;
            requestAnimationFrame(mount);
        }).observe(document.body, { subtree: true, childList: true });
        window.addEventListener('resize', placeTooltip);
        window.addEventListener('scroll', placeTooltip, true);
        window.addEventListener('blur', hideQuota);
        document.addEventListener('keydown', e => { if (e.key === 'Escape') hideQuota(); });
        document.addEventListener('visibilitychange', () => { if (document.hidden) hideQuota(); });
        setInterval(() => { if (tooltip?.matches(':popover-open')) refreshQuota(); }, CACHE_MS);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
    else start();
})();
/* --- ANTIGRAVITY SIDEBAR USAGE END --- */
