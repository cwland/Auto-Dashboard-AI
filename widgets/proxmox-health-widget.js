// Auto Dashboard AI — Proxmox VE System Health Status Widget
// ---------------------------------------------------------------------------
// A cluster-wide health summary for Proxmox VE, sourced entirely from the PVE
// REST API with an API token (no host/shell access). Shows summary tiles
// (Total / Healthy / Warnings / Critical), an overall status pill, an optional
// notice line, and a list of per-check rows.
//
//   const w = new ProxmoxHealthWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProxmoxHealthApi and ProxmoxHealthWidget. Reuses ProxmoxApi
// (proxmox-widget.js) for the cluster/resources mapping.
//
// ATTRIBUTION: the health-check categories and OK/Warning/Critical thresholds
// are adapted (reimplemented in JS against the REST API) from the ProxMenux
// project's host-side health monitor, which is GPLv3. Only the functional
// classification logic/thresholds are reused — no source was copied.
//   https://github.com/MacRimi/ProxMenux
// Checks that require host/shell access in ProxMenux (CPU temperature, dmesg
// I/O errors, failed-login counts) are intentionally omitted — they are not
// available through the Proxmox REST API.
'use strict';

(function (global) {
  // Thresholds (percent), adapted from ProxMenux. Documented for reuse clarity.
  const TH = {
    cpuWarn: 85, cpuCrit: 95,      // CPU utilization %
    memWarn: 85, memCrit: 90,      // RAM utilization %
    swapRatioCrit: 0.20,           // swap used > 20% of total RAM → critical
    storWarn: 85, storCrit: 95,    // filesystem/storage utilization %
  };
  // Core PVE services whose inactivity is treated as critical.
  const CORE_SERVICES = ['pveproxy', 'pvedaemon', 'pvestatd', 'pve-cluster', 'corosync'];

  const RANK = { ok: 0, unavailable: 0, warning: 1, critical: 2 };
  const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

  const ProxmoxHealthApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeader(opts) { return { Authorization: `PVEAPIToken=${opts.username}@${opts.realm}!${opts.tokenId}=${opts.apiKey}` }; },

    // Fetch one API path → json.data. Throws on auth/HTTP errors; a 403 throws an
    // error tagged `.forbidden` so callers can degrade a single check gracefully.
    async _get(base, path, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api2/json${path}`, { cache: 'no-store', headers: this.authHeader(opts), signal });
      if (res.status === 401) throw new Error('invalid credentials');
      if (res.status === 403) { const e = new Error('forbidden'); e.forbidden = true; throw e; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return (json && json.data);
    },

    // Best-effort GET: returns { ok, data } or { ok:false, forbidden } without throwing.
    async _try(base, path, opts, signal) {
      try { return { ok: true, data: await this._get(base, path, opts, signal) }; }
      catch (e) { if (e && e.name === 'AbortError') throw e; return { ok: false, forbidden: !!(e && e.forbidden) }; }
    },

    // Gather raw data from the cluster + per-node endpoints, then build the report.
    async getReport(base, opts, signal) {
      const resources = await this._get(base, '/cluster/resources', opts, signal);   // required
      const mapped = (global.ProxmoxApi && global.ProxmoxApi.mapResources)
        ? global.ProxmoxApi.mapResources(resources || [])
        : { nodes: [], storages: [] };

      // Cluster status (quorum). Optional — standalone nodes have no cluster entry.
      let cluster = null;
      const cs = await this._try(base, '/cluster/status', opts, signal);
      if (cs.ok && Array.isArray(cs.data)) {
        const cl = cs.data.find((e) => e.type === 'cluster');
        if (cl) cluster = { clustered: true, quorate: cl.quorate === 1 || cl.quorate === true };
      }

      // Per online node: status (swap/rootfs) + perms-gated checks, all best-effort.
      const onlineNodes = mapped.nodes.filter((n) => n.isRunning);
      const perNode = {};
      await Promise.all(onlineNodes.map(async (n) => {
        const node = n.name;
        const [status, services, disks, network, apt] = await Promise.all([
          this._try(base, `/nodes/${encodeURIComponent(node)}/status`, opts, signal),
          this._try(base, `/nodes/${encodeURIComponent(node)}/services`, opts, signal),
          this._try(base, `/nodes/${encodeURIComponent(node)}/disks/list`, opts, signal),
          this._try(base, `/nodes/${encodeURIComponent(node)}/network`, opts, signal),
          this._try(base, `/nodes/${encodeURIComponent(node)}/apt/update`, opts, signal),
        ]);
        perNode[node] = { status, services, disks, network, apt };
      }));

      return this.buildReport({ nodes: mapped.nodes, storages: mapped.storages, cluster, perNode });
    },

    // Pure: turn gathered raw data into { overall, summary, checks[], notice }.
    buildReport(raw) {
      const nodes = raw.nodes || [];
      const storages = raw.storages || [];
      const cluster = raw.cluster || null;
      const per = raw.perNode || {};
      const checks = [];
      const pct = (n) => Math.round((Number(n) || 0) * 10) / 10;

      // 1. Nodes online
      if (nodes.length) {
        const online = nodes.filter((n) => n.isRunning).length;
        checks.push({ id: 'nodes', label: 'Nodes Online', status: online < nodes.length ? 'critical' : 'ok', detail: `${online}/${nodes.length} online` });
      }

      // 2. Cluster quorum (only when clustered)
      if (cluster && cluster.clustered) {
        checks.push({ id: 'quorum', label: 'Cluster Quorum', status: cluster.quorate ? 'ok' : 'critical', detail: cluster.quorate ? 'Quorate' : 'Cluster not quorate' });
      }

      // 3. CPU usage (worst online node) — from cluster/resources.
      let cpuMax = -1, cpuNode = '';
      nodes.filter((n) => n.isRunning).forEach((n) => { const u = (n.cpu && n.cpu.utilization || 0) * 100; if (u > cpuMax) { cpuMax = u; cpuNode = n.name; } });
      if (cpuMax >= 0) {
        const st = cpuMax >= TH.cpuCrit ? 'critical' : cpuMax >= TH.cpuWarn ? 'warning' : 'ok';
        checks.push({ id: 'cpu', label: 'CPU Usage', status: st, detail: `${pct(cpuMax)}% max${nodes.length > 1 && cpuNode ? ` (${cpuNode})` : ''}` });
      }

      // 4. Memory & Swap (RAM from resources; swap from node status when available).
      let memMax = -1, memNode = '', memStatus = 'ok', swapStatus = 'ok', swapDetail = '';
      nodes.filter((n) => n.isRunning).forEach((n) => {
        const total = n.memory && n.memory.total || 0;
        const p = total ? (n.memory.used / total) * 100 : 0;
        if (p > memMax) { memMax = p; memNode = n.name; }
        const ns = per[n.name] && per[n.name].status;
        if (ns && ns.ok && ns.data && ns.data.swap && ns.data.swap.total) {
          const ramTotal = (ns.data.memory && ns.data.memory.total) || total;
          const ratio = ramTotal ? (ns.data.swap.used / ramTotal) : 0;
          if (ratio > TH.swapRatioCrit) { swapStatus = 'critical'; swapDetail = `swap ${pct(ratio * 100)}% of RAM`; }
        }
      });
      if (memMax >= 0) {
        memStatus = memMax >= TH.memCrit ? 'critical' : memMax >= TH.memWarn ? 'warning' : 'ok';
        const st = worse(memStatus, swapStatus);
        const detail = `${pct(memMax)}% RAM max${nodes.length > 1 && memNode ? ` (${memNode})` : ''}${swapDetail ? ` · ${swapDetail}` : ''}`;
        checks.push({ id: 'memory', label: 'Memory & Swap', status: st, detail });
      }

      // 5. Storage & Root FS (PVE storages + per-node rootfs).
      let stMax = -1, stName = '';
      storages.forEach((s) => { const p = s.total ? (s.used / s.total) * 100 : 0; if (p > stMax) { stMax = p; stName = s.name; } });
      Object.keys(per).forEach((node) => {
        const ns = per[node].status;
        if (ns && ns.ok && ns.data && ns.data.rootfs && ns.data.rootfs.total) {
          const p = (ns.data.rootfs.used / ns.data.rootfs.total) * 100;
          if (p > stMax) { stMax = p; stName = `${node}:rootfs`; }
        }
      });
      if (stMax >= 0) {
        const st = stMax >= TH.storCrit ? 'critical' : stMax >= TH.storWarn ? 'warning' : 'ok';
        checks.push({ id: 'storage', label: 'Storage & Root FS', status: st, detail: `${pct(stMax)}% max${stName ? ` (${stName})` : ''}` });
      }

      // 6. PVE services (perms). Critical if a core service is not running.
      checks.push(this._aggregateNodeCheck(per, 'services', 'PVE Services', (data) => {
        const down = (data || []).filter((s) => CORE_SERVICES.indexOf(s.name || s.service) !== -1 && s.state && s.state !== 'running');
        if (down.length) return { status: 'critical', detail: `${down.map((d) => d.name || d.service).join(', ')} not running` };
        return { status: 'ok', detail: 'All core services running' };
      }));

      // 7. Disk SMART health (perms). Critical if any disk SMART != PASSED/OK.
      checks.push(this._aggregateNodeCheck(per, 'disks', 'Disk SMART Health', (data) => {
        const bad = (data || []).filter((d) => { const h = String(d.health || '').toUpperCase(); return h && h !== 'PASSED' && h !== 'OK' && h !== 'UNKNOWN'; });
        if (bad.length) return { status: 'critical', detail: `${bad.length} disk(s) failing SMART` };
        return { status: 'ok', detail: `${(data || []).length} disk(s) healthy` };
      }));

      // 8. Network interfaces (perms). Down autostart bridge → critical, others → warning.
      checks.push(this._aggregateNodeCheck(per, 'network', 'Network Interfaces', (data) => {
        const down = (data || []).filter((i) => (i.autostart === 1 || i.autostart === true) && i.active === 0);
        if (!down.length) return { status: 'ok', detail: 'All active' };
        const bridge = down.some((i) => i.type === 'bridge' || /^vmbr/.test(i.iface || ''));
        return { status: bridge ? 'critical' : 'warning', detail: `${down.map((i) => i.iface).join(', ')} down` };
      }));

      // 9. Available updates (perms). Informational — OK status, surfaced in the notice.
      let updTotal = 0, updNodes = 0, updForbidden = 0;
      Object.keys(per).forEach((node) => {
        const u = per[node].apt;
        if (!u) return;
        if (u.ok) { updNodes++; updTotal += (u.data || []).length; }
        else if (u.forbidden) updForbidden++;
      });
      let notice = '';
      if (updNodes > 0) {
        checks.push({ id: 'updates', label: 'Available Updates', status: 'ok', detail: updTotal ? `${updTotal} update(s) available` : 'Up to date' });
        if (updTotal) notice = `${updTotal} update(s) available`;
      } else if (updForbidden > 0 && Object.keys(per).length) {
        checks.push({ id: 'updates', label: 'Available Updates', status: 'unavailable', detail: 'Needs Sys.Modify on the API token' });
      }

      // Roll-up
      const summary = { total: 0, healthy: 0, warnings: 0, critical: 0, unavailable: 0 };
      let overall = 'ok';
      checks.forEach((c) => {
        if (c.status === 'unavailable') { summary.unavailable++; return; }
        summary.total++;
        if (c.status === 'critical') summary.critical++;
        else if (c.status === 'warning') summary.warnings++;
        else summary.healthy++;
        overall = worse(overall, c.status);
      });
      return { overall, summary, checks, notice, generatedAt: Date.now() };
    },

    // Aggregate one perms-gated per-node check across nodes. If every node was
    // forbidden (or none returned data) → 'unavailable'. Otherwise the worst
    // per-node status wins.
    _aggregateNodeCheck(per, key, label, classify) {
      const nodeNames = Object.keys(per);
      let evaluated = 0, forbidden = 0, status = 'ok', detail = '';
      nodeNames.forEach((node) => {
        const r = per[node][key];
        if (!r) return;
        if (r.forbidden) { forbidden++; return; }
        if (!r.ok) return;
        evaluated++;
        const res = classify(r.data);
        if (RANK[res.status] > RANK[status]) { status = res.status; detail = `${res.detail}${nodeNames.length > 1 ? ` (${node})` : ''}`; }
        else if (!detail) detail = res.detail;
      });
      if (evaluated === 0) {
        return { id: key, label, status: 'unavailable', detail: forbidden ? 'Needs Sys.Audit on the API token' : 'No data' };
      }
      return { id: key, label, status, detail };
    },
  };

  // ── Widget ─────────────────────────────────────────────────────────────────
  const STATUS_LABEL = { ok: 'OK', warning: 'Warning', critical: 'Critical', unavailable: 'Unavailable' };
  const ICON = {
    ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9.5 16.5H2.5z"/><path d="M12 10v4"/><path d="M12 17.5v.01"/></svg>',
    critical: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    unavailable: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></svg>',
  };

  class ProxmoxHealthWidget {
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
          : await ProxmoxHealthApi.getReport(this.cfg.baseUrl, this.cfg, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('proxmox-health-widget');
      this.el.innerHTML = `<div class="pxh-header"><img class="wg-icon" src="../icons/integrations/proxmox.svg" alt=""><div class="pxh-title">System Health Status</div><span class="pxh-overall" style="display:none"></span><div class="pxh-error" style="display:none"></div></div><div class="pxh-body"></div>`;
      this.overallEl = this.el.querySelector('.pxh-overall');
      this.errorEl = this.el.querySelector('.pxh-error');
      this.body = this.el.querySelector('.pxh-body');
    }
    _render(report) {
      const r = report || { overall: 'ok', summary: { total: 0, healthy: 0, warnings: 0, critical: 0, unavailable: 0 }, checks: [], notice: '' };
      const s = r.summary || { total: 0, healthy: 0, warnings: 0, critical: 0 };
      // Overall pill
      this.overallEl.style.display = '';
      this.overallEl.className = `pxh-overall pxh-${r.overall || 'ok'}`;
      this.overallEl.textContent = STATUS_LABEL[r.overall] || 'OK';
      // Summary tiles
      const tiles = [
        ['Total Checks', s.total, ''],
        ['Healthy', s.healthy, 'pxh-ok'],
        ['Warnings', s.warnings, 'pxh-warning'],
        ['Critical', s.critical, 'pxh-critical'],
      ];
      const tilesHtml = `<div class="pxh-grid">${tiles.map((t) =>
        `<div class="pxh-tile"><span class="pxh-tile-val ${t[2]}">${t[1]}</span><span class="pxh-tile-lbl">${t[0]}</span></div>`).join('')}</div>`;
      const noticeHtml = r.notice ? `<div class="pxh-notice">${escapeHtml(r.notice)}</div>` : '';
      const rowsHtml = (r.checks || []).map((c) =>
        `<div class="pxh-row pxh-${c.status}">
          <span class="pxh-row-ico">${ICON[c.status] || ICON.ok}</span>
          <span class="pxh-row-main"><span class="pxh-row-label">${escapeHtml(c.label)}</span>${c.detail ? `<span class="pxh-row-detail">${escapeHtml(c.detail)}</span>` : ''}</span>
          <span class="pxh-pill pxh-pill-${c.status}">${STATUS_LABEL[c.status] || ''}</span>
        </div>`).join('');
      this.body.innerHTML = tilesHtml + noticeHtml + (rowsHtml ? `<div class="pxh-rows">${rowsHtml}</div>` : `<div class="pxh-empty">No checks available.</div>`);
    }
    _showError(msg) {
      this.overallEl.style.display = 'none';
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*401/i.test(msg) ? 'Check token' : 'Proxmox unavailable';
      this.el.classList.add('pxh-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pxh-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  global.ProxmoxHealthApi = ProxmoxHealthApi;
  global.ProxmoxHealthWidget = ProxmoxHealthWidget;
})(typeof window !== 'undefined' ? window : this);
