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
});

// Open the dashboard on browser startup when the user has opted in.
chrome.runtime.onStartup.addListener(async () => {
  checkForUpdate();

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

  return true;
});
