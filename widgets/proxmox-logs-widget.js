// Auto Dashboard AI — Proxmox VE System Logs & Events Widget
// ---------------------------------------------------------------------------
// A tabbed log/event viewer for Proxmox VE, sourced entirely from the PVE REST
// API with an API token (no host/shell access):
//   • Logs    — node syslog/journal lines (/nodes/{node}/syslog)
//   • Backups — vzdump backup tasks (/nodes/{node}/tasks?typefilter=vzdump)
// Toolbar: search (client-side), time range (API `since`), level filter
// (heuristic, logs only), service filter (logs only), plus a manual Refresh.
//
//   const w = new ProxmoxLogsWidget(el, { baseUrl, username, realm, tokenId, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProxmoxLogsApi and ProxmoxLogsWidget. Reuses ProxmoxApi
// (proxmox-widget.js) for the cluster/resources node list.
//
// The Proxmox REST API exposes no structured log priority and no notification
// history, so levels are inferred from message text and there is no
// Notifications tab — by design (REST-only).
'use strict';

(function (global) {
  const ProxmoxLogsApi = {
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

    // Online node names via cluster/resources (reuses ProxmoxApi mapping).
    async _nodes(base, opts, signal) {
      const resources = await this._get(base, '/cluster/resources', opts, signal);   // required
      const mapped = (global.ProxmoxApi && global.ProxmoxApi.mapResources) ? global.ProxmoxApi.mapResources(resources || []) : { nodes: [] };
      return mapped.nodes.filter((n) => n.isRunning).map((n) => n.name);
    },

    // Infer a coarse level (info|warn|error) from a log message.
    inferLevel(text) {
      const s = String(text || '');
      if (/\b(error|err|fail|failed|failure|critical|crit|fatal|panic|segfault|denied|refused|cannot|unable)\b/i.test(s)) return 'error';
      if (/\b(warn|warning|deprecat|degraded|timeout|timed out|retry|retrying)\b/i.test(s)) return 'warn';
      return 'info';
    },

    // Tolerant parse of a syslog/journal text line → { ts, host, unit, pid, message }.
    parseLine(line, fallbackHost) {
      const raw = String(line || '');
      let m = raw.match(/^(\S+T\d{2}:\d{2}:\d{2}\S*)\s+(\S+)\s+(.*)$/);              // ISO ts
      let tsMs = null, host = fallbackHost || '', rest = raw;
      if (m) { const d = new Date(m[1]); if (!isNaN(d)) tsMs = d.getTime(); host = m[2]; rest = m[3]; }
      else {
        m = raw.match(/^([A-Z][a-z]{2}\s+\d+\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+(.*)$/);  // classic syslog ts
        if (m) { const d = new Date(`${m[1]} ${new Date().getFullYear()}`); if (!isNaN(d)) tsMs = d.getTime(); host = m[2]; rest = m[3]; }
      }
      let unit = '', pid = '', message = rest;
      const um = rest.match(/^([A-Za-z0-9_.@:\-]+?)(?:\[(\d+)\])?:\s*(.*)$/);
      if (um) { unit = um[1]; pid = um[2] || ''; message = um[3]; }
      return { ts: tsMs, host, unit, pid, message: message || raw };
    },

    // Logs across all online nodes within the time window. Returns { entries, forbidden }.
    async getLogs(base, opts, { sinceSecs, limit }, signal) {
      const nodes = await this._nodes(base, opts, signal);
      const sinceStr = fmtSince(sinceSecs);
      const lim = limit || 200;
      const out = []; let forbidden = 0, evaluated = 0;
      await Promise.all(nodes.map(async (node) => {
        const r = await this._try(base, `/nodes/${encodeURIComponent(node)}/syslog?limit=${lim}&since=${encodeURIComponent(sinceStr)}`, opts, signal);
        if (!r.ok) { if (r.forbidden) forbidden++; return; }
        evaluated++;
        (r.data || []).forEach((row) => {
          const text = (row && (row.t != null ? row.t : row)) || '';
          if (!String(text).trim()) return;
          const p = this.parseLine(text, node);
          out.push({ ts: p.ts, host: p.host || node, unit: p.unit, pid: p.pid, message: p.message, level: this.inferLevel(p.message), node });
        });
      }));
      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return { entries: out, forbidden: evaluated === 0 && forbidden > 0 };
    },

    // vzdump backup tasks across all online nodes. Returns { entries, forbidden }.
    async getBackups(base, opts, { sinceSecs, limit }, signal) {
      const nodes = await this._nodes(base, opts, signal);
      const lim = limit || 50;
      const out = []; let forbidden = 0, evaluated = 0;
      await Promise.all(nodes.map(async (node) => {
        const r = await this._try(base, `/nodes/${encodeURIComponent(node)}/tasks?typefilter=vzdump&source=all&limit=${lim}&since=${sinceSecs}`, opts, signal);
        if (!r.ok) { if (r.forbidden) forbidden++; return; }
        evaluated++;
        (r.data || []).forEach((t) => {
          const status = !t.endtime ? 'running' : (t.status === 'OK' ? 'ok' : 'failed');
          out.push({ ts: (t.starttime || 0) * 1000, endtime: t.endtime, status, statusText: t.status || '', vmid: t.id || '', user: t.user || '', node: t.node || node, upid: t.upid || '' });
        });
      }));
      out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
      return { entries: out, forbidden: evaluated === 0 && forbidden > 0 };
    },
  };

  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtTime(ms) { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
  function fmtSince(secs) { const d = new Date(Date.now() - (secs || 86400) * 1000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`; }
  function fmtDuration(s) { s = Math.max(0, Math.floor(s)); if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`; return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`; }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  const LEVEL_LABEL = { info: 'INFO', warn: 'WARN', error: 'ERROR' };
  const BK_LABEL = { ok: 'OK', failed: 'Failed', running: 'Running' };

  function logRowHtml(e) {
    return `<div class="pxl-row">
      <span class="pxl-badge pxl-lvl-${e.level}">${LEVEL_LABEL[e.level]}</span>
      <div class="pxl-main">
        <div class="pxl-unit">${escapeHtml(e.unit || '—')}</div>
        <div class="pxl-msg">${escapeHtml(e.message)}</div>
        <div class="pxl-meta">journal${e.pid ? ` · PID: ${escapeHtml(e.pid)}` : ''} · Host: ${escapeHtml(e.host || e.node)}</div>
      </div>
      <span class="pxl-ts">${escapeHtml(fmtTime(e.ts))}</span>
    </div>`;
  }
  function backupRowHtml(e) {
    const dur = e.endtime ? fmtDuration(e.endtime - (e.ts / 1000)) : '';
    const detail = e.status === 'failed' && e.statusText ? ` · ${escapeHtml(e.statusText)}` : '';
    return `<div class="pxl-row">
      <span class="pxl-badge pxl-bk-${e.status}">${BK_LABEL[e.status]}</span>
      <div class="pxl-main">
        <div class="pxl-unit">Backup · ${escapeHtml(e.vmid ? 'VM/CT ' + e.vmid : 'vzdump')}</div>
        <div class="pxl-msg">${escapeHtml(e.user || '')}${dur ? ` · took ${dur}` : (e.status === 'running' ? ' · running…' : '')}${detail}</div>
        <div class="pxl-meta">task · Node: ${escapeHtml(e.node)}</div>
      </div>
      <span class="pxl-ts">${escapeHtml(fmtTime(e.ts))}</span>
    </div>`;
  }
  // A labelled <select> config row, styled to match the carousel config rows.
  function buildSelectRow(label, value, opts, onChange) {
    const row = document.createElement('div'); row.className = 'cfg-row cfg-row-inline';
    const lab = document.createElement('span'); lab.className = 'cfg-label'; lab.textContent = label;
    const sel = document.createElement('select'); sel.className = 'pxl-cfg-select';
    opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
    sel.value = value;
    sel.addEventListener('change', () => onChange(sel.value));
    row.append(lab, sel);
    return row;
  }

  // ── Base: a refreshing, carousel-scrolling list. All options live in the
  // per-widget Configure card (carousel scroll/show/speed, Refresh interval,
  // Days window, plus subclass-specific filters). No on-screen toolbar. ──
  class ProxmoxLogListBase {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        baseUrl: '', username: '', realm: 'pam', tokenId: '', apiKey: '',
        carousel: true, visibleCount: 6, speed: 24, mode: 'continuous', pauseMs: 1000,
        refreshMins: 5, days: 1, level: 'all', service: 'all',
        dataProvider: null, onConfigChange: null,
      }, config || {});
      this.entries = []; this.forbidden = false; this.errorMsg = ''; this.loading = false;
      this.abort = null; this.timer = null; this.destroyed = false;
      this._build();
    }
    _intervalMs() { return Math.max(60000, (parseInt(this.cfg.refreshMins, 10) || 5) * 60000); }
    start() { this.stop(); this.refresh(); this.timer = setInterval(() => this.refresh(), this._intervalMs()); }
    stop() { if (this.timer) { clearInterval(this.timer); this.timer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    _restartTimer() { if (this.timer) { clearInterval(this.timer); this.timer = setInterval(() => this.refresh(), this._intervalMs()); } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); this.refresh(); }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) this.carousel.destroy(); if (this.el) this.el.innerHTML = ''; }
    _persist(patch) { if (typeof this.cfg.onConfigChange === 'function') this.cfg.onConfigChange(patch); }

    _build() {
      this.el.classList.add('proxmox-loglist-widget', this.ROOT);
      this.el.innerHTML = `<div class="pxl-header"><img class="wg-icon" src="../icons/integrations/proxmox.svg" alt=""><div class="pxl-title">${escapeHtml(this.TITLE)}</div><div class="pxl-tools"></div></div>`
        + `<div class="pxl-body"><div class="pxl-state" style="display:none"></div><div class="pxl-viewport"><div class="pxl-track"></div></div></div>`;
      this.toolsEl = this.el.querySelector('.pxl-tools');
      this.stateEl = this.el.querySelector('.pxl-state');
      this.viewport = this.el.querySelector('.pxl-viewport');
      this.track = this.el.querySelector('.pxl-track');
      if (typeof ListCarousel !== 'undefined') {
        this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track, enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed, mode: this.cfg.mode, pauseMs: this.cfg.pauseMs });
        ListCarousel.buildControls(this.toolsEl, this.cfg, (patch) => { this.carousel.update(patch); this._persist(patch); });
        this.toolsEl.appendChild(ListCarousel.sliderRow('Refresh', () => this.cfg.refreshMins, 1, 60, 1, (v) => { this.cfg.refreshMins = v; this._restartTimer(); this._persist({ refreshMins: v }); }, (v) => `${v} min`, 'How often to reload the log data.'));
        this.toolsEl.appendChild(ListCarousel.sliderRow('Days', () => this.cfg.days, 1, 7, 1, (v) => { this.cfg.days = v; this._persist({ days: v }); this.refresh(); }, (v) => `${v}d`, 'How many days of history to include.'));
        this._extraControls(this.toolsEl);
      }
    }
    _extraControls() {}      // override
    _afterFetch() {}         // override
    _filter(entries) { return entries; }   // override

    async refresh() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      const signal = this.abort && this.abort.signal;
      this.loading = true; if (!this.entries.length) this._renderRows();
      try {
        const r = this.cfg.dataProvider ? await this.cfg.dataProvider({ days: this.cfg.days }) : await this._fetch(signal);
        this.entries = (r && r.entries) || []; this.forbidden = !!(r && r.forbidden); this.errorMsg = '';
        this._afterFetch(); this.loading = false; this._renderRows();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this.loading = false;
        this.errorMsg = err && /invalid credentials|HTTP\s*401/i.test(err.message) ? 'Check token' : 'Proxmox unavailable';
        this._renderRows();
      }
    }
    _showState(html, isErr) { this.stateEl.style.display = ''; this.stateEl.className = 'pxl-state' + (isErr ? ' pxl-state-err' : ''); this.stateEl.innerHTML = html; this.viewport.style.display = 'none'; }
    _renderRows() {
      if (this.errorMsg) { this._showState(escapeHtml(this.errorMsg), true); return; }
      if (this.forbidden) { this._showState(this.FORBIDDEN_MSG); return; }
      if (this.loading && !this.entries.length) { this._showState('Loading…'); return; }
      const rows = this._filter(this.entries);
      if (!rows.length) { this._showState(this.EMPTY_MSG); return; }
      this.stateEl.style.display = 'none'; this.viewport.style.display = '';
      this.track.innerHTML = rows.slice(0, 500).map((e) => this._rowHtml(e)).join('');
      if (this.carousel) this.carousel.layout();
    }
  }

  // ── System Logs ─────────────────────────────────────────────────────────────
  class ProxmoxLogsWidget extends ProxmoxLogListBase {
    get ROOT() { return 'pxl-syslog'; }
    get TITLE() { return 'System Logs'; }
    get FORBIDDEN_MSG() { return 'Logs unavailable — the API token needs <b>Sys.Audit</b> / <b>Sys.Syslog</b>.'; }
    get EMPTY_MSG() { return 'No log entries.'; }
    _fetch(signal) { return ProxmoxLogsApi.getLogs(this.cfg.baseUrl, this.cfg, { sinceSecs: (this.cfg.days || 1) * 86400, limit: 200 }, signal); }
    _rowHtml(e) { return logRowHtml(e); }
    _filter(entries) {
      return entries.filter((e) => {
        if (this.cfg.level !== 'all' && e.level !== this.cfg.level) return false;
        if (this.cfg.service !== 'all' && (e.unit || '') !== this.cfg.service) return false;
        return true;
      });
    }
    _extraControls(toolsEl) {
      toolsEl.appendChild(ListCarousel.segmentRow('Level', () => this.cfg.level,
        [['all', 'All'], ['error', 'Error'], ['warn', 'Warn'], ['info', 'Info']],
        (v) => { this.cfg.level = v; this._persist({ level: v }); this._renderRows(); },
        'Only show log entries at or above this severity.'));
      this.serviceRow = buildSelectRow('Service', this.cfg.service, [['all', 'All Services']],
        (v) => { this.cfg.service = v; this._persist({ service: v }); this._renderRows(); });
      this.serviceSel = this.serviceRow.querySelector('select');
      toolsEl.appendChild(this.serviceRow);
    }
    _afterFetch() {
      if (!this.serviceSel) return;
      const units = Array.from(new Set(this.entries.map((e) => e.unit).filter(Boolean))).sort();
      const cur = this.cfg.service;
      this.serviceSel.innerHTML = `<option value="all">All Services</option>` + units.map((u) => `<option value="${escapeAttr(u)}">${escapeHtml(u)}</option>`).join('');
      if (units.indexOf(cur) !== -1) this.serviceSel.value = cur; else { this.cfg.service = 'all'; this.serviceSel.value = 'all'; }
    }
  }

  // ── Backup Logs ───────────────────────────────────────────────────────────
  class ProxmoxBackupsWidget extends ProxmoxLogListBase {
    get ROOT() { return 'pxl-backups'; }
    get TITLE() { return 'Backup Logs'; }
    get FORBIDDEN_MSG() { return 'Backups unavailable — the API token needs <b>Sys.Audit</b>.'; }
    get EMPTY_MSG() { return 'No backup activity in this period.'; }
    _fetch(signal) { return ProxmoxLogsApi.getBackups(this.cfg.baseUrl, this.cfg, { sinceSecs: (this.cfg.days || 1) * 86400, limit: 100 }, signal); }
    _rowHtml(e) { return backupRowHtml(e); }
  }

  global.ProxmoxLogsApi = ProxmoxLogsApi;
  global.ProxmoxLogsWidget = ProxmoxLogsWidget;
  global.ProxmoxBackupsWidget = ProxmoxBackupsWidget;
})(typeof window !== 'undefined' ? window : this);
