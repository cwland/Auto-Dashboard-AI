// Auto Dashboard AI — Proxmox VE System Overview Widget
// ---------------------------------------------------------------------------
// A modernized at-a-glance overview of a Proxmox VE cluster, sourced from the
// PVE REST API with an API token (no host/shell access). Three cards:
//   • CPU Usage     — real-time host CPU (cluster-wide, vCPU-weighted)
//   • Memory Usage  — host RAM used + % of total
//   • Active VM & LXC — running count, running/stopped breakdown, VM/LXC totals
// Temperature is intentionally omitted: the Proxmox REST API exposes no sensor
// data (host lm-sensors only).
//
//   const w = new ProxmoxOverviewWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProxmoxOverviewApi and ProxmoxOverviewWidget. Reuses ProxmoxApi
// (proxmox-widget.js) for the cluster/resources mapping.
'use strict';

(function (global) {
  const ProxmoxOverviewApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeader(opts) { return { Authorization: `PVEAPIToken=${opts.username}@${opts.realm}!${opts.tokenId}=${opts.apiKey}` }; },

    async _get(base, path, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api2/json${path}`, { cache: 'no-store', headers: this.authHeader(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json && json.data);
    },

    async getOverview(base, opts, signal) {
      const list = (await this._get(base, '/cluster/resources', opts, signal)) || [];
      const mapped = (global.ProxmoxApi && global.ProxmoxApi.mapResources) ? global.ProxmoxApi.mapResources(list) : { nodes: [] };
      const nodes = mapped.nodes.filter((n) => n.isRunning);

      // Host CPU — vCPU-weighted average across online nodes (fallback: simple avg).
      let cpuNum = 0, cpuDen = 0;
      nodes.forEach((n) => { cpuNum += (n.cpu.utilization || 0) * (n.cpu.cores || 0); cpuDen += (n.cpu.cores || 0); });
      const cpuPct = cpuDen ? (cpuNum / cpuDen) * 100 : (nodes.length ? (nodes.reduce((a, n) => a + (n.cpu.utilization || 0), 0) / nodes.length) * 100 : 0);

      // Host memory.
      const memUsed = nodes.reduce((a, n) => a + (n.memory.used || 0), 0);
      const memTotal = mapped.nodes.reduce((a, n) => a + (n.memory.total || 0), 0);
      const memPct = memTotal ? (memUsed / memTotal) * 100 : 0;

      // Guests (exclude templates).
      const guests = list.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && r.template !== 1);
      const running = guests.filter((g) => g.status === 'running').length;
      const vmCount = guests.filter((g) => g.type === 'qemu').length;
      const lxcCount = guests.filter((g) => g.type === 'lxc').length;

      return { cpuPct, memUsed, memTotal, memPct, running, stopped: guests.length - running, total: guests.length, vmCount, lxcCount };
    },
  };

  function fmtBytes(n) { let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } const s = i === 0 ? String(Math.round(v)) : v.toFixed(1); return `${s} ${u[i]}`; }
  function pct1(n) { return `${(Number(n) || 0).toFixed(1)}%`; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function clamp(p) { return Math.max(0, Math.min(100, Number(p) || 0)); }

  const IC_CPU = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>';
  const IC_MEM = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><path d="M6 7v10M10 7v10M14 7v10M18 7v10"/></svg>';
  const IC_GRID = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/></svg>';

  class ProxmoxOverviewWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', username: '', realm: 'pam', tokenId: '', apiKey: '', pollMs: 30000, dataProvider: null }, config || {});
      this.data = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(10000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await ProxmoxOverviewApi.getOverview(this.cfg.baseUrl, this.cfg, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('proxmox-overview-widget');
      this.el.innerHTML = `<div class="pxo-header"><img class="wg-icon" src="../icons/integrations/proxmox.svg" alt=""><div class="pxo-title">Overview</div><div class="pxo-error" style="display:none"></div></div><div class="pxo-body"></div>`;
      this.errorEl = this.el.querySelector('.pxo-error'); this.body = this.el.querySelector('.pxo-body');
    }
    _render(d) {
      const o = d || { cpuPct: 0, memUsed: 0, memTotal: 0, memPct: 0, running: 0, stopped: 0, total: 0, vmCount: 0, lxcCount: 0 };
      this.body.innerHTML = `<div class="pxo-grid">
        <div class="pxo-card">
          <div class="pxo-card-top"><span class="pxo-card-lbl">CPU Usage</span>${IC_CPU}</div>
          <div class="pxo-card-val">${escapeHtml(pct1(o.cpuPct))}</div>
          <div class="pxo-bar"><div class="pxo-bar-fill" style="width:${clamp(o.cpuPct)}%"></div></div>
          <div class="pxo-card-sub">Real-time usage</div>
        </div>
        <div class="pxo-card">
          <div class="pxo-card-top"><span class="pxo-card-lbl">Memory Usage</span>${IC_MEM}</div>
          <div class="pxo-card-val">${escapeHtml(fmtBytes(o.memUsed))}</div>
          <div class="pxo-bar"><div class="pxo-bar-fill" style="width:${clamp(o.memPct)}%"></div></div>
          <div class="pxo-card-sub"><span class="pxo-c-pct">${escapeHtml(pct1(o.memPct))}</span> of ${escapeHtml(fmtBytes(o.memTotal))}</div>
        </div>
        <div class="pxo-card pxo-card-active">
          <div class="pxo-card-title">${IC_GRID}<span>Active VM &amp; LXC</span></div>
          <div class="pxo-card-val">${o.running}</div>
          <div class="pxo-badges"><span class="pxo-cnt pxo-cnt-run">${o.running} Running</span><span class="pxo-cnt pxo-cnt-stop">${o.stopped} Stopped</span></div>
          <div class="pxo-card-sub">Total: ${o.vmCount} VM${o.vmCount === 1 ? '' : 's'}, ${o.lxcCount} LXC</div>
        </div>
      </div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check token' : 'Proxmox unavailable';
      this.el.classList.add('pxo-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pxo-has-error'); } }
  }

  global.ProxmoxOverviewApi = ProxmoxOverviewApi;
  global.ProxmoxOverviewWidget = ProxmoxOverviewWidget;
})(typeof window !== 'undefined' ? window : this);
