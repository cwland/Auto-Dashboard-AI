// Auto Dashboard AI — OPNsense Widget
// ---------------------------------------------------------------------------
// Shows an OPNsense firewall summary: version, CPU usage, memory usage, and
// per-interface traffic (received / transmitted, shown as live rates).
//
//   const w = new OpnsenseWidget(el, { baseUrl, apiKey, apiSecret });
//   w.start();  ...  w.destroy();
//
// Exposed as OpnsenseApi and OpnsenseWidget.
//
// ATTRIBUTION: the diagnostics endpoints (system_information / system_resources
// / traffic/interface / cpu_usage stream), the Basic key:secret auth, and the
// firewall-summary mapping are adapted from the Homarr project's OPNsense
// integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  function b64(str) { return (typeof btoa === 'function') ? btoa(str) : Buffer.from(str, 'utf-8').toString('base64'); }

  const OpnsenseApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeader(apiKey, apiSecret) { return `Basic ${b64(`${apiKey || ''}:${apiSecret || ''}`)}`; },

    // ── pure mappers ────────────────────────────────────────────────────────
    mapVersion(json) { const v = (json && json.versions) || []; return { version: v[0] || 'Unknown' }; },
    mapMemory(json) {
      const m = (json && json.memory) || {};
      const total = parseInt(m.total, 10) || 0;
      const used = Number(m.used) || 0;
      return { total, used, percent: total ? (100 * used) / total : 0 };
    },
    mapInterfaces(json) {
      const ifaces = (json && json.interfaces) || {};
      const out = [];
      for (const key of Object.keys(ifaces)) {
        const i = ifaces[key];
        if (!i) continue;
        out.push({ name: i.name || key, receive: parseInt(i['bytes received'], 10) || 0, transmit: parseInt(i['bytes transmitted'], 10) || 0 });
      }
      return out;
    },
    mapCpu(obj) { return { total: Number(obj && obj.total) || 0 }; },

    async _get(base, path, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}${path}`, { cache: 'no-store', headers: { Authorization: this.authHeader(opts.apiKey, opts.apiSecret) }, signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async getVersion(base, opts, signal) { return this.mapVersion(await this._get(base, '/api/diagnostics/system/system_information', opts, signal)); },
    async getMemory(base, opts, signal) { return this.mapMemory(await this._get(base, '/api/diagnostics/system/system_resources', opts, signal)); },
    async getInterfaces(base, opts, signal) { return this.mapInterfaces(await this._get(base, '/api/diagnostics/traffic/interface', opts, signal)); },

    // CPU is a server-sent-event stream; read a couple of "data:" lines and
    // return the first valid total (mirrors Homarr's reader loop).
    async getCpu(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/diagnostics/cpu_usage/stream`, { cache: 'no-store', headers: { Authorization: this.authHeader(opts.apiKey, opts.apiSecret) }, signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body || !res.body.getReader) return { total: 0 };
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let loops = 0, buffer = '';
      try {
        while (loops < 10) {
          loops++;
          const { done, value } = await reader.read();
          if (done) break;
          buffer += dec.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            if (loops < 2) continue; // skip the first iteration's (baseline) lines
            try { const d = JSON.parse(line.slice(5).trim()); if (typeof d.total === 'number') return { total: d.total }; } catch { /* keep reading */ }
          }
        }
        return { total: 0 };
      } finally { try { await reader.cancel(); } catch { /* ignore */ } }
    },

    async getData(base, opts, session, signal) {
      const [version, memory, interfaces, cpu] = await Promise.all([
        this.getVersion(base, opts, signal),
        this.getMemory(base, opts, signal),
        this.getInterfaces(base, opts, signal),
        this.getCpu(base, opts, signal).catch(() => ({ total: 0 })),
      ]);
      return { version: version.version, cpu, memory, interfaces };
    },
    async testConnection(base, opts, signal) {
      const data = await this._get(base, '/api/diagnostics/system/system_information', opts, signal);
      if (typeof data !== 'object' || data === null) throw new Error('unexpected response');
      return { ok: true };
    },
  };

  function fmtBytes(n) { let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`; }
  function fmtSpeed(n) { return `${fmtBytes(n)}/s`; }
  function fmtPct(n) { return `${Math.round((Number(n) || 0) * 10) / 10}%`; }

  class OpnsenseWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', apiKey: '', apiSecret: '', pollMs: 10000, dataProvider: null }, config || {});
      this.data = null; this._prevIfaces = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(5000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await OpnsenseApi.getData(this.cfg.baseUrl, { apiKey: this.cfg.apiKey, apiSecret: this.cfg.apiSecret }, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    // Convert cumulative interface byte counters into live rates by diffing polls.
    _rates(interfaces) {
      const now = Date.now(), prev = this._prevIfaces;
      const out = (interfaces || []).map((i) => {
        const p = prev && prev[i.name]; let rx = 0, tx = 0, hasRate = false;
        if (p) { const dt = (now - p.t) / 1000; if (dt > 0) { rx = Math.max(0, (i.receive - p.receive) / dt); tx = Math.max(0, (i.transmit - p.transmit) / dt); hasRate = true; } }
        return { name: i.name, rx, tx, hasRate };
      });
      this._prevIfaces = {}; (interfaces || []).forEach((i) => { this._prevIfaces[i.name] = { receive: i.receive, transmit: i.transmit, t: now }; });
      return out;
    }
    _buildSkeleton() {
      this.el.classList.add('opnsense-widget');
      this.el.innerHTML = `<div class="op-header"><img class="wg-icon" src="../icons/integrations/opnsense.svg" alt=""><div class="op-title">OPNsense</div><div class="op-tools"><div class="op-error" style="display:none"></div><span class="op-ver"></span></div></div><div class="op-body"></div>`;
      this.errorEl = this.el.querySelector('.op-error'); this.verEl = this.el.querySelector('.op-ver'); this.body = this.el.querySelector('.op-body');
    }
    _render(d) {
      const data = d || {};
      this.verEl.textContent = data.version || '';
      const mem = data.memory || { used: 0, total: 0, percent: 0 };
      const tiles = [
        ['CPU', fmtPct(data.cpu ? data.cpu.total : 0), 'op-cpu'],
        ['Memory', fmtPct(mem.percent), 'op-mem', `${fmtBytes(mem.used)} / ${fmtBytes(mem.total)}`],
      ];
      const rates = this._rates(data.interfaces);
      const ifaceRows = rates.map((r) => `
        <div class="op-if-row">
          <span class="op-if-name" title="${escapeAttr(r.name)}">${escapeHtml(r.name)}</span>
          <span class="op-if-rate">↓ ${escapeHtml(r.hasRate ? fmtSpeed(r.rx) : '—')}</span>
          <span class="op-if-rate">↑ ${escapeHtml(r.hasRate ? fmtSpeed(r.tx) : '—')}</span>
        </div>`).join('');
      this.body.innerHTML = `<div class="op-grid">${tiles.map((t) => `<div class="op-tile ${t[2] || ''}"><span class="op-val">${escapeHtml(t[1])}</span><span class="op-lbl">${t[0]}</span>${t[3] ? `<span class="op-sub">${escapeHtml(t[3])}</span>` : ''}</div>`).join('')}</div>`
        + (ifaceRows ? `<div class="op-section"><div class="op-sec-head">Interfaces</div>${ifaceRows}</div>` : '');
    }
    _showError(msg) { this.errorEl.style.display = 'block'; this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check API key/secret' : 'OPNsense unavailable'; this.el.classList.add('op-has-error'); }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('op-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.OpnsenseApi = OpnsenseApi;
  global.OpnsenseWidget = OpnsenseWidget;
  OpnsenseWidget._fmtSpeed = fmtSpeed;
})(typeof window !== 'undefined' ? window : this);
