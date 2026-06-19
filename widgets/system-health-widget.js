// Auto Dashboard AI — System Health Widget (Glances / Dashdot / Unraid / OpenMediaVault / TrueNAS)
// ---------------------------------------------------------------------------
// These five all normalize to the same "system health" shape, so one engine
// (SystemHealthApi + SystemHealthWidget) with five adapters covers them all,
// surfaced as five integrations. The widget shows CPU / memory / uptime, plus
// optional temperature, load average, filesystems, SMART, and GPU.
//
//   const w = new GlancesWidget(el, { baseUrl });
//   const w = new UnraidWidget(el, { baseUrl, apiKey });
//   ...  w.start();  ...  w.destroy();
//
// Exposed as SystemHealthApi, SystemHealthWidget, and per-service wrappers.
//
// ATTRIBUTION: the per-service fetching and the mapping into the normalized
// SystemHealthMonitoring shape are adapted from the Homarr project's Glances,
// Dashdot, Unraid, OpenMediaVault, and TrueNAS integrations (health-monitoring
// interface). Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
// Modified: Homarr drives TrueNAS via a server-side WebSocket and Dashdot's
// load average via a Redis history channel; here requests are made directly
// from the browser (best-effort for TrueNAS / OpenMediaVault).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  function b64(str) { return (typeof btoa === 'function') ? btoa(str) : Buffer.from(str, 'utf-8').toString('base64'); }

  // Empty normalized shape — adapters fill what their API provides.
  function emptyHealth() {
    return {
      version: '', cpuModelName: '', cpuUtilization: 0, memUsedInBytes: 0, memAvailableInBytes: 0,
      uptime: 0, network: null, loadAverage: null, rebootRequired: false, availablePkgUpdates: 0,
      cpuTemp: undefined, fileSystem: [], smart: [], gpu: [],
    };
  }

  const SystemHealthApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // ── Glances ───────────────────────────────────────────────────────────────
    glances: {
      basicAuth(opts) { return (opts.username && opts.password) ? { Authorization: `Basic ${b64(`${opts.username}:${opts.password}`)}` } : {}; },
      // "71 days, 9:51:35" | "1 day, 9:50:23" | "9:51:24" → seconds
      parseUptime(str) {
        const m = /^(?:(\d+)\s+days?,\s+)?(\d+):(\d+):(\d+)$/.exec(String(str || '').trim());
        if (!m) return 0;
        const [, d, h, mi, s] = m;
        return ((Number(d || 0) * 24 + Number(h)) * 3600) + Number(mi) * 60 + Number(s);
      },
      mapAll(all, version) {
        const h = emptyHealth();
        const a = all || {};
        h.version = version || '';
        h.cpuUtilization = (a.cpu && a.cpu.total) || 0;
        h.memUsedInBytes = (a.mem && a.mem.used) || 0;
        h.memAvailableInBytes = ((a.mem && a.mem.total) || 0) - ((a.mem && a.mem.used) || 0);
        h.network = {
          down: (a.network || []).reduce((acc, n) => acc + (n.bytes_recv_rate_per_sec || 0), 0),
          up: (a.network || []).reduce((acc, n) => acc + (n.bytes_sent_rate_per_sec || 0), 0),
        };
        h.uptime = this.parseUptime(a.uptime);
        h.cpuModelName = (a.quicklook && a.quicklook.cpu_name) || 'Unknown';
        h.fileSystem = (a.fs || []).map((f) => ({ deviceName: f.device_name, used: `${f.used}`, available: `${f.free}`, percentage: f.percent }));
        h.gpu = (a.gpu || []).map((g) => ({ gpuId: g.gpu_id, name: g.name, memoryUtilization: g.mem || 0, processorUtilization: g.proc || 0, temperature: g.temperature == null ? null : g.temperature, fanSpeed: g.fan_speed == null ? null : g.fan_speed }));
        return h;
      },
      async getData(base, opts, session, signal) {
        const b = SystemHealthApi.normalizeBase(base), headers = this.basicAuth(opts);
        const [verRes, allRes] = await Promise.all([
          fetch(`${b}/api/4/version`, { cache: 'no-store', headers, signal }),
          fetch(`${b}/api/4/all`, { cache: 'no-store', headers, signal }),
        ]);
        if (allRes.status === 401) throw new Error('invalid credentials');
        if (!allRes.ok) throw new Error(`HTTP ${allRes.status}`);
        const version = verRes.ok ? (await verRes.text()).replace(/"/g, '').trim() : '';
        return this.mapAll(await allRes.json(), version);
      },
      async testConnection(base, opts, signal) {
        const res = await fetch(`${SystemHealthApi.normalizeBase(base)}/api/4/status`, { cache: 'no-store', headers: this.basicAuth(opts), signal });
        if (res.status === 401) throw new Error('invalid credentials');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { ok: true };
      },
    },

    // ── Dashdot ─────────────────────────────────────────────────────────────────
    dashdot: {
      mapData(info, cpuLoad, memBytes, storageLoad, network, gpuLoad) {
        const h = emptyHealth();
        const i = info || {};
        h.cpuUtilization = (cpuLoad && cpuLoad.sumLoad) || 0;
        h.cpuTemp = cpuLoad ? cpuLoad.averageTemperature : undefined;
        h.memUsedInBytes = memBytes || 0;
        h.memAvailableInBytes = (i.maxAvailableMemoryBytes || 0) - (memBytes || 0);
        h.network = network || null;
        h.cpuModelName = i.cpuModel ? `${i.cpuModel} (${i.cpuBrand})` : `Unknown Model (${i.cpuBrand || ''})`;
        h.uptime = i.uptime || 0;
        h.version = i.operatingSystemVersion || '';
        h.fileSystem = (i.storage || []).map((st, idx) => {
          const used = (storageLoad && storageLoad[idx]) || 0;
          return { deviceName: `Storage ${idx + 1}`, used: `${used}`, available: `${(st.size || 0) - used}`, percentage: st.size ? (used / st.size) * 100 : 0 };
        });
        h.gpu = (gpuLoad || []).map((g, idx) => ({ gpuId: `gpu-${idx}`, name: (i.gpuNames && i.gpuNames[idx]) || `GPU ${idx}`, memoryUtilization: g.memory || 0, processorUtilization: g.load || 0, temperature: null, fanSpeed: null }));
        return h;
      },
      async _json(b, path, signal) { const r = await fetch(`${b}${path}`, { cache: 'no-store', signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); const t = await r.text(); return t ? JSON.parse(t) : null; },
      async getData(base, opts, session, signal) {
        const b = SystemHealthApi.normalizeBase(base);
        const raw = await this._json(b, '/info', signal);
        const info = {
          maxAvailableMemoryBytes: raw.ram && raw.ram.size, storage: raw.storage || [],
          cpuBrand: raw.cpu && raw.cpu.brand, cpuModel: raw.cpu && raw.cpu.model,
          operatingSystemVersion: raw.os ? `${raw.os.distro} ${raw.os.release} (${raw.os.kernel})` : '',
          uptime: raw.os && raw.os.uptime, gpuNames: (raw.gpu && raw.gpu.layout || []).map((g) => g.brand),
        };
        const [cpu, mem, storage, network, gpu] = await Promise.all([
          this._json(b, '/load/cpu', signal).catch(() => []),
          this._json(b, '/load/memory', signal).catch(() => null),
          this._json(b, '/load/storage', signal).catch(() => []),
          this._json(b, '/load/network', signal).catch(() => null),
          this._json(b, '/load/gpu', signal).catch(() => []),
        ]);
        const cpuArr = Array.isArray(cpu) ? cpu : [];
        const cpuLoad = { sumLoad: cpuArr.length ? cpuArr.reduce((a, c) => a + (c.load || 0), 0) / cpuArr.length : 0, averageTemperature: cpuArr.length ? cpuArr.reduce((a, c) => a + (c.temp || 0), 0) / cpuArr.length : 0 };
        const memBytes = mem ? (mem.load || 0) : 0;
        const net = network ? { up: network.up || 0, down: network.down || 0 } : null;
        return this.mapData(info, cpuLoad, memBytes, Array.isArray(storage) ? storage : [], net, Array.isArray(gpu) ? gpu : []);
      },
      async testConnection(base, opts, signal) { await this._json(SystemHealthApi.normalizeBase(base), '/info', signal); return { ok: true }; },
    },

    // ── Unraid (GraphQL) ──────────────────────────────────────────────────────
    unraid: {
      QUERY: `query { metrics { cpu { percentTotal cpus { percentTotal } } memory { percentTotal } } array { disks { name size fsFree fsUsed status temp } } info { os { release uptime } cpu { brand cores } memory { layout { size } } } }`,
      mapSystemInfo(data) {
        const h = emptyHealth();
        const si = data || {};
        const cpus = (si.metrics && si.metrics.cpu && si.metrics.cpu.cpus) || [];
        const cpuCount = (si.info && si.info.cpu && si.info.cpu.cores) || cpus.length || 1;
        const cpuUtil = cpus.reduce((a, c) => a + (c.percentTotal || 0), 0);
        const totalMem = ((si.info && si.info.memory && si.info.memory.layout) || []).reduce((a, l) => a + (l.size || 0), 0);
        const usedMem = totalMem * (((si.metrics && si.metrics.memory && si.metrics.memory.percentTotal) || 0) / 100);
        h.version = (si.info && si.info.os && si.info.os.release) || '';
        h.cpuModelName = (si.info && si.info.cpu && si.info.cpu.brand) || '';
        h.cpuUtilization = cpuCount ? cpuUtil / cpuCount : 0;
        h.memUsedInBytes = usedMem;
        h.memAvailableInBytes = totalMem - usedMem;
        const up = si.info && si.info.os && si.info.os.uptime;
        h.uptime = up ? Math.max(0, Math.floor((Date.now() - new Date(up).getTime()) / 1000)) : 0;
        h.fileSystem = ((si.array && si.array.disks) || []).map((d) => ({ deviceName: d.name, used: `${(d.fsUsed || 0) * 1024}`, available: `${(d.size || 0) * 1024}`, percentage: d.size ? (d.fsUsed / d.size) * 100 : 0 }));
        h.smart = ((si.array && si.array.disks) || []).map((d) => ({ deviceName: d.name, temperature: d.temp == null ? null : d.temp, overallStatus: d.status, healthy: d.status === 'DISK_OK' }));
        return h;
      },
      async _query(base, apiKey, signal) {
        const res = await fetch(`${SystemHealthApi.normalizeBase(base)}/graphql`, {
          method: 'POST', cache: 'no-store',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey || '' },
          body: JSON.stringify({ query: this.QUERY }), signal,
        });
        if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.errors) throw new Error('GraphQL error');
        return json.data;
      },
      async getData(base, opts, session, signal) { return this.mapSystemInfo(await this._query(base, opts.apiKey, signal)); },
      async testConnection(base, opts, signal) { await this._query(base, opts.apiKey, signal); return { ok: true }; },
    },

    // ── OpenMediaVault (RPC, cookie session) ────────────────────────────────────
    openmediavault: {
      mapResponses(system, fs, smart, cputemp) {
        const h = emptyHealth();
        const s = (system && system.response) || {};
        h.version = s.version || '';
        h.cpuModelName = s.cpuModelName || 'Unknown CPU';
        h.cpuUtilization = s.cpuUtilization || 0;
        h.memUsedInBytes = Number(s.memUsed) || 0;
        h.memAvailableInBytes = Number(s.memAvailable) || 0;
        h.uptime = s.uptime || 0;
        h.loadAverage = s.loadAverage ? { '1min': s.loadAverage['1min'], '5min': s.loadAverage['5min'], '15min': s.loadAverage['15min'] } : null;
        h.rebootRequired = !!s.rebootRequired;
        h.availablePkgUpdates = s.availablePkgUpdates || 0;
        h.cpuTemp = (cputemp && cputemp.response) ? cputemp.response.cputemp : undefined;
        h.fileSystem = (((fs && fs.response) || [])).map((f) => ({ deviceName: f.devicename, used: f.used, available: String(f.available), percentage: f.percentage }));
        h.smart = (((smart && smart.response) || [])).map((d) => ({ deviceName: d.devicename, temperature: d.temperature == null ? null : d.temperature, healthy: d.overallstatus === 'GOOD', overallStatus: d.overallstatus }));
        return h;
      },
      async _rpc(base, service, method, params, signal) {
        const res = await fetch(`${SystemHealthApi.normalizeBase(base)}/rpc.php`, {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service, method, params: params || null }), signal,
        });
        if (res.status === 401) throw new Error('invalid credentials');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      },
      async login(base, opts, signal) {
        const data = await this._rpc(base, 'session', 'login', { username: opts.username, password: opts.password }, signal);
        if (data && data.response && data.response.authenticated === false) throw new Error('invalid credentials');
        return true;
      },
      async getData(base, opts, session, signal) {
        session = session || {};
        if (!session.loggedIn) { await this.login(base, opts, signal); session.loggedIn = true; }
        const [system, fs, smart, cputemp] = await Promise.all([
          this._rpc(base, 'system', 'getInformation', null, signal),
          this._rpc(base, 'filesystemmgmt', 'enumerateMountedFilesystems', { includeroot: true }, signal),
          this._rpc(base, 'smart', 'enumerateDevices', null, signal).catch(() => null),
          this._rpc(base, 'cputemp', 'get', null, signal).catch(() => null),
        ]);
        return this.mapResponses(system, fs, smart, cputemp);
      },
      async testConnection(base, opts, signal) { await this.login(base, opts, signal); return { ok: true }; },
    },

    // ── TrueNAS (WebSocket JSON-RPC) ────────────────────────────────────────────
    truenas: {
      // Pure: map the websocket method results to system health.
      mapResults(systemInfo, reporting, pools, netdata) {
        const h = emptyHealth();
        const latest = (id) => { const it = (reporting || []).find((r) => r.identifier === id); return (it && it.data && it.data.length) ? it.data[it.data.length - 1] : []; };
        const cpu = latest('cpu'), cputemp = latest('cputemp'), mem = latest('memory');
        // Faithful to Homarr: the latest row includes the timestamp at index 0;
        // values > 100 (incl. the timestamp) are treated as 0, then averaged
        // over the full row length.
        h.cpuUtilization = cpu.length ? cpu.reduce((a, v) => a + (v > 100 ? 0 : v), 0) / cpu.length : 0;
        const temps = cputemp.slice(1).filter((v) => typeof v === 'number');
        h.cpuTemp = temps.length ? Math.max.apply(null, temps) : undefined;
        const si = systemInfo || {};
        h.memAvailableInBytes = si.physmem || 0;
        h.memUsedInBytes = mem[1] || 0;
        h.version = si.version || '';
        h.cpuModelName = si.model || '';
        h.uptime = si.uptime_seconds || 0;
        const sumNet = (idx) => (netdata || []).reduce((a, n) => { const last = n.data && n.data.length ? n.data[n.data.length - 1] : null; return a + ((last && last[idx]) || 0); }, 0);
        h.network = { up: sumNet(2) * 100, down: sumNet(1) * 100 };
        h.fileSystem = (pools || []).map((p) => ({ deviceName: p.name, used: `${p.allocated}`, available: `${p.size}`, percentage: p.size ? (p.allocated / p.size) * 100 : 0 }));
        h.smart = (pools || []).map((p) => ({ deviceName: p.name, healthy: !!p.healthy, overallStatus: p.status, temperature: null }));
        return h;
      },
      // Minimal browser WebSocket JSON-RPC client.
      _wsUrl(base, path) { return `${SystemHealthApi.normalizeBase(base).replace(/^http/i, 'ws')}${path}`; },
      connect(base, opts, signal) {
        return new Promise((resolve, reject) => {
          if (typeof WebSocket === 'undefined') { reject(new Error('WebSocket not available')); return; }
          const ws = new WebSocket(this._wsUrl(base, '/api/current'));
          let nextId = 1; const pending = new Map();
          const fail = (e) => { reject(e instanceof Error ? e : new Error('TrueNAS connection failed')); };
          ws.onerror = () => fail(new Error('TrueNAS unavailable'));
          ws.onclose = () => { pending.forEach((p) => p.reject(new Error('connection closed'))); };
          ws.onmessage = (ev) => {
            let msg; try { msg = JSON.parse(ev.data); } catch { return; }
            const p = pending.get(msg.id);
            if (!p) return;
            pending.delete(msg.id);
            if (msg.error != null) p.reject(new Error((msg.error && msg.error.message) || 'TrueNAS error'));
            else p.resolve(msg.result);
          };
          const call = (method, params) => new Promise((res, rej) => { const id = String(nextId++); pending.set(id, { resolve: res, reject: rej }); ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params: params || [] })); });
          ws.onopen = async () => {
            try {
              const ok = opts.apiKey
                ? await call('auth.login_with_api_key', [opts.apiKey])
                : await call('auth.login', [opts.username, opts.password]);
              if (!ok) throw new Error('invalid credentials');
              resolve({ call, close: () => ws.close() });
            } catch (e) { try { ws.close(); } catch {} fail(e); }
          };
          if (signal) signal.addEventListener('abort', () => { try { ws.close(); } catch {} });
        });
      },
      async getData(base, opts, session, signal) {
        const client = await this.connect(base, opts, signal);
        try {
          const fiveMinAgo = Math.floor(Date.now() / 1000) - 300, now = Math.floor(Date.now() / 1000);
          const [systemInfo, reporting, pools] = await Promise.all([
            client.call('system.info'),
            client.call('reporting.get_data', [[{ name: 'cpu' }, { name: 'memory' }, { name: 'cputemp' }], { aggregate: true, start: fiveMinAgo, end: now }]),
            client.call('pool.query', [[], { extra: { is_upgraded: true } }]),
          ]);
          let netdata = [];
          try {
            const ifaces = await client.call('interface.query', [[], {}]);
            netdata = await client.call('reporting.netdata_get_data', [(ifaces || []).map((i) => ({ name: 'interface', identifier: i.id })), { start: fiveMinAgo, end: now }]);
          } catch { /* network optional */ }
          const activePools = (pools || []).filter((p) => p.allocated != null && p.size != null);
          return this.mapResults(systemInfo, reporting, activePools, netdata);
        } finally { client.close(); }
      },
      async testConnection(base, opts, signal) { const c = await this.connect(base, opts, signal); c.close(); return { ok: true }; },
    },

    getData(service, base, opts, session, signal) { return this[service].getData(base, opts, session, signal); },
    testConnection(service, base, opts, signal) { return this[service].testConnection(base, opts, signal); },
  };

  // ─── display helpers ────────────────────────────────────────────────────────
  function fmtBytes(n) {
    let v = Number(n) || 0; const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
  }
  function fmtSpeed(n) { return `${fmtBytes(n)}/s`; }
  function fmtUptime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0)); const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`; if (h > 0) return `${h}h ${m}m`; return `${m}m`;
  }
  function fmtPct(n) { return `${Math.round((Number(n) || 0) * 10) / 10}%`; }
  const TITLE = { glances: 'Glances', dashdot: 'dash.', unraid: 'Unraid', openmediavault: 'OpenMediaVault', truenas: 'TrueNAS' };
  const ICON  = { glances: 'glances.svg', dashdot: 'dashdot.png', unraid: 'unraid.svg', openmediavault: 'openmediavault.svg', truenas: 'truenas.svg' };

  class SystemHealthWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ service: 'glances', baseUrl: '', apiKey: '', username: '', password: '', pollMs: 30000, dataProvider: null }, config || {});
      this.data = null; this.session = {}; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(10000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (patch && (patch.baseUrl || patch.apiKey || patch.username || patch.password)) this.session = {}; if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    _opts() { return { apiKey: this.cfg.apiKey, username: this.cfg.username, password: this.cfg.password }; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await SystemHealthApi.getData(this.cfg.service, this.cfg.baseUrl, this._opts(), this.session, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('syshealth-widget', `sh-${this.cfg.service}`);
      this.el.innerHTML = `<div class="sh-header"><img class="wg-icon" src="../icons/integrations/${ICON[this.cfg.service] || ''}" alt=""><div class="sh-title"></div><div class="sh-tools"><div class="sh-error" style="display:none"></div><span class="sh-ver"></span></div></div><div class="sh-body"></div>`;
      this.titleEl = this.el.querySelector('.sh-title'); this.errorEl = this.el.querySelector('.sh-error'); this.verEl = this.el.querySelector('.sh-ver'); this.body = this.el.querySelector('.sh-body');
      this.titleEl.textContent = TITLE[this.cfg.service] || 'System';
    }
    _render(d) {
      const h = d || emptyHealth();
      this.verEl.textContent = h.version || '';
      const memTotal = (h.memUsedInBytes || 0) + (h.memAvailableInBytes || 0);
      const memPct = memTotal ? (h.memUsedInBytes / memTotal) * 100 : 0;
      const tiles = [
        ['CPU', fmtPct(h.cpuUtilization), 'sh-cpu'],
        ['Memory', fmtPct(memPct), 'sh-mem', `${fmtBytes(h.memUsedInBytes)} / ${fmtBytes(memTotal)}`],
        ['Uptime', fmtUptime(h.uptime), '', h.cpuModelName ? '' : ''],
      ];
      if (h.cpuTemp != null) tiles.push(['CPU temp', `${Math.round(h.cpuTemp)}°C`, 'sh-temp']);
      if (h.network) tiles.push(['Network', `↓${fmtSpeed(h.network.down)}`, '', `↑${fmtSpeed(h.network.up)}`]);
      if (h.loadAverage) tiles.push(['Load', `${h.loadAverage['1min']}`, '', `${h.loadAverage['5min']} / ${h.loadAverage['15min']}`]);

      let badges = '';
      if (h.rebootRequired) badges += `<span class="sh-badge sh-badge-warn">Reboot required</span>`;
      if (h.availablePkgUpdates > 0) badges += `<span class="sh-badge sh-badge-info">${h.availablePkgUpdates} update${h.availablePkgUpdates === 1 ? '' : 's'}</span>`;

      const fsRows = (h.fileSystem || []).slice(0, 6).map((f) => `
        <div class="sh-fs-row"><span class="sh-fs-name" title="${escapeAttr(f.deviceName)}">${escapeHtml(f.deviceName)}</span>
          <div class="sh-fs-bar"><div class="sh-fs-fill" style="width:${Math.max(0, Math.min(100, f.percentage || 0))}%"></div></div>
          <span class="sh-fs-pct">${Math.round(f.percentage || 0)}%</span></div>`).join('');
      const smartRows = (h.smart || []).filter((x) => x.deviceName).slice(0, 6).map((x) => `
        <div class="sh-smart-row"><span class="sh-dot ${x.healthy ? 'sh-ok' : 'sh-err'}"></span><span class="sh-smart-name">${escapeHtml(x.deviceName)}</span>
          <span class="sh-smart-meta">${escapeHtml(x.overallStatus || '')}${x.temperature != null ? ` · ${x.temperature}°C` : ''}</span></div>`).join('');
      const gpuRows = (h.gpu || []).map((g) => `
        <div class="sh-fs-row"><span class="sh-fs-name">${escapeHtml(g.name)}</span>
          <div class="sh-fs-bar"><div class="sh-fs-fill" style="width:${Math.max(0, Math.min(100, g.processorUtilization || 0))}%"></div></div>
          <span class="sh-fs-pct">${Math.round(g.processorUtilization || 0)}%</span></div>`).join('');

      this.body.innerHTML =
        `<div class="sh-grid">${tiles.map((t) => `<div class="sh-tile ${t[2] || ''}"><span class="sh-val">${escapeHtml(t[1])}</span><span class="sh-lbl">${t[0]}</span>${t[3] ? `<span class="sh-sub">${escapeHtml(t[3])}</span>` : ''}</div>`).join('')}</div>`
        + (badges ? `<div class="sh-badges">${badges}</div>` : '')
        + (fsRows ? `<div class="sh-section"><div class="sh-sec-head">Filesystems</div>${fsRows}</div>` : '')
        + (gpuRows ? `<div class="sh-section"><div class="sh-sec-head">GPU</div>${gpuRows}</div>` : '')
        + (smartRows ? `<div class="sh-section"><div class="sh-sec-head">Disks (SMART)</div>${smartRows}</div>` : '');
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid (API key|credentials)|HTTP\s*40[13]/i.test(msg) ? 'Check credentials' : `${TITLE[this.cfg.service] || 'Host'} unavailable`;
      this.el.classList.add('sh-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('sh-has-error'); } }
  }

  function makeWrapper(service) { return function (el, cfg) { return new SystemHealthWidget(el, Object.assign({ service }, cfg || {})); }; }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.SystemHealthApi = SystemHealthApi;
  global.SystemHealthWidget = SystemHealthWidget;
  global.GlancesWidget = makeWrapper('glances');
  global.DashdotWidget = makeWrapper('dashdot');
  global.UnraidWidget = makeWrapper('unraid');
  global.OpenMediaVaultWidget = makeWrapper('openmediavault');
  global.TrueNasWidget = makeWrapper('truenas');
  SystemHealthWidget._fmtUptime = fmtUptime;
  SystemHealthWidget._fmtBytes = fmtBytes;
  SystemHealthApi._emptyHealth = emptyHealth;
})(typeof window !== 'undefined' ? window : this);
