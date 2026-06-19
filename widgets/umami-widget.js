// Auto Dashboard AI — Umami (web analytics) Widget
// ---------------------------------------------------------------------------
// Shows a website's analytics summary from Umami: active visitors right now,
// plus visitors / pageviews / bounce rate / average visit duration for a
// selected time frame.
//
//   const w = new UmamiWidget(el, { baseUrl, apiKey, websiteId, timeFrame: '24h' });
//   w.start();  ...  w.destroy();
//
// Exposed as UmamiApi and UmamiWidget.
//
// ATTRIBUTION: the auth (x-umami-api-key header or /auth/login JWT), the
// time-range presets, and the stats → bounce-rate / avg-duration computation
// are adapted from the Homarr project's Umami integration. Homarr is
// Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const DAY = 86400000, HOUR = 3600000;

  const UmamiApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // Window bounds mirror Umami's "Last N" presets (include the in-progress period).
    computeRange(timeFrame) {
      const now = Date.now();
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
      const sod = startOfDay.getTime();
      switch (timeFrame) {
        case 'today': return { startAt: sod, endAt: sod + DAY - 1 };
        case '7d': return { startAt: sod - 7 * DAY, endAt: sod + DAY - 1 };
        case '30d': return { startAt: sod - 30 * DAY, endAt: sod + DAY - 1 };
        case '24h':
        default: {
          const startHour = new Date(); startHour.setMinutes(0, 0, 0);
          return { startAt: startHour.getTime() - 24 * HOUR, endAt: now };
        }
      }
    },

    // Pure: stats payload → normalized summary numbers.
    buildSummary(stats, active, timeFrame) {
      const s = stats || {};
      const visits = s.visits || 0;
      return {
        active: active || 0,
        visitors: s.visitors || 0,
        pageviews: s.pageviews || 0,
        visits,
        bounceRate: visits > 0 ? Math.round(((s.bounces || 0) / visits) * 100) : 0,
        avgDuration: visits > 0 ? Math.round((s.totaltime || 0) / visits) : 0,
        timeFrame: timeFrame || '24h',
      };
    },

    async authHeaders(base, opts, signal) {
      if (opts.apiKey) return { 'x-umami-api-key': opts.apiKey };
      const res = await fetch(`${this.normalizeBase(base)}/auth/login`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: opts.username || '', password: opts.password || '' }), signal,
      });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (!data || !data.token) throw new Error('login failed');
      return { Authorization: `Bearer ${data.token}` };
    },

    async _json(url, headers, signal) {
      const res = await fetch(url, { cache: 'no-store', headers, signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    async getSummary(base, opts, session, signal) {
      const b = this.normalizeBase(base);
      session = session || {};
      if (!session.headers) session.headers = await this.authHeaders(base, opts, signal);
      const { startAt, endAt } = this.computeRange(opts.timeFrame);
      const id = encodeURIComponent(opts.websiteId || '');
      const [active, stats] = await Promise.all([
        this._json(`${b}/websites/${id}/active`, session.headers, signal).catch(() => ({ visitors: 0 })),
        this._json(`${b}/websites/${id}/stats?startAt=${startAt}&endAt=${endAt}`, session.headers, signal),
      ]);
      // /stats values can be wrapped {value, prev} in newer Umami — unwrap.
      const unwrap = (o) => {
        const out = {};
        for (const k of Object.keys(o || {})) out[k] = (o[k] && typeof o[k] === 'object' && 'value' in o[k]) ? o[k].value : o[k];
        return out;
      };
      return this.buildSummary(unwrap(stats), (active && active.visitors) || 0, opts.timeFrame);
    },

    async testConnection(base, opts, signal) {
      const headers = await this.authHeaders(base, opts, signal);
      await this._json(`${this.normalizeBase(base)}/websites`, headers, signal);
      return { ok: true };
    },
  };

  function fmtDuration(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(s / 60), r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${r}s`;
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString(); }
  const TF_LABEL = { today: 'Today', '24h': 'Last 24h', '7d': 'Last 7 days', '30d': 'Last 30 days' };

  class UmamiWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', apiKey: '', username: '', password: '', websiteId: '', timeFrame: '24h', pollMs: 60000, dataProvider: null }, config || {});
      this.data = null; this.session = {}; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(15000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      if (patch && (patch.baseUrl || patch.apiKey || patch.username || patch.password)) this.session = {};
      if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data);
    }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await UmamiApi.getSummary(this.cfg.baseUrl, this.cfg, this.session, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('umami-widget');
      this.el.innerHTML = `<div class="um-header"><img class="wg-icon" src="../icons/integrations/umami.svg" alt=""><div class="um-title">Umami</div><div class="um-tools"><div class="um-error" style="display:none"></div><span class="um-tf"></span></div></div><div class="um-body"></div>`;
      this.errorEl = this.el.querySelector('.um-error'); this.tfEl = this.el.querySelector('.um-tf'); this.body = this.el.querySelector('.um-body');
    }
    _render(d) {
      const data = d || {};
      this.tfEl.textContent = TF_LABEL[data.timeFrame] || data.timeFrame || '';
      const tiles = [
        ['Active now', fmtNum(data.active), 'um-accent'],
        ['Visitors', fmtNum(data.visitors), ''],
        ['Pageviews', fmtNum(data.pageviews), ''],
        ['Bounce rate', `${data.bounceRate || 0}%`, ''],
        ['Avg. visit', fmtDuration(data.avgDuration), ''],
        ['Visits', fmtNum(data.visits), ''],
      ];
      this.body.innerHTML = `<div class="um-grid">${tiles.map((t) => `<div class="um-tile ${t[2]}"><span class="um-val">${escapeHtml(t[1])}</span><span class="um-lbl">${t[0]}</span></div>`).join('')}</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|login failed|HTTP\s*40[13]/i.test(msg) ? 'Check credentials' : 'Umami unavailable';
      this.el.classList.add('um-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('um-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  global.UmamiApi = UmamiApi;
  global.UmamiWidget = UmamiWidget;
  UmamiWidget._fmtDuration = fmtDuration;
})(typeof window !== 'undefined' ? window : this);
