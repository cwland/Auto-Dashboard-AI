// Auto Dashboard AI — live widget mounts for the dashboard.
// Maps an integration id → a function that builds the widget's live config from
// the user's saved settings and instantiates the matching widget class.
// Mirrors the per-integration config built by the config page's preview code.
'use strict';

(function (global) {
  const N = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

  // Apply a per-integration poll override (settings.pollSecs[id], seconds).
  function withPoll(s, id, cfg) {
    const secs = s && s.pollSecs && s.pollSecs[id];
    if (secs) cfg.pollMs = N(secs, 0) * 1000 || cfg.pollMs;
    return cfg;
  }

  // Pull the standard ListCarousel options out of a widget's persisted config.
  function carouselOpts(opts) {
    const o = {};
    if (!opts) return o;
    if (opts.carousel != null) o.carousel = opts.carousel;
    if (opts.visibleCount != null) o.visibleCount = opts.visibleCount;
    if (opts.speed != null) o.speed = opts.speed;
    if (opts.mode != null) o.mode = opts.mode;
    if (opts.pauseMs != null) o.pauseMs = opts.pauseMs;
    if (opts.onConfigChange) o.onConfigChange = opts.onConfigChange;
    return o;
  }

  // Pass through the Tautulli idle "Poster Showcase" settings (persisted per widget).
  const POSTER_KEYS = ['posterShowcase', 'posterAnimate', 'posterLockMode', 'posterMax', 'posterAvoidDup',
    'posterInitialDelayMs', 'posterSlideMs', 'posterLockMs',
    'posterDisplayMs', 'posterClearMs', 'posterRefreshMins', 'posterReloadEachCycle'];
  function posterOpts(opts) {
    const o = {};
    if (!opts) return o;
    POSTER_KEYS.forEach((k) => { if (opts[k] != null) o[k] = opts[k]; });
    return o;
  }

  // Per-widget options for the Proxmox log/backup list widgets (on top of carousel).
  function proxmoxLogOpts(opts) {
    const o = {};
    if (!opts) return o;
    ['refreshMins', 'days', 'level', 'service'].forEach((k) => { if (opts[k] != null) o[k] = opts[k]; });
    return o;
  }

  function arr(host, s, svc, opts) {
    const cfg = {
      service: svc, baseUrl: s[svc + 'Url'], apiKey: s[svc + 'ApiKey'],
      view: (opts && opts.view) || s[svc + 'View'] || 'upcoming', upcomingCount: N(s[svc + 'Count'], 8),
      showUnmonitored: s[svc + 'Unmonitored'] !== false,
    };
    if (svc === 'radarr') {
      const t = [];
      if (s.radarrRtCinemas) t.push('inCinemas');
      if (s.radarrRtDigital) t.push('digitalRelease');
      if (s.radarrRtPhysical) t.push('physicalRelease');
      cfg.releaseTypes = t.length ? t : ['inCinemas', 'digitalRelease', 'physicalRelease'];
    }
    return new ArrCalendarWidget(host, withPoll(s, svc, Object.assign(cfg, carouselOpts(opts))));
  }
  function mediaServer(host, s, svc) {
    return new MediaServerWidget(host, withPoll(s, svc, { service: svc, baseUrl: s[svc + 'Url'], apiKey: s[svc + 'ApiKey'] }));
  }
  function download(host, s, svc) {
    const cfg = { service: svc, baseUrl: s[svc + 'Url'], limit: N(s[svc + 'Limit'], 10) };
    if (svc === 'sabnzbd') cfg.apiKey = s.sabnzbdApiKey;
    else { cfg.username = s[svc + 'Username']; cfg.password = s[svc + 'Password']; }
    return new DownloadClientWidget(host, withPoll(s, svc, cfg));
  }

  // Provider-agnostic weather config. The provider + key are global; each city
  // supplies its resolved coordinates (used by both providers). Falls back to a
  // sensible provider when the setting is absent (legacy installs).
  function wxBase(s, extra) {
    const provider = s.weatherProvider || (s.weatherApiKey ? 'openweathermap' : 'openmeteo');
    return Object.assign({
      provider,
      apiKey: s.weatherApiKey,
      lat: (s.weatherLat != null && s.weatherLat !== '') ? Number(s.weatherLat) : null,
      lon: (s.weatherLon != null && s.weatherLon !== '') ? Number(s.weatherLon) : null,
      location: s.weatherLocation,
      units: s.weatherUnits || 'imperial',
    }, extra || {});
  }

  const MOUNTS = {
    tautulli: (h, s, opts) => {
      const cfg = Object.assign({
        baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey,
        maxVisible: (opts && opts.maxVisible) || N(s.tautulliMaxSessions, 3),
        dwellMs: (opts && opts.dwellMs) || N(s.tautulliCarouselDwellMs, 4000),
        carousel: (opts && opts.carousel != null) ? opts.carousel : true,
      }, posterOpts(opts));
      const w = new TautulliWidget(h, withPoll(s, 'tautulli', cfg));
      w.onConfigChange = opts && opts.onConfigChange;
      return w;
    },
    'tautulli-list': (h, s, opts) => new TautulliListWidget(h, withPoll(s, 'tautulli', Object.assign({
      baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey,
    }, carouselOpts(opts)))),
    'tautulli-recent': (h, s, opts) => new TautulliRecentWidget(h, withPoll(s, 'tautulli', Object.assign({ baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey }, carouselOpts(opts)))),
    'tautulli-watch': (h, s, opts) => new TautulliWatchStatsWidget(h, withPoll(s, 'tautulli', Object.assign({ baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey }, carouselOpts(opts)))),
    'tautulli-libraries': (h, s) => new TautulliLibrariesWidget(h, withPoll(s, 'tautulli', { baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey })),
    'tautulli-top': (h, s) => new TautulliTopUsersWidget(h, withPoll(s, 'tautulli', { baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey })),
    stocks: (h, s, opts) => new StocksWidget(h, withPoll(s, 'stocks', Object.assign({ symbols: StocksApi.parseSymbols(s.stocksSymbols) }, carouselOpts(opts)))),
    countdown: (h, s, opts) => new CountdownWidget(h, {
      items: s.countdownItems, expired: s.countdownExpired || 'started',
      units: (opts && opts.units) || s.countdownUnits,
      itemId: opts && opts.endpointId,   // which configured countdown this placement shows
      onConfigChange: opts && opts.onConfigChange,
    }),
    'countdown-list': (h, s, opts) => new CountdownListWidget(h, Object.assign({
      items: s.countdownItems, expired: s.countdownExpired || 'started',
      units: (opts && opts.units) || s.countdownUnits,
    }, carouselOpts(opts))),
    portainer: (h, s, opts) => {
      const base = withPoll(s, 'portainer', { baseUrl: s.portainerUrl, apiKey: s.portainerApiKey });
      return new PortainerWidget(h, Object.assign(base, {
        statusFilter: (opts && opts.statusFilter) || 'all',
        nodeFilter: (opts && opts.nodeFilter) || 'all',
        pollMs: (opts && opts.pollMs) || base.pollMs || 15000,
        onConfigChange: opts && opts.onConfigChange,
      }, carouselOpts(opts)));
    },
    uptimekuma: (h, s) => new UptimeKumaWidget(h, {
      baseUrl: s.uptimeKumaUrl, slug: s.uptimeKumaSlug || 'default',
      pollMs: N(s.uptimeKumaRefreshSecs, 30) * 1000,
      showAverageUptime: !!s.uptimeKumaShowAverage, showUptimeRing: !!s.uptimeKumaShowRing,
      showTotalMonitors: !!s.uptimeKumaShowTotal, showUpCount: !!s.uptimeKumaShowUp,
      showDownCount: !!s.uptimeKumaShowDown, showPausedCount: !!s.uptimeKumaShowPaused,
      showMonitorList: !!s.uptimeKumaShowList,
    }),
    sonarr: (h, s, opts) => arr(h, s, 'sonarr', opts),
    radarr: (h, s, opts) => arr(h, s, 'radarr', opts),
    seerr: (h, s, opts) => new SeerrWidget(h, withPoll(s, 'seerr', Object.assign({
      baseUrl: s.seerrUrl, apiKey: s.seerrApiKey,
      view: (opts && opts.view) || s.seerrView || 'requests',
      requestCount: N(s.seerrCount, 8), showUsers: s.seerrShowUsers !== false,
    }, carouselOpts(opts)))),
    pihole: (h, s) => new DnsHoleWidget(h, withPoll(s, 'pihole', { service: 'pihole', baseUrl: s.piholeUrl, apiKey: s.piholeApiKey })),
    adguard: (h, s) => new DnsHoleWidget(h, withPoll(s, 'adguard', { service: 'adguard', baseUrl: s.adguardUrl, username: s.adguardUsername, password: s.adguardPassword })),
    plex: (h, s) => new PlexWidget(h, withPoll(s, 'plex', { baseUrl: s.plexUrl, token: s.plexToken })),
    jellyfin: (h, s) => mediaServer(h, s, 'jellyfin'),
    emby: (h, s) => mediaServer(h, s, 'emby'),
    unifi: (h, s) => new UnifiWidget(h, withPoll(s, 'unifi', { baseUrl: s.unifiUrl, username: s.unifiUsername, password: s.unifiPassword, site: s.unifiSite || 'default' })),
    sabnzbd: (h, s) => download(h, s, 'sabnzbd'),
    qbittorrent: (h, s) => download(h, s, 'qbittorrent'),
    transmission: (h, s) => download(h, s, 'transmission'),

    // ── Extra integrations ──────────────────────────────────────────────────
    peanut: (h, s) => new PeanutWidget(h, withPoll(s, 'peanut', { baseUrl: s.peanutUrl, username: s.peanutUsername, password: s.peanutPassword })),
    umami: (h, s) => new UmamiWidget(h, withPoll(s, 'umami', { baseUrl: s.umamiUrl, apiKey: s.umamiApiKey, username: s.umamiUsername, password: s.umamiPassword, websiteId: s.umamiWebsiteId, timeFrame: s.umamiTimeframe })),
    speedtest: (h, s) => new SpeedtestWidget(h, withPoll(s, 'speedtest', { baseUrl: s.speedtestUrl, token: s.speedtestToken })),
    ntfy: (h, s) => new NtfyWidget(h, withPoll(s, 'ntfy', { baseUrl: s.ntfyUrl, topic: s.ntfyTopic, token: s.ntfyToken, limit: N(s.ntfyLimit, 10) })),
    audiobookshelf: (h, s) => new AudiobookshelfWidget(h, withPoll(s, 'audiobookshelf', { baseUrl: s.audiobookshelfUrl, apiKey: s.audiobookshelfToken })),
    navidrome: (h, s) => new NavidromeWidget(h, withPoll(s, 'navidrome', { baseUrl: s.navidromeUrl, username: s.navidromeUsername, password: s.navidromePassword })),
    prowlarr: (h, s) => new ProwlarrWidget(h, withPoll(s, 'prowlarr', { baseUrl: s.prowlarrUrl, apiKey: s.prowlarrApiKey })),
    tracearr: (h, s) => new TracearrWidget(h, withPoll(s, 'tracearr', { baseUrl: s.tracearrUrl, apiKey: s.tracearrApiKey })),
    proxmox: (h, s) => new ProxmoxWidget(h, withPoll(s, 'proxmox', { baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey })),
    'proxmox-health': (h, s) => new ProxmoxHealthWidget(h, withPoll(s, 'proxmox', { baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey })),
    'proxmox-logs': (h, s, opts) => new ProxmoxLogsWidget(h, Object.assign({ baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey }, carouselOpts(opts), proxmoxLogOpts(opts))),
    'proxmox-backups': (h, s, opts) => new ProxmoxBackupsWidget(h, Object.assign({ baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey }, carouselOpts(opts), proxmoxLogOpts(opts))),
    'proxmox-storage': (h, s) => new ProxmoxStorageWidget(h, withPoll(s, 'proxmox', { baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey })),
    'proxmox-guests': (h, s) => new ProxmoxGuestsWidget(h, withPoll(s, 'proxmox', { baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey })),
    'proxmox-overview': (h, s) => new ProxmoxOverviewWidget(h, withPoll(s, 'proxmox', { baseUrl: s.proxmoxUrl, username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey })),
    pbs: (h, s) => new PbsWidget(h, withPoll(s, 'pbs', { baseUrl: s.pbsUrl, username: s.pbsUsername, realm: s.pbsRealm, tokenId: s.pbsTokenId, apiKey: s.pbsApiKey, node: s.pbsNode || 'localhost' })),
    beszel: (h, s) => new BeszelWidget(h, withPoll(s, 'beszel', { baseUrl: s.beszelUrl, username: s.beszelUsername, password: s.beszelPassword })),
    ical: (h, s) => new IcalWidget(h, withPoll(s, 'ical', { url: s.icalUrl, title: s.icalName || 'Calendar', view: s.icalView || 'upcoming' })),
    homeassistant: (h, s) => new HomeAssistantWidget(h, withPoll(s, 'homeassistant', { baseUrl: s.homeassistantUrl, apiKey: s.homeassistantToken, entities: String(s.homeassistantEntities || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean), allowToggle: s.homeassistantAllowToggle !== false })),
    nextcloud: (h, s) => new NextcloudWidget(h, withPoll(s, 'nextcloud', { baseUrl: s.nextcloudUrl, username: s.nextcloudUsername, password: s.nextcloudPassword })),
    opnsense: (h, s) => new OpnsenseWidget(h, withPoll(s, 'opnsense', { baseUrl: s.opnsenseUrl, apiKey: s.opnsenseKey, apiSecret: s.opnsenseSecret })),

    // SystemHealthWidget covers five host-monitoring services.
    glances: (h, s) => new SystemHealthWidget(h, withPoll(s, 'glances', { service: 'glances', baseUrl: s.glancesUrl, username: s.glancesUsername, password: s.glancesPassword })),
    dashdot: (h, s) => new SystemHealthWidget(h, withPoll(s, 'dashdot', { service: 'dashdot', baseUrl: s.dashdotUrl })),
    unraid: (h, s) => new SystemHealthWidget(h, withPoll(s, 'unraid', { service: 'unraid', baseUrl: s.unraidUrl, apiKey: s.unraidApiKey })),
    openmediavault: (h, s) => new SystemHealthWidget(h, withPoll(s, 'openmediavault', { service: 'openmediavault', baseUrl: s.openmediavaultUrl, username: s.openmediavaultUsername, password: s.openmediavaultPassword })),
    truenas: (h, s) => new SystemHealthWidget(h, withPoll(s, 'truenas', { service: 'truenas', baseUrl: s.truenasUrl, apiKey: s.truenasApiKey })),

    // ── Weather (three independent widgets) ─────────────────────────────────
    'weather-current': (h, s) => new WeatherCurrentWidget(h, wxBase(s)),
    'weather-hourly': (h, s, opts) => new WeatherHourlyWidget(h, wxBase(s, carouselOpts(opts))),
    'weather-forecast': (h, s, opts) => new WeatherForecastWidget(h, wxBase(s, carouselOpts(opts))),
    'weather-combined': (h, s, opts) => new WeatherCombinedWidget(h, wxBase(s, {
      hours: (opts && opts.hours) || 12, days: (opts && opts.days) || 5, speedMs: (opts && opts.speedMs) || 2000,
      carousel: !(opts && opts.carousel === false),
      onHoursChange: opts && opts.onHoursChange, onDaysChange: opts && opts.onDaysChange, onSpeedChange: opts && opts.onSpeedChange,
      onScrollChange: opts && opts.onScrollChange,
    })),
  };

  // Widget id → base integration id (for multi-endpoint resolution). Variant
  // widgets (tautulli-list, weather-current, …) resolve to their parent service.
  const WIDGET_BASE_INT = {
    'tautulli-list': 'tautulli', 'tautulli-recent': 'tautulli', 'tautulli-watch': 'tautulli',
    'tautulli-libraries': 'tautulli', 'tautulli-top': 'tautulli',
    'weather-current': 'weather', 'weather-hourly': 'weather', 'weather-forecast': 'weather', 'weather-combined': 'weather',
    'countdown-list': 'countdown',
    'proxmox-health': 'proxmox',
    'proxmox-logs': 'proxmox',
    'proxmox-storage': 'proxmox',
    'proxmox-guests': 'proxmox',
    'proxmox-overview': 'proxmox',
    'proxmox-backups': 'proxmox',
  };
  function baseIntOf(intId) { return WIDGET_BASE_INT[intId] || intId; }
  global.dashboardWidgetBaseInt = baseIntOf;

  // Render the "this endpoint was deleted" placeholder into a widget host.
  // `label` names the configuration the placement belonged to (e.g.
  // "Tautulli Streams — Cabin") so the user knows which one to check.
  function renderConfigRemoved(host, label) {
    if (!host) return;
    const safe = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    host.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;' +
      'gap:6px;padding:18px;text-align:center;color:var(--text-muted);">' +
      '<div style="font-size:26px;line-height:1;">⚠️</div>' +
      '<div style="font-size:14px;font-weight:600;color:var(--text-secondary);">Configuration removed</div>' +
      (label ? `<div style="font-size:12.5px;font-weight:600;color:var(--text-primary);">${safe(label)}</div>` : '') +
      '<div style="font-size:12px;">Please check setup.</div></div>';
  }
  global.renderConfigRemoved = renderConfigRemoved;

  // Mount a live widget for an integration into `host`. Returns the widget
  // instance (so the caller can destroy it later), or null if there's no live
  // mount for this integration yet (caller shows a placeholder). When the
  // placement points at a multi-endpoint service whose endpoint has been
  // deleted, renders a "configuration removed" notice and returns a no-op stub.
  global.mountDashboardWidget = function (intId, host, settings, opts) {
    const fn = MOUNTS[intId];
    if (typeof fn !== 'function') return null;
    opts = opts || {};
    let s = settings || {};
    const base = baseIntOf(intId);
    if (global.Endpoints && Endpoints.isMulti(base)) {
      const resolved = Endpoints.resolve(s, base, opts.endpointId);
      if (resolved === null) {
        renderConfigRemoved(host, opts.removedLabel);
        return { removed: true, start() {}, stop() {}, destroy() { if (host) host.innerHTML = ''; } };
      }
      s = resolved;
    }
    try {
      const w = fn(host, s, opts);
      if (w && typeof w.start === 'function') w.start();
      return w;
    } catch (e) {
      console.warn('[dashboard] widget mount failed:', intId, e);
      return null;
    }
  };
  global.DASHBOARD_WIDGET_MOUNTS = Object.keys(MOUNTS);
})(typeof window !== 'undefined' ? window : this);
