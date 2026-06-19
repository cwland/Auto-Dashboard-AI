// Auto Dashboard AI — Speedtest Tracker Widget
// ---------------------------------------------------------------------------
// Shows the latest internet speed test from a Speedtest Tracker instance —
// download, upload, and ping — plus average download/upload/ping over all
// recorded results.
//
//   const w = new SpeedtestWidget(el, { baseUrl, token });
//   w.start();  ...  w.destroy();
//
// Exposed as SpeedtestApi and SpeedtestWidget.
//
// ATTRIBUTION: the /api/v1/results/latest + /api/v1/stats fetching and the
// result/stats mapping are adapted from the Homarr project's Speedtest Tracker
// integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const SpeedtestApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(token) { return { Authorization: `Bearer ${token || ''}`, Accept: 'application/json' }; },
    bitsToMbps(bits) { return bits == null ? null : Math.round((Number(bits) / 1e6) * 10) / 10; },

    mapLatest(result) {
      if (!result) return null;
      return {
        id: result.id,
        ping: result.ping != null ? Math.round(result.ping * 10) / 10 : null,
        downloadMbps: this.bitsToMbps(result.download_bits),
        uploadMbps: this.bitsToMbps(result.upload_bits),
        healthy: result.healthy,
        createdAt: result.created_at ? new Date(String(result.created_at).replace(' ', 'T')) : null,
      };
    },
    mapStats(stats) {
      if (!stats) return null;
      const r1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);
      return {
        ping: { avg: r1(stats.ping && stats.ping.avg) },
        download: { avg: r1(stats.download && stats.download.avg) },
        upload: { avg: r1(stats.upload && stats.upload.avg) },
        total: stats.total_results || 0,
      };
    },

    async _get(base, path, token, signal) {
      return fetch(`${this.normalizeBase(base)}${path}`, { cache: 'no-store', headers: this.authHeaders(token), signal });
    },
    async getData(base, opts, session, signal) {
      const [latestRes, statsRes] = await Promise.all([
        this._get(base, '/api/v1/results/latest', opts.token, signal),
        this._get(base, '/api/v1/stats', opts.token, signal),
      ]);
      if (latestRes.status === 401 || statsRes.status === 401) throw new Error('invalid token');
      const latest = latestRes.status === 404 ? null
        : (latestRes.ok ? this.mapLatest((await latestRes.json()).data) : null);
      const stats = statsRes.ok ? this.mapStats((await statsRes.json()).data) : null;
      return { latest, stats };
    },
    async testConnection(base, opts, signal) {
      const res = await this._get(base, '/api/v1/results/latest', opts.token, signal);
      if (res.status === 401) throw new Error('invalid token');
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      return { ok: true };
    },
  };

  function fmtMbps(n) { return n == null ? '—' : `${n} Mbps`; }
  function fmtMs(n) { return n == null ? '—' : `${n} ms`; }
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

  class SpeedtestWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', token: '', pollMs: 60000, dataProvider: null }, config || {});
      this.data = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(15000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await SpeedtestApi.getData(this.cfg.baseUrl, { token: this.cfg.token }, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('speedtest-widget');
      this.el.innerHTML = `<div class="st-header"><img class="wg-icon" src="../icons/integrations/speedtest-tracker.png" alt=""><div class="st-title">Speedtest</div><div class="st-tools"><div class="st-error" style="display:none"></div><span class="st-ago"></span></div></div><div class="st-body"></div>`;
      this.errorEl = this.el.querySelector('.st-error'); this.agoEl = this.el.querySelector('.st-ago'); this.body = this.el.querySelector('.st-body');
    }
    _render(d) {
      const data = d || {};
      const l = data.latest, s = data.stats;
      if (!l && !s) { this.body.innerHTML = `<div class="st-empty">No speed tests recorded yet.</div>`; this.agoEl.textContent = ''; return; }
      this.agoEl.textContent = l && l.createdAt ? fmtAgo(l.createdAt) : '';
      const tile = (icon, label, val, sub, cls) => `
        <div class="st-tile ${cls}">
          <span class="st-icon">${icon}</span>
          <span class="st-val">${escapeHtml(val)}</span>
          <span class="st-lbl">${label}</span>
          ${sub ? `<span class="st-sub">${escapeHtml(sub)}</span>` : ''}
        </div>`;
      this.body.innerHTML = `
        <div class="st-grid">
          ${tile('↓', 'Download', l ? fmtMbps(l.downloadMbps) : '—', s && s.download.avg != null ? `avg ${fmtMbps(s.download.avg)}` : '', 'st-down')}
          ${tile('↑', 'Upload', l ? fmtMbps(l.uploadMbps) : '—', s && s.upload.avg != null ? `avg ${fmtMbps(s.upload.avg)}` : '', 'st-up')}
          ${tile('⟳', 'Ping', l ? fmtMs(l.ping) : '—', s && s.ping.avg != null ? `avg ${fmtMs(s.ping.avg)}` : '', 'st-ping')}
        </div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid token|HTTP\s*401/i.test(msg) ? 'Invalid token' : 'Speedtest Tracker unavailable';
      this.el.classList.add('st-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('st-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  global.SpeedtestApi = SpeedtestApi;
  global.SpeedtestWidget = SpeedtestWidget;
  SpeedtestWidget._fmtAgo = fmtAgo;
})(typeof window !== 'undefined' ? window : this);
