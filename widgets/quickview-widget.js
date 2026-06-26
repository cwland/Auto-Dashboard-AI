// Auto Dashboard AI — Quick View widgets.
// ---------------------------------------------------------------------------
// A compact, at-a-glance summary card for an integration: an icon + title +
// subtitle header followed by ~4-5 of the integration's most important metrics.
// One generic widget class (QuickViewWidget) is driven by a per-integration
// "spec" (QUICKVIEW_SPECS) that knows how to fetch the integration's data and
// pick the metrics to show. New integrations get a Quick View widget by adding
// a single spec entry — no new widget class required.
//
// Design goals (mirrors the rest of the app):
//   • class-based widget with start()/stop()/setConfig()/destroy() lifecycle
//   • polling refresh via AbortController, min 5s (matches other widgets)
//   • dataProvider override so the Sample tab can render mock data offline
//   • all colors via CSS custom properties (theme-aware)
//   • optional "Clickable" behaviour: clicking the card opens the integration
//
// Exposed on window as QuickViewWidget, QUICKVIEW_SPECS, QUICKVIEW_KEYS.
'use strict';

(function (global) {
  // ── small formatters ───────────────────────────────────────────────────────
  const fmt = {
    // bytes/second → "0 B/s" / "1.2 MB/s"
    rate(bytesPerSec) {
      const n = Number(bytesPerSec) || 0;
      if (n < 1) return '0 B/s';
      const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
      let v = n, i = 0;
      while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
      return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
    },
    // kilobits/second (Tautulli total_bandwidth) → "10.0 Mbps"
    mbps(kbps) {
      const n = Number(kbps) || 0;
      if (n <= 0) return '0 Mbps';
      return `${(n / 1000).toFixed(1)} Mbps`;
    },
    // milliseconds → "0:00:00" / "1:23:45"
    clock(ms) {
      let s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60); s -= m * 60;
      const pad = (x) => String(x).padStart(2, '0');
      return `${h}:${pad(m)}:${pad(s)}`;
    },
    // large integers → "4,032"
    num(n) {
      const v = Number(n);
      if (!Number.isFinite(v)) return String(n == null ? '—' : n);
      return v.toLocaleString();
    },
    pct(v, d) {
      const n = Math.max(0, Math.min(100, Number(v) || 0));
      return `${n.toFixed(d == null ? 1 : d)}%`;
    },
  };

  function norm(url) { return String(url || '').trim().replace(/\/+$/, ''); }

  // ── per-integration data adapters ──────────────────────────────────────────
  // Each spec: { title, subtitle, icon, async load(cfg, signal) -> [stat...] }.
  // A stat is { label, value, tone? } where tone ∈ good|warn|bad|accent|''.
  //
  // load() reuses the integration's existing global *Api helper wherever one
  // exists, so Quick View metrics stay consistent with the full widgets.

  // Generic Sonarr/Radarr v3 helper (the calendar widget's API is calendar-only,
  // so counts are fetched here).
  async function arrJson(cfg, path, signal) {
    const r = await fetch(norm(cfg.baseUrl) + path, {
      cache: 'no-store', headers: { 'X-Api-Key': cfg.apiKey || '' }, signal,
    });
    if (r.status === 401) throw new Error('invalid API key');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  const SPECS = {
    sonarr: {
      title: 'Sonarr', subtitle: 'TV shows', icon: 'sonarr.svg',
      async load(cfg, signal) {
        const [queue, wanted, series] = await Promise.all([
          arrJson(cfg, '/api/v3/queue?page=1&pageSize=1', signal),
          arrJson(cfg, '/api/v3/wanted/missing?page=1&pageSize=1', signal),
          arrJson(cfg, '/api/v3/series', signal),
        ]);
        const list = Array.isArray(series) ? series : [];
        const monitored = list.filter((s) => s.monitored).length;
        return [
          { label: 'Wanted', value: fmt.num(wanted.totalRecords), tone: wanted.totalRecords ? 'warn' : '' },
          { label: 'Queued', value: fmt.num(queue.totalRecords), tone: queue.totalRecords ? 'accent' : '' },
          { label: 'Series', value: fmt.num(list.length) },
          { label: 'Monitored', value: fmt.num(monitored) },
        ];
      },
    },

    radarr: {
      title: 'Radarr', subtitle: 'Movies', icon: 'radarr.svg',
      async load(cfg, signal) {
        const [queue, wanted, movies] = await Promise.all([
          arrJson(cfg, '/api/v3/queue?page=1&pageSize=1', signal),
          arrJson(cfg, '/api/v3/wanted/missing?page=1&pageSize=1', signal),
          arrJson(cfg, '/api/v3/movie', signal),
        ]);
        const list = Array.isArray(movies) ? movies : [];
        const missing = list.filter((m) => m.monitored && !m.hasFile).length;
        return [
          { label: 'Wanted', value: fmt.num(wanted.totalRecords), tone: wanted.totalRecords ? 'warn' : '' },
          { label: 'Missing', value: fmt.num(missing), tone: missing ? 'bad' : 'good' },
          { label: 'Queued', value: fmt.num(queue.totalRecords), tone: queue.totalRecords ? 'accent' : '' },
          { label: 'Movies', value: fmt.num(list.length) },
        ];
      },
    },

    seerr: {
      title: 'Seerr', subtitle: 'Requests', icon: 'seerr.svg',
      async load(cfg, signal) {
        const s = await global.SeerrApi.getStats(cfg.baseUrl, cfg.apiKey, signal);
        return [
          { label: 'Pending', value: fmt.num(s.pending), tone: s.pending ? 'warn' : '' },
          { label: 'Approved', value: fmt.num(s.approved), tone: 'good' },
          { label: 'Completed', value: fmt.num(s.available) },
          { label: 'Total', value: fmt.num(s.total) },
        ];
      },
    },

    tautulli: {
      title: 'Tautulli', subtitle: 'Now playing on Plex', icon: 'tautulli.svg',
      async load(cfg, signal) {
        const d = await global.TautulliApi.getActivity(cfg.baseUrl, cfg.apiKey, signal);
        const streams = Number(d.stream_count) || 0;
        const transcodes = Number(d.stream_count_transcode) || 0;
        return [
          { label: 'Streams', value: fmt.num(streams), tone: streams ? 'accent' : '' },
          { label: 'Transcodes', value: fmt.num(transcodes), tone: transcodes ? 'warn' : '' },
          { label: 'Direct Play', value: fmt.num(Math.max(0, streams - transcodes)), tone: 'good' },
          { label: 'Bandwidth', value: fmt.mbps(d.total_bandwidth) },
        ];
      },
    },

    sabnzbd: {
      title: 'SABnzbd', subtitle: 'Usenet downloader', icon: 'sabnzbd.svg',
      async load(cfg, signal) {
        const data = await global.DownloadsApi.getData(
          'sabnzbd', cfg.baseUrl, { apiKey: cfg.apiKey, limit: 100 }, {}, signal);
        const queued = (data.items || []).filter((i) => i.progress < 1);
        const down = data.status.rates.down;
        return [
          { label: 'Rate', value: fmt.rate(down), tone: down > 0 ? 'accent' : '' },
          { label: 'Queue', value: fmt.num(queued.length), tone: queued.length ? 'warn' : '' },
          { label: 'Time Left', value: fmt.clock(queued[0] ? queued[0].time : 0) },
          { label: 'Status', value: data.status.paused ? 'Paused' : (down > 0 ? 'Downloading' : 'Idle'),
            tone: data.status.paused ? 'warn' : (down > 0 ? 'good' : '') },
        ];
      },
    },

    qbittorrent: torrentSpec('qBittorrent', 'qbittorrent.svg', 'qbittorrent'),
    transmission: torrentSpec('Transmission', 'transmission.svg', 'transmission'),

    uptimekuma: {
      title: 'Uptime Kuma', subtitle: 'Service monitoring', icon: 'uptime-kuma.svg',
      async load(cfg, signal) {
        const d = await global.UptimeKumaApi.getDashboard(cfg.baseUrl, cfg.slug || 'default', signal);
        return [
          { label: 'Up', value: fmt.num(d.upCount), tone: 'good' },
          { label: 'Down', value: fmt.num(d.downCount), tone: d.downCount ? 'bad' : '' },
          { label: 'Paused', value: fmt.num(d.pausedCount), tone: d.pausedCount ? 'warn' : '' },
          { label: 'Uptime', value: fmt.pct(d.averageUptimePercent),
            tone: d.averageUptimePercent >= 99 ? 'good' : (d.averageUptimePercent >= 95 ? 'warn' : 'bad') },
        ];
      },
    },

    portainer: {
      title: 'Portainer', subtitle: 'Containers', icon: 'portainer.svg',
      async load(cfg, signal) {
        const Api = global.PortainerApi;
        const eps = await Api.getEndpoints(cfg.baseUrl, cfg.apiKey, signal);
        let running = 0, stopped = 0, total = 0;
        for (const ep of eps) {
          let raw = [];
          try { raw = await Api.listContainers(cfg.baseUrl, cfg.apiKey, ep.Id, signal); } catch (_) { raw = []; }
          for (const c of (Array.isArray(raw) ? raw : [])) {
            if (c.Labels && String(c.Labels['homarr.hide']) === 'true') continue;
            total++;
            if (c.State === 'running') running++; else stopped++;
          }
        }
        return [
          { label: 'Running', value: fmt.num(running), tone: 'good' },
          { label: 'Stopped', value: fmt.num(stopped), tone: stopped ? 'bad' : '' },
          { label: 'Total', value: fmt.num(total) },
          { label: 'Endpoints', value: fmt.num(eps.length) },
        ];
      },
    },

    plex: {
      title: 'Plex', subtitle: 'Now playing', icon: 'plex.svg',
      async load(cfg, signal) {
        const d = await global.PlexApi.getActivity(cfg.baseUrl, cfg.token, signal);
        return [
          { label: 'Streams', value: fmt.num(d.streams), tone: d.streams ? 'accent' : '' },
          { label: 'Transcodes', value: fmt.num(d.transcodes), tone: d.transcodes ? 'warn' : '' },
          { label: 'Direct Play', value: fmt.num(d.directPlay), tone: 'good' },
          { label: 'Bandwidth', value: fmt.mbps(d.bandwidth) },
        ];
      },
    },

    n8n: {
      title: 'n8n', subtitle: 'Workflows', icon: 'n8n.svg',
      async load(cfg, signal) {
        const d = await global.N8nApi.getData(cfg.baseUrl, cfg.apiKey, signal);
        return [
          { label: 'Running', value: fmt.num(d.running), tone: d.running ? 'accent' : '' },
          { label: 'Failed today', value: fmt.num(d.failedToday), tone: d.failedToday ? 'bad' : '' },
          { label: 'Success today', value: fmt.num(d.successToday), tone: 'good' },
        ];
      },
    },

    prowlarr: {
      title: 'Prowlarr', subtitle: 'Indexers', icon: 'prowlarr.svg',
      async load(cfg, signal) {
        const list = await global.ProwlarrApi.getData(cfg.baseUrl, { apiKey: cfg.apiKey }, null, signal);
        let online = 0, offline = 0, disabled = 0;
        for (const ix of (list || [])) {
          if (!ix.enabled) disabled++;
          else if (ix.status) online++;
          else offline++;
        }
        return [
          { label: 'Providers', value: fmt.num((list || []).length) },
          { label: 'Online', value: fmt.num(online), tone: 'good' },
          { label: 'Offline', value: fmt.num(offline), tone: offline ? 'bad' : '' },
          { label: 'Disabled', value: fmt.num(disabled), tone: disabled ? 'warn' : '' },
        ];
      },
    },

    speedtest: {
      title: 'Speedtest', subtitle: 'Internet speed', icon: 'speedtest-tracker.png',
      async load(cfg, signal) {
        const Api = global.SpeedtestApi;
        const d = await Api.getData(cfg.baseUrl, { token: cfg.token }, null, signal);
        const l = d.latest;
        if (!l) {
          return { subtitle: 'No tests yet', stats: [
            { label: 'Download', value: '—' }, { label: 'Upload', value: '—' },
            { label: 'Ping', value: '—' }, { label: 'Last Test', value: '—' },
          ] };
        }
        const ago = (global.SpeedtestWidget && global.SpeedtestWidget._fmtAgo)
          ? global.SpeedtestWidget._fmtAgo(l.createdAt) : '';
        return [
          { label: 'Download', value: l.downloadMbps != null ? `${l.downloadMbps} Mbps` : '—', tone: 'accent' },
          { label: 'Upload', value: l.uploadMbps != null ? `${l.uploadMbps} Mbps` : '—', tone: 'good' },
          { label: 'Ping', value: l.ping != null ? `${l.ping} ms` : '—' },
          { label: 'Last Test', value: ago || '—', tone: l.healthy === false ? 'bad' : '' },
        ];
      },
      actions: [{
        id: 'run', icon: 'refresh', title: 'Run a new speed test', busyTitle: 'Running test…', errorPrefix: 'Test failed',
        async run(ctx) {
          await global.SpeedtestApi.runTestAndWait(ctx.cfg.baseUrl, { token: ctx.cfg.token }, ctx.signal);
        },
      }],
    },
  };

  // Shared torrent-client spec (qBittorrent / Transmission).
  function torrentSpec(title, icon, service) {
    return {
      title, subtitle: 'Torrent client', icon,
      async load(cfg, signal) {
        const opts = { limit: 500, username: cfg.username, password: cfg.password };
        const data = await global.DownloadsApi.getData(service, cfg.baseUrl, opts, cfg._session || (cfg._session = {}), signal);
        const items = data.items || [];
        const active = items.filter((i) => i.state === 'leeching').length;
        const seeding = items.filter((i) => i.state === 'seeding').length;
        return [
          { label: 'Download', value: fmt.rate(data.status.rates.down), tone: data.status.rates.down > 0 ? 'accent' : '' },
          { label: 'Upload', value: fmt.rate(data.status.rates.up), tone: data.status.rates.up > 0 ? 'good' : '' },
          { label: 'Active', value: fmt.num(active), tone: active ? 'accent' : '' },
          { label: 'Seeding', value: fmt.num(seeding) },
          { label: 'Total', value: fmt.num(items.length) },
        ];
      },
    };
  }

  // ── widget ──────────────────────────────────────────────────────────────────
  const TONE_CLASS = { good: 'qv-good', warn: 'qv-warn', bad: 'qv-bad', accent: 'qv-accent' };

  // Icon-style action glyphs (rendered as a clickable button in the header).
  const ACTION_ICONS = {
    refresh: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  };

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  class QuickViewWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        key: '',            // QUICKVIEW_SPECS key (sonarr, radarr, …)
        title: '', subtitle: '', icon: '',
        baseUrl: '', apiKey: '', token: '', username: '', password: '', slug: '',
        url: '',            // integration address opened on click
        clickable: true,    // default ON (per the feature spec)
        showFrame: true,    // inner frame (border)
        showBackground: true, // card background
        statusMonitor: false, // online/offline badge
        pollMs: 15000,
        dataProvider: null, // (cfg) => Promise<stat[]> — used by Sample previews
        onConfigChange: null,
      }, config || {});
      this.spec = SPECS[this.cfg.key] || {};
      this.stats = null;
      this.online = null;   // null=unknown, true=online, false=offline
      this.busy = false;    // an action (e.g. Run Test) is in progress
      this.pollTimer = null;
      this.abort = null;
      this.actionAbort = null;
      this.destroyed = false;
      this._buildSkeleton();
    }

    // ── lifecycle ─────────────────────────────────────────────────────────────
    start() {
      this.stop();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), Math.max(5000, this.cfg.pollMs));
    }

    stop() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.abort) { this.abort.abort(); this.abort = null; }
    }

    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      this._applyClickable();
      this._applyFrame();
      this._applyStatus();
      if (this.stats) this._renderStats(this.stats);
    }

    destroy() {
      this.destroyed = true;
      this.stop();
      if (this.actionAbort) { this.actionAbort.abort(); this.actionAbort = null; }
      if (this.el) this.el.innerHTML = '';
    }

    // ── data ──────────────────────────────────────────────────────────────────
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = new AbortController();
      try {
        const result = this.cfg.dataProvider
          ? await this.cfg.dataProvider(this.cfg)
          : await this.spec.load(this.cfg, this.abort.signal);
        if (this.destroyed) return;
        // load() may return a stats array, or { stats, subtitle } for a dynamic subtitle.
        const stats = Array.isArray(result) ? result : (result && result.stats) || [];
        if (result && !Array.isArray(result) && result.subtitle != null) this._setSubtitle(result.subtitle);
        this.stats = stats;
        this.online = true;          // a successful fetch means the service is reachable
        this._applyStatus();
        this._clearError();
        this._renderStats(stats);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        // A failed refresh isn't shown as an error message — the widget just grays
        // out (last good values dimmed) and the Offline badge surfaces the problem.
        this.online = false;
        this._applyStatus();
        if (this.statsEl) this.statsEl.classList.add('qv-stale');
      }
    }

    _setSubtitle(text) {
      if (this.subtitleEl) this.subtitleEl.textContent = text == null ? '' : String(text);
    }

    // ── rendering ───────────────────────────────────────────────────────────────
    _buildSkeleton() {
      const title = this.cfg.title || this.spec.title || this.cfg.key;
      const subtitle = this.cfg.subtitle || this.spec.subtitle || '';
      const icon = this.cfg.icon || this.spec.icon || '';
      const root = document.createElement('div');
      root.className = 'quickview-widget';
      root.innerHTML =
        '<div class="qv-head">' +
          (icon
            ? `<img class="qv-icon" alt="" src="../icons/integrations/${esc(icon)}" />`
            : '<span class="qv-icon qv-icon-fallback"></span>') +
          '<div class="qv-titles">' +
            `<div class="qv-title">${esc(title)}</div>` +
            `<div class="qv-subtitle">${esc(subtitle)}</div>` +
          '</div>' +
          '<span class="qv-status" hidden><span class="qv-status-dot"></span><span class="qv-status-text"></span></span>' +
          '<span class="qv-head-actions"></span>' +
          '<span class="qv-link-hint" aria-hidden="true">' +
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>' +
          '</span>' +
        '</div>' +
        '<div class="qv-stats"><div class="qv-skeleton">Loading…</div></div>' +
        '<div class="qv-actions" hidden></div>' +
        '<div class="qv-error" hidden></div>';
      this.el.innerHTML = '';
      this.el.appendChild(root);
      this.root = root;
      this.statsEl = root.querySelector('.qv-stats');
      this.errEl = root.querySelector('.qv-error');
      this.statusEl = root.querySelector('.qv-status');
      this.subtitleEl = root.querySelector('.qv-subtitle');
      this.actionsEl = root.querySelector('.qv-actions');
      this.headActionsEl = root.querySelector('.qv-head-actions');

      this._buildActions();
      this._buildTools();
      this._applyClickable();
      this._applyFrame();
      this._applyStatus();
      this._wireClick();
    }

    // Render actions declared by the spec. An action with `icon` becomes a small
    // clickable icon button in the header (e.g. Speedtest's refresh/run icon);
    // otherwise it's a text button in the footer.
    _buildActions() {
      const actions = (this.spec && this.spec.actions) || this.cfg.actions;
      if (!actions || !actions.length) return;
      // Sample previews show the control for layout, but it's inert (no live API).
      const sampleMode = !!this.cfg.dataProvider;
      actions.forEach((a) => {
        const isIcon = !!a.icon;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.id = a.id || a.label;
        const tip = a.title || a.label || '';
        if (isIcon) {
          btn.className = 'qv-icon-action';
          btn.innerHTML = ACTION_ICONS[a.icon] || ACTION_ICONS.refresh;
          btn.setAttribute('aria-label', tip || 'Action');
          if (tip) btn.dataset.tip = tip;   // styled hover tooltip (see CSS)
          this.headActionsEl.appendChild(btn);
        } else {
          btn.className = 'qv-action';
          btn.textContent = a.label;
          this.actionsEl.hidden = false;
          this.actionsEl.appendChild(btn);
        }
        if (sampleMode) {
          btn.disabled = true;
          if (isIcon) { if (tip) btn.dataset.tip = `${tip} (preview)`; } else { btn.title = `${tip} (preview)`.trim(); }
          return;
        }
        btn.addEventListener('pointerdown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.preventDefault(); e.stopPropagation();
          if (document.body && document.body.classList.contains('rearrange-mode')) return;
          this._runAction(a, btn);
        });
      });
    }

    async _runAction(action, btn) {
      if (this.busy || typeof action.run !== 'function') return;
      const isIcon = btn.classList.contains('qv-icon-action');
      this.busy = true;
      this.root.classList.add('qv-busy');
      btn.disabled = true;
      const label = btn.textContent;
      if (isIcon) { btn.classList.add('qv-spin'); if (action.busyTitle) btn.dataset.tip = action.busyTitle; }
      else { btn.textContent = action.busyLabel || 'Working…'; }
      this._clearError();
      this.actionAbort = new AbortController();
      const ctx = { cfg: this.cfg, signal: this.actionAbort.signal, refresh: () => this.poll() };
      try {
        await action.run(ctx);
        if (this.destroyed) return;
        await this.poll();
      } catch (err) {
        if (!(err && (err.name === 'AbortError' || err.message === 'aborted'))) {
          this._showError(action.errorPrefix ? `${action.errorPrefix}: ${err.message}` : (err && err.message) || 'Action failed');
        }
      } finally {
        if (!this.destroyed) {
          this.busy = false;
          this.root.classList.remove('qv-busy');
          btn.disabled = false;
          if (isIcon) { btn.classList.remove('qv-spin'); btn.dataset.tip = action.title || action.label || ''; }
          else { btn.textContent = label; }
        }
      }
    }

    // Configure-window controls (collected into the per-widget Configure panel).
    _buildTools() {
      const tools = document.createElement('div');
      tools.className = 'qv-tools';
      const uid = Math.random().toString(36).slice(2, 8);
      const toggle = (key, label, hint, checked, onChange) => {
        const id = `qv-${key}-${uid}`;
        const row = document.createElement('label');
        row.className = 'qv-tool-row';
        row.setAttribute('for', id);
        row.innerHTML =
          `<span class="qv-tool-label">${esc(label)}</span>` +
          `<input type="checkbox" id="${id}" class="qv-tool-toggle"${checked ? ' checked' : ''} />` +
          `<span class="qv-tool-hint">${esc(hint)}</span>`;
        row.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
        tools.appendChild(row);
      };
      const persist = (patch) => { if (typeof this.cfg.onConfigChange === 'function') this.cfg.onConfigChange(patch); };

      toggle('click', 'Clickable widget', 'Open the integration when the widget is clicked', this.cfg.clickable, (v) => {
        this.cfg.clickable = v; this._applyClickable(); persist({ clickable: v });
      });
      toggle('frame', 'Show inner frame', 'Draw a border around the widget', this.cfg.showFrame, (v) => {
        this.cfg.showFrame = v; this._applyFrame(); persist({ showFrame: v });
      });
      toggle('bg', 'Show background', 'Fill the widget background (off = blends into the dashboard)', this.cfg.showBackground, (v) => {
        this.cfg.showBackground = v; this._applyFrame(); persist({ showBackground: v });
      });
      toggle('status', 'Enable status monitoring', 'Show an online / offline badge for the service', this.cfg.statusMonitor, (v) => {
        this.cfg.statusMonitor = v; this._applyStatus(); persist({ statusMonitor: v });
      });

      // Don't let toggling start a drag.
      tools.addEventListener('pointerdown', (e) => e.stopPropagation());
      this.root.appendChild(tools);
    }

    _applyClickable() {
      const on = !!this.cfg.clickable && !!this.cfg.url;
      this.root.classList.toggle('qv-clickable', on);
      this.root.setAttribute('title', on ? `Open ${this.cfg.title || this.spec.title || ''}`.trim() : '');
    }

    // Inner-frame / background visibility (transparent mode).
    _applyFrame() {
      this.root.classList.toggle('qv-no-frame', !this.cfg.showFrame);
      this.root.classList.toggle('qv-no-bg', !this.cfg.showBackground);
    }

    // Online/offline badge — a centered tab that hangs off the top frame. Shown
    // when status monitoring is enabled, OR whenever the service is offline —
    // an outage is always surfaced regardless of the user's setting.
    _applyStatus() {
      if (!this.statusEl) return;
      const show = !!this.cfg.statusMonitor || this.online === false;
      this.root.classList.toggle('qv-status-shown', show);
      if (!show) { this.statusEl.hidden = true; return; }
      this.statusEl.hidden = false;
      const txt = this.statusEl.querySelector('.qv-status-text');
      if (this.online == null) {
        this.statusEl.className = 'qv-status qv-status-unknown';
        if (txt) txt.textContent = '…';
      } else {
        this.statusEl.className = 'qv-status ' + (this.online ? 'qv-status-online' : 'qv-status-offline');
        if (txt) txt.textContent = this.online ? 'Online' : 'Offline';
      }
    }

    _wireClick() {
      this.root.addEventListener('click', (e) => {
        if (!this.cfg.clickable || !this.cfg.url) return;
        // Ignore clicks on the configure/delete/tools chrome, and while editing.
        if (e.target.closest('.qv-tools, .widget-configure, .widget-del, .widget-drag, .grid-lock, .widget-config-store')) return;
        if (document.body && document.body.classList.contains('rearrange-mode')) return;
        global.open(this.cfg.url, '_blank', 'noopener');
      });
    }

    _renderStats(stats) {
      const cells = (stats || []).map((s) => {
        const toneCls = TONE_CLASS[s.tone] || '';
        return (
          '<div class="qv-cell">' +
            `<div class="qv-cell-label">${esc(s.label)}</div>` +
            `<div class="qv-cell-value ${toneCls}">${esc(s.value)}</div>` +
          '</div>'
        );
      }).join('');
      this.statsEl.innerHTML = cells || '<div class="qv-skeleton">No data</div>';
      this.statsEl.style.setProperty('--qv-count', String((stats || []).length || 1));
    }

    _showError(msg) {
      if (!this.errEl) return;
      this.errEl.textContent = msg;
      this.errEl.hidden = false;
      // Keep the last good stats visible but dimmed.
      if (this.statsEl) this.statsEl.classList.add('qv-stale');
    }

    _clearError() {
      if (this.errEl) { this.errEl.hidden = true; this.errEl.textContent = ''; }
      if (this.statsEl) this.statsEl.classList.remove('qv-stale');
    }
  }

  global.QuickViewWidget = QuickViewWidget;
  global.QUICKVIEW_SPECS = SPECS;
  global.QUICKVIEW_KEYS = Object.keys(SPECS);
  global.quickViewFmt = fmt;
})(typeof window !== 'undefined' ? window : this);
