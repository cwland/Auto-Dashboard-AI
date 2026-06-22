// Auto Dashboard AI — Service Worker
'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// GitHub-based update system (side-loaded installs only)
// ═══════════════════════════════════════════════════════════════════════════
const UPDATE_CONFIG = {
  // Flip to true for the Chrome Web Store build to disable all update checks.
  isWebStoreBuild: false,
  versionUrl: 'https://raw.githubusercontent.com/cwland/Auto-Dashboard-AI/main/version.json',
  releasesUrl: 'https://github.com/cwland/Auto-Dashboard-AI/releases',
  checkIntervalMs: 24 * 60 * 60 * 1000, // max once per 24h
  alarmName: 'adaiUpdateCheck',
};

// Side-loaded = NOT a Web Store build AND no managed update_url in the manifest.
// (Web Store / policy-managed installs carry an update_url; unpacked/sideloaded
// builds do not.) No extra permission required.
function isSideLoadedInstall() {
  if (UPDATE_CONFIG.isWebStoreBuild) return false;
  try {
    if (chrome.runtime.getManifest().update_url) return false;
  } catch (_) {}
  return true;
}

// Numeric semver-ish comparison. Returns true if `remote` is strictly newer
// than `current`. Tolerates differing segment counts ("1.2" vs "1.2.0").
function isVersionNewer(remote, current) {
  const norm = (v) => String(v || '').trim().replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const a = norm(remote);
  const b = norm(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// Fetch the remote version file and, if newer, record an "update available"
// flag in local storage for the UI surfaces to read. Rate-limited to once per
// 24h. Fails silently — never throws, never surfaces errors to the user.
async function checkForUpdate({ force = false } = {}) {
  if (!isSideLoadedInstall()) return;
  try {
    const { adaiLastUpdateCheck } = await chrome.storage.local.get('adaiLastUpdateCheck');
    const now = Date.now();
    if (!force && adaiLastUpdateCheck && (now - adaiLastUpdateCheck) < UPDATE_CONFIG.checkIntervalMs) {
      return; // checked recently — skip to avoid excessive requests
    }
    // Record the attempt up front so a failure doesn't cause repeated retries
    // before the next scheduled interval.
    await chrome.storage.local.set({ adaiLastUpdateCheck: now });

    // Cache-buster so we always see the latest file.
    const resp = await fetch(`${UPDATE_CONFIG.versionUrl}?t=${now}`, { method: 'GET', cache: 'no-store' });
    if (!resp.ok) return;
    const info = await resp.json().catch(() => null);
    if (!info || !info.version) return;

    const current = chrome.runtime.getManifest().version;
    if (isVersionNewer(info.version, current)) {
      await chrome.storage.local.set({
        adaiUpdate: {
          available: true,
          version: String(info.version),
          notes: info.notes ? String(info.notes) : '',
          downloadUrl: info.downloadUrl ? String(info.downloadUrl) : UPDATE_CONFIG.releasesUrl,
        },
      });
    } else {
      // Up to date — clear any stale flag (e.g. after the user updates).
      await chrome.storage.local.set({ adaiUpdate: { available: false } });
    }
  } catch (_) {
    // GitHub unreachable / offline / parse error — fail silently, retry next interval.
  }
}

// Daily alarm trigger (onStartup + onInstalled checks are wired below).
try {
  chrome.alarms.create(UPDATE_CONFIG.alarmName, { periodInMinutes: 24 * 60 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === UPDATE_CONFIG.alarmName) checkForUpdate();
  });
} catch (_) { /* alarms unavailable — startup check still runs */ }

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard → Bookmark Bar one-way sync (opt-in)
// ═══════════════════════════════════════════════════════════════════════════
// Mirrors dashboard bookmark items into a managed "Dashboard AI" folder on the
// bookmark bar. The dashboard is the source of truth; manual edits inside the
// managed hierarchy are overwritten on the next sync. EVERY destructive op is
// scoped to nodes we created and track (in bookmarkSyncMap) — nothing outside
// the managed folder is ever touched.
const SYNC_ROOT_TITLE = 'Dashboard AI';

// Group a dashboard's bookmarks into ordered sections, exactly like the board.
function syncGroupSections(dash) {
  const groups = new Map();
  const order = [];
  (dash.bookmarks || []).forEach((bm) => {
    if (!bm || !bm.url) return;             // bookmark/link items only
    const key = bm.folder || 'General';
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key).push(bm);
  });
  let names = order;
  if (Array.isArray(dash.sectionOrder) && dash.sectionOrder.length) {
    const present = new Set(order);
    names = dash.sectionOrder.filter((s) => present.has(s));
    order.forEach((s) => { if (!names.includes(s)) names.push(s); });
  }
  return names.map((name) => ({ name, bookmarks: groups.get(name) || [] }));
}

async function bmGet(id) {
  if (!id) return null;
  try { const [n] = await chrome.bookmarks.get(String(id)); return n || null; } catch (_) { return null; }
}

async function bmGetBar() {
  const tree = await chrome.bookmarks.getTree();
  const roots = (tree[0] && tree[0].children) || [];
  return roots.find((c) => c.id === '1') || roots[0] || null;
}

// Ensure a folder named `title` exists at `parentId` (reusing knownId when valid).
async function bmEnsureFolder(parentId, title, knownId, index) {
  const node = await bmGet(knownId);
  if (node && node.parentId === parentId && !node.url) {
    if (node.title !== title) { try { await chrome.bookmarks.update(node.id, { title }); } catch (_) {} }
    if (typeof index === 'number' && node.index !== index) { try { await chrome.bookmarks.move(node.id, { parentId, index }); } catch (_) {} }
    return node.id;
  }
  const created = await chrome.bookmarks.create({ parentId, title, index });
  return created.id;
}

// Ensure a bookmark (title + url) exists at `parentId` (reusing knownId when valid).
async function bmEnsureLink(parentId, title, url, knownId, index) {
  const node = await bmGet(knownId);
  if (node && node.parentId === parentId && node.url != null) {
    const patch = {};
    if (node.title !== title) patch.title = title;
    if (node.url !== url) patch.url = url;
    if (Object.keys(patch).length) { try { await chrome.bookmarks.update(node.id, patch); } catch (_) {} }
    if (typeof index === 'number' && node.index !== index) { try { await chrome.bookmarks.move(node.id, { parentId, index }); } catch (_) {} }
    return node.id;
  }
  const created = await chrome.bookmarks.create({ parentId, title, url, index });
  return created.id;
}

async function bmRemove(id) { try { await chrome.bookmarks.removeTree(String(id)); } catch (_) {} }

// Remove any child of a managed folder that we don't recognise (manual edits).
async function bmPrune(parentId, keepIds) {
  let kids = [];
  try { kids = await chrome.bookmarks.getChildren(parentId); } catch (_) { return; }
  for (const c of kids) { if (!keepIds.has(c.id)) await bmRemove(c.id); }
}

let _syncMap = null;
async function loadSyncMap() {
  if (_syncMap) return _syncMap;
  const { bookmarkSyncMap } = await chrome.storage.local.get('bookmarkSyncMap');
  _syncMap = (bookmarkSyncMap && typeof bookmarkSyncMap === 'object') ? bookmarkSyncMap : { rootId: null, dashes: {} };
  if (!_syncMap.dashes) _syncMap.dashes = {};
  return _syncMap;
}

let _syncing = false, _syncQueued = false;
async function syncDashboardsToBookmarks() {
  if (_syncing) { _syncQueued = true; return; }
  _syncing = true;
  try {
    const { settings, dashboards } = await chrome.storage.local.get(['settings', 'dashboards']);
    if (!settings || settings.syncBookmarks !== true) return;   // disabled → leave bookmarks intact
    if (!chrome.bookmarks) return;
    const bar = await bmGetBar();
    if (!bar) return;
    const map = await loadSyncMap();

    // Managed root, always first in the bar.
    map.rootId = await bmEnsureFolder(bar.id, SYNC_ROOT_TITLE, map.rootId, 0);
    map.dashes = map.dashes || {};

    const dashes = Array.isArray(dashboards) ? dashboards : [];
    const seenDash = new Set();
    const dashKeep = new Set();
    for (let di = 0; di < dashes.length; di++) {
      const dash = dashes[di];
      if (!dash || !dash.id) continue;
      seenDash.add(dash.id);
      const dEntry = map.dashes[dash.id] = map.dashes[dash.id] || { secs: {} };
      if (!dEntry.secs) dEntry.secs = {};
      dEntry.id = await bmEnsureFolder(map.rootId, dash.name || 'Dashboard', dEntry.id, di);
      dashKeep.add(dEntry.id);

      const sections = syncGroupSections(dash);
      const seenSec = new Set();
      const secKeep = new Set();
      for (let si = 0; si < sections.length; si++) {
        const sec = sections[si];
        seenSec.add(sec.name);
        const sEntry = dEntry.secs[sec.name] = dEntry.secs[sec.name] || { items: {} };
        if (!sEntry.items) sEntry.items = {};
        sEntry.id = await bmEnsureFolder(dEntry.id, sec.name, sEntry.id, si);
        secKeep.add(sEntry.id);

        const seenBm = new Set();
        const itemKeep = new Set();
        for (let bi = 0; bi < sec.bookmarks.length; bi++) {
          const bm = sec.bookmarks[bi];
          if (!bm || !bm.id || !bm.url) continue;
          seenBm.add(bm.id);
          const nodeId = await bmEnsureLink(sEntry.id, bm.title || bm.url, bm.url, sEntry.items[bm.id], bi);
          sEntry.items[bm.id] = nodeId;
          itemKeep.add(nodeId);
        }
        for (const bmId of Object.keys(sEntry.items)) {
          if (!seenBm.has(bmId)) { await bmRemove(sEntry.items[bmId]); delete sEntry.items[bmId]; }
        }
        await bmPrune(sEntry.id, itemKeep);   // wipe manual additions in this section
      }
      for (const secName of Object.keys(dEntry.secs)) {
        if (!seenSec.has(secName)) { await bmRemove(dEntry.secs[secName].id); delete dEntry.secs[secName]; }
      }
      await bmPrune(dEntry.id, secKeep);
    }
    for (const dashId of Object.keys(map.dashes)) {
      if (!seenDash.has(dashId)) { await bmRemove(map.dashes[dashId].id); delete map.dashes[dashId]; }
    }
    await bmPrune(map.rootId, dashKeep);

    try { await chrome.storage.local.set({ bookmarkSyncMap: map }); } catch (_) {}
  } catch (_) {
    // Never throw from the background.
  } finally {
    _syncing = false;
    if (_syncQueued) { _syncQueued = false; syncDashboardsToBookmarks(); }
  }
}

let _syncTimer = null;
function scheduleBookmarkSync() {
  if (_syncTimer) clearTimeout(_syncTimer);
  _syncTimer = setTimeout(syncDashboardsToBookmarks, 800);   // debounce bursts of edits
}

// ── Backup payload helpers (shared by the Gist backup) ───────────────────────
// The backed-up data is settings + dashboards + the default-dashboard pointer.
// bookmarkSyncMap and other machine-specific keys are deliberately excluded.
const CFG_SYNC_KEYS = ['settings', 'dashboards', 'defaultDashboardId'];
// Data-shape version stamped into each backup. Bump ONLY on a breaking change to
// the settings/dashboards shape; an older build refuses to restore a newer schema.
const CFG_SCHEMA = 1;

function cfgHash(str) {            // FNV-1a 32-bit → hex (change detection only)
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

let _cfgState = null;
async function cfgLoadState() {
  if (_cfgState) return _cfgState;
  const { _cfgSync } = await chrome.storage.local.get('_cfgSync');
  _cfgState = (_cfgSync && typeof _cfgSync === 'object') ? _cfgSync : {};
  if (!_cfgState.deviceId) {
    _cfgState.deviceId = (self.crypto && crypto.randomUUID)
      ? crypto.randomUUID() : 'd' + Date.now() + Math.random().toString(16).slice(2);
  }
  return _cfgState;
}
async function cfgSaveState() { try { await chrome.storage.local.set({ _cfgSync: _cfgState }); } catch (_) {} }

// Settings that must NEVER be written into a backup/sync payload: the GitHub
// token (storing it in its own gist makes GitHub's secret scanning auto-revoke
// it!) and the encryption passphrase (must be entered per device, not synced).
const CFG_LOCAL_ONLY_SETTINGS = ['gistToken', 'backupPassphrase'];

// Per-dashboard flags that are LOCAL and transient — they must not travel in a
// backup. `autoArrange` is a one-shot "tidy this freshly-created dashboard on its
// first render" flag; if it syncs, the receiving browser re-compacts the saved
// grid layout instead of showing it as-is, scrambling the section grouping.
const CFG_TRANSIENT_DASH_KEYS = ['autoArrange'];
function cfgStripDashboards(dashboards) {
  if (!Array.isArray(dashboards)) return dashboards;
  return dashboards.map((d) => {
    if (!d || typeof d !== 'object') return d;
    let copy = d;
    CFG_TRANSIENT_DASH_KEYS.forEach((k) => {
      if (k in d) { if (copy === d) copy = { ...d }; delete copy[k]; }
    });
    return copy;
  });
}

// Build the {settings,dashboards,defaultDashboardId} payload from local storage,
// with device-local-only secrets and transient dashboard flags stripped out.
async function cfgLocalPayload() {
  const local = await chrome.storage.local.get(CFG_SYNC_KEYS);
  const obj = {};
  CFG_SYNC_KEYS.forEach((k) => { if (local[k] !== undefined) obj[k] = local[k]; });
  if (obj.settings && typeof obj.settings === 'object') {
    const s = { ...obj.settings };
    CFG_LOCAL_ONLY_SETTINGS.forEach((k) => { delete s[k]; });
    obj.settings = s;
  }
  if (obj.dashboards) obj.dashboards = cfgStripDashboards(obj.dashboards);
  return obj;
}

// Apply a pulled payload to local storage, preserving this device's local-only
// secrets (token/passphrase) so a restore never wipes the credential you just set.
async function cfgApplyToLocal(obj) {
  const writeLocal = {};
  CFG_SYNC_KEYS.forEach((k) => { if (obj[k] !== undefined) writeLocal[k] = obj[k]; });
  if (writeLocal.dashboards) writeLocal.dashboards = cfgStripDashboards(writeLocal.dashboards);
  if (writeLocal.settings && typeof writeLocal.settings === 'object') {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    const merged = { ...writeLocal.settings };
    CFG_LOCAL_ONLY_SETTINGS.forEach((k) => { if (cur[k] !== undefined) merged[k] = cur[k]; });
    writeLocal.settings = merged;
  }
  _cfgApplying = true;
  try { await chrome.storage.local.set(writeLocal); } finally { _cfgApplying = false; }
}

let _cfgApplying = false;
const GIST_AUTOSYNC_ALARM = 'adaiGistAutoSync';

// Reconcile the bookmark-bar mirror whenever dashboards or settings change, and
// track real local edits (for auto-sync's "is the backup newer?" comparison).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.dashboards || changes.settings) scheduleBookmarkSync();
  if (!_cfgApplying && (changes.settings || changes.dashboards || changes.defaultDashboardId)) {
    scheduleLocalStamp();      // mark this as a real local edit
    scheduleAutoBackup();      // ~30s after you stop editing, back up the change
  }
});

// Debounced auto-backup of local edits (only fires when auto-sync is enabled).
let _autoBackupTimer = null;
function scheduleAutoBackup() {
  if (_autoBackupTimer) clearTimeout(_autoBackupTimer);
  _autoBackupTimer = setTimeout(gistReconcile, 30000);
}

// Periodic two-way sync (gists have no push notifications, so we poll).
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === GIST_AUTOSYNC_ALARM) gistReconcile();
});

// Build the {settings,dashboards,defaultDashboardId} payload + its hash.
async function cfgBuild() {
  const obj = await cfgLocalPayload();
  const json = JSON.stringify(obj);
  return { obj, json, hash: cfgHash(json) };
}
function cfgPayloadHash(data) {
  if (data && typeof data.hash === 'string') return data.hash;
  const obj = {};
  CFG_SYNC_KEYS.forEach((k) => { if (data && data[k] !== undefined) obj[k] = data[k]; });
  return cfgHash(JSON.stringify(obj));
}

// ── Backup encryption (optional passphrase, shared by cloud backups) ───────────
// When a passphrase is set, the {settings,dashboards,defaultDashboardId} payload
// is AES-256-GCM encrypted (key derived from the passphrase via PBKDF2-SHA256)
// BEFORE it leaves the machine, so the cloud only ever holds ciphertext. The
// envelope keeps schema/ts/hash in cleartext so conflict resolution and the
// schema guard work without the passphrase; only the actual data is encrypted.
const BACKUP_KDF_ITER = 210000;
async function backupGetPass() {
  const { settings } = await chrome.storage.local.get('settings');
  return (settings && settings.backupPassphrase) ? String(settings.backupPassphrase) : '';
}
function b64enc(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64dec(str) { return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)); }
async function backupKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function backupEncrypt(plainStr, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(pass, salt, BACKUP_KDF_ITER);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainStr));
  return { v: 1, kdf: 'PBKDF2', hash: 'SHA-256', iter: BACKUP_KDF_ITER, salt: b64enc(salt), iv: b64enc(iv), ct: b64enc(ct) };
}
async function backupDecrypt(enc, pass) {
  try {
    const key = await backupKey(pass, b64dec(enc.salt), enc.iter || BACKUP_KDF_ITER);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(enc.iv) }, key, b64dec(enc.ct));
    return new TextDecoder().decode(pt);
  } catch (_) { return null; }
}
// Build the object stored in the cloud (encrypted when a passphrase is set).
async function backupBuildStored(hash, ts, st, obj) {
  const meta = { app: 'Auto Dashboard AI', type: 'config-backup', schema: CFG_SCHEMA, hash, ts, deviceId: st.deviceId };
  const pass = await backupGetPass();
  if (pass) { meta.enc = await backupEncrypt(JSON.stringify(obj), pass); meta.encrypted = true; }
  else { Object.assign(meta, obj); }
  return meta;
}
// Recover {settings,...} from a stored object. Returns {obj} | {error:'passphrase'|'corrupt'}.
async function backupReadPayload(rData) {
  if (rData && rData.enc) {
    const pass = await backupGetPass();
    if (!pass) return { error: 'passphrase' };
    const str = await backupDecrypt(rData.enc, pass);
    if (str == null) return { error: 'passphrase' };
    let obj; try { obj = JSON.parse(str); } catch (_) { return { error: 'corrupt' }; }
    return { obj };
  }
  const obj = {};
  CFG_SYNC_KEYS.forEach((k) => { if (rData && rData[k] !== undefined) obj[k] = rData[k]; });
  return { obj };
}

// ── GitHub Gist backup (token auth, private gist) ─────────────────────────────
// A no-OAuth cloud backup: the user pastes a fine-grained token scoped to "gists"
// and the same {settings,dashboards,defaultDashboardId} payload is stored as a
// single file in a private gist. Works across any browser. Opt-in via the
// "gistSync" setting, using the same three-way reconcile + schema guard as the
// other backends. The gist id is remembered locally so updates patch the same gist.
const GIST_FILE_BASE = 'auto-dashboard-config';
const GIST_DESC_BASE = 'Auto Dashboard AI — config backup';
const GIST_API = 'https://api.github.com';

// Browser-type-scoped backups: each browser brand keeps its OWN gist file, so a
// browser only ever syncs with the same brand (Brave↔Brave, Chrome↔Chrome). This
// avoids cross-brand differences in how the grid layout renders. Brave reports a
// Chrome user-agent, so it's detected via navigator.brave; pages also stash the
// detected type in storage (a window is the most reliable place to detect Brave).
async function detectBrowserType() {
  try {
    if (typeof navigator !== 'undefined' && navigator.brave && navigator.brave.isBrave) {
      if (await navigator.brave.isBrave()) return 'brave';
    }
  } catch (_) {}
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/\bEdg\//.test(ua)) return 'edge';
  if (/\bOPR\//.test(ua) || /\bOpera\b/.test(ua)) return 'opera';
  if (/\bVivaldi\b/.test(ua)) return 'vivaldi';
  return 'chrome';
}
let _browserType = null;
async function getBrowserType() {
  if (_browserType) return _browserType;
  try {
    const { browserType } = await chrome.storage.local.get('browserType');
    if (browserType) { _browserType = browserType; return _browserType; }
  } catch (_) {}
  _browserType = await detectBrowserType();
  return _browserType;
}
async function gistFileName() { return `${GIST_FILE_BASE}-${await getBrowserType()}.json`; }

async function gistGetToken() {
  const { settings } = await chrome.storage.local.get('settings');
  return (settings && settings.gistToken) ? String(settings.gistToken).trim() : '';
}
async function gistFetch(url, opts) {
  const token = await gistGetToken();
  if (!token) return null;
  const headers = Object.assign({
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }, opts && opts.headers);
  return fetch(url, Object.assign({}, opts, { headers }));
}

async function gistSetError(err) { try { await chrome.storage.local.set({ gistSyncError: err }); } catch (_) {} }
async function gistClearError() { try { await chrome.storage.local.remove('gistSyncError'); } catch (_) {} }

// Locate THIS browser's backup gist (by its browser-scoped filename `fname`).
// Returns {id} | {noAuth:true} | {none:true} | null.
async function gistFindId(st, fname) {
  if (st.gistId) {
    const r = await gistFetch(`${GIST_API}/gists/${st.gistId}`);
    if (r === null) return { noAuth: true };
    if (r.ok) {
      const g = await r.json().catch(() => null);
      if (g && g.files && g.files[fname]) return { id: st.gistId };   // cached gist holds OUR file
      // Cached gist isn't this browser's backup (e.g. after the per-browser split) →
      // fall through to find/create the correct one.
    } else if (r.status === 401) return { noAuth: true };
    else if (r.status === 404) { st.gistId = null; await cfgSaveState(); }   // gist was deleted
  }
  const r = await gistFetch(`${GIST_API}/gists?per_page=100`);
  if (r === null) return { noAuth: true };
  if (r.status === 401) return { noAuth: true };
  if (!r.ok) return null;
  const list = await r.json().catch(() => null);
  if (!Array.isArray(list)) return null;
  const found = list.find((g) => g && g.files && g.files[fname]);
  return found ? { id: found.id } : { none: true };
}
// Returns {noAuth:true} | {none:true} | null(error) | {id,data}
async function gistRead() {
  const st = await cfgLoadState();
  const fname = await gistFileName();
  const f = await gistFindId(st, fname);
  if (!f || f.noAuth) return f || null;
  if (f.none) return { none: true };
  const r = await gistFetch(`${GIST_API}/gists/${f.id}`);
  if (r === null) return { noAuth: true };
  if (!r.ok) return null;
  const g = await r.json().catch(() => null);
  const file = g && g.files && g.files[fname];
  if (!file) return { none: true };
  let content = file.content;
  if (file.truncated && file.raw_url) {
    try { const rr = await fetch(file.raw_url); if (rr.ok) content = await rr.text(); } catch (_) {}
  }
  let data; try { data = JSON.parse(content); } catch (_) { return null; }
  st.gistId = f.id; await cfgSaveState();
  return { id: f.id, data };
}
// Create or update this browser's gist. Returns id or null.
async function gistWrite(payloadObj) {
  const st = await cfgLoadState();
  const fname = await gistFileName();
  const f = await gistFindId(st, fname);
  if (!f || f.noAuth) return null;
  const files = { [fname]: { content: JSON.stringify(payloadObj) } };
  if (f.id) {
    const r = await gistFetch(`${GIST_API}/gists/${f.id}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
    if (r && r.ok) { st.gistId = f.id; await cfgSaveState(); return f.id; }
    return null;
  }
  const desc = `${GIST_DESC_BASE} (${await getBrowserType()})`;
  const r = await gistFetch(`${GIST_API}/gists`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: desc, public: false, files }) });
  if (!r || !r.ok) return null;
  const g = await r.json().catch(() => null);
  if (!g || !g.id) return null;
  st.gistId = g.id; await cfgSaveState();
  return g.id;
}

async function gistPush(obj, hash, st) {
  const ts = st.localTs || Date.now();
  const payload = await backupBuildStored(hash, ts, st, obj);
  const id = await gistWrite(payload);
  if (!id) { await gistSetError({ code: 'auth', at: Date.now() }); return false; }
  // Record the synced baseline: our local config now matches the remote backup,
  // so later local-change detection won't treat it as a fresh edit.
  st.gistHash = hash; st.gistTs = ts; st.gistBackupAt = Date.now();
  st.lastSyncedHash = hash; st.localTs = ts;
  await cfgSaveState();
  await gistClearError();
  return true;
}
async function gistPull(remote, rHash, st) {
  const data = remote.data;
  const dec = await backupReadPayload(data);
  if (dec.error) { await gistSetError({ code: dec.error === 'passphrase' ? 'passphrase' : 'error', at: Date.now() }); return false; }
  const obj = dec.obj;
  if (!obj || !obj.settings) return false;
  // Set the synced baseline BEFORE writing local, so the resulting storage change
  // is recognised as "our own apply" (hash === baseline) and never bumps localTs.
  st.gistHash = rHash; st.localTs = data.ts || Date.now(); st.gistBackupAt = Date.now();
  st.lastSyncedHash = rHash;
  await cfgSaveState();
  await cfgApplyToLocal(obj);
  await gistClearError();
  return true;
}

async function gistBackupNow() {
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || settings.gistSync !== true) return { ok: false, reason: 'disabled' };
  if (!settings.gistToken) return { ok: false, reason: 'auth' };
  if (!settings.backupPassphrase) return { ok: false, reason: 'noPassphrase' };
  const { obj, hash } = await cfgBuild();
  const st = await cfgLoadState();
  st.localTs = Date.now();
  const ok = await gistPush(obj, hash, st);
  return { ok, reason: ok ? null : 'auth' };
}
async function gistRestoreNow() {
  const { settings } = await chrome.storage.local.get('settings');
  if (settings && settings.gistSync === true && !settings.backupPassphrase) return { ok: false, reason: 'noPassphrase' };
  const remote = await gistRead();
  if (!remote || remote.noAuth) return { ok: false, reason: 'auth' };
  if (remote.none) return { ok: false, reason: 'none' };
  const rData = remote.data || {};
  if ((rData.schema || 1) > CFG_SCHEMA) return { ok: false, reason: 'schema' };
  if (rData.enc && !(await backupGetPass())) return { ok: false, reason: 'passphrase' };
  const rHash = cfgPayloadHash(rData);
  const st = await cfgLoadState();
  const ok = await gistPull(remote, rHash, st);
  return { ok, reason: ok ? null : (rData.enc ? 'passphrase' : 'empty') };
}
// ── Auto-sync: pull a newer backup automatically (one-way; push stays manual) ─
// When the user enables "auto-sync", we periodically check the gist and, if the
// stored backup is NEWER than this device's config, load it and refresh open
// dashboards. We never auto-push, and an applied pull updates the synced baseline
// so it can't re-trigger anything — no circular backup loop.
// Two-way auto-sync: push local edits to the gist and pull newer remote backups.
// Loop-safe via the synced baseline (lastSyncedHash): a backup that we just loaded
// (or just pushed) matches the baseline, so it never triggers another write.
let _reconciling = false, _reconcileQueued = false;
async function gistReconcile() {
  if (_reconciling) { _reconcileQueued = true; return; }
  _reconciling = true;
  try {
    const { settings } = await chrome.storage.local.get('settings');
    if (!settings || settings.gistSync !== true || settings.gistAutoSync !== true) return;
    if (!settings.gistToken || !settings.backupPassphrase) return;
    const { obj, hash } = await cfgBuild();
    const st = await cfgLoadState();
    const base = st.lastSyncedHash;

    const remote = await gistRead();
    if (!remote || remote.noAuth) return;                     // not signed in / transient error
    if (remote.none) { await gistPush(obj, hash, st); return; }   // empty gist → seed it

    const rData = remote.data || {};
    if ((rData.schema || 1) > CFG_SCHEMA) { await gistSetError({ code: 'schema', remote: rData.schema || 1, local: CFG_SCHEMA, at: Date.now() }); return; }
    if (rData.enc && !(await backupGetPass())) { await gistSetError({ code: 'passphrase', at: Date.now() }); return; }

    const remoteHash = cfgPayloadHash(rData);
    if (remoteHash === hash) {                                 // already identical
      if (base !== hash) { st.lastSyncedHash = hash; await cfgSaveState(); }
      await gistClearError();
      return;
    }
    const localChanged = hash !== base;
    const remoteChanged = remoteHash !== base;
    if (localChanged && !remoteChanged) {                      // only local changed → back up
      await gistPush(obj, hash, st);
    } else if (!localChanged && remoteChanged) {               // only remote changed → load it
      const ok = await gistPull(remote, remoteHash, st);
      if (ok) notifyConfigReplaced();
    } else {                                                   // both changed → last-write-wins
      const remoteTs = rData.ts || 0;
      if ((st.localTs || 0) >= remoteTs) { await gistPush(obj, hash, st); }
      else { const ok = await gistPull(remote, remoteHash, st); if (ok) notifyConfigReplaced(); }
    }
  } catch (_) {
    // Auto-sync is best-effort; never throw from the background.
  } finally {
    _reconciling = false;
    if (_reconcileQueued) { _reconcileQueued = false; gistReconcile(); }
  }
}

// Tell any open dashboard pages to reload so they show the just-loaded config.
function notifyConfigReplaced() {
  // Open dashboard pages listen for this and reload themselves (newtab.js), so
  // no tab scan is needed — which lets us avoid the "tabs" permission entirely.
  try { chrome.runtime.sendMessage({ type: 'configReplaced' }, () => void chrome.runtime.lastError); } catch (_) {}
}

// Mark the local config as edited (bumps localTs) — but only for a REAL change,
// not our own applied pull. We compare the payload hash to the synced baseline:
// if it matches, this storage change came from a pull/push and must not bump.
let _stampTimer = null;
function scheduleLocalStamp() {
  if (_stampTimer) clearTimeout(_stampTimer);
  _stampTimer = setTimeout(async () => {
    try {
      const st = await cfgLoadState();
      const hash = cfgHash(JSON.stringify(await cfgLocalPayload()));
      if (hash !== st.lastSyncedHash) { st.localTs = Date.now(); await cfgSaveState(); }
    } catch (_) {}
  }, 500);
}

async function gistStatus() {
  const st = await cfgLoadState();
  const { settings, gistSyncError } = await chrome.storage.local.get(['settings', 'gistSyncError']);
  return {
    enabled: !!(settings && settings.gistSync === true),
    hasToken: !!(settings && settings.gistToken),
    hasPassphrase: !!(settings && settings.backupPassphrase),
    lastBackupAt: st.gistBackupAt || null,
    error: gistSyncError || null,
  };
}
// Validate a GitHub token (the value currently in the field, may be unsaved):
// confirms it authenticates AND can access gists. Returns {ok, login, reason}.
async function gistTest(token) {
  token = (token || '').trim();
  if (!token) return { ok: false, reason: 'empty' };
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  try {
    const u = await fetch('https://api.github.com/user', { headers });
    if (u.status === 401) return { ok: false, reason: 'unauthorized' };
    if (!u.ok) return { ok: false, reason: 'http', status: u.status };
    const user = await u.json().catch(() => ({}));
    const g = await fetch('https://api.github.com/gists?per_page=1', { headers });
    if (g.status === 401 || g.status === 403 || g.status === 404) {
      return { ok: false, reason: 'noGistScope', status: g.status, login: user.login || null };
    }
    if (!g.ok) return { ok: false, reason: 'http', status: g.status, login: user.login || null };
    return { ok: true, login: user.login || null };
  } catch (e) {
    return { ok: false, reason: 'network', msg: String((e && e.message) || e) };
  }
}


// Open config page on first install
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('config/config.html'),
    });
  }

  // On install/update, clear any stale "update available" flag (the user may
  // have just updated) and run a fresh check.
  if (reason === 'install' || reason === 'update') {
    chrome.storage.local.set({ adaiUpdate: { available: false } });
    checkForUpdate({ force: true });
  }
  scheduleBookmarkSync();   // reconcile bookmarks (no-op if disabled)
  try { chrome.alarms.create(GIST_AUTOSYNC_ALARM, { periodInMinutes: 0.5 }); } catch (_) {}  // 30s = Chrome's floor
  gistReconcile();          // sync with the gist (no-op if auto-sync disabled)
});

// Open the dashboard on browser startup when the user has opted in.
chrome.runtime.onStartup.addListener(async () => {
  checkForUpdate();
  scheduleBookmarkSync();   // catch any dashboard/bookmark drift since last session
  try { chrome.alarms.create(GIST_AUTOSYNC_ALARM, { periodInMinutes: 0.5 }); } catch (_) {}  // 30s = Chrome's floor
  gistReconcile();          // sync with the gist (no-op if auto-sync disabled)

  const { settings, defaultDashboardId, dashboards } =
    await chrome.storage.local.get(['settings', 'defaultDashboardId', 'dashboards']);
  if (!settings || settings.openOnStartup !== true) return;
  const id = defaultDashboardId || (dashboards && dashboards[0] && dashboards[0].id);
  // dashboard.html (not the new-tab override) → no browser takeover bar.
  const url = chrome.runtime.getURL('newtab/dashboard.html' + (id ? `?dash=${id}` : ''));
  chrome.tabs.create({ url });
});

// Handle messages from other extension pages (future use)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'OPEN_CONFIG') {
    const tab = msg.tab || 'settings';
    chrome.tabs.create({
      url: chrome.runtime.getURL(`config/config.html${tab === 'dashboards' ? '?tab=dashboards' : ''}`),
    });
    sendResponse({ ok: true });
  }

  // Open an external URL (used by the "View Update" toast button).
  if ((msg.type === 'openUrl' || msg.action === 'openUrl') && msg.url) {
    try { chrome.tabs.create({ url: msg.url }); } catch (_) {}
    sendResponse({ ok: true });
  }

  // Nudge an update check (rate-limited inside checkForUpdate).
  if (msg.type === 'checkForUpdate' || msg.action === 'checkForUpdate') {
    checkForUpdate().finally(() => sendResponse({ ok: true }));
    return true; // async response
  }

  // GitHub Gist backup actions (from the config page).
  if (msg.type === 'gistBackup')  { gistBackupNow().then(sendResponse); return true; }
  if (msg.type === 'gistRestore') { gistRestoreNow().then(sendResponse); return true; }
  if (msg.type === 'gistStatus')  { gistStatus().then(sendResponse); return true; }
  if (msg.type === 'gistTest')    { gistTest(msg.token).then(sendResponse); return true; }
  // A dashboard page just opened — check for a newer backup right away.
  if (msg.type === 'gistAutoPullCheck') { gistReconcile().finally(() => sendResponse({ ok: true })); return true; }

  return true;
});
