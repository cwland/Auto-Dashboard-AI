// Auto Dashboard AI — ntfy (notifications) Widget
// ---------------------------------------------------------------------------
// Shows recent notifications from an ntfy topic (title, message, time).
//
//   const w = new NtfyWidget(el, { baseUrl, topic, token });
//   w.start();  ...  w.destroy();
//
// Exposed as NtfyApi and NtfyWidget.
//
// ATTRIBUTION: the /{topic}/json?poll=1 fetching, the newline-delimited JSON
// parsing, and the message → notification mapping are adapted from the Homarr
// project's ntfy integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const NtfyApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(token) { return token ? { Authorization: `Bearer ${token}` } : {}; },
    topicUrl(base, topic) { return `${this.normalizeBase(base)}/${encodeURIComponent(topic || '')}/json?poll=1`; },

    // Pure: parse newline-delimited JSON into normalized notifications.
    parseMessages(text) {
      const out = [];
      for (const line of String(text || '').split('\n')) {
        if (!line.length) continue;
        let json;
        try { json = JSON.parse(line); } catch { continue; }
        if (!json || json.event !== 'message') continue; // skip open/keepalive events
        out.push({
          id: json.id,
          time: json.time ? new Date(json.time * 1000) : null,
          title: json.title || json.topic || 'Notification',
          body: json.message || '',
          topic: json.topic,
          tags: Array.isArray(json.tags) ? json.tags : [],
          priority: json.priority,
        });
      }
      return out.sort((a, b) => (b.time ? b.time.getTime() : 0) - (a.time ? a.time.getTime() : 0));
    },

    async getNotifications(base, opts, signal) {
      const res = await fetch(this.topicUrl(base, opts.topic), { cache: 'no-store', headers: this.authHeaders(opts.token), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const limit = opts.limit || 10;
      return this.parseMessages(text).slice(0, limit);
    },
    async testConnection(base, opts, signal) {
      const res = await fetch(this.topicUrl(base, opts.topic), { cache: 'no-store', headers: this.authHeaders(opts.token), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.text();
      return { ok: true };
    },
  };

  function fmtAgo(date) {
    if (!date) return '';
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  class NtfyWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', topic: '', token: '', limit: 10, pollMs: 30000, dataProvider: null }, config || {});
      this.items = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(10000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render(); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const items = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await NtfyApi.getNotifications(this.cfg.baseUrl, { topic: this.cfg.topic, token: this.cfg.token, limit: this.cfg.limit }, this.abort && this.abort.signal);
        this._clearError(); this.items = items || []; this._render();
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('ntfy-widget');
      this.el.innerHTML = `<div class="nt-header"><img class="wg-icon" src="../icons/integrations/ntfy.svg" alt=""><div class="nt-title">ntfy${this.cfg.topic ? ` — ${escapeHtml(this.cfg.topic)}` : ''}</div><div class="nt-error" style="display:none"></div></div><div class="nt-body"></div>`;
      this.errorEl = this.el.querySelector('.nt-error'); this.body = this.el.querySelector('.nt-body');
    }
    _render() {
      const items = this.items || [];
      if (!items.length) { this.body.innerHTML = `<div class="nt-empty">No recent notifications.</div>`; return; }
      this.body.innerHTML = `<div class="nt-list">${items.map((n) => `
        <div class="nt-row">
          <div class="nt-row-top">
            <span class="nt-rtitle" title="${escapeAttr(n.title)}">${escapeHtml(n.title)}</span>
            <span class="nt-time">${escapeHtml(fmtAgo(n.time))}</span>
          </div>
          ${n.body ? `<div class="nt-msg">${escapeHtml(n.body)}</div>` : ''}
        </div>`).join('')}</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid token|HTTP\s*40[13]/i.test(msg) ? 'Check token' : 'ntfy unavailable';
      this.el.classList.add('nt-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('nt-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.NtfyApi = NtfyApi;
  global.NtfyWidget = NtfyWidget;
  NtfyWidget._fmtAgo = fmtAgo;
})(typeof window !== 'undefined' ? window : this);
