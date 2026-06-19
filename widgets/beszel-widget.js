// Auto Dashboard AI — Beszel Widget
// ---------------------------------------------------------------------------
// Shows the systems monitored by Beszel: each host's status with CPU, memory,
// and disk usage, plus uptime.
//
//   const w = new BeszelWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed as BeszelApi and BeszelWidget.
//
// ATTRIBUTION: the PocketBase auth (/api/collections/users/auth-with-password),
// the systems-records fetching, and the system-info field mapping are adapted
// from the Homarr project's Beszel integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const STATUS_META = {
    up: { label: 'Up', color: 'green' },
    down: { label: 'Down', color: 'red' },
    paused: { label: 'Paused', color: 'gray' },
    pending: { label: 'Pending', color: 'yellow' },
  };

  const BeszelApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // Pure: a Beszel system record → display row. `info` uses short keys:
    //   cpu (CPU %), mp (mem %), dp (disk %), u (uptime s), m (cpu model),
    //   c (cores), v (agent version), t (temp °C).
    mapSystem(record) {
      const r = record || {}, info = r.info || {};
      return {
        id: r.id,
        name: r.name || info.h || r.host || 'system',
        host: r.host || '',
        status: r.status || 'pending',
        cpu: info.cpu || 0,
        memPct: info.mp || 0,
        diskPct: info.dp || 0,
        uptime: info.u || 0,
        cpuModel: info.m || '',
        cores: info.c || null,
        temp: info.t == null ? null : info.t,
        agentVersion: info.v || '',
      };
    },
    mapSystems(items) { return (items || []).map((r) => this.mapSystem(r)); },

    async authenticate(base, opts, session, signal) {
      session = session || {};
      if (session.token) return session.token;
      const res = await fetch(`${this.normalizeBase(base)}/api/collections/users/auth-with-password`, {
        method: 'POST', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: opts.username || '', password: opts.password || '' }), signal,
      });
      if (res.status === 400 || res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (!data || !data.token) throw new Error('login failed');
      session.token = data.token;
      return session.token;
    },
    async getData(base, opts, session, signal) {
      session = session || {};
      let token = await this.authenticate(base, opts, session, signal);
      const url = `${this.normalizeBase(base)}/api/collections/systems/records?perPage=500&sort=-updated`;
      let res = await fetch(url, { cache: 'no-store', headers: { Authorization: token }, signal });
      if (res.status === 401) { session.token = null; token = await this.authenticate(base, opts, session, signal); res = await fetch(url, { cache: 'no-store', headers: { Authorization: token }, signal }); }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return this.mapSystems((data && data.items) || []);
    },
    async testConnection(base, opts, signal) {
      await this.authenticate(base, opts, {}, signal);
      return { ok: true };
    },
  };

  function fmtPct(n) { return `${Math.round((Number(n) || 0) * 10) / 10}%`; }
  function fmtUptime(sec) { const s = Math.max(0, Math.floor(Number(sec) || 0)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); if (d > 0) return `${d}d ${h}h`; const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${m}m` : `${m}m`; }

  class BeszelWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', username: '', password: '', pollMs: 30000, dataProvider: null }, config || {});
      this.systems = null; this.session = {}; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(10000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (patch && (patch.baseUrl || patch.username || patch.password)) this.session = {}; if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render(); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const systems = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await BeszelApi.getData(this.cfg.baseUrl, { username: this.cfg.username, password: this.cfg.password }, this.session, this.abort && this.abort.signal);
        this._clearError(); this.systems = systems || []; this._render();
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('beszel-widget');
      this.el.innerHTML = `<div class="bz-header"><img class="wg-icon" src="../icons/integrations/beszel.svg" alt=""><div class="bz-title">Beszel</div><div class="bz-tools"><div class="bz-error" style="display:none"></div><span class="bz-count"></span></div></div><div class="bz-body"></div>`;
      this.errorEl = this.el.querySelector('.bz-error'); this.countEl = this.el.querySelector('.bz-count'); this.body = this.el.querySelector('.bz-body');
    }
    _render() {
      const systems = this.systems || [];
      const up = systems.filter((s) => s.status === 'up').length;
      this.countEl.textContent = systems.length ? `${up}/${systems.length} up` : '';
      this.countEl.classList.toggle('bz-count-warn', systems.length > 0 && up < systems.length);
      if (!systems.length) { this.body.innerHTML = `<div class="bz-empty">No systems monitored.</div>`; return; }
      this.body.innerHTML = `<div class="bz-list">${systems.map((s) => {
        const meta = STATUS_META[s.status] || STATUS_META.pending;
        const metric = (lbl, pct) => `<div class="bz-metric"><div class="bz-bar"><div class="bz-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div><span class="bz-metric-lbl">${lbl} ${fmtPct(pct)}</span></div>`;
        return `<div class="bz-row">
          <div class="bz-row-head"><span class="bz-dot bz-c-${meta.color}"></span><span class="bz-name" title="${escapeAttr(s.name)}">${escapeHtml(s.name)}</span><span class="bz-status bz-c-${meta.color}">${meta.label}</span></div>
          ${s.status === 'up' ? `<div class="bz-metrics">${metric('CPU', s.cpu)}${metric('Mem', s.memPct)}${metric('Disk', s.diskPct)}</div><div class="bz-up">up ${escapeHtml(fmtUptime(s.uptime))}</div>` : ''}
        </div>`;
      }).join('')}</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|login failed|HTTP\s*40[013]/i.test(msg) ? 'Check credentials' : 'Beszel unavailable';
      this.el.classList.add('bz-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('bz-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.BeszelApi = BeszelApi;
  global.BeszelWidget = BeszelWidget;
  BeszelWidget._fmtUptime = fmtUptime;
})(typeof window !== 'undefined' ? window : this);
