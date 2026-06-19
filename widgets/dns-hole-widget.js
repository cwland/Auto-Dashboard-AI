// Auto Dashboard AI — Pi-hole / AdGuard Home Widget (reusable component)
// ---------------------------------------------------------------------------
// Pi-hole and AdGuard Home both expose the same conceptual "DNS hole" summary,
// so a single engine (DnsHoleApi + DnsHoleWidget) with two adapters covers
// both, surfaced as two separate integrations. The widget shows four stats —
// ads blocked today, block %, DNS queries today, domains on the blocklist —
// plus an enabled/disabled status pill.
//
// Framework-free and self-contained:
//   const w = new PiholeWidget(el, { baseUrl, apiKey });
//   const w = new AdguardWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed on window as DnsHoleApi, DnsHoleWidget, PiholeWidget, AdguardWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The Pi-hole (v5 query-auth + v6 session-auth, with version auto-detection)
// and AdGuard Home (Basic-auth /control endpoints) summary fetching and the
// summary computation are adapted from the Homarr project's Pi-hole and
// AdGuard Home integrations; the four-stat layout follows Homarr's DNS-hole
// summary widget as a reference template. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. Modified from the original (TS/React → JS).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  function b64(str) {
    if (typeof btoa === 'function') return btoa(str);
    return Buffer.from(str, 'utf-8').toString('base64'); // Node fallback (tests)
  }

  // ─── API helper (engine) ────────────────────────────────────────────────────
  const DnsHoleApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // ---- AdGuard Home ----------------------------------------------------------
    adguard: {
      authHeader(username, password) { return `Basic ${b64(`${username || ''}:${password || ''}`)}`; },

      // Pure: turn the three AdGuard responses into a normalized summary.
      computeSummary(stats, status, filtering) {
        const s = stats || {};
        const byDays = s.time_units === 'days';
        const last = (arr) => (Array.isArray(arr) && arr.length ? arr[arr.length - 1] : 0);
        const sum = (arr) => (Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0);

        const blocked = byDays ? (last(s.blocked_filtering) || 0) : sum(s.blocked_filtering);
        const total = byDays ? (last(s.dns_queries) || 0) : sum(s.dns_queries);
        const domains = ((filtering && filtering.filters) || [])
          .filter((f) => f.enabled)
          .reduce((acc, f) => acc + (f.rules_count || 0), 0);

        return {
          status: status && status.protection_enabled ? 'enabled' : 'disabled',
          adsBlockedToday: blocked,
          adsBlockedTodayPercentage: total > 0 ? (blocked / total) * 100 : 0,
          domainsBeingBlocked: domains,
          dnsQueriesToday: total,
        };
      },

      async getSummary(base, opts, session, signal) {
        const o = opts || {};
        const b = DnsHoleApi.normalizeBase(base);
        const headers = { Authorization: this.authHeader(o.username, o.password) };
        const get = async (path) => {
          const res = await fetch(`${b}${path}`, { cache: 'no-store', headers, signal });
          if (res.status === 401 || res.status === 403) throw new Error('invalid credentials');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        };
        const [stats, status, filtering] = await Promise.all([
          get('/control/stats'), get('/control/status'), get('/control/filtering/status'),
        ]);
        return this.computeSummary(stats, status, filtering);
      },

      async testConnection(base, opts, signal) {
        const b = DnsHoleApi.normalizeBase(base);
        const res = await fetch(`${b}/control/status`, {
          cache: 'no-store',
          headers: { Authorization: this.authHeader(opts.username, opts.password) },
          signal,
        });
        if (res.status === 401 || res.status === 403) throw new Error('invalid credentials');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (typeof data !== 'object' || data === null) throw new Error('unexpected response');
        return data;
      },
    },

    // ---- Pi-hole (v5 + v6) -----------------------------------------------------
    pihole: {
      // v5 returned 404 on /api/info/version; v6 returns 401. Default to v6.
      async detectVersion(base, signal) {
        try {
          const res = await fetch(`${DnsHoleApi.normalizeBase(base)}/api/info/version`, { cache: 'no-store', signal });
          return res.status === 404 ? 'v5' : 'v6';
        } catch { return 'v6'; }
      },

      mapV5(raw) {
        const r = raw || {};
        return {
          status: r.status === 'enabled' || r.status === 'disabled' ? r.status : undefined,
          adsBlockedToday: r.ads_blocked_today || 0,
          adsBlockedTodayPercentage: r.ads_percentage_today || 0,
          domainsBeingBlocked: r.domains_being_blocked || 0,
          dnsQueriesToday: r.dns_queries_today || 0,
        };
      },

      mapV6(statsSummary, blocking) {
        const q = (statsSummary && statsSummary.queries) || {};
        const g = (statsSummary && statsSummary.gravity) || {};
        const blk = blocking && blocking.blocking;
        return {
          status: blk === 'enabled' || blk === 'disabled' ? blk : undefined,
          adsBlockedToday: q.blocked || 0,
          adsBlockedTodayPercentage: q.percent_blocked || 0,
          domainsBeingBlocked: g.domains_being_blocked || 0,
          dnsQueriesToday: q.total || 0,
        };
      },

      async _getV5(base, apiKey, signal) {
        const b = DnsHoleApi.normalizeBase(base);
        const res = await fetch(`${b}/admin/api.php?summaryRaw&auth=${encodeURIComponent(apiKey || '')}`, {
          cache: 'no-store', signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid API key');
        return this.mapV5(data);
      },

      async _authV6(base, apiKey, signal) {
        const b = DnsHoleApi.normalizeBase(base);
        const res = await fetch(`${b}/api/auth`, {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: apiKey || '' }), signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data || !data.session || !data.session.valid) throw new Error('invalid API key');
        return data.session.sid;
      },

      async _getV6(base, apiKey, session, signal) {
        const b = DnsHoleApi.normalizeBase(base);
        session = session || {};
        const fetchWithSid = async (path) => {
          if (!session.sid) session.sid = await this._authV6(base, apiKey, signal);
          let res = await fetch(`${b}${path}`, { cache: 'no-store', headers: { sid: session.sid }, signal });
          if (res.status === 401) { // session expired → re-auth once
            session.sid = await this._authV6(base, apiKey, signal);
            res = await fetch(`${b}${path}`, { cache: 'no-store', headers: { sid: session.sid }, signal });
          }
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        };
        const [statsSummary, blocking] = await Promise.all([
          fetchWithSid('/api/stats/summary'),
          fetchWithSid('/api/dns/blocking'),
        ]);
        return this.mapV6(statsSummary, blocking);
      },

      async getSummary(base, opts, session, signal) {
        const o = opts || {};
        session = session || {};
        if (!session.version) session.version = await this.detectVersion(base, signal);
        return session.version === 'v5'
          ? this._getV5(base, o.apiKey, signal)
          : this._getV6(base, o.apiKey, session, signal);
      },

      async testConnection(base, opts, signal) {
        const o = opts || {};
        const version = await this.detectVersion(base, signal);
        if (version === 'v5') {
          const b = DnsHoleApi.normalizeBase(base);
          const res = await fetch(`${b}/admin/api.php?status&auth=${encodeURIComponent(o.apiKey || '')}`, { cache: 'no-store', signal });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid API key');
          return { version: 'v5' };
        }
        await this._authV6(base, o.apiKey, signal);
        return { version: 'v6' };
      },
    },

    // ---- service dispatch ------------------------------------------------------
    getSummary(service, base, opts, session, signal) {
      return service === 'adguard'
        ? this.adguard.getSummary(base, opts, session, signal)
        : this.pihole.getSummary(base, opts, session, signal);
    },
    testConnection(service, base, opts, signal) {
      return service === 'adguard'
        ? this.adguard.testConnection(base, opts, signal)
        : this.pihole.testConnection(base, opts, signal);
    },
  };

  // ─── Display ──────────────────────────────────────────────────────────────────
  const STAT_TILES = [
    { key: 'adsBlockedToday', label: 'Ads blocked today', icon: '🛑', cls: 'dh-red', fmt: 'int' },
    { key: 'adsBlockedTodayPercentage', label: 'Blocked %', icon: '％', cls: 'dh-yellow', fmt: 'pct' },
    { key: 'dnsQueriesToday', label: 'DNS queries today', icon: '🔎', cls: 'dh-blue', fmt: 'int' },
    { key: 'domainsBeingBlocked', label: 'Domains on blocklist', icon: '🌐', cls: 'dh-green', fmt: 'int' },
  ];

  function fmtInt(n) { return Number(n || 0).toLocaleString(); }
  function fmtPct(n) {
    const v = Math.max(0, Math.min(100, Number(n) || 0));
    return `${v.toFixed(1)}%`;
  }

  // ─── Widget ─────────────────────────────────────────────────────────────────
  class DnsHoleWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        { service: 'pihole', baseUrl: '', apiKey: '', username: '', password: '', pollMs: 30000, dataProvider: null },
        config || {}
      );
      this.data = null;
      this.session = {}; // holds pi-hole version + sid across polls
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this._buildSkeleton();
    }

    start() {
      this.stop();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), Math.max(10000, this.cfg.pollMs));
    }
    stop() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.abort) { this.abort.abort(); this.abort = null; }
    }
    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      // Auth/url change invalidates any cached session.
      if (patch && (patch.baseUrl || patch.apiKey || patch.username || patch.password)) this.session = {};
      if (this.pollTimer || this.cfg.dataProvider) this.poll();
      else if (this.data) this._render(this.data);
    }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }

    _opts() {
      return this.cfg.service === 'adguard'
        ? { username: this.cfg.username, password: this.cfg.password }
        : { apiKey: this.cfg.apiKey };
    }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider
          ? await this.cfg.dataProvider(this.cfg.service, this._opts())
          : await DnsHoleApi.getSummary(this.cfg.service, this.cfg.baseUrl, this._opts(), this.session, this.abort && this.abort.signal);
        this._clearError();
        this.data = data;
        this._render(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      this.el.classList.add('dns-hole-widget', `dh-${this.cfg.service}`);
      this.el.innerHTML = `
        <div class="dh-header">
          <img class="wg-icon" src="../icons/integrations/${this.cfg.service === 'adguard' ? 'adguard-home' : 'pi-hole'}.svg" alt="">
          <div class="dh-title"></div>
          <div class="dh-tools">
            <div class="dh-error" style="display:none"></div>
            <span class="dh-status" style="display:none"></span>
          </div>
        </div>
        <div class="dh-body"></div>`;
      this.titleEl = this.el.querySelector('.dh-title');
      this.errorEl = this.el.querySelector('.dh-error');
      this.statusEl = this.el.querySelector('.dh-status');
      this.body = this.el.querySelector('.dh-body');
      this.titleEl.textContent = this.cfg.service === 'adguard' ? 'AdGuard Home' : 'Pi-hole';
    }

    _render(data) {
      const d = data || {};
      // status pill
      if (d.status === 'enabled' || d.status === 'disabled') {
        this.statusEl.style.display = '';
        this.statusEl.textContent = d.status === 'enabled' ? 'Blocking on' : 'Blocking off';
        this.statusEl.classList.toggle('dh-status-on', d.status === 'enabled');
        this.statusEl.classList.toggle('dh-status-off', d.status === 'disabled');
      } else {
        this.statusEl.style.display = 'none';
      }

      const tiles = STAT_TILES.map((t) => {
        const raw = d[t.key];
        const val = t.fmt === 'pct' ? fmtPct(raw) : fmtInt(raw);
        return `
          <div class="dh-tile ${t.cls}">
            <span class="dh-tile-icon">${t.icon}</span>
            <span class="dh-tile-value">${val}</span>
            <span class="dh-tile-label">${t.label}</span>
          </div>`;
      }).join('');
      this.body.innerHTML = `<div class="dh-grid">${tiles}</div>`;
    }

    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid (API key|credentials)|HTTP\s*40[13]/i.test(msg)
        ? 'Check credentials' : `${this.cfg.service === 'adguard' ? 'AdGuard' : 'Pi-hole'} unavailable`;
      this.el.classList.add('dh-has-error');
    }
    _clearError() {
      if (this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('dh-has-error');
      }
    }
  }

  function PiholeWidget(container, config) {
    return new DnsHoleWidget(container, Object.assign({ service: 'pihole' }, config || {}));
  }
  function AdguardWidget(container, config) {
    return new DnsHoleWidget(container, Object.assign({ service: 'adguard' }, config || {}));
  }

  global.DnsHoleApi = DnsHoleApi;
  global.DnsHoleWidget = DnsHoleWidget;
  global.PiholeWidget = PiholeWidget;
  global.AdguardWidget = AdguardWidget;
  // Exposed for unit testing.
  DnsHoleWidget._fmtPct = fmtPct;
  DnsHoleWidget._fmtInt = fmtInt;
})(typeof window !== 'undefined' ? window : this);
