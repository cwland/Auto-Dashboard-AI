// Auto Dashboard AI — Proxmox VE VMs & LXCs Overview Widget
// ---------------------------------------------------------------------------
// Cluster-wide inventory of VMs (qemu) and containers (lxc), sourced from the
// PVE REST API with an API token (no host/shell access):
//   • Summary tiles: Total VMs & LXCs (running/stopped), Total CPU (allocated
//     usage), Total Memory (used % of host RAM + allocated RAM vs limits),
//     Total Disk (allocated).
//   • Per-guest cards: status, type, name/ID, uptime (+ LXC IP best-effort),
//     CPU / Memory / Disk usage bars, and cumulative Disk & Network I/O.
// Everything but the LXC IP comes from a single /cluster/resources call. LXC IPs
// come from /nodes/{node}/lxc/{vmid}/interfaces (best-effort; omitted if the
// token lacks permission). VM IPs need a guest agent and are not fetched.
//
//   const w = new ProxmoxGuestsWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProxmoxGuestsApi and ProxmoxGuestsWidget.
'use strict';

(function (global) {
  const ProxmoxGuestsApi = {
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

    async getGuests(base, opts, signal) {
      const list = (await this._get(base, '/cluster/resources', opts, signal)) || [];   // required
      const hostMemTotal = list.filter((r) => r.type === 'node').reduce((a, n) => a + (n.maxmem || 0), 0);

      const guests = list.filter((r) => (r.type === 'qemu' || r.type === 'lxc') && r.template !== 1).map((r) => ({
        vmid: r.vmid || 0, name: r.name || `${r.type === 'qemu' ? 'VM' : 'CT'} ${r.vmid || ''}`.trim(),
        type: r.type, kind: r.type === 'qemu' ? 'VM' : 'LXC',
        running: r.status === 'running', status: r.status || 'stopped',
        cpu: r.cpu || 0, maxcpu: r.maxcpu || 0, mem: r.mem || 0, maxmem: r.maxmem || 0,
        disk: r.disk || 0, maxdisk: r.maxdisk || 0, uptime: r.uptime || 0,
        netin: r.netin || 0, netout: r.netout || 0, diskread: r.diskread || 0, diskwrite: r.diskwrite || 0,
        node: r.node || '', ip: '',
      }));
      guests.sort((a, b) => (Number(b.running) - Number(a.running)) || (a.vmid - b.vmid));

      const runG = guests.filter((g) => g.running);
      const cpuDen = runG.reduce((a, g) => a + (g.maxcpu || 0), 0);
      const cpuNum = runG.reduce((a, g) => a + g.cpu * (g.maxcpu || 0), 0);
      const memUsed = runG.reduce((a, g) => a + g.mem, 0);
      const allocatedRam = guests.reduce((a, g) => a + g.maxmem, 0);
      const diskAllocated = guests.reduce((a, g) => a + g.maxdisk, 0);
      const summary = {
        total: guests.length, running: runG.length, stopped: guests.length - runG.length,
        cpuPct: cpuDen ? (cpuNum / cpuDen) * 100 : 0,
        memUsed, memTotal: hostMemTotal, memPct: hostMemTotal ? (memUsed / hostMemTotal) * 100 : 0,
        allocatedRam, withinLimits: !hostMemTotal || allocatedRam <= hostMemTotal,
        diskAllocated,
      };

      // LXC IPs — best-effort for running containers; silently skipped on 403/none.
      await Promise.all(guests.filter((g) => g.type === 'lxc' && g.running && g.node).map(async (g) => {
        const r = await this._try(base, `/nodes/${encodeURIComponent(g.node)}/lxc/${g.vmid}/interfaces`, opts, signal);
        if (!r.ok || !Array.isArray(r.data)) return;
        const ifc = r.data.find((i) => i.name !== 'lo' && (i.inet || i.address));
        if (ifc) g.ip = String(ifc.inet || ifc.address || '').split('/')[0];
      }));

      return { guests, summary };
    },
  };

  function fmtBytes(n) { let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0; while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; } const s = i === 0 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, ''); return `${s} ${u[i]}`; }
  function fmtPair(used, total) { let t = Number(total) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0; let div = 1; while (t >= 1024 && i < u.length - 1) { t /= 1024; div *= 1024; i++; } return `${((Number(used) || 0) / div).toFixed(1)} / ${t.toFixed(1)} ${u[i]}`; }
  function fmtUptime(s) { s = Math.max(0, Math.floor(s)); if (!s) return ''; const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); const p = []; if (d) p.push(`${d}d`); if (h || d) p.push(`${h}h`); p.push(`${m}m`); return p.join(' '); }
  function pct1(n) { return `${(Number(n) || 0).toFixed(1)}%`; }
  function barClass(p) { return p >= 90 ? 'pxg-hi' : p >= 75 ? 'pxg-mid' : ''; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  const RUN_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const STOP_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
  const ICON_GRID = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/></svg>';

  class ProxmoxGuestsWidget {
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
          : await ProxmoxGuestsApi.getGuests(this.cfg.baseUrl, this.cfg, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('proxmox-guests-widget');
      this.el.innerHTML = `<div class="pxg-header"><img class="wg-icon" src="../icons/integrations/proxmox.svg" alt=""><div class="pxg-title">VMs &amp; LXCs</div><div class="pxg-error" style="display:none"></div></div><div class="pxg-body"></div>`;
      this.errorEl = this.el.querySelector('.pxg-error'); this.body = this.el.querySelector('.pxg-body');
    }
    _metric(label, valueHtml, pct, hasBar) {
      const bar = hasBar ? `<div class="pxg-bar"><div class="pxg-bar-fill ${barClass(pct)}" style="width:${Math.max(0, Math.min(100, pct || 0))}%"></div></div>` : '';
      return `<div class="pxg-metric"><div class="pxg-m-lbl">${label}</div><div class="pxg-m-val">${valueHtml}</div>${bar}</div>`;
    }
    _render(d) {
      const data = d || { guests: [], summary: {} };
      const s = data.summary || {};
      const tiles = `
        <div class="pxg-tile">
          <div class="pxg-tile-top"><span class="pxg-tile-lbl">Total VMs &amp; LXCs</span>${ICON_GRID}</div>
          <div class="pxg-tile-val">${s.total || 0}</div>
          <div class="pxg-tile-badges"><span class="pxg-cnt pxg-cnt-run">${s.running || 0} Running</span><span class="pxg-cnt pxg-cnt-stop">${s.stopped || 0} Stopped</span></div>
          <div class="pxg-tile-sub">Virtual machines configured</div>
        </div>
        <div class="pxg-tile">
          <div class="pxg-tile-top"><span class="pxg-tile-lbl">Total CPU</span>${ICON_GRID}</div>
          <div class="pxg-tile-val">${Math.round(s.cpuPct || 0)}%</div>
          <div class="pxg-tile-sub">Allocated CPU usage</div>
        </div>
        <div class="pxg-tile">
          <div class="pxg-tile-top"><span class="pxg-tile-lbl">Total Memory</span>${ICON_GRID}</div>
          <div class="pxg-tile-val">${escapeHtml(fmtBytes(s.memUsed || 0))}</div>
          <div class="pxg-tile-sub"><span class="pxg-c-pct">${pct1(s.memPct || 0)}</span> of ${escapeHtml(fmtBytes(s.memTotal || 0))}</div>
          <div class="pxg-bar pxg-tile-bar"><div class="pxg-bar-fill ${barClass(s.memPct || 0)}" style="width:${Math.max(0, Math.min(100, s.memPct || 0))}%"></div></div>
          <div class="pxg-tile-row"><div><div class="pxg-tile-val2">${escapeHtml(fmtBytes(s.allocatedRam || 0))}</div><div class="pxg-tile-sub">Allocated RAM</div></div><span class="pxg-limit ${s.withinLimits ? 'pxg-ok' : 'pxg-over'}">${s.withinLimits ? 'Within Limits' : 'Overcommitted'}</span></div>
        </div>
        <div class="pxg-tile">
          <div class="pxg-tile-top"><span class="pxg-tile-lbl">Total Disk</span>${ICON_GRID}</div>
          <div class="pxg-tile-val">${escapeHtml(fmtBytes(s.diskAllocated || 0))}</div>
          <div class="pxg-tile-sub">Allocated disk space</div>
        </div>`;

      const cards = (data.guests || []).map((g) => {
        const cpuPct = g.running ? g.cpu * 100 : 0;
        const memPct = g.maxmem ? (g.mem / g.maxmem) * 100 : 0;
        const diskPct = g.maxdisk ? (g.disk / g.maxdisk) * 100 : 0;
        const right = `${g.ip ? `<span class="pxg-ip">IP: ${escapeHtml(g.ip)}</span>` : ''}${g.running ? `<span class="pxg-uptime">Uptime: ${escapeHtml(fmtUptime(g.uptime))}</span>` : ''}`;
        return `<div class="pxg-guest">
          <div class="pxg-guest-head">
            <span class="pxg-state ${g.running ? 'pxg-running' : 'pxg-stopped'}">${g.running ? RUN_ICON + 'RUNNING' : STOP_ICON + 'STOPPED'}</span>
            <span class="pxg-kind pxg-kind-${g.type}">${g.kind}</span>
            <span class="pxg-name">${escapeHtml(g.name)}</span>
            <span class="pxg-id">ID: ${escapeHtml(g.vmid)}</span>
            <span class="pxg-guest-right">${right}</span>
          </div>
          <div class="pxg-metrics">
            ${this._metric('CPU Usage', pct1(cpuPct), cpuPct, true)}
            ${this._metric('Memory', `<span class="${memPct >= 90 ? 'pxg-c-hi' : ''}">${escapeHtml(fmtPair(g.mem, g.maxmem))}</span>`, memPct, true)}
            ${this._metric('Disk Usage', escapeHtml(fmtPair(g.disk, g.maxdisk)), diskPct, true)}
            ${this._metric('Disk I/O', `<span class="pxg-io-down">↓ ${escapeHtml(fmtBytes(g.diskread))}</span> <span class="pxg-io-up">↑ ${escapeHtml(fmtBytes(g.diskwrite))}</span>`, 0, false)}
            ${this._metric('Network I/O', `<span class="pxg-io-down">↓ ${escapeHtml(fmtBytes(g.netin))}</span> <span class="pxg-io-up">↑ ${escapeHtml(fmtBytes(g.netout))}</span>`, 0, false)}
          </div>
        </div>`;
      }).join('');

      this.body.innerHTML = `<div class="pxg-grid">${tiles}</div>`
        + `<div class="pxg-section"><div class="pxg-sec-head">${ICON_GRID}<span>Virtual Machines &amp; Containers</span></div>`
        + (cards ? `<div class="pxg-guests">${cards}</div>` : `<div class="pxg-empty">No VMs or containers found.</div>`)
        + `</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check token' : 'Proxmox unavailable';
      this.el.classList.add('pxg-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pxg-has-error'); } }
  }

  global.ProxmoxGuestsApi = ProxmoxGuestsApi;
  global.ProxmoxGuestsWidget = ProxmoxGuestsWidget;
})(typeof window !== 'undefined' ? window : this);
