// Auto Dashboard AI — Proxmox VE Storage Widget
// ---------------------------------------------------------------------------
// A cluster-wide storage overview for Proxmox VE, sourced entirely from the PVE
// REST API with an API token (no host/shell access):
//   • Summary tiles: Total Storage, Local Used, Remote Used, Physical Disks
//   • Proxmox Storage list: each storage with type badge, active state, usage
// Storages + local/remote usage come from /cluster/resources (always available
// with a basic token). Physical-disk counts come from /nodes/{node}/disks/list
// (needs Sys.Audit) and degrade gracefully — Total Storage then falls back to
// summed storage capacity.
//
//   const w = new ProxmoxStorageWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProxmoxStorageApi and ProxmoxStorageWidget. Reuses ProxmoxApi
// (proxmox-widget.js) for the node list.
'use strict';

(function (global) {
  // Storage backend types treated as remote/shared (everything else is local).
  const REMOTE_TYPES = new Set(['nfs', 'cifs', 'pbs', 'glusterfs', 'iscsi', 'iscsidirect', 'cephfs', 'rbd', 'zfs']);

  const ProxmoxStorageApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeader(opts) { return { Authorization: `PVEAPIToken=${opts.username}@${opts.realm}!${opts.tokenId}=${opts.apiKey}` }; },

    async _get(base, path, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api2/json${path}`, { cache: 'no-store', headers: this.authHeader(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (res.status === 403) { const e = new Error('forbidden'); e.forbidden = true; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json && json.data);
    },
    async _try(base, path, opts, signal) {
      try { return { ok: true, data: await this._get(base, path, opts, signal) }; }
      catch (e) { if (e && e.name === 'AbortError') throw e; return { ok: false, forbidden: !!(e && e.forbidden) }; }
    },

    async getStorage(base, opts, signal) {
      const resources = await this._get(base, '/cluster/resources', opts, signal);   // required
      const list = resources || [];

      // Storages — dedup shared by name, local by node:name.
      const seen = {}; const storages = [];
      list.filter((r) => r.type === 'storage').forEach((r) => {
        const shared = r.shared === 1;
        const key = shared ? `s:${r.storage}` : `n:${r.node}:${r.storage}`;
        if (seen[key]) return; seen[key] = true;
        const total = r.maxdisk || 0, used = r.disk || 0;
        const ptype = r.plugintype || r.storage_type || '';
        const scope = (shared || REMOTE_TYPES.has(String(ptype).toLowerCase())) ? 'remote' : 'local';
        storages.push({ name: r.storage, type: ptype, node: r.node || '', shared, active: r.status === 'available', used, total, avail: Math.max(0, total - used), pct: total ? (used / total) * 100 : 0, scope });
      });
      storages.sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name));

      // Local / remote usage roll-up.
      const local = { used: 0, total: 0 }, remote = { used: 0, total: 0 };
      storages.forEach((s) => { const b = s.scope === 'remote' ? remote : local; b.used += s.used; b.total += s.total; });

      // Physical disks (perms-gated, best-effort across online nodes).
      const mapped = (global.ProxmoxApi && global.ProxmoxApi.mapResources) ? global.ProxmoxApi.mapResources(list) : { nodes: [] };
      const nodes = mapped.nodes.filter((n) => n.isRunning).map((n) => n.name);
      let count = 0, total = 0, healthy = 0, evaluated = 0, forbidden = 0; const byType = {};
      await Promise.all(nodes.map(async (node) => {
        const r = await this._try(base, `/nodes/${encodeURIComponent(node)}/disks/list`, opts, signal);
        if (!r.ok) { if (r.forbidden) forbidden++; return; }
        evaluated++;
        (r.data || []).forEach((d) => {
          count++; total += d.size || 0;
          const t = String(d.type || 'unknown').toLowerCase(); byType[t] = (byType[t] || 0) + 1;
          const h = String(d.health || '').toUpperCase(); if (h === 'PASSED' || h === 'OK') healthy++;
        });
      }));
      const disks = { available: evaluated > 0, forbidden: evaluated === 0 && forbidden > 0, count, total, healthy, byType };

      return { storages, local, remote, disks, totalStorage: disks.available ? total : (local.total + remote.total), totalStorageFromDisks: disks.available };
    },
  };

  function fmtBytes(n) { let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } const s = i === 0 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, ''); return `${s} ${u[i]}`; }
  function fmtPct(n) { return `${(Number(n) || 0).toFixed(2)}%`; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }
  const DB_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/></svg>';
  const TYPE_LABEL = { nvme: 'NVMe', ssd: 'SSD', hdd: 'HDD', usb: 'USB', unknown: 'Other' };
  function diskTypeSummary(byType) {
    return Object.keys(byType).sort((a, b) => byType[b] - byType[a]).map((t) => `${byType[t]} ${TYPE_LABEL[t] || (t.charAt(0).toUpperCase() + t.slice(1))}`).join(' · ');
  }

  class ProxmoxStorageWidget {
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
          : await ProxmoxStorageApi.getStorage(this.cfg.baseUrl, this.cfg, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('proxmox-storage-widget');
      this.el.innerHTML = `<div class="pxs-header"><img class="wg-icon" src="../icons/integrations/proxmox.svg" alt=""><div class="pxs-title">Storage</div><div class="pxs-error" style="display:none"></div></div><div class="pxs-body"></div>`;
      this.errorEl = this.el.querySelector('.pxs-error'); this.body = this.el.querySelector('.pxs-body');
    }
    _render(d) {
      const data = d || { storages: [], local: { used: 0, total: 0 }, remote: { used: 0, total: 0 }, disks: { available: false, count: 0, total: 0, healthy: 0, byType: {} }, totalStorage: 0 };
      const dk = data.disks || { available: false, count: 0, byType: {}, healthy: 0, forbidden: false };
      const localPct = data.local.total ? (data.local.used / data.local.total) * 100 : 0;
      const remotePct = data.remote.total ? (data.remote.used / data.remote.total) * 100 : 0;

      const tiles = `
        <div class="pxs-tile">
          <div class="pxs-tile-top"><span class="pxs-tile-lbl">Total Storage</span>${DB_ICON}</div>
          <div class="pxs-tile-val">${escapeHtml(fmtBytes(data.totalStorage))}</div>
          <div class="pxs-tile-sub">${data.totalStorageFromDisks ? `${dk.count} physical disk${dk.count === 1 ? '' : 's'}` : 'across all storage'}</div>
        </div>
        <div class="pxs-tile">
          <div class="pxs-tile-top"><span class="pxs-tile-lbl">Local Used</span>${DB_ICON}</div>
          <div class="pxs-tile-val">${escapeHtml(fmtBytes(data.local.used))}</div>
          <div class="pxs-tile-sub"><span class="pxs-c-pct">${escapeHtml(fmtPct(localPct))}</span> of <span class="pxs-c-tot">${escapeHtml(fmtBytes(data.local.total))}</span></div>
        </div>
        <div class="pxs-tile">
          <div class="pxs-tile-top"><span class="pxs-tile-lbl">Remote Used</span>${DB_ICON}</div>
          <div class="pxs-tile-val">${escapeHtml(fmtBytes(data.remote.used))}</div>
          <div class="pxs-tile-sub"><span class="pxs-c-pct">${escapeHtml(fmtPct(remotePct))}</span> of <span class="pxs-c-tot">${escapeHtml(fmtBytes(data.remote.total))}</span></div>
        </div>
        <div class="pxs-tile">
          <div class="pxs-tile-top"><span class="pxs-tile-lbl">Physical Disks</span>${DB_ICON}</div>
          <div class="pxs-tile-val">${dk.available ? `${dk.count} disk${dk.count === 1 ? '' : 's'}` : '—'}</div>
          <div class="pxs-tile-sub">${dk.available
            ? `<span class="pxs-c-type">${escapeHtml(diskTypeSummary(dk.byType) || '—')}</span><br><span class="pxs-c-tot">${dk.healthy} healthy</span>`
            : (dk.forbidden ? 'Needs Sys.Audit on the token' : 'Unavailable')}</div>
        </div>`;

      const rows = (data.storages || []).map((st) => {
        const pctClamp = Math.max(0, Math.min(100, st.pct));
        return `<div class="pxs-stor">
          <div class="pxs-stor-head">
            <span class="pxs-stor-ico">${DB_ICON}</span>
            <span class="pxs-stor-name">${escapeHtml(st.name)}</span>
            <span class="pxs-badge">${escapeHtml(st.type || 'storage')}</span>
            <span class="pxs-stor-right"><span class="pxs-state ${st.active ? 'pxs-active' : 'pxs-inactive'}">${st.active ? 'active' : 'inactive'}</span><span class="pxs-stor-pct">${escapeHtml(fmtPct(st.pct))}</span></span>
          </div>
          <div class="pxs-bar"><div class="pxs-bar-fill" style="width:${pctClamp}%"></div></div>
          <div class="pxs-stor-foot">
            <div><span class="pxs-foot-lbl">Total</span><span class="pxs-foot-val">${escapeHtml(fmtBytes(st.total))}</span></div>
            <div><span class="pxs-foot-lbl">Used</span><span class="pxs-foot-val pxs-c-used">${escapeHtml(fmtBytes(st.used))}</span></div>
            <div><span class="pxs-foot-lbl">Available</span><span class="pxs-foot-val pxs-c-avail">${escapeHtml(fmtBytes(st.avail))}</span></div>
          </div>
        </div>`;
      }).join('');

      this.body.innerHTML = `<div class="pxs-grid">${tiles}</div>`
        + `<div class="pxs-section"><div class="pxs-sec-head">${DB_ICON}<span>Proxmox Storage</span></div>`
        + (rows ? `<div class="pxs-stors">${rows}</div>` : `<div class="pxs-empty">No storage configured.</div>`)
        + `</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check token' : 'Proxmox unavailable';
      this.el.classList.add('pxs-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pxs-has-error'); } }
  }

  global.ProxmoxStorageApi = ProxmoxStorageApi;
  global.ProxmoxStorageWidget = ProxmoxStorageWidget;
})(typeof window !== 'undefined' ? window : this);
