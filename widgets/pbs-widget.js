// Auto Dashboard AI — Proxmox Backup Server (PBS) Widget
// ---------------------------------------------------------------------------
// Shows a Proxmox Backup Server summary: node CPU / memory / uptime, plus
// per-datastore usage (used / total with a fill bar).
//
//   const w = new PbsWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as PbsApi and PbsWidget.
//
// ORIGINAL WORK: Proxmox Backup Server is not part of Homarr. This widget is
// written against the documented PBS REST API
// (https://pbs.proxmox.com/docs/api-viewer/). It follows the same structure and
// conventions as the (Apache-2.0, Homarr-derived) Proxmox VE widget in this
// project for consistency. PBS uses API-token auth with a ":" separator between
// the token id and secret (PVE uses "=").
'use strict';

(function (global) {
  const PbsApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    // PBS API token header: PBSAPIToken=USER@REALM!TOKENID:SECRET
    authHeader(opts) { return { Authorization: `PBSAPIToken=${opts.username}@${opts.realm}!${opts.tokenId}:${opts.apiKey}` }; },

    // Pure: node status payload → normalized node summary.
    mapNode(status) {
      const s = status || {};
      const mem = s.memory || {};
      return {
        cpuUtilization: (s.cpu || 0) * 100, // PBS reports cpu as 0..1
        memUsed: mem.used || 0,
        memTotal: mem.total || 0,
        uptime: s.uptime || 0,
      };
    },
    // Pure: datastore-usage payload → normalized datastore list.
    mapDatastores(list) {
      return (list || []).map((d) => ({
        name: d.store,
        used: d.used || 0,
        total: d.total || 0,
        available: d.avail || 0,
        percentage: d.total ? (d.used / d.total) * 100 : 0,
      }));
    },

    async _get(base, path, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}${path}`, { cache: 'no-store', headers: this.authHeader(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json && json.data;
    },
    async getData(base, opts, session, signal) {
      const node = opts.node || 'localhost';
      const [datastores, nodeStatus] = await Promise.all([
        this._get(base, '/api2/json/status/datastore-usage', opts, signal),
        this._get(base, `/api2/json/nodes/${encodeURIComponent(node)}/status`, opts, signal).catch(() => null),
      ]);
      return { node: nodeStatus ? this.mapNode(nodeStatus) : null, datastores: this.mapDatastores(datastores) };
    },
    async testConnection(base, opts, signal) {
      await this._get(base, '/api2/json/status/datastore-usage', opts, signal);
      return { ok: true };
    },
  };

  function fmtBytes(n) { let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`; }
  function fmtPct(n) { return `${Math.round((Number(n) || 0) * 10) / 10}%`; }
  function fmtUptime(sec) { const s = Math.max(0, Math.floor(Number(sec) || 0)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600); return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((s % 3600) / 60)}m`; }

  class PbsWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', username: '', realm: 'pbs', tokenId: '', apiKey: '', node: 'localhost', pollMs: 60000, dataProvider: null }, config || {});
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
          : await PbsApi.getData(this.cfg.baseUrl, this.cfg, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('pbs-widget');
      this.el.innerHTML = `<div class="pbs-header"><img class="wg-icon" src="../icons/integrations/proxmox-backup-server.svg" alt=""><div class="pbs-title">Proxmox Backup</div><div class="pbs-error" style="display:none"></div></div><div class="pbs-body"></div>`;
      this.errorEl = this.el.querySelector('.pbs-error'); this.body = this.el.querySelector('.pbs-body');
    }
    _render(d) {
      const data = d || { node: null, datastores: [] };
      let tilesHtml = '';
      if (data.node) {
        const memPct = data.node.memTotal ? (data.node.memUsed / data.node.memTotal) * 100 : 0;
        const tiles = [
          ['CPU', fmtPct(data.node.cpuUtilization), 'pbs-cpu'],
          ['Memory', fmtPct(memPct), 'pbs-mem', `${fmtBytes(data.node.memUsed)} / ${fmtBytes(data.node.memTotal)}`],
          ['Uptime', fmtUptime(data.node.uptime), '', ''],
        ];
        tilesHtml = `<div class="pbs-grid">${tiles.map((t) => `<div class="pbs-tile ${t[2] || ''}"><span class="pbs-val">${escapeHtml(t[1])}</span><span class="pbs-lbl">${t[0]}</span>${t[3] ? `<span class="pbs-sub">${escapeHtml(t[3])}</span>` : ''}</div>`).join('')}</div>`;
      }
      const ds = data.datastores || [];
      const dsHtml = ds.length
        ? `<div class="pbs-section"><div class="pbs-sec-head">Datastores</div>${ds.map((s) => `
            <div class="pbs-ds-row">
              <span class="pbs-ds-name" title="${escapeAttr(s.name)}">${escapeHtml(s.name)}</span>
              <div class="pbs-bar"><div class="pbs-bar-fill" style="width:${Math.max(0, Math.min(100, s.percentage))}%"></div></div>
              <span class="pbs-ds-meta">${escapeHtml(fmtBytes(s.used))} / ${escapeHtml(fmtBytes(s.total))}</span>
            </div>`).join('')}</div>`
        : `<div class="pbs-empty">No datastores found.</div>`;
      this.body.innerHTML = tilesHtml + dsHtml;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check token' : 'PBS unavailable';
      this.el.classList.add('pbs-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pbs-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.PbsApi = PbsApi;
  global.PbsWidget = PbsWidget;
})(typeof window !== 'undefined' ? window : this);
