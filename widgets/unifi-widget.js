// Auto Dashboard AI — UniFi Controller Widget (reusable component)
// ---------------------------------------------------------------------------
// Shows a UniFi network health summary: WWW (internet) status with latency /
// ping / uptime, plus Wi-Fi, LAN, and VPN status with connected user/guest
// counts.
//
// Framework-free and self-contained:
//   const w = new UnifiWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed on window as UnifiApi and UnifiWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The site-health → NetworkControllerSummary mapping (per-subsystem status via
// "every site ok", and numeric aggregation by sum/max across sites) is adapted
// from the Homarr project's UniFi Controller integration. Homarr is Apache-2.0
// licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. Modified from the original: Homarr uses the
// node-unifi library server-side; here login is done directly with fetch
// (UniFi OS + classic controller), which is best-effort in a browser.
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  const UnifiApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // ── pure mapping (faithful port of Homarr's aggregation) ───────────────────
    _getSubsystem(health, name) {
      return (health || []).find((h) => h && h.subsystem === name) || null;
    },
    _statusEnabled(sites, subsystem) {
      // "enabled" only if every site reports the subsystem ok.
      if (!sites.length) return 'disabled';
      const ok = sites.every((site) => {
        const s = this._getSubsystem(site.health, subsystem);
        return s ? s.status === 'ok' : false;
      });
      return ok ? 'enabled' : 'disabled';
    },
    _numeric(sites, subsystem, field, strategy) {
      const values = sites.map((site) => {
        const s = this._getSubsystem(site.health, subsystem);
        const v = s ? Number(s[field]) : 0;
        return isNaN(v) ? 0 : v;
      });
      if (!values.length) return 0;
      if (strategy === 'sum') return values.reduce((a, b) => a + b, 0);
      if (strategy === 'average') return values.reduce((a, b) => a + b, 0) / values.length;
      return Math.max.apply(null, values); // max
    },

    // sites: [{ health: [{subsystem, status, ...}] }]  → NetworkControllerSummary
    mapSites(sites) {
      const s = Array.isArray(sites) ? sites : [];
      return {
        wanStatus: this._statusEnabled(s, 'wan'),
        www: {
          status: this._statusEnabled(s, 'wan'),
          latency: this._numeric(s, 'www', 'latency', 'max'),
          ping: this._numeric(s, 'www', 'speedtest_ping', 'max'),
          uptime: this._numeric(s, 'www', 'uptime', 'max'),
        },
        wifi: {
          status: this._statusEnabled(s, 'wlan'),
          users: this._numeric(s, 'wlan', 'num_user', 'sum'),
          guests: this._numeric(s, 'wlan', 'num_guest', 'sum'),
        },
        lan: {
          status: this._statusEnabled(s, 'lan'),
          users: this._numeric(s, 'lan', 'num_user', 'sum'),
          guests: this._numeric(s, 'lan', 'num_guest', 'sum'),
        },
        vpn: {
          status: this._statusEnabled(s, 'vpn'),
          users: this._numeric(s, 'vpn', 'remote_user_num_active', 'sum'),
        },
      };
    },

    // ── auth + fetch (best-effort; UniFi OS first, then classic) ────────────────
    // Returns { type, csrf }. Relies on the browser sending the session cookie
    // (credentials: 'include') on subsequent requests.
    async login(base, username, password, signal) {
      const b = this.normalizeBase(base);
      const body = JSON.stringify({ username, password });
      // UniFi OS (UDM / UCK Gen2+)
      let res = await fetch(`${b}/api/auth/login`, {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body, signal,
      }).catch(() => null);
      if (res && res.ok) {
        const csrf = res.headers.get('x-csrf-token') || res.headers.get('x-updated-csrf-token') || null;
        return { type: 'unifios', csrf };
      }
      if (res && (res.status === 401 || res.status === 403)) throw new Error('invalid credentials');

      // Classic controller
      res = await fetch(`${b}/api/login`, {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body, signal,
      });
      if (res.status === 401 || res.status === 403) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { type: 'classic', csrf: null };
    },

    healthUrl(base, type, site) {
      const b = this.normalizeBase(base);
      const s = site || 'default';
      return type === 'unifios'
        ? `${b}/proxy/network/api/s/${s}/stat/health`
        : `${b}/api/s/${s}/stat/health`;
    },

    async getNetworkSummary(base, opts, session, signal) {
      const o = opts || {};
      session = session || {};
      if (!session.type) {
        const auth = await this.login(base, o.username, o.password, signal);
        session.type = auth.type;
        session.csrf = auth.csrf;
      }
      const headers = {};
      if (session.csrf) headers['X-CSRF-Token'] = session.csrf;
      let res = await fetch(this.healthUrl(base, session.type, o.site), {
        credentials: 'include', cache: 'no-store', headers, signal,
      });
      if (res.status === 401) { // session expired → re-login once
        const auth = await this.login(base, o.username, o.password, signal);
        session.type = auth.type; session.csrf = auth.csrf;
        const h2 = {}; if (session.csrf) h2['X-CSRF-Token'] = session.csrf;
        res = await fetch(this.healthUrl(base, session.type, o.site), { credentials: 'include', cache: 'no-store', headers: h2, signal });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const data = (json && json.data) || [];
      return this.mapSites([{ health: data }]);
    },

    async testConnection(base, opts, signal) {
      const summary = await this.getNetworkSummary(base, opts, {}, signal);
      return summary;
    },
  };

  // ── display ───────────────────────────────────────────────────────────────────
  function fmtUptime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    if (d > 0) return `${d}d ${h}h`;
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtMs(n) { const v = Number(n) || 0; return `${Math.round(v)} ms`; }

  class UnifiWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        { baseUrl: '', username: '', password: '', site: 'default', pollMs: 30000, dataProvider: null },
        config || {}
      );
      this.data = null;
      this.session = {};
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
      if (patch && (patch.baseUrl || patch.username || patch.password)) this.session = {};
      if (this.pollTimer || this.cfg.dataProvider) this.poll();
      else if (this.data) this._render(this.data);
    }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }

    _opts() { return { username: this.cfg.username, password: this.cfg.password, site: this.cfg.site }; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider
          ? await this.cfg.dataProvider()
          : await UnifiApi.getNetworkSummary(this.cfg.baseUrl, this._opts(), this.session, this.abort && this.abort.signal);
        this._clearError();
        this.data = data;
        this._render(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      this.el.classList.add('unifi-widget');
      this.el.innerHTML = `
        <div class="uf-header">
          <img class="wg-icon" src="../icons/integrations/unifi.png" alt="">
          <div class="uf-title">UniFi — Network</div>
          <div class="uf-tools">
            <div class="uf-error" style="display:none"></div>
            <span class="uf-wan" style="display:none"></span>
          </div>
        </div>
        <div class="uf-body"></div>`;
      this.errorEl = this.el.querySelector('.uf-error');
      this.wanEl = this.el.querySelector('.uf-wan');
      this.body = this.el.querySelector('.uf-body');
    }

    _statusDot(status) {
      return `<span class="uf-dot ${status === 'enabled' ? 'uf-dot-on' : 'uf-dot-off'}"></span>`;
    }

    _render(data) {
      const d = data || {};
      // WAN pill
      if (d.wanStatus === 'enabled' || d.wanStatus === 'disabled') {
        this.wanEl.style.display = '';
        this.wanEl.textContent = d.wanStatus === 'enabled' ? 'WAN up' : 'WAN down';
        this.wanEl.classList.toggle('uf-wan-on', d.wanStatus === 'enabled');
        this.wanEl.classList.toggle('uf-wan-off', d.wanStatus === 'disabled');
      } else {
        this.wanEl.style.display = 'none';
      }

      const www = d.www || {}, wifi = d.wifi || {}, lan = d.lan || {}, vpn = d.vpn || {};
      const card = (icon, label, status, metricsHtml) => `
        <div class="uf-card">
          <div class="uf-card-head">
            <span class="uf-card-icon">${icon}</span>
            <span class="uf-card-label">${label}</span>
            ${this._statusDot(status)}
          </div>
          <div class="uf-card-metrics">${metricsHtml}</div>
        </div>`;
      const metric = (val, lbl) => `<span class="uf-metric"><span class="uf-metric-val">${val}</span><span class="uf-metric-lbl">${lbl}</span></span>`;

      this.body.innerHTML = `
        <div class="uf-grid">
          ${card('🌐', 'Internet', www.status, metric(fmtMs(www.latency), 'latency') + metric(fmtUptime(www.uptime), 'uptime'))}
          ${card('📶', 'Wi-Fi', wifi.status, metric(num(wifi.users), 'users') + metric(num(wifi.guests), 'guests'))}
          ${card('🔌', 'LAN', lan.status, metric(num(lan.users), 'users') + metric(num(lan.guests), 'guests'))}
          ${card('🔒', 'VPN', vpn.status, metric(num(vpn.users), 'users'))}
        </div>`;
    }

    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*40[13]/i.test(msg) ? 'Check credentials' : 'UniFi unavailable';
      this.el.classList.add('uf-has-error');
    }
    _clearError() {
      if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('uf-has-error'); }
    }
  }

  function num(n) { return Number(n || 0).toLocaleString(); }

  global.UnifiApi = UnifiApi;
  global.UnifiWidget = UnifiWidget;
  UnifiWidget._fmtUptime = fmtUptime;
  UnifiWidget._fmtMs = fmtMs;
})(typeof window !== 'undefined' ? window : this);
