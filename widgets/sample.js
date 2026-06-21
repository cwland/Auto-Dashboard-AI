'use strict';
const GB = 1024 ** 3;
const now = () => Math.floor(Date.now() / 1000);
const root = document.getElementById('root');

// Samples are static, display-only previews — never auto-scroll. This page is
// isolated (no live widgets), so force every ListCarousel instance created here
// to start disabled. Covers all list/carousel sample widgets in one place
// (current and future); the combined-weather widget uses its own scroller and
// is turned off via `carousel: false` at its mount below.
if (typeof ListCarousel === 'function' && !ListCarousel._sampleStatic) {
  const _Orig = ListCarousel;
  const _Patched = function (opts) { return new _Orig(Object.assign({}, opts || {}, { enabled: false })); };
  _Patched.prototype = _Orig.prototype;
  Object.keys(_Orig).forEach((k) => { _Patched[k] = _Orig[k]; });   // buildControls, toggleRow, sliderRow, segmentRow
  _Patched._sampleStatic = true;
  // eslint-disable-next-line no-global-assign
  ListCarousel = _Patched;
  if (typeof window !== 'undefined') window.ListCarousel = _Patched;
}

// Create a captioned tile and return the inner host element to mount into.
function tile(caption) {
  const wrap = document.createElement('div');
  wrap.className = 'tile';
  if (caption) { const h = document.createElement('div'); h.className = 'cap'; h.textContent = caption; wrap.appendChild(h); }
  const host = document.createElement('div');
  wrap.appendChild(host);
  root.appendChild(wrap);
  return host;
}
const poster = (label, c1, c2) => 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="140" height="210"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="140" height="210" fill="url(#g)"/><text x="70" y="110" fill="#fff" font-family="system-ui" font-size="14" font-weight="700" text-anchor="middle">${label}</text></svg>`);

const SAMPLES = {
  // ── Media servers ──────────────────────────────────────────────────────
  plex(h) {
    const raw = [
      { type: 'episode', grandparentTitle: 'Severance', parentTitle: 'Season 2', title: 'Cold Harbor', index: '4', user: { title: 'avery' }, player: { product: 'Plex Web', title: 'Chrome' }, session: { id: 's1' } },
      { type: 'movie', title: 'Dune: Part Two', user: { title: 'jordan' }, player: { product: 'Plex for Apple TV', title: 'Living Room' }, session: { id: 's2' } },
      { type: 'track', grandparentTitle: 'Daft Punk', parentTitle: 'Discovery', title: 'Digital Love', user: { title: 'sam' }, player: { product: 'Plexamp', title: 'iPhone' } },
    ];
    new PlexWidget(tile('Plex — Now Playing'), { dataProvider: () => Promise.resolve(PlexApi.mapSessions(raw)) }).start();
  },
  jellyfin: (h) => mediaServer('jellyfin'),
  emby: (h) => mediaServer('emby'),

  tautulli(h) {
    const chrome = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" rx="11" fill="#e8483c"/><circle cx="24" cy="24" r="9" fill="#fff"/><circle cx="24" cy="24" r="5" fill="#4285f4"/></svg>');
    const backdrop = (c1, c2) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="340"><rect width="600" height="340" fill="${c1}"/></svg>`);
    const card = (over) => Object.assign({
      key: 'k', poster: poster('NOW', '#3a5a7a', '#1a2a3a'), backdrop: backdrop('#2a3a4a', '#10161e'),
      username: 'avery', product: 'Plex Web', player: 'Chrome', quality: 'Original (4.3 Mbps)', qualityWarn: true,
      stream: 'Transcode (Throttled)', container: 'Converting (MKV → MP4)', video: 'Direct Stream (H264 720p)',
      audio: 'Transcode (AC3 5.1 → AAC)', subtitle: 'None', location: 'LAN: 192.168.50.16', secure: true,
      bandwidth: '5.0 Mbps', eta: '19:14', progressText: '1:22 / 42:50', progressPct: 32,
      state: 'playing', stateIcon: '▶', mediaIcon: '🖥', footTitle: 'Severance - Cold Harbor', footSub: 'S2 · E4',
      platformIcon: chrome, avatarInitial: 'A', avatarColor: '#e07a7a', avatarImg: '',
    }, over);
    const cardsA = [
      card({ key: 'a' }),
      card({ key: 'b', footTitle: 'Dune: Part Two', footSub: '2024', mediaIcon: '🎬', product: 'Plex for Apple TV', player: 'Living Room', bandwidth: '12.4 Mbps', avatarInitial: 'J', avatarColor: '#6f8fe0', username: 'jordan', state: 'paused', stateIcon: '❚❚', progressPct: 61, poster: poster('DUNE', '#7a5a3a', '#3a2a1a') }),
    ];

    // Widget 1 — the activity carousel.
    const host = tile('Tautulli — Activity');
    const w = new TautulliWidget(host, { baseUrl: '', apiKey: '', maxVisible: 3 });
    w.stop();
    w.headerSummary.textContent = 'Sessions: 2 streams (1 transcode) | Bandwidth: 5.0 Mbps';
    w.headerTitle.textContent = 'Tautulli';
    w.noStreams.style.display = 'none';
    w._reconcile(cardsA);

    // Widget 2 — the Plex-style streams list (same sample data).
    if (typeof TautulliListWidget !== 'undefined') {
      const lw = new TautulliListWidget(tile('Tautulli — Streams'), { baseUrl: '', apiKey: '' });
      lw.stop();
      lw._renderSessions(cardsA, { count: 2, total: '17.4 Mbps' });
    }

    // Widgets 3–6 — the stats widgets (each mounts its own captioned tile).
    ['tautulli-recent', 'tautulli-watch', 'tautulli-libraries', 'tautulli-top']
      .forEach((wid) => { if (typeof SAMPLES[wid] === 'function') SAMPLES[wid](); });
  },

  'tautulli-list'(h) {
    const pf = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#e8483c"/><circle cx="20" cy="20" r="7" fill="#fff"/><circle cx="20" cy="20" r="4" fill="#4285f4"/></svg>');
    const pfApple = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="9" fill="#0a0a0a"/><rect x="10" y="11" width="20" height="13" rx="2" fill="none" stroke="#fff" stroke-width="2"/><rect x="15" y="27" width="10" height="2.2" rx="1.1" fill="#fff"/></svg>');
    const pfAndroid = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="9" fill="#3ddc84"/><path d="M12 19a8 8 0 0 1 16 0z" fill="#0a0a0a"/><rect x="12" y="20" width="16" height="10" rx="2.2" fill="#0a0a0a"/><circle cx="17" cy="16.5" r="1.2" fill="#3ddc84"/><circle cx="23" cy="16.5" r="1.2" fill="#3ddc84"/></svg>');
    const card = (over) => Object.assign({
      username: 'avery', product: 'Plex Web', player: 'Chrome', bandwidth: '5.0 Mbps', platformIcon: pf,
      location: 'LAN: 192.168.50.16', eta: '19:14', progressText: '1:22 / 42:50', progressPct: 32,
      state: 'playing', stateIcon: '▶', mediaIcon: '🖥', footTitle: 'Severance - Cold Harbor', footSub: 'S2 · E4',
      avatarInitial: 'A', avatarColor: '#e07a7a', avatarImg: '',
    }, over);
    const w = new TautulliListWidget(tile('Tautulli — Streams'), { baseUrl: '', apiKey: '' });
    w.stop();
    w._renderSessions([
      card({}),
      card({ footTitle: 'Dune: Part Two', footSub: '🎬 2024', mediaIcon: '🎬', product: 'Plex for Apple TV', player: 'Living Room', bandwidth: '12.4 Mbps', location: 'WAN: 73.42.10.5', eta: '20:38', progressText: '48:10 / 2:46:00', progressPct: 29, state: 'paused', stateIcon: '❚❚', username: 'jordan', avatarInitial: 'J', avatarColor: '#6f8fe0', platformIcon: pfApple }),
      card({ footTitle: 'Daft Punk - Digital Love', footSub: '🎵 Discovery', mediaIcon: '🎵', product: 'Plexamp', player: 'Pixel 8', bandwidth: '0.3 Mbps', location: 'WAN: 98.11.4.20', eta: '18:52', progressText: '1:48 / 4:58', progressPct: 36, username: 'sam', avatarInitial: 'S', avatarColor: '#7ec07e', platformIcon: pfAndroid }),
    ], { count: 3, total: '17.7 Mbps' });
  },

  // ── Media management / requests ─────────────────────────────────────────
  sonarr: (h) => arr('sonarr'),
  radarr: (h) => arr('radarr'),
  seerr(h) {
    const USERS = [{ id: 1, displayName: 'avery', requestCount: 42 }, { id: 2, displayName: 'jordan', requestCount: 27 }, { id: 3, displayName: 'sam', requestCount: 11 }];
    const TITLES = [['movie', 'Dune: Part Two'], ['tv', 'Severance'], ['movie', 'Furiosa'], ['tv', 'Shogun'], ['movie', 'Mickey 17'], ['tv', 'Foundation']];
    const reqs = TITLES.map((t, i) => {
      const status = [1, 2, 5, 2, 3, 5][i], mediaStatus = [2, 3, 5, 4, 1, 5][i];
      const raw = { id: 100 + i, type: t[0], status, createdAt: new Date(Date.now() - i * 86400000).toISOString(), media: { status: mediaStatus, tmdbId: 1000 + i, downloadStatus: i === 1 ? [{}] : [] }, requestedBy: USERS[i % USERS.length] };
      return SeerrApi.mapRequest(raw, { name: t[1], posterPath: null }, 'http://demo');
    });
    const stats = { total: reqs.length, movie: 3, tv: 3, pending: 2, approved: 2, declined: 1, processing: 1, available: 3 };
    new SeerrWidget(tile('Seerr — Requests'), { view: 'requests', showUsers: true, dataProvider: () => Promise.resolve({ requests: reqs, stats, users: USERS.map((u) => ({ name: u.displayName, avatarUrl: null, requestCount: u.requestCount })) }) }).start();
  },

  // ── DNS ─────────────────────────────────────────────────────────────────
  pihole(h) {
    new PiholeWidget(tile('Pi-hole'), { dataProvider: () => Promise.resolve(DnsHoleApi.pihole.mapV6(
      { queries: { total: 48213, blocked: 9120, percent_blocked: (9120 / 48213) * 100 }, gravity: { domains_being_blocked: 184219 } },
      { blocking: 'enabled', timer: null })) }).start();
  },
  adguard(h) {
    new AdguardWidget(tile('AdGuard Home'), { dataProvider: () => Promise.resolve(DnsHoleApi.adguard.computeSummary(
      { time_units: 'hours', dns_queries: [30190], blocked_filtering: [5021] },
      { protection_enabled: true },
      { filters: [{ enabled: true, rules_count: 52000 }, { enabled: true, rules_count: 38500 }, { enabled: false, rules_count: 10000 }] })) }).start();
  },

  // ── Network ─────────────────────────────────────────────────────────────
  unifi(h) {
    const health = [
      { subsystem: 'wan', status: 'ok' },
      { subsystem: 'www', status: 'ok', latency: 12, speedtest_ping: 16, uptime: 864000 },
      { subsystem: 'wlan', status: 'ok', num_user: 24, num_guest: 3 },
      { subsystem: 'lan', status: 'ok', num_user: 18, num_guest: 0 },
      { subsystem: 'vpn', status: 'ok', remote_user_num_active: 2 },
    ];
    new UnifiWidget(tile('UniFi — Network'), { dataProvider: () => Promise.resolve(UnifiApi.mapSites([{ health }])) }).start();
  },
  speedtest(h) {
    const data = {
      latest: SpeedtestApi.mapLatest({ id: 1, ping: 12.4, download_bits: 942000000, upload_bits: 118000000, healthy: true, created_at: new Date(Date.now() - 1800000).toISOString() }),
      stats: SpeedtestApi.mapStats({ ping: { avg: 13.8, min: 9, max: 40 }, download: { avg: 910.2 }, upload: { avg: 115.6 }, total_results: 412 }),
    };
    new SpeedtestWidget(tile('Speedtest Tracker'), { dataProvider: () => Promise.resolve(data) }).start();
  },
  opnsense(h) {
    const data = {
      version: OpnsenseApi.mapVersion({ versions: ['24.7.3', 'OpenSSL 3.0'] }).version,
      cpu: OpnsenseApi.mapCpu({ total: 14 }),
      memory: OpnsenseApi.mapMemory({ memory: { total: String(8 * GB), used: 2.6 * GB } }),
      interfaces: OpnsenseApi.mapInterfaces({ interfaces: {
        wan: { name: 'WAN', 'bytes received': String(4 * GB), 'bytes transmitted': String(1 * GB) },
        lan: { name: 'LAN', 'bytes received': String(12 * GB), 'bytes transmitted': String(9 * GB) },
      } }),
    };
    new OpnsenseWidget(tile('OPNsense — Firewall'), { dataProvider: () => Promise.resolve(data) }).start();
  },

  // ── Download clients ────────────────────────────────────────────────────
  sabnzbd(h) {
    const q = { queue: { paused: false, kbpersec: '4200', slots: [
      { status: 'Downloading', index: 0, mb: '1500', filename: 'Ubuntu.24.04.iso', cat: 'software', timeleft: '0:04:12', percentage: '63', nzo_id: 'q1' },
      { status: 'Queued', index: 1, mb: '8200', filename: 'BigBuckBunny.4K.mkv', cat: 'movies', timeleft: '0:31:50', percentage: '0', nzo_id: 'q2' },
    ] } };
    const hist = { history: { slots: [{ category: 'tv', download_time: 120, status: 'Completed', completed: now() - 3600, nzo_id: 'h1', postproc_time: 30, name: 'Some.Show.S01E02', bytes: 1610612736 }] } };
    new SabnzbdWidget(tile('SABnzbd'), { dataProvider: (o) => Promise.resolve(DownloadsApi.sabnzbd.build(q, hist, o.limit)) }).start();
  },
  qbittorrent(h) {
    const t = [
      { hash: 'a', priority: 1, name: 'Arch.Linux.iso', size: 900000000, uploaded: 50000000, dlspeed: 3200000, upspeed: 120000, progress: 0.42, eta: 900, added_on: now() - 1800, completion_on: 0, state: 'downloading', category: 'iso' },
      { hash: 'b', priority: 2, name: 'Public.Domain.Film.mkv', size: 4200000000, uploaded: 800000000, dlspeed: 0, upspeed: 450000, progress: 1, eta: 8640000, added_on: now() - 86400, completion_on: now() - 3600, state: 'uploading', category: 'video' },
    ];
    new QbittorrentWidget(tile('qBittorrent'), { dataProvider: () => Promise.resolve(DownloadsApi.qbittorrent.build(t)) }).start();
  },
  transmission(h) {
    const t = [
      { hashString: 'x', queuePosition: 0, name: 'Dataset.tar.gz', totalSize: 1200000000, percentDone: 0.77, rateDownload: 5400000, rateUpload: 0, uploadedEver: 0, downloadedEver: 920000000, eta: 300, status: 4, addedDate: now() - 1200, doneDate: 0, labels: ['data'] },
      { hashString: 'y', queuePosition: 1, name: 'Seeding.Release.iso', totalSize: 3000000000, percentDone: 1, rateDownload: 0, rateUpload: 680000, uploadedEver: 5000000000, downloadedEver: 3000000000, eta: -1, status: 6, addedDate: now() - 200000, doneDate: now() - 50000, labels: [] },
    ];
    new TransmissionWidget(tile('Transmission'), { dataProvider: (o) => Promise.resolve(DownloadsApi.transmission.build(t, o.limit)) }).start();
  },

  // ── Monitoring / health ─────────────────────────────────────────────────
  uptimekuma(h) {
    const mons = [
      { id: 10, name: 'Home Assistant', st: 'up', pct: 0.9998 }, { id: 20, name: 'Plex Media Server', st: 'up', pct: 0.9971 },
      { id: 30, name: 'Nextcloud', st: 'up', pct: 0.9925 }, { id: 40, name: 'Pi-hole DNS', st: 'up', pct: 0.9999 },
      { id: 50, name: 'Backup NAS', st: 'paused', pct: 0.88 }, { id: 60, name: 'Public Website', st: 'down', pct: 0.62 },
    ];
    const SC = { up: 1, down: 0, paused: 2 };
    const statusPage = { publicGroupList: [{ id: 1, name: 'Services', monitorList: mons.map((m) => ({ id: m.id, name: m.name })) }] };
    const hb = { heartbeatList: {}, uptimeList: {} };
    mons.forEach((m) => { hb.heartbeatList[String(m.id)] = [{ status: SC[m.st], time: '2026-01-01 00:00:00' }]; hb.uptimeList[`${m.id}_24`] = m.pct; });
    const w = new UptimeKumaWidget(tile('Uptime Kuma'), { showAverageUptime: true, showUptimeRing: true, showTotalMonitors: true, showUpCount: true, showDownCount: true, showPausedCount: true, showMonitorList: true });
    w.stop();
    const data = UptimeKumaApi.aggregate(statusPage, hb);
    w.data = data; w._render(data);
  },
  glances: (h) => new GlancesWidget(tile('Glances'), { dataProvider: () => Promise.resolve(SystemHealthApi.glances.mapAll({
    cpu: { total: 23.4 }, mem: { total: 32 * GB, used: 11 * GB }, network: [{ bytes_recv_rate_per_sec: 1240000, bytes_sent_rate_per_sec: 320000 }],
    fs: [{ device_name: '/dev/sda1', used: 120 * GB, free: 380 * GB, percent: 24 }], uptime: '12 days, 4:13:09', quicklook: { cpu_name: 'AMD Ryzen 7 5700G' }, gpu: [],
  }, '4.2.0')) }).start(),
  dashdot: (h) => new DashdotWidget(tile('Dash.'), { dataProvider: () => Promise.resolve(SystemHealthApi.dashdot.mapData(
    { maxAvailableMemoryBytes: 16 * GB, storage: [{ size: 1000 * GB }], cpuBrand: 'Intel', cpuModel: 'i5-12400', operatingSystemVersion: 'Debian 12', uptime: 540000, gpuNames: [] },
    { sumLoad: 41.2, averageTemperature: 52 }, 6.5 * GB, [220 * GB], { up: 90000, down: 4200000 }, [])) }).start(),
  unraid: (h) => new UnraidWidget(tile('Unraid'), { dataProvider: () => Promise.resolve(SystemHealthApi.unraid.mapSystemInfo({
    metrics: { cpu: { cpus: [{ percentTotal: 18 }, { percentTotal: 22 }] }, memory: { percentTotal: 47 } },
    array: { disks: [{ name: 'disk1', size: 8 * GB, fsUsed: 3 * GB, status: 'DISK_OK', temp: 34 }, { name: 'disk2', size: 8 * GB, fsUsed: 7.5 * GB, status: 'DISK_DSBL', temp: 39 }] },
    info: { os: { release: '7.0.0', uptime: new Date(Date.now() - 86400000 * 3).toISOString() }, cpu: { brand: 'Intel Xeon E5', cores: 8 }, memory: { layout: [{ size: 16 * GB }, { size: 16 * GB }] } },
  })) }).start(),
  openmediavault: (h) => new OpenMediaVaultWidget(tile('OpenMediaVault'), { dataProvider: () => Promise.resolve(SystemHealthApi.openmediavault.mapResponses(
    { response: { version: '7.4', cpuModelName: 'Intel N100', cpuUtilization: 12.5, memUsed: 2.4 * GB, memAvailable: 8 * GB, uptime: 720000, loadAverage: { '1min': 0.4, '5min': 0.6, '15min': 0.5 }, rebootRequired: true, availablePkgUpdates: 5 } },
    { response: [{ devicename: '/dev/sda1', used: '120 GiB', available: 380 * GB, percentage: 24 }] },
    { response: [{ devicename: '/dev/sda', temperature: 36, overallstatus: 'GOOD' }, { devicename: '/dev/sdb', temperature: 41, overallstatus: 'BAD' }] },
    { response: { cputemp: 44 } })) }).start(),
  truenas: (h) => new TrueNasWidget(tile('TrueNAS'), { dataProvider: () => Promise.resolve(SystemHealthApi.truenas.mapResults(
    { physmem: 64 * GB, version: 'TrueNAS-SCALE-24.10', model: 'AMD EPYC 7302P', uptime_seconds: 1200000 },
    [{ identifier: 'cpu', data: [[0, 15, 12, 8]] }, { identifier: 'memory', data: [[0, 40 * GB]] }, { identifier: 'cputemp', data: [[0, 45, 47]] }],
    [{ name: 'tank', allocated: 6 * 1024 * GB, size: 10 * 1024 * GB, healthy: true, status: 'ONLINE' }, { name: 'backup', allocated: 1 * 1024 * GB, size: 4 * 1024 * GB, healthy: false, status: 'DEGRADED' }],
    [{ data: [[0, 1240000, 320000]] }])) }).start(),
  proxmox: (h) => new ProxmoxWidget(tile('Proxmox VE'), { dataProvider: () => Promise.resolve(ProxmoxApi.mapResources([
    { type: 'node', id: 'node/pve1', node: 'pve1', status: 'online', cpu: 0.18, maxcpu: 16, mem: 18 * GB, maxmem: 64 * GB, uptime: 900000 },
    { type: 'qemu', id: 'qemu/100', vmid: 100, name: 'web', status: 'running', cpu: 0.05, maxcpu: 4, mem: 2 * GB, maxmem: 4 * GB },
    { type: 'qemu', id: 'qemu/101', vmid: 101, name: 'db', status: 'stopped', cpu: 0, maxcpu: 4, mem: 0, maxmem: 8 * GB },
    { type: 'lxc', id: 'lxc/200', vmid: 200, name: 'pihole', status: 'running', cpu: 0.01, maxcpu: 1, mem: 0.2 * GB, maxmem: 0.5 * GB },
    { type: 'storage', id: 'storage/pve1/local', storage: 'local', node: 'pve1', status: 'available', disk: 80 * GB, maxdisk: 100 * GB, shared: 0 },
  ])) }).start(),
  pbs: (h) => new PbsWidget(tile('Proxmox Backup Server'), { dataProvider: () => Promise.resolve({
    node: PbsApi.mapNode({ cpu: 0.07, memory: { total: 16 * GB, used: 4.2 * GB }, uptime: 1300000 }),
    datastores: PbsApi.mapDatastores([{ store: 'main', used: 3.4 * 1024 * GB, total: 8 * 1024 * GB, avail: 4.6 * 1024 * GB }, { store: 'offsite', used: 6.9 * 1024 * GB, total: 8 * 1024 * GB, avail: 1.1 * 1024 * GB }]),
  }) }).start(),
  beszel: (h) => new BeszelWidget(tile('Beszel'), { dataProvider: () => Promise.resolve(BeszelApi.mapSystems([
    { id: '1', name: 'web-01', host: '10.0.0.5', status: 'up', info: { cpu: 14, mp: 38, dp: 52, u: 540000, m: 'Xeon', v: '0.9.1' } },
    { id: '2', name: 'db-01', host: '10.0.0.6', status: 'up', info: { cpu: 61, mp: 74, dp: 88, u: 1200000, v: '0.9.1' } },
    { id: '3', name: 'backup', host: '10.0.0.7', status: 'down', info: { cpu: 0, mp: 0, dp: 0, u: 0, v: '0.9.1' } },
  ])) }).start(),
  peanut: (h) => new PeanutWidget(tile('PeaNUT — UPS'), { dataProvider: () => Promise.resolve(PeanutApi.mapDevices([
    { 'peanut.device_id': 'ups', 'device.mfr': 'APC', 'device.model': 'Back-UPS 1500', 'ups.status': 'OL', 'battery.charge': 100, 'battery.runtime': 3120, 'ups.load': 22, 'input.voltage': 121.5, 'ups.realpower': 88, 'ups.temperature': 31 },
  ])) }).start(),

  // ── Media library ───────────────────────────────────────────────────────
  audiobookshelf: (h) => new AudiobookshelfWidget(tile('Audiobookshelf'), { dataProvider: () => Promise.resolve(AudiobookshelfApi.buildDashboard(
    [{ id: 'a', mediaType: 'book' }, { id: 'b', mediaType: 'podcast' }], [{ mediaType: 'book', totalItems: 842 }, { mediaType: 'podcast', totalItems: 1290 }], 486000, 2)) }).start(),
  navidrome(h) {
    const artistsBody = { artists: { index: [{ artist: new Array(120).fill({}) }, { artist: new Array(90).fill({}) }] } };
    const albumPages = [new Array(500).fill({ songCount: 11 }), new Array(180).fill({ songCount: 9 })];
    const np = { nowPlaying: { entry: [{ title: 'Digital Love', artist: 'Daft Punk', album: 'Discovery', username: 'avery', playerName: 'Plexamp' }] } };
    new NavidromeWidget(tile('Navidrome'), { dataProvider: () => Promise.resolve({ artistCount: NavidromeApi.countArtists(artistsBody), ...NavidromeApi.countAlbumsSongs(albumPages), nowPlaying: NavidromeApi.mapNowPlaying(np) }) }).start();
  },
  prowlarr(h) {
    const indexers = [{ id: 1, name: '1337x', indexerUrls: ['https://1337x.to'], enable: true }, { id: 2, name: 'Nyaa', indexerUrls: ['https://nyaa.si'], enable: true }, { id: 3, name: 'RARBG (dead)', indexerUrls: ['https://rarbg.to'], enable: true }, { id: 4, name: 'Old Tracker', indexerUrls: ['https://example.org'], enable: false }];
    new ProwlarrWidget(tile('Prowlarr'), { dataProvider: () => Promise.resolve(ProwlarrApi.buildIndexers(indexers, [{ indexerId: 3 }])) }).start();
  },
  tracearr(h) {
    const stats = { activeStreams: 3, totalUsers: 14, totalSessions: 5210, recentViolations: 2, timestamp: '' };
    const streams = { summary: { total: 3, transcodes: 1, directStreams: 1, directPlays: 1, totalBitrate: '24 Mbps' }, data: [
      { id: 's1', serverName: 'Plex', username: 'avery', mediaTitle: 'Cold Harbor', mediaType: 'episode', showTitle: 'Severance', seasonNumber: 2, episodeNumber: 4, state: 'playing', isTranscode: false },
      { id: 's2', serverName: 'Plex', username: 'jordan', mediaTitle: 'Dune: Part Two', mediaType: 'movie', year: 2024, state: 'paused', videoDecision: 'transcode' },
      { id: 's3', serverName: 'Jellyfin', username: 'sam', mediaTitle: 'Live News', mediaType: 'live', state: 'playing', isTranscode: false },
    ] };
    new TracearrWidget(tile('Tracearr'), { dataProvider: () => Promise.resolve(TracearrApi.buildDashboard(stats, streams, null, null)) }).start();
  },
  umami(h) {
    new UmamiWidget(tile('Umami'), { dataProvider: () => Promise.resolve(UmamiApi.buildSummary({ pageviews: 18420, visitors: 9230, visits: 11200, bounces: 4480, totaltime: 1568000 }, 37, '24h')) }).start();
  },
  ntfy(h) {
    const t = now();
    const text = [
      JSON.stringify({ id: '1', time: t - 120, event: 'message', topic: 'home', title: 'Backup complete', message: 'Nightly backup finished in 4m 12s.' }),
      JSON.stringify({ id: '0', time: t - 5400, event: 'open', topic: 'home' }),
      JSON.stringify({ id: '2', time: t - 7200, event: 'message', topic: 'home', title: 'Door opened', message: 'Front door sensor triggered.' }),
    ].join('\n');
    new NtfyWidget(tile('ntfy — home'), { topic: 'home', dataProvider: () => Promise.resolve(NtfyApi.parseMessages(text)) }).start();
  },

  // ── Calendar / smart home ───────────────────────────────────────────────
  ical(h) {
    const pad = (n) => String(n).padStart(2, '0');
    const d = (off, hh, mm) => { const x = new Date(); x.setDate(x.getDate() + off); return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(hh)}${pad(mm)}00`; };
    const day = (off) => { const x = new Date(); x.setDate(x.getDate() + off); return `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`; };
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0',
      'BEGIN:VEVENT', 'UID:1', `DTSTART:${d(0, 14, 0)}`, `DTEND:${d(0, 15, 0)}`, 'SUMMARY:Dentist appointment', 'LOCATION:Main St Clinic', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:2', `DTSTART:${d(2, 9, 30)}`, `DTEND:${d(2, 10, 0)}`, 'SUMMARY:Standup', 'RRULE:FREQ=WEEKLY;COUNT=8', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:3', `DTSTART;VALUE=DATE:${day(5)}`, 'SUMMARY:Trip to the coast', 'END:VEVENT',
      'END:VCALENDAR'].join('\r\n');
    new IcalWidget(tile('iCal — Family'), { title: 'Family', dataProvider: () => Promise.resolve(IcalApi.parse(ics)) }).start();
  },
  homeassistant(h) {
    new HomeAssistantWidget(tile('Home Assistant'), { dataProvider: () => Promise.resolve([
      HomeAssistantApi.mapState({ entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen Light' } }),
      HomeAssistantApi.mapState({ entity_id: 'switch.office', state: 'off', attributes: { friendly_name: 'Office Switch' } }),
      HomeAssistantApi.mapState({ entity_id: 'sensor.living_room_temperature', state: '21.4', attributes: { friendly_name: 'Living Room Temp', unit_of_measurement: '°C' } }),
      HomeAssistantApi.mapState({ entity_id: 'cover.garage', state: 'closed', attributes: { friendly_name: 'Garage Door' } }),
    ]) }).start();
  },
  nextcloud(h) {
    const n = new Date();
    new NextcloudWidget(tile('Nextcloud'), { dataProvider: () => Promise.resolve(NextcloudApi.mapNotifications({ ocs: { data: [
      { notification_id: 2, datetime: new Date(n - 600000).toISOString(), app: 'files_sharing', subject: 'Shared a file with you', message: 'Anna shared "Budget.xlsx"' },
      { notification_id: 1, datetime: new Date(n - 7200000).toISOString(), app: 'updatenotification', subject: 'Update available', message: 'Nextcloud 30.0.2 is available.' },
    ] } }).slice(0, 10)) }).start();
  },
};

// ── Shared builders ───────────────────────────────────────────────────────
function mediaServer(service) {
  const raw = [
    { Id: 's1', UserName: 'avery', Client: service === 'emby' ? 'Emby Web' : 'Jellyfin Web', DeviceName: 'Chrome', PlayState: { PositionTicks: 30000000000, IsPaused: false }, NowPlayingItem: { Type: 'Episode', SeriesName: 'Severance', SeasonName: 'Season 2', IndexNumber: 4, Name: 'Cold Harbor', RunTimeTicks: 60000000000 } },
    { Id: 's2', UserName: 'jordan', Client: 'Roku', DeviceName: 'Living Room', PlayState: { PositionTicks: 18000000000, IsPaused: true }, NowPlayingItem: { Type: 'Movie', Name: 'Dune: Part Two', ProductionYear: 2024, RunTimeTicks: 166000000000 } },
    { Id: 's3', UserName: 'sam', Client: 'Finamp', DeviceName: 'iPhone', PlayState: { PositionTicks: 90000000000, IsPaused: false }, NowPlayingItem: { Type: 'Audio', AlbumArtist: 'Daft Punk', Album: 'Discovery', Name: 'Digital Love', RunTimeTicks: 180000000000 } },
  ];
  const label = service === 'emby' ? 'Emby — Now Playing' : 'Jellyfin — Now Playing';
  new MediaServerWidget(tile(label), { service, dataProvider: () => Promise.resolve(MediaServerApi.mapSessions(raw)) }).start();
}

function arr(service) {
  const PAL = [['#3a5a7a', '#1a2a3a'], ['#7a3a5a', '#3a1a2a'], ['#3a7a5a', '#1a3a2a'], ['#5a3a7a', '#2a1a3a']];
  const off = (n) => { const x = new Date(); x.setDate(x.getDate() + n); return x.toISOString(); };
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  let raw;
  if (service === 'sonarr') {
    const SHOWS = ['The Bear', 'Severance', 'Foundation', 'Silo', 'Andor', 'Shogun'];
    raw = Array.from({ length: 8 }, (_, i) => { const show = rand(SHOWS), p = rand(PAL), ep = 1 + (i % 10); return {
      title: `Episode ${ep}`, airDateUtc: off(Math.floor(Math.random() * 30) - 3), seasonNumber: 1 + (i % 3), episodeNumber: ep,
      series: { title: show, titleSlug: show.toLowerCase().replace(/\s+/g, '-'), overview: `${show} continues.`, imdbId: 'tt' + (1000000 + i), images: [{ coverType: 'poster', remoteUrl: poster(show, p[0], p[1]) }] }, images: [] }; });
  } else {
    const MOVIES = ['Dune: Part Two', 'Furiosa', 'The Batman II', 'Mickey 17', 'Nosferatu'];
    raw = Array.from({ length: 6 }, (_, i) => { const title = rand(MOVIES), p = rand(PAL), b = Math.floor(Math.random() * 25) - 3; return {
      title, originalTitle: title, titleSlug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), overview: `${title} hits screens.`, imdbId: 'tt' + (2000000 + i),
      inCinemas: off(b), digitalRelease: off(b + 21), physicalRelease: off(b + 35), images: [{ coverType: 'poster', remoteUrl: poster(title.split(' ')[0], p[0], p[1]) }] }; });
  }
  const provider = (range, svc, opts) => {
    const all = ArrCalendarApi.mapEvents(raw, svc, opts);
    const start = new Date(range.start), end = new Date(range.end);
    return Promise.resolve(all.filter((e) => e.startDate >= start && e.startDate <= end));
  };
  const Cls = service === 'sonarr' ? SonarrWidget : RadarrWidget;
  new Cls(tile(service === 'sonarr' ? 'Sonarr — Upcoming' : 'Radarr — Upcoming'), { view: 'upcoming', upcomingCount: 8, dataProvider: provider }).start();
}

// ── Weather (all three widgets on one demo page) ─────────────────────────
function demoWeatherData() {
  const H = (t, e, temp, wind) => ({ time: t, condition: '', emoji: e, temp, wind });
  const D = (d, e, c, hi, lo) => ({ day: d, emoji: e, condition: c, high: hi, low: lo, sunrise: '6:42 AM', sunset: '7:58 PM' });
  return {
    current: { condition: 'Partly Cloudy', emoji: '⛅', temp: 72, feels: 70, high: 78, low: 61, wind: 8, humidity: 44, sunrise: '6:42 AM', sunset: '7:58 PM', place: 'San Francisco' },
    hourly: [H('1 PM', '☀️', 73, 7), H('2 PM', '🌤️', 74, 8), H('3 PM', '⛅', 73, 9), H('4 PM', '⛅', 71, 10), H('5 PM', '🌥️', 68, 11), H('6 PM', '🌧️', 64, 12), H('7 PM', '🌧️', 62, 12), H('8 PM', '🌙', 60, 9), H('9 PM', '🌙', 58, 8), H('10 PM', '☁️', 57, 7), H('11 PM', '☁️', 56, 6), H('12 AM', '🌙', 55, 6)],
    daily: [D('Mon', '☀️', 'Sunny', 78, 61), D('Tue', '⛅', 'Partly Cloudy', 75, 60), D('Wed', '🌧️', 'Rain', 69, 58), D('Thu', '🌤️', 'Mostly Sunny', 73, 59), D('Fri', '⛈️', 'Storms', 66, 55), D('Sat', '☀️', 'Sunny', 72, 57), D('Sun', '🌤️', 'Mostly Sunny', 74, 58)],
    units: 'imperial', sym: { temp: '°F', speed: 'mph' },
  };
}
SAMPLES.weather = function () {
  const dp = () => Promise.resolve(demoWeatherData());
  if (typeof WeatherCombinedWidget !== 'undefined') new WeatherCombinedWidget(tile('Weather — Combined'), { dataProvider: dp, hours: 12, days: 5, carousel: false }).start();
  new WeatherCurrentWidget(tile('Current Weather'), { dataProvider: dp }).start();
  new WeatherHourlyWidget(tile('Hourly Forecast'), { dataProvider: dp, hours: 5 }).start();
  new WeatherForecastWidget(tile('5-Day Forecast'), { dataProvider: dp }).start();
};

// ── Countdown (single big timer + scrolling list) ────────────────────────
function demoCountdownItems() {
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const nowD = new Date(); const y = nowD.getFullYear();
  const nextHoliday = (m, d) => { let yr = y; if (new Date(y, m - 1, d).getTime() <= nowD.getTime()) yr += 1; return fmt(new Date(yr, m - 1, d)); };
  const launch = new Date(nowD.getTime() + 5 * 3600000);   // ~5 hours out (short duration)
  return [
    { id: 's1', name: 'Project Launch', date: fmt(launch), time: `${pad(launch.getHours())}:${pad(launch.getMinutes())}` },
    { id: 's2', name: 'Independence Day', date: nextHoliday(7, 4) },
    { id: 's3', name: 'Vacation Countdown', date: nextHoliday(8, 10) },
    { id: 's4', name: 'Christmas', date: nextHoliday(12, 25) },
    { id: 's5', name: "New Year's Day", date: nextHoliday(1, 1) },
    { id: 's6', name: 'Birthday Countdown', date: fmt(new Date(y + 2, 2, 14)), time: '08:00' },
  ];
}
SAMPLES.countdown = function () {
  if (typeof CountdownWidget === 'undefined') return;
  const items = demoCountdownItems();
  const ALL = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];
  // Single: default full breakdown against a multi-year target.
  new CountdownWidget(tile('Countdown'), { items: items.filter((it) => it.id === 's6'), expired: 'started', units: ALL }).start();
  // List: a customized unit set (Days/Hours/Min/Sec) across a spread of dates.
  if (typeof CountdownListWidget !== 'undefined') {
    new CountdownListWidget(tile('Countdown List'), { items, expired: 'started', units: ['days', 'hours', 'minutes', 'seconds'], carousel: false, visibleCount: 4 }).start();
  }
};

// ── Portainer (10-service homelab dataset across two nodes) ──────────────
SAMPLES.portainer = function () {
  const MB = 1048576;
  const mk = (name, image, node, state, cpu, memMB, uptime) => ({
    id: name.toLowerCase() + '-' + node, endpointId: node, node, name, image, state,
    statusText: state === 'running' ? 'Up ' + uptime : 'Exited (0) 2 hours ago',
    uptime: state === 'running' ? uptime : '—',
    cpu: state === 'running' ? cpu : 0, mem: state === 'running' ? memMB * MB : 0, labels: {},
  });
  const data = [
    mk('plex',          'lscr.io/linuxserver/plex',            'docker-01', 'running', 63, 780,  '5 days'),
    mk('jellyfin',      'jellyfin/jellyfin',                   'docker-02', 'running', 28, 410,  '12 days'),
    mk('sonarr',        'lscr.io/linuxserver/sonarr',          'docker-01', 'running',  6, 180,  '3 days'),
    mk('radarr',        'lscr.io/linuxserver/radarr',          'docker-01', 'running',  9, 240,  '3 days'),
    mk('prowlarr',      'lscr.io/linuxserver/prowlarr',        'docker-02', 'running',  2,  96,  '8 days'),
    mk('homeassistant', 'ghcr.io/home-assistant/home-assistant', 'docker-02', 'running', 41, 520, '20 days'),
    mk('grafana',       'grafana/grafana',                     'docker-01', 'running', 17, 150,  '6 days'),
    mk('prometheus',    'prom/prometheus',                     'docker-01', 'running', 88, 1640, '6 days'),
    mk('pihole',        'pihole/pihole',                       'docker-02', 'running',  3,  64,  '30 days'),
    mk('immich',        'ghcr.io/immich-app/immich-server',    'docker-02', 'exited',   0,   0,  ''),
  ];
  new PortainerWidget(tile('Portainer — Containers'), { dataProvider: () => Promise.resolve(data) }).start();
};

// ── Stocks ──────────────────────────────────────────────────────────────
SAMPLES.stocks = function () {
  const walk = (start, n, vol, drift) => { const a = []; let p = start; for (let i = 0; i < n; i++) { p += (Math.random() - 0.5) * vol + drift; a.push(Math.round(p * 100) / 100); } return a; };
  const mk = (symbol, name, hist, prev, currency) => { const price = hist[hist.length - 1]; return { symbol, name, price, prevClose: prev, change: Math.round((price - prev) * 100) / 100, changePct: ((price - prev) / prev) * 100, currency: currency || 'USD', history: hist }; };
  const data = [
    mk('AAPL', 'Apple Inc.', walk(225, 22, 3, 0.4), 229.31),
    mk('MSFT', 'Microsoft Corp.', walk(415, 22, 5, 0.8), 410.22),
    mk('NVDA', 'NVIDIA Corp.', walk(128, 22, 4, -0.5), 134.80),
    mk('BTC-USD', 'Bitcoin USD', walk(63000, 22, 1400, 200), 61240.0),
  ];
  new StocksWidget(tile('Stocks'), { dataProvider: () => Promise.resolve(data) }).start();
};

// ── Tautulli stats widgets ───────────────────────────────────────────────
SAMPLES['tautulli-recent'] = function () {
  const data = [
    { title: 'Severance', sub: 'S2 · E4 — Cold Harbor', poster: poster('SEV', '#2c4a63', '#101820'), added: '2h ago', library: 'TV Shows', icon: '📺' },
    { title: 'Dune: Part Two', sub: '2024', poster: poster('DUNE', '#7a5a3a', '#3a2a1a'), added: '5h ago', library: 'Movies', icon: '🎬' },
    { title: 'Shōgun', sub: 'S1 · E9 — Crimson Sky', poster: poster('SHO', '#5a2a2a', '#2a1010'), added: '1d ago', library: 'TV Shows', icon: '📺' },
    { title: 'Furiosa', sub: '2024', poster: poster('FUR', '#7a3a1a', '#2a1208'), added: '2d ago', library: 'Movies', icon: '🎬' },
    { title: 'Discovery', sub: 'Daft Punk', poster: poster('DP', '#3a3a5a', '#15151f'), added: '3d ago', library: 'Music', icon: '🎵' },
  ];
  new TautulliRecentWidget(tile('Tautulli — Recently Added'), { dataProvider: () => Promise.resolve(data) }).start();
};
SAMPLES['tautulli-watch'] = function () {
  const data = [
    { title: 'Severance', plays: 69, poster: poster('SEV', '#2c4a63', '#101820'), type: '📺' },
    { title: 'Game of Thrones', plays: 54, poster: poster('GOT', '#3a2a4a', '#150f1f'), type: '📺' },
    { title: 'Dune: Part Two', plays: 41, poster: poster('DUNE', '#7a5a3a', '#3a2a1a'), type: '🎬' },
    { title: 'Foundation', plays: 33, poster: poster('FND', '#2a4a4a', '#0f1f1f'), type: '📺' },
    { title: 'Furiosa', plays: 22, poster: poster('FUR', '#7a3a1a', '#2a1208'), type: '🎬' },
  ];
  new TautulliWatchStatsWidget(tile('Tautulli — Most Watched'), { dataProvider: () => Promise.resolve(data) }).start();
};
SAMPLES['tautulli-libraries'] = function () {
  const data = [
    { name: 'Movies', type: 'movie', icon: '🎬', primary: '612 movies', secondary: '' },
    { name: 'TV Shows', type: 'show', icon: '📺', primary: '148 shows', secondary: '620 seasons · 8,240 episodes' },
    { name: 'Music', type: 'artist', icon: '🎵', primary: '320 artists', secondary: '1,240 albums · 14,900 tracks' },
    { name: 'Photos', type: 'photo', icon: '🖼️', primary: '4,512 photos', secondary: '' },
  ];
  new TautulliLibrariesWidget(tile('Tautulli — Libraries'), { dataProvider: () => Promise.resolve(data) }).start();
};
SAMPLES['tautulli-top'] = function () {
  const data = {
    users: [{ name: 'avery', plays: 142, thumb: '' }, { name: 'jordan', plays: 98, thumb: '' }, { name: 'sam', plays: 54, thumb: '' }, { name: 'alex', plays: 31, thumb: '' }],
    platforms: [{ name: 'Plex Web', plays: 120 }, { name: 'Apple TV', plays: 96 }, { name: 'Roku', plays: 64 }, { name: 'Android', plays: 45 }],
  };
  new TautulliTopUsersWidget(tile('Tautulli — Top Users & Platforms'), { dataProvider: () => Promise.resolve(data) }).start();
};

// ── Boot ────────────────────────────────────────────────────────────────
const id = new URLSearchParams(location.search).get('w');
if (SAMPLES[id]) {
  try { SAMPLES[id](); }
  catch (e) { root.innerHTML = `<div class="note">Sample unavailable: ${e.message}</div>`; }
} else {
  root.innerHTML = '<div class="note">No sample available for this integration.</div>';
}
