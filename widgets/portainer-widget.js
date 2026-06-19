// Auto Dashboard AI — Portainer Containers Widget
// ---------------------------------------------------------------------------
// Aggregates Docker containers across every Portainer environment (node) and
// shows, per container: a service icon, name, node, CPU%, memory, uptime, and
// status — plus inline Start / Stop / Restart actions with status-area feedback.
//
//   const w = new PortainerWidget(el, { baseUrl, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as PortainerApi and PortainerWidget.
//
// ATTRIBUTION: container data shape, the CPU/memory threshold colors, the
// container-state set, and the service-icon-from-image approach are modeled on
// the Homarr project's Docker widget. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
// Modified: Homarr talks to the Docker socket via dockerode server-side; here
// the Portainer REST API (/api/endpoints/{id}/docker/...) is called directly
// with an X-API-Key token, and stats/actions run from the browser.
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  const DOCKER_ICON = '../icons/integrations/docker.svg';

  // Container image → local icon slug overrides (where the image basename
  // doesn't match a dashboard-icons slug we ship).
  const ICON_ALIAS = {
    'home-assistant': 'home-assistant', homeassistant: 'home-assistant', hass: 'home-assistant',
    pihole: 'pi-hole', 'pi-hole': 'pi-hole', pihole_v6: 'pi-hole',
    'pms-docker': 'plex', plexinc: 'plex',
    'immich-server': 'immich', 'immich-machine-learning': 'immich',
    prom: 'prometheus', 'prometheus-prometheus': 'prometheus',
    'jellyseerr': 'seerr', overseerr: 'seerr',
    qbittorrentofficial: 'qbittorrent',
  };

  // Derive an icon slug from a container image reference.
  //   ghcr.io/jellyfin/jellyfin:latest -> jellyfin
  //   lscr.io/linuxserver/sonarr       -> sonarr
  function imageSlug(image) {
    let s = String(image || '').split('@')[0];      // drop digest
    s = s.split('/').pop() || '';                    // last path segment
    s = s.split(':')[0].toLowerCase();               // drop tag
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return ICON_ALIAS[s] || s;
  }

  function iconForContainer(c) {
    if (c.iconUrl) return c.iconUrl;
    // Explicit override label wins (Homarr-style): homarr.icon / dashboard.icon.
    const lbl = c.labels && (c.labels['homarr.icon'] || c.labels['dashboard.icon']);
    if (lbl) return /^https?:|^\//.test(lbl) ? lbl : `../icons/integrations/${imageSlug(lbl)}.svg`;
    const slug = imageSlug(c.image);
    return slug ? `../icons/integrations/${slug}.svg` : DOCKER_ICON;
  }

  // ─── Thresholds (mirrors Homarr's packages/docker/src/shared.ts) ──────────
  const C = { green: '#22c55e', yellow: '#eab308', orange: '#f97316', red: '#ef4444' };
  function cpuColor(pct, state) {
    if (pct === 0 && state !== 'running') return C.red;
    if (pct < 40) return C.green;
    if (pct < 60) return C.yellow;
    if (pct < 90) return C.orange;
    return C.red;
  }
  function memColor(bytes, state) {
    const mb = (Number(bytes) || 0) / 1048576;
    if (mb === 0 && state !== 'running') return C.red;
    if (mb < 128) return C.green;
    if (mb < 256) return C.yellow;
    if (mb < 512) return C.orange;
    return C.red;
  }

  // Container state → badge color (Homarr's containerStateColorMap).
  const STATE_COLOR = {
    created: '#06b6d4', running: '#22c55e', paused: '#eab308',
    restarting: '#f97316', exited: '#ef4444', removing: '#ec4899', dead: '#6b7280',
  };

  function fmtBytes(n) {
    let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
  }
  // Pull a friendly uptime out of Docker's Status string ("Up 3 days (healthy)").
  function uptimeFromStatus(state, status) {
    if (state !== 'running') return '—';
    const m = /^Up\s+(.+?)(?:\s*\(.*\))?$/i.exec(String(status || ''));
    return m ? m[1].replace(/\s*ago$/i, '') : 'up';
  }

  // ─── REST API ─────────────────────────────────────────────────────────────
  const PortainerApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    headers(apiKey) { return { 'X-API-Key': apiKey, Accept: 'application/json' }; },

    async getEndpoints(base, apiKey, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/endpoints`, { cache: 'no-store', headers: this.headers(apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid apikey');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.json();
      // Type 1 (Docker), 2 (Agent), 4 (Edge agent) all expose the Docker API.
      return (Array.isArray(arr) ? arr : []).filter((e) => [1, 2, 4].includes(e.Type));
    },

    async listContainers(base, apiKey, endpointId, signal) {
      const url = `${this.normalizeBase(base)}/api/endpoints/${endpointId}/docker/containers/json?all=1`;
      const res = await fetch(url, { cache: 'no-store', headers: this.headers(apiKey), signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    async stats(base, apiKey, endpointId, cid, signal) {
      const url = `${this.normalizeBase(base)}/api/endpoints/${endpointId}/docker/containers/${cid}/stats?stream=false`;
      const res = await fetch(url, { cache: 'no-store', headers: this.headers(apiKey), signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    // Docker stats → { cpu: percent, mem: bytes }.
    computeStats(s) {
      let cpu = 0;
      try {
        const cd = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
        const sd = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
        const cpus = s.cpu_stats.online_cpus
          || (s.cpu_stats.cpu_usage.percpu_usage && s.cpu_stats.cpu_usage.percpu_usage.length) || 1;
        if (sd > 0 && cd > 0) cpu = (cd / sd) * cpus * 100;
      } catch (_) { cpu = 0; }
      let mem = 0;
      try {
        const cache = (s.memory_stats.stats && (s.memory_stats.stats.inactive_file || s.memory_stats.stats.cache)) || 0;
        mem = Math.max(0, (s.memory_stats.usage || 0) - cache);
      } catch (_) { mem = 0; }
      return { cpu: Math.round(cpu * 10) / 10, mem };
    },

    async action(base, apiKey, endpointId, cid, kind, signal) {
      const url = `${this.normalizeBase(base)}/api/endpoints/${endpointId}/docker/containers/${cid}/${kind}`;
      const res = await fetch(url, { method: 'POST', cache: 'no-store', headers: this.headers(apiKey), signal });
      // 204 = success, 304 = already in target state (Docker returns this).
      if (res.status === 401 || res.status === 403) throw new Error('invalid apikey');
      if (!res.ok && res.status !== 304) throw new Error(`HTTP ${res.status}`);
      return true;
    },

    // Aggregate containers across all endpoints, with bounded-concurrency stats.
    async getData(base, apiKey, opts, signal) {
      const conc = (opts && opts.maxConcurrentStats) || 6;
      const endpoints = await this.getEndpoints(base, apiKey, signal);
      const all = [];
      for (const ep of endpoints) {
        let raw = [];
        try { raw = await this.listContainers(base, apiKey, ep.Id, signal); } catch (_) { raw = []; }
        for (const r of raw) {
          if (r.Labels && String(r.Labels['homarr.hide']) === 'true') continue;
          all.push({
            id: r.Id,
            endpointId: ep.Id,
            node: ep.Name || `env ${ep.Id}`,
            name: ((r.Names && r.Names[0]) || '').replace(/^\//, '') || String(r.Id).slice(0, 12),
            image: r.Image,
            state: r.State,
            statusText: r.Status,
            uptime: uptimeFromStatus(r.State, r.Status),
            labels: r.Labels || {},
            cpu: 0, mem: 0,
          });
        }
      }
      // Fetch per-container stats (running only) with a small concurrency pool.
      const running = all.filter((c) => c.state === 'running');
      let idx = 0;
      const worker = async () => {
        while (idx < running.length) {
          const c = running[idx++];
          try { Object.assign(c, this.computeStats(await this.stats(base, apiKey, c.endpointId, c.id, signal))); }
          catch (_) { /* leave zeros */ }
        }
      };
      await Promise.all(Array.from({ length: Math.min(conc, running.length) }, worker));
      return all;
    },

    async testConnection(base, apiKey, signal) {
      const eps = await this.getEndpoints(base, apiKey, signal);
      return { endpoints: eps.length };
    },
  };

  // ─── Action button glyphs (SVG, themed via currentColor) ──────────────────
  const ICON = {
    start: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    stop:  '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>',
    restart: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
  };

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(v) { return esc(v).replace(/"/g, '&quot;'); }

  class PortainerWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        baseUrl: '', apiKey: '', pollMs: 15000, maxConcurrentStats: 6,
        statusFilter: 'all', nodeFilter: 'all', dataProvider: null, onConfigChange: null,
        carousel: true, visibleCount: 5, speed: 20,
      }, config || {});
      this.data = [];
      this.pending = new Map();      // `${endpointId}:${id}` -> { label, target }
      this.activeActions = 0;        // outstanding interactive actions (scroll hold)
      this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
      this._buildTools();
      if (typeof ListCarousel !== 'undefined') {
        this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track, enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed });
        ListCarousel.buildControls(this.lcToolsEl, this.cfg, (patch) => {
          this.carousel.update(patch);
          if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
        });
      }
    }

    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(3000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) {
      const prevPoll = this.cfg.pollMs;
      Object.assign(this.cfg, patch || {});
      if (this.cfg.pollMs !== prevPoll && this.pollTimer) {
        clearInterval(this.pollTimer);
        this.pollTimer = setInterval(() => this.poll(), Math.max(3000, this.cfg.pollMs));
      }
      this._render();
    }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) this.carousel.destroy(); this.el.innerHTML = ''; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider
          ? await this.cfg.dataProvider()
          : await PortainerApi.getData(this.cfg.baseUrl, this.cfg.apiKey, this.cfg, this.abort && this.abort.signal);
        this._clearError();
        this.data = Array.isArray(data) ? data : [];
        this._reconcilePending();
        this._render();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    // Drop transient action labels once the container reached its target state.
    _reconcilePending() {
      for (const [key, p] of Array.from(this.pending.entries())) {
        const c = this.data.find((x) => `${x.endpointId}:${x.id}` === key);
        if (!c) { this.pending.delete(key); continue; }
        const isRunning = c.state === 'running';
        if ((p.target === 'running' && isRunning) || (p.target === 'stopped' && !isRunning)) {
          this.pending.delete(key);
        }
      }
    }

    _nodes() { return Array.from(new Set(this.data.map((c) => c.node))).sort(); }

    _filtered() {
      return this.data.filter((c) => {
        if (this.cfg.nodeFilter !== 'all' && c.node !== this.cfg.nodeFilter) return false;
        if (this.cfg.statusFilter === 'running' && c.state !== 'running') return false;
        if (this.cfg.statusFilter === 'stopped' && c.state === 'running') return false;
        return true;
      }).sort((a, b) => (a.state === 'running' ? 0 : 1) - (b.state === 'running' ? 0 : 1)
        || a.name.localeCompare(b.name));
    }

    // ── config controls (rearrange-mode only via CSS) ──────────────────────
    _buildTools() {
      const tools = this.el.querySelector('.pc-tools');
      if (!tools) return;
      this.toolsEl = tools;

      const sel = (label, value, options, onChange) => {
        const grp = document.createElement('div'); grp.className = 'pc-toolgrp';
        const lab = document.createElement('span'); lab.className = 'pc-tlabel'; lab.textContent = label;
        const s = document.createElement('select'); s.className = 'pc-tsel';
        options.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === value) o.selected = true; s.appendChild(o); });
        s.addEventListener('change', () => onChange(s.value));
        grp.append(lab, s); tools.appendChild(grp);
        return s;
      };
      sel('Status', this.cfg.statusFilter, [['all', 'All'], ['running', 'Running'], ['stopped', 'Stopped']],
        (v) => this._applyConfig({ statusFilter: v }));
      this.nodeSel = sel('Node', this.cfg.nodeFilter, [['all', 'All']], (v) => this._applyConfig({ nodeFilter: v }));

      // Poll-interval stepper (seconds).
      const grp = document.createElement('div'); grp.className = 'pc-toolgrp';
      const lab = document.createElement('span'); lab.className = 'pc-tlabel'; lab.textContent = 'Poll';
      const dec = document.createElement('button'); dec.type = 'button'; dec.className = 'pc-step'; dec.textContent = '−';
      const cnt = document.createElement('span'); cnt.className = 'pc-tcount';
      const inc = document.createElement('button'); inc.type = 'button'; inc.className = 'pc-step'; inc.textContent = '+';
      const draw = () => { cnt.textContent = Math.round(this.cfg.pollMs / 1000) + 's'; };
      dec.addEventListener('click', () => this._applyConfig({ pollMs: Math.max(5, Math.round(this.cfg.pollMs / 1000) - 5) * 1000 }, draw));
      inc.addEventListener('click', () => this._applyConfig({ pollMs: Math.min(300, Math.round(this.cfg.pollMs / 1000) + 5) * 1000 }, draw));
      grp.append(lab, dec, cnt, inc); tools.appendChild(grp); draw();
    }

    _applyConfig(patch, after) {
      this.setConfig(patch);
      if (after) after();
      if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
    }

    _refreshNodeOptions() {
      if (!this.nodeSel) return;
      const want = ['all', ...this._nodes()];
      const have = Array.from(this.nodeSel.options).map((o) => o.value);
      if (want.join('|') === have.join('|')) return;
      const cur = this.cfg.nodeFilter;
      this.nodeSel.innerHTML = '';
      want.forEach((v) => { const o = document.createElement('option'); o.value = v; o.textContent = v === 'all' ? 'All' : v; if (v === cur) o.selected = true; this.nodeSel.appendChild(o); });
    }

    // ── DOM ────────────────────────────────────────────────────────────────
    _buildSkeleton() {
      this.el.classList.add('portainer-widget');
      this.el.innerHTML = `
        <div class="pc-header">
          <img class="wg-icon" src="../icons/integrations/portainer.svg" alt="">
          <div class="pc-title">Portainer</div>
          <div class="pc-summary"></div>
          <div class="pc-tools"></div>
          <div class="lc-tools"></div>
          <div class="pc-error" style="display:none"></div>
        </div>
        <div class="pc-body">
          <div class="pc-empty" style="display:none">Loading…</div>
          <div class="pc-viewport"><div class="pc-track"></div></div>
        </div>`;
      this.summaryEl = this.el.querySelector('.pc-summary');
      this.errorEl = this.el.querySelector('.pc-error');
      this.body = this.el.querySelector('.pc-body');
      this.emptyEl = this.el.querySelector('.pc-empty');
      this.viewport = this.el.querySelector('.pc-viewport');
      this.track = this.el.querySelector('.pc-track');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
      // Event delegation for action buttons (survives re-renders).
      this.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.pc-act');
        if (!btn) return;
        const row = btn.closest('.pc-row');
        if (!row) return;
        this._doAction(row.dataset.ep, row.dataset.cid, btn.dataset.kind);
      });
    }

    _render() {
      this._refreshNodeOptions();
      const rows = this._filtered();
      const running = this.data.filter((c) => c.state === 'running').length;
      if (this.summaryEl) this.summaryEl.textContent = this.data.length ? `${running}/${this.data.length} running` : '';

      if (!rows.length) {
        this.emptyEl.textContent = this.data.length ? 'No containers match the filter' : 'No containers';
        this.emptyEl.style.display = '';
        this.viewport.style.display = 'none';
        this.track.innerHTML = '';
        return;
      }
      this.emptyEl.style.display = 'none';
      this.viewport.style.display = '';
      this.track.innerHTML = rows.map((c) => {
        const key = `${c.endpointId}:${c.id}`;
        const pend = this.pending.get(key);
        const isRunning = c.state === 'running';
        const cpuC = cpuColor(c.cpu, c.state);
        const memC = memColor(c.mem, c.state);
        const stColor = pend ? '#f59e0b' : (STATE_COLOR[c.state] || '#6b7280');
        const stLabel = pend ? pend.label : c.state;
        // Two contextual actions: running -> stop+restart, else start+restart.
        const acts = (isRunning
          ? [['stop', 'Stop'], ['restart', 'Restart']]
          : [['start', 'Start'], ['restart', 'Restart']])
          .map(([k, t]) => `<button class="pc-act pc-act-${k}" data-kind="${k}" title="${t}" aria-label="${t}"${pend ? ' disabled' : ''}>${ICON[k]}</button>`).join('');
        return `<div class="pc-row" data-ep="${escAttr(c.endpointId)}" data-cid="${escAttr(c.id)}">
          <img class="pc-ico" data-fallback="1" src="${escAttr(iconForContainer(c))}" alt="">
          <div class="pc-main">
            <div class="pc-name" title="${escAttr(c.name)}">${esc(c.name)}</div>
            <div class="pc-node" title="${escAttr(c.image)}">${esc(c.node)}</div>
          </div>
          <div class="pc-metric"><span class="pc-mlabel">CPU</span><span class="pc-mval" style="color:${cpuC}">${isRunning ? Math.round(c.cpu) + '%' : '—'}</span></div>
          <div class="pc-metric"><span class="pc-mlabel">MEM</span><span class="pc-mval" style="color:${memC}">${isRunning ? fmtBytes(c.mem) : '—'}</span></div>
          <div class="pc-metric"><span class="pc-mlabel">UP</span><span class="pc-mval pc-up">${esc(c.uptime)}</span></div>
          <span class="pc-status${pend ? ' pc-status-busy' : ''}" style="color:${stColor};border-color:${stColor}">${esc(stLabel)}${pend ? '…' : ''}</span>
          <div class="pc-actions">${acts}</div>
        </div>`;
      }).join('');

      // Icon fallback to the generic Docker icon when a service icon is missing.
      this.track.querySelectorAll('.pc-ico[data-fallback]').forEach((img) => {
        img.onerror = () => { img.onerror = null; img.src = DOCKER_ICON; };
      });
      if (this.carousel) this.carousel.layout();
    }

    // ── actions ────────────────────────────────────────────────────────────
    async _doAction(endpointId, cid, kind) {
      const c = this.data.find((x) => String(x.endpointId) === String(endpointId) && String(x.id) === String(cid));
      if (!c) return;
      const key = `${c.endpointId}:${c.id}`;
      const label = kind === 'start' ? 'Starting' : kind === 'stop' ? 'Stopping' : 'Restarting';
      const target = kind === 'stop' ? 'stopped' : 'running';
      this.pending.set(key, { label, target });
      // Interactive-widget protection: hold scrolling immediately, and keep it
      // held until 5s after the final status update (and the cursor has left).
      this._beginAction();
      this._render();

      // Sample/preview mode (no live backend): simulate the transition.
      if (this.cfg.dataProvider) {
        setTimeout(() => {
          c.state = target === 'running' ? 'running' : 'exited';
          c.uptime = target === 'running' ? 'Less than a second' : '—';
          if (target !== 'running') { c.cpu = 0; c.mem = 0; }
          this.pending.delete(key);
          this._render();
          this._endAction();
        }, 1200);
        return;
      }

      try {
        await PortainerApi.action(this.cfg.baseUrl, this.cfg.apiKey, c.endpointId, c.id, kind);
        await this.poll();                    // refresh real state (clears pending)
        this._endAction();
      } catch (err) {
        this.pending.set(key, { label: 'Failed', target });
        this._render();
        setTimeout(() => { this.pending.delete(key); this.poll(); this._endAction(); }, 1800);
      }
    }

    // Scroll hold spanning one or more concurrent actions.
    _beginAction() { this.activeActions++; if (this.carousel) this.carousel.pauseForAction(); }
    _endAction() {
      this.activeActions = Math.max(0, this.activeActions - 1);
      if (this.activeActions === 0 && this.carousel) this.carousel.resumeAfterAction();
    }

    _showError(msg) {
      if (!this.errorEl) return;
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /apikey|401|403/i.test(msg) ? 'Check API key' : 'Portainer unavailable';
      this.el.classList.add('pc-has-error');
    }
    _clearError() {
      if (this.errorEl && this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('pc-has-error');
      }
    }
  }

  global.PortainerApi = PortainerApi;
  global.PortainerWidget = PortainerWidget;
})(typeof window !== 'undefined' ? window : this);
