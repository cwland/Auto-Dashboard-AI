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

  function arr(host, s, svc) {
    const cfg = {
      service: svc, baseUrl: s[svc + 'Url'], apiKey: s[svc + 'ApiKey'],
      view: s[svc + 'View'] || 'upcoming', upcomingCount: N(s[svc + 'Count'], 8),
      showUnmonitored: s[svc + 'Unmonitored'] !== false,
    };
    if (svc === 'radarr') {
      const t = [];
      if (s.radarrRtCinemas) t.push('inCinemas');
      if (s.radarrRtDigital) t.push('digitalRelease');
      if (s.radarrRtPhysical) t.push('physicalRelease');
      cfg.releaseTypes = t.length ? t : ['inCinemas', 'digitalRelease', 'physicalRelease'];
    }
    return new ArrCalendarWidget(host, withPoll(s, svc, cfg));
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

  const MOUNTS = {
    tautulli: (h, s, opts) => {
      const w = new TautulliWidget(h, withPoll(s, 'tautulli', {
        baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey,
        maxVisible: (opts && opts.maxVisible) || N(s.tautulliMaxSessions, 3),
        dwellMs: (opts && opts.dwellMs) || N(s.tautulliCarouselDwellMs, 4000),
      }));
      w.onConfigChange = opts && opts.onConfigChange;
      return w;
    },
    'tautulli-list': (h, s) => new TautulliListWidget(h, withPoll(s, 'tautulli', {
      baseUrl: s.tautulliUrl, apiKey: s.tautulliApiKey,
    })),
    uptimekuma: (h, s) => new UptimeKumaWidget(h, {
      baseUrl: s.uptimeKumaUrl, slug: s.uptimeKumaSlug || 'default',
      pollMs: N(s.uptimeKumaRefreshSecs, 30) * 1000,
      showAverageUptime: !!s.uptimeKumaShowAverage, showUptimeRing: !!s.uptimeKumaShowRing,
      showTotalMonitors: !!s.uptimeKumaShowTotal, showUpCount: !!s.uptimeKumaShowUp,
      showDownCount: !!s.uptimeKumaShowDown, showPausedCount: !!s.uptimeKumaShowPaused,
      showMonitorList: !!s.uptimeKumaShowList,
    }),
    sonarr: (h, s) => arr(h, s, 'sonarr'),
    radarr: (h, s) => arr(h, s, 'radarr'),
    seerr: (h, s) => new SeerrWidget(h, withPoll(s, 'seerr', {
      baseUrl: s.seerrUrl, apiKey: s.seerrApiKey, view: s.seerrView || 'requests',
      requestCount: N(s.seerrCount, 8), showUsers: s.seerrShowUsers !== false,
    })),
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
    'weather-current': (h, s) => new WeatherCurrentWidget(h, { apiKey: s.weatherApiKey, location: s.weatherLocation, units: s.weatherUnits || 'imperial' }),
    'weather-hourly': (h, s, opts) => new WeatherHourlyWidget(h, {
      apiKey: s.weatherApiKey, location: s.weatherLocation, units: s.weatherUnits || 'imperial',
      hours: (opts && opts.hours) || 5, onHoursChange: opts && opts.onHoursChange,
    }),
    'weather-forecast': (h, s, opts) => new WeatherForecastWidget(h, {
      apiKey: s.weatherApiKey, location: s.weatherLocation, units: s.weatherUnits || 'imperial',
      days: (opts && opts.days) || 5, onDaysChange: opts && opts.onDaysChange,
    }),
  };

  // Mount a live widget for an integration into `host`. Returns the widget
  // instance (so the caller can destroy it later), or null if there's no live
  // mount for this integration yet (caller shows a placeholder).
  global.mountDashboardWidget = function (intId, host, settings, opts) {
    const fn = MOUNTS[intId];
    if (typeof fn !== 'function') return null;
    try {
      const w = fn(host, settings || {}, opts || {});
      if (w && typeof w.start === 'function') w.start();
      return w;
    } catch (e) {
      console.warn('[dashboard] widget mount failed:', intId, e);
      return null;
    }
  };
  global.DASHBOARD_WIDGET_MOUNTS = Object.keys(MOUNTS);
})(typeof window !== 'undefined' ? window : this);
