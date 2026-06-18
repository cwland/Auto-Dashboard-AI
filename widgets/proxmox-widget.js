// Auto Dashboard AI — Proxmox VE Widget
// ---------------------------------------------------------------------------
// Shows a Proxmox cluster summary: nodes (CPU / memory), running vs. total VMs
// and LXC containers, and storage usage.
//
//   const w = new ProxmoxWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProxmoxApi and ProxmoxWidget.
//
// ATTRIBUTION: the cluster/resources mapping (nodes / qemu / lxc / storage) is
// adapted from the Homarr project's Proxmox integration. Homarr is Apache-2.0
// licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
// Modified: Homarr uses the proxmox-api library server-side; here the
// /api2/json/cluster/resources endpoint is called directly with an API token.
'use strict';

(function (global) {
  const ProxmoxApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    // PVE API token header: PVEAPIToken=USER@REALM!TOKENID=SECRET
    authHeader(opts) { return { Authorization: `PVEAPIToken=${opts.username}@${opts.realm}!${opts.tokenId}=${opts.apiKey}` }; },

    mapCompute(r) {
      return {
        id: r.id,
        cpu: { utilization: r.cpu || 0, cores: r.maxcpu || 0 },
        memory: { used: r.mem || 0, total: r.maxmem || 0 },
        storage: { used: r.disk || 0, total: r.maxdisk || 0 },
        isRunning: r.status === 'running' || r.status === 'online',
        name: r.name || '', node: r.node || '', status: r.status || (r.type === 'node' ? 'offline' : 'stopped'),
        uptime: r.uptime || 0,
      };
    },
    // Pure: split cluster resources into nodes / vms / lxcs / storages.
    mapResources(resources) {
      const out = { nodes: [], vms: [], lxcs: [], storages: [] };
      for (const r of (resources || [])) {
        if (r.type === 'node') out.nodes.push(Object.assign({ type: 'node' }, this.mapCompute(r), { name: r.node || '' }));
        else if (r.type === 'qemu') out.vms.push(Object.assign({ type: 'qemu', vmId: r.vmid || 0 }, this.mapCompute(r)));
        else if (r.type === 'lxc') out.lxcs.push(Object.assign({ type: 'lxc', vmId: r.vmid || 0 }, this.mapCompute(r)));
        else if (r.type === 'storage') out.storages.push({ id: r.id, type: 'storage', name: r.storage || '', node: r.node || '', isRunning: r.status === 'available', status: r.status || 'offline', total: r.maxdisk || 0, used: r.disk || 0, isShared: r.shared === 1 });
      }
      return out;
    },

    async getData(base, opts, session, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api2/json/cluster/resources`, { cache: 'no-store', headers: this.authHeader(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return this.mapResources((json && json.data) || []);
    },
    async testConnection(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api2/json/cluster/resources`, { cache: 'no-store', headers: this.authHeader(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json().catch(() => null);
      return { ok: true };
    },
  };

  function fmtBytes(n) { let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`; }
  function fmtPct(n) { return `${Math.round((Number(n) || 0) * 10) / 10}%`; }

  class ProxmoxWidget {
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
          : await ProxmoxApi.getData(this.cfg.baseUrl, this.cfg, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('proxmox-widget');
      this.el.innerHTML = `<div class="px-header"><div class="px-title">Proxmox</div><div class="px-error" style="display:none"></div></div><div class="px-body"></div>`;
      this.errorEl = this.el.querySelector('.px-error'); this.body = this.el.querySelector('.px-body');
    }
    _render(d) {
      const data = d || { nodes: [], vms: [], lxcs: [], storages: [] };
      const vmsRun = data.vms.filter((v) => v.isRunning).length, lxcRun = data.lxcs.filter((v) => v.isRunning).length;
      const tiles = [
        ['Nodes', `${data.nodes.filter((n) => n.isRunning).length}/${data.nodes.length}`],
        ['VMs', `${vmsRun}/${data.vms.length}`],
        ['LXC', `${lxcRun}/${data.lxcs.length}`],
        ['Storage', `${data.storages.length}`],
      ];
      const nodeRows = data.nodes.map((n) => {
        const memPct = n.memory.total ? (n.memory.used / n.memory.total) * 100 : 0;
        return `<div class="px-node">
          <div class="px-node-head"><span class="px-dot ${n.isRunning ? 'px-ok' : 'px-err'}"></span><span class="px-node-name">${escapeHtml(n.name)}</span><span class="px-node-up">${n.isRunning ? 'online' : 'offline'}</span></div>
          <div class="px-metric"><span class="px-metric-lbl">CPU</span><div class="px-bar"><div class="px-bar-fill" style="width:${Math.max(0, Math.min(100, n.cpu.utilization * 100))}%"></div></div><span class="px-metric-val">${fmtPct(n.cpu.utilization * 100)}</span></div>
          <div class="px-metric"><span class="px-metric-lbl">Mem</span><div class="px-bar"><div class="px-bar-fill px-mem" style="width:${Math.max(0, Math.min(100, memPct))}%"></div></div><span class="px-metric-val">${fmtBytes(n.memory.used)}/${fmtBytes(n.memory.total)}</span></div>
        </div>`;
      }).join('');
      const storRows = data.storages.slice(0, 6).map((st) => {
        const pct = st.total ? (st.used / st.total) * 100 : 0;
        return `<div class="px-fs-row"><span class="px-fs-name" title="${escapeAttr(st.name)}">${escapeHtml(st.name)}</span><div class="px-bar"><div class="px-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></div></div><span class="px-fs-pct">${Math.round(pct)}%</span></div>`;
      }).join('');
      this.body.innerHTML = `<div class="px-grid">${tiles.map((t) => `<div class="px-tile"><span class="px-val">${escapeHtml(t[1])}</span><span class="px-lbl">${t[0]}</span></div>`).join('')}</div>`
        + (nodeRows ? `<div class="px-nodes">${nodeRows}</div>` : '')
        + (storRows ? `<div class="px-section"><div class="px-sec-head">Storage</div>${storRows}</div>` : '');
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check token' : 'Proxmox unavailable';
      this.el.classList.add('px-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('px-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.ProxmoxApi = ProxmoxApi;
  global.ProxmoxWidget = ProxmoxWidget;
})(typeof window !== 'undefined' ? window : this);
