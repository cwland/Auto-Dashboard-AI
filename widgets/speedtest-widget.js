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

    // Speedtest Tracker returns timestamps in UTC as "YYYY-MM-DD HH:MM:SS" with
    // NO timezone designator. `new Date("…T…")` would parse that as LOCAL time,
    // pushing every result into the future for users behind UTC (so "ago" shows
    // "just now" for all of them). Normalize: swap the space for "T" and, when no
    // timezone marker is present, append "Z" so it's parsed as UTC. ISO strings
    // that already carry a "Z" or "+hh:mm" offset are left untouched.
    parseDate(raw) {
      if (!raw) return null;
      let s = String(raw).trim().replace(' ', 'T');
      if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s)) s += 'Z';
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    },
    mapLatest(result) {
      if (!result) return null;
      return {
        id: result.id,
        ping: result.ping != null ? Math.round(result.ping * 10) / 10 : null,
        downloadMbps: this.bitsToMbps(result.download_bits),
        uploadMbps: this.bitsToMbps(result.upload_bits),
        healthy: result.healthy,
        createdAt: this.parseDate(result.created_at),
      };
    },
    // Speedtest Tracker's /api/v1/stats returns the download/upload averages in
    // BYTES per second in `avg` (and bits/second in the optional `avg_bits`) —
    // NOT in Mbps. Convert to Mbps so the averages match the latest-result tiles
    // (which are derived from `download_bits`). Ping `avg` is already in ms.
    statAvgMbps(band) {
      if (!band) return null;
      if (band.avg_bits != null) return this.bitsToMbps(band.avg_bits);
      if (band.avg != null) return this.bitsToMbps(Number(band.avg) * 8);
      return null;
    },
    mapStats(stats) {
      if (!stats) return null;
      const r1 = (n) => (n == null ? null : Math.round(Number(n) * 10) / 10);
      return {
        ping: { avg: r1(stats.ping && stats.ping.avg) },
        download: { avg: this.statAvgMbps(stats.download) },
        upload: { avg: this.statAvgMbps(stats.upload) },
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
    // History: the most recent N results, newest first. Speedtest Tracker pages
    // /api/v1/results with `result_count` + `sort=-created_at` (same params Homarr
    // uses). Returns an array mapped through mapLatest (download/upload in Mbps).
    async getRecentResults(base, opts, signal) {
      const count = Math.max(1, parseInt(opts && opts.count, 10) || 30);
      const res = await this._get(base, `/api/v1/results?result_count=${count}&sort=-created_at`, opts.token, signal);
      if (res.status === 401) throw new Error('invalid token');
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json().catch(() => null);
      const list = (json && json.data) || [];
      return list.map((r) => this.mapLatest(r)).filter(Boolean);
    },
    async testConnection(base, opts, signal) {
      const res = await this._get(base, '/api/v1/results/latest', opts.token, signal);
      if (res.status === 401) throw new Error('invalid token');
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
      return { ok: true };
    },

    // Trigger a new Ookla speed test. POST /api/v1/speedtests/run returns 201 with
    // a *queued* result — the real numbers land in /results/latest once it finishes.
    // The API token must have the "run speedtests" ability, else 403.
    async runTest(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/v1/speedtests/run`, {
        method: 'POST', cache: 'no-store', headers: this.authHeaders((opts || {}).token), signal,
      });
      if (res.status === 401) throw new Error('invalid token');
      if (res.status === 403) throw new Error('token cannot run tests');
      if (res.status === 406) throw new Error('unexpected response');
      if (!res.ok && res.status !== 201) throw new Error(`HTTP ${res.status}`);
      return res.json().catch(() => ({}));
    },

    // Fire a test, then poll /results/latest until a NEW completed result appears
    // (different id from the one before we started, and download present). Resolves
    // with the mapped latest result, or throws on timeout (default ~120s).
    async runTestAndWait(base, opts, signal, onTick) {
      const o = opts || {};
      let beforeId = 0;
      try {
        const cur = await this._get(base, '/api/v1/results/latest', o.token, signal);
        if (cur.ok) { const d = (await cur.json()).data; beforeId = (d && d.id) || 0; }
      } catch (_) { /* fresh install: no prior result */ }
      await this.runTest(base, o, signal);
      const deadline = Date.now() + ((o.timeoutMs) || 120000);
      const wait = (ms) => new Promise((resolve, reject) => {
        const t = setTimeout(resolve, ms);
        if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); }, { once: true });
      });
      while (Date.now() < deadline) {
        await wait(4000);
        if (signal && signal.aborted) throw new Error('aborted');
        if (typeof onTick === 'function') onTick();
        const r = await this._get(base, '/api/v1/results/latest', o.token, signal);
        if (r.ok) {
          const d = (await r.json()).data;
          if (d && d.id !== beforeId && d.download_bits != null) return this.mapLatest(d);
        }
      }
      throw new Error('test timed out');
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
  function escAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  function fmtClock(date) {
    if (!date) return '';
    try { return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return ''; }
  }

  // ── History (list) ──────────────────────────────────────────────────────────
  // A scrollable list of past speed tests, newest first. Follows the same
  // ListCarousel framework + Auto-scroll/Scroll-mode/Show/Speed controls as the
  // app's other list widgets (Tautulli Streams, Stocks, Countdown List, …).
  class SpeedtestHistoryWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        baseUrl: '', token: '', count: 30, pollMs: 5 * 60 * 1000, dataProvider: null,
        carousel: true, visibleCount: 5, speed: 18, mode: undefined, pauseMs: undefined,
        onConfigChange: null,
      }, config || {});
      this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._build();
    }
    _build() {
      this.el.classList.add('speedtest-history-widget');
      this.el.innerHTML =
        '<div class="sth-header"><img class="wg-icon" src="../icons/integrations/speedtest-tracker.png" alt="">' +
          '<div class="sth-title">Speedtest History</div><div class="sth-summary"></div>' +
          '<div class="lc-tools"></div><div class="sth-error" style="display:none"></div></div>' +
        '<div class="sth-body"><div class="sth-empty" style="display:none">No speed tests recorded yet.</div>' +
          '<div class="sth-viewport"><div class="sth-track"></div></div></div>';
      this.summaryEl = this.el.querySelector('.sth-summary');
      this.errorEl = this.el.querySelector('.sth-error');
      this.emptyEl = this.el.querySelector('.sth-empty');
      this.viewport = this.el.querySelector('.sth-viewport');
      this.track = this.el.querySelector('.sth-track');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
      this._initCarousel();
    }
    _initCarousel() {
      if (typeof ListCarousel === 'undefined' || !this.viewport || !this.track) return;
      this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track,
        enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed, mode: this.cfg.mode, pauseMs: this.cfg.pauseMs });
      if (this.lcToolsEl) ListCarousel.buildControls(this.lcToolsEl, this.cfg, (patch) => {
        this.carousel.update(patch);
        if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
      });
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(30000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); this.poll(); }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) this.carousel.destroy(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const list = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await SpeedtestApi.getRecentResults(this.cfg.baseUrl, { token: this.cfg.token, count: this.cfg.count }, this.abort && this.abort.signal);
        if (this.destroyed) return;
        this._clearError(); this._render(list || []);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _render(list) {
      this.summaryEl.textContent = list.length ? `${list.length} tests` : '';
      if (!list.length) {
        this.emptyEl.style.display = ''; this.viewport.style.display = 'none'; this.track.innerHTML = '';
        return;
      }
      this.emptyEl.style.display = 'none'; this.viewport.style.display = '';
      this.track.innerHTML = list.map((r) => {
        const healthy = r.healthy !== false;
        const dotCls = healthy ? 'sth-ok' : 'sth-fail';
        return '<div class="sth-row">' +
          `<span class="sth-dot ${dotCls}" title="${healthy ? 'Healthy' : 'Failed'}"></span>` +
          '<div class="sth-when">' +
            `<span class="sth-ago">${escapeHtml(fmtAgo(r.createdAt))}</span>` +
            `<span class="sth-date">${escapeHtml(fmtClock(r.createdAt))}</span>` +
          '</div>' +
          `<span class="sth-metric sth-down"><span class="sth-arrow">↓</span>${escapeHtml(fmtMbps(r.downloadMbps))}</span>` +
          `<span class="sth-metric sth-up"><span class="sth-arrow">↑</span>${escapeHtml(fmtMbps(r.uploadMbps))}</span>` +
          `<span class="sth-metric sth-ping">${escapeHtml(fmtMs(r.ping))}</span>` +
        '</div>';
      }).join('');
      if (this.carousel) this.carousel.layout();
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid token|HTTP\s*401/i.test(msg) ? 'Invalid token' : 'Speedtest Tracker unavailable';
    }
    _clearError() { if (this.errorEl.style.display !== 'none') this.errorEl.style.display = 'none'; }
  }

  global.SpeedtestApi = SpeedtestApi;
  global.SpeedtestWidget = SpeedtestWidget;
  global.SpeedtestHistoryWidget = SpeedtestHistoryWidget;
  SpeedtestWidget._fmtAgo = fmtAgo;
})(typeof window !== 'undefined' ? window : this);
