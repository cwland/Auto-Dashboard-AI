// Auto Dashboard AI — shared update notifier
// Reads the "update available" flag the service worker stores after a GitHub
// version check and, if a newer version is available (and not already dismissed
// for that version), shows a small non-blocking toast. Also keeps any in-page
// version label (#app-version) in sync with the running extension version.
// Safe to load on every surface (popup, config, new tab, dashboard).
'use strict';

(function () {
  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Keep any version label in sync with the actual manifest version.
  function syncVersionLabel() {
    try {
      const ver = chrome.runtime.getManifest().version;
      const el = document.getElementById('app-version');
      if (el && ver) el.textContent = 'v' + ver;
    } catch (_) { /* not in extension context — ignore */ }
  }

  function maybeShowUpdateToast() {
    try {
      // Nudge a check in case the 24h window has elapsed (background rate-limits it).
      chrome.runtime.sendMessage({ action: 'checkForUpdate' }, () => { void chrome.runtime.lastError; });

      chrome.storage.local.get(['adaiUpdate', 'adaiUpdateDismissed'], (d) => {
        if (chrome.runtime.lastError) return;
        const u = d && d.adaiUpdate;
        if (!u || !u.available || !u.version) return;
        if (d.adaiUpdateDismissed === u.version) return; // user dismissed this one
        showUpdateToast(u);
      });
    } catch (_) { /* extension context gone — ignore */ }
  }

  function showUpdateToast(info) {
    if (document.getElementById('adai-update-toast')) return; // already showing

    // Pull theme colors from the page so the toast matches the active theme.
    let cs = null;
    try { cs = getComputedStyle(document.documentElement); } catch (_) {}
    const v = (name, fallback) => {
      const val = cs ? cs.getPropertyValue(name).trim() : '';
      return val || fallback;
    };
    const surface  = v('--bg-card', '#1e1e28');
    const text     = v('--text-primary', '#f5f5fa');
    const subLabel = v('--text-muted', '#9aa0ac');
    const accent1  = v('--accent', '#6d28d9');
    const accent2  = v('--accent-hover', accent1);
    const border   = v('--border', 'rgba(255,255,255,0.12)');
    const onAccent = '#ffffff';

    const toast = document.createElement('div');
    toast.id = 'adai-update-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.style.cssText = `
      position: fixed; top: 16px; right: 16px; z-index: 2147483647;
      width: 270px; max-width: calc(100vw - 32px);
      background: ${surface}; color: ${text};
      border: 1px solid ${border}; border-radius: 14px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.28), 0 0 0 1px rgba(255,255,255,0.05);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      padding: 13px 14px 14px; overflow: hidden;
      opacity: 0; transform: translateY(-8px);
      transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.3,0.64,1);
    `;

    const notesHTML = info.notes
      ? `<div style="font-size:11.5px;line-height:1.4;color:${subLabel};margin:2px 0 10px;">${escapeHTML(info.notes)}</div>`
      : `<div style="height:8px"></div>`;

    toast.innerHTML = `
      <button id="adai-update-x" aria-label="Dismiss" style="
        position:absolute;top:8px;right:9px;border:none;background:transparent;
        color:${subLabel};font-size:15px;line-height:1;cursor:pointer;padding:2px;">&times;</button>
      <div style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;margin-bottom:3px;">
        <span style="display:inline-flex;width:18px;height:18px;color:${accent1};">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/></svg>
        </span>
        Update Available
      </div>
      <div style="font-size:12px;margin:0 0 2px;">Auto Dashboard AI v${escapeHTML(info.version)} is ready to install</div>
      ${notesHTML}
      <button id="adai-update-view" style="
        width:100%;border:none;border-radius:9px;cursor:pointer;
        background:linear-gradient(135deg, ${accent1} 0%, ${accent2} 100%);
        color:${onAccent};font-family:inherit;font-size:12.5px;font-weight:700;
        padding:8px 10px;">View Update</button>
    `;

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });

    let dismissed = false;
    const remove = () => {
      if (dismissed) return;
      dismissed = true;
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      setTimeout(() => toast.remove(), 240);
    };

    // Auto-dismiss after ~9s unless the user is hovering/interacting.
    let timer = setTimeout(remove, 9000);
    toast.addEventListener('mouseenter', () => clearTimeout(timer));
    toast.addEventListener('mouseleave', () => { timer = setTimeout(remove, 4000); });

    toast.querySelector('#adai-update-view').addEventListener('click', () => {
      const url = info.downloadUrl || 'https://github.com/cwland/Auto-Dashboard-AI/releases';
      try {
        chrome.runtime.sendMessage({ action: 'openUrl', url }, () => { void chrome.runtime.lastError; });
      } catch (_) {
        try { window.open(url, '_blank', 'noopener'); } catch (_) {}
      }
      remove();
    });

    // Explicit close stops this version from nagging again.
    toast.querySelector('#adai-update-x').addEventListener('click', () => {
      try { chrome.storage.local.set({ adaiUpdateDismissed: info.version }); } catch (_) {}
      clearTimeout(timer);
      remove();
    });
  }

  // Expose for manual calls if needed, then auto-run once the DOM is ready.
  window.maybeShowUpdateToast = maybeShowUpdateToast;

  function init() {
    syncVersionLabel();
    maybeShowUpdateToast();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
