// Auto Dashboard AI — Nextcloud (notifications) Widget
// ---------------------------------------------------------------------------
// Shows recent notifications from a Nextcloud server (title, message, time).
//
//   const w = new NextcloudWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed as NextcloudApi and NextcloudWidget.
//
// Tip: Nextcloud *calendars* (CalDAV) aren't practical to read directly from a
// browser. Each Nextcloud calendar can be exported as an iCal (.ics) link
// (Calendar app → ⋯ → Copy private link); add that to the iCal widget to show a
// Nextcloud calendar.
//
// ATTRIBUTION: the OCS notifications fetching (/ocs/v2.php/.../notifications
// with Basic auth + the OCS-APIRequest header) and the notification mapping are
// adapted from the Homarr project's Nextcloud integration. Homarr is
// Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  function b64(str) { return (typeof btoa === 'function') ? btoa(str) : Buffer.from(str, 'utf-8').toString('base64'); }

  const NextcloudApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    headers(opts) { return { Authorization: `Basic ${b64(`${opts.username || ''}:${opts.password || ''}`)}`, 'OCS-APIRequest': 'true', Accept: 'application/json' }; },

    // Pure: OCS notifications payload → normalized list.
    mapNotifications(json) {
      const data = (json && json.ocs && json.ocs.data) || [];
      return data.map((n) => ({
        id: String(n.notification_id),
        time: n.datetime ? new Date(n.datetime) : null,
        title: n.subject || n.app || 'Notification',
        body: n.message || '',
        app: n.app || '',
      })).sort((a, b) => (b.time ? b.time.getTime() : 0) - (a.time ? a.time.getTime() : 0));
    },

    async getNotifications(base, opts, signal) {
      const url = `${this.normalizeBase(base)}/ocs/v2.php/apps/notifications/api/v2/notifications?format=json`;
      const res = await fetch(url, { cache: 'no-store', headers: this.headers(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json().catch(() => null);
      const limit = opts.limit || 10;
      return this.mapNotifications(json).slice(0, limit);
    },
    async testConnection(base, opts, signal) {
      const url = `${this.normalizeBase(base)}/ocs/v2.php/apps/notifications/api/v2/notifications?format=json`;
      const res = await fetch(url, { cache: 'no-store', headers: this.headers(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json().catch(() => null);
      return { ok: true };
    },
  };

  function fmtAgo(date) {
    if (!date) return '';
    const m = Math.floor((Date.now() - date.getTime()) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  class NextcloudWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', username: '', password: '', limit: 10, pollMs: 60000, dataProvider: null }, config || {});
      this.items = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(20000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render(); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const items = this.cfg.dataProvider ? await this.cfg.dataProvider() : await NextcloudApi.getNotifications(this.cfg.baseUrl, { username: this.cfg.username, password: this.cfg.password, limit: this.cfg.limit }, this.abort && this.abort.signal);
        this._clearError(); this.items = items || []; this._render();
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('nextcloud-widget');
      this.el.innerHTML = `<div class="nc-header"><img class="wg-icon" src="../icons/integrations/nextcloud.svg" alt=""><div class="nc-title">Nextcloud</div><div class="nc-error" style="display:none"></div></div><div class="nc-body"></div>`;
      this.errorEl = this.el.querySelector('.nc-error'); this.body = this.el.querySelector('.nc-body');
    }
    _render() {
      const items = this.items || [];
      if (!items.length) { this.body.innerHTML = `<div class="nc-empty">No notifications.</div>`; return; }
      this.body.innerHTML = `<div class="nc-list">${items.map((n) => `<div class="nc-row"><div class="nc-row-top"><span class="nc-rtitle" title="${escapeAttr(n.title)}">${escapeHtml(n.title)}</span><span class="nc-time">${escapeHtml(fmtAgo(n.time))}</span></div>${n.body ? `<div class="nc-msg">${escapeHtml(n.body)}</div>` : ''}${n.app ? `<div class="nc-app">${escapeHtml(n.app)}</div>` : ''}</div>`).join('')}</div>`;
    }
    _showError(msg) { this.errorEl.style.display = 'block'; this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check credentials' : 'Nextcloud unavailable'; this.el.classList.add('nc-has-error'); }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('nc-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.NextcloudApi = NextcloudApi;
  global.NextcloudWidget = NextcloudWidget;
  NextcloudWidget._fmtAgo = fmtAgo;
})(typeof window !== 'undefined' ? window : this);
