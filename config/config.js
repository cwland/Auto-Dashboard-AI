// Auto Dashboard AI — Config Page
'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const AI_BATCH_SIZE = 15; // bookmarks per AI request
const FAVICON_URL = (domain) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'google/gemini-flash-1.5',
  clockFormat: '12',
  dateVisible: true,
  dateFormat: 'long',
  weatherEnabled: false,
  weatherApiKey: '',
  weatherLocation: '',
  weatherUnits: 'imperial',
  weatherRefreshMins: 60,
  tautulliEnabled: false,
  tautulliUrl: '',
  tautulliApiKey: '',
  tautulliMaxSessions: 3,
  tautulliCarouselDwellMs: 4000,
  uptimeKumaEnabled: false,
  uptimeKumaUrl: '',
  uptimeKumaSlug: 'default',
  uptimeKumaRefreshSecs: 30,
  uptimeKumaShowAverage: true,
  uptimeKumaShowRing: true,
  uptimeKumaShowTotal: true,
  uptimeKumaShowUp: true,
  uptimeKumaShowDown: true,
  uptimeKumaShowPaused: true,
  uptimeKumaShowList: false,
  sonarrEnabled: false,
  sonarrUrl: '',
  sonarrApiKey: '',
  sonarrView: 'upcoming',
  sonarrCount: 8,
  sonarrUnmonitored: true,
  radarrEnabled: false,
  radarrUrl: '',
  radarrApiKey: '',
  radarrView: 'upcoming',
  radarrCount: 8,
  radarrUnmonitored: true,
  radarrRtCinemas: true,
  radarrRtDigital: true,
  radarrRtPhysical: true,
  seerrEnabled: false,
  seerrUrl: '',
  seerrApiKey: '',
  seerrView: 'requests',
  seerrCount: 8,
  seerrShowUsers: true,
  piholeEnabled: false,
  piholeUrl: '',
  piholeApiKey: '',
  adguardEnabled: false,
  adguardUrl: '',
  adguardUsername: '',
  adguardPassword: '',
  plexEnabled: false,
  plexUrl: '',
  plexToken: '',
  unifiEnabled: false,
  unifiUrl: '',
  unifiUsername: '',
  unifiPassword: '',
  unifiSite: 'default',
  sabnzbdEnabled: false,
  sabnzbdUrl: '',
  sabnzbdApiKey: '',
  sabnzbdLimit: 10,
  qbittorrentEnabled: false,
  qbittorrentUrl: '',
  qbittorrentUsername: '',
  qbittorrentPassword: '',
  qbittorrentLimit: 10,
  transmissionEnabled: false,
  transmissionUrl: '',
  transmissionUsername: '',
  transmissionPassword: '',
  transmissionLimit: 10,
  peanutEnabled: false,
  peanutUrl: '',
  peanutUsername: '',
  peanutPassword: '',
  umamiEnabled: false,
  umamiUrl: '',
  umamiApiKey: '',
  umamiUsername: '',
  umamiPassword: '',
  umamiWebsiteId: '',
  umamiTimeframe: '24h',
  speedtestEnabled: false,
  speedtestUrl: '',
  speedtestToken: '',
  ntfyEnabled: false,
  ntfyUrl: '',
  ntfyTopic: '',
  ntfyToken: '',
  ntfyLimit: 10,
  audiobookshelfEnabled: false,
  audiobookshelfUrl: '',
  audiobookshelfToken: '',
  navidromeEnabled: false,
  navidromeUrl: '',
  navidromeUsername: '',
  navidromePassword: '',
  prowlarrEnabled: false,
  prowlarrUrl: '',
  prowlarrApiKey: '',
  tracearrEnabled: false,
  tracearrUrl: '',
  tracearrApiKey: '',
  glancesEnabled: false, glancesUrl: '', glancesUsername: '', glancesPassword: '',
  dashdotEnabled: false, dashdotUrl: '',
  unraidEnabled: false, unraidUrl: '', unraidApiKey: '',
  openmediavaultEnabled: false, openmediavaultUrl: '', openmediavaultUsername: '', openmediavaultPassword: '',
  truenasEnabled: false, truenasUrl: '', truenasApiKey: '',
  proxmoxEnabled: false, proxmoxUrl: '', proxmoxUsername: 'root', proxmoxRealm: 'pam', proxmoxTokenId: '', proxmoxApiKey: '',
  pbsEnabled: false, pbsUrl: '', pbsUsername: 'root', pbsRealm: 'pbs', pbsTokenId: '', pbsApiKey: '', pbsNode: 'localhost',
  beszelEnabled: false, beszelUrl: '', beszelUsername: '', beszelPassword: '',
  icalEnabled: false, icalName: 'Calendar', icalUrl: '', icalView: 'upcoming',
  homeassistantEnabled: false, homeassistantUrl: '', homeassistantToken: '', homeassistantEntities: '', homeassistantAllowToggle: true,
  nextcloudEnabled: false, nextcloudUrl: '', nextcloudUsername: '', nextcloudPassword: '',
  opnsenseEnabled: false, opnsenseUrl: '', opnsenseKey: '', opnsenseSecret: '',
};

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  savedSettings: { ...DEFAULT_SETTINGS },
  currentSettings: { ...DEFAULT_SETTINGS },
  apiKeyValidated: false,
  weatherApiKeyValidated: false,
  tautulliApiKeyValidated: false,
  tautulliPreviewWidget: null,
  uptimeKumaValidated: false,
  uptimeKumaPreviewWidget: null,
  sonarrValidated: false,
  sonarrPreviewWidget: null,
  radarrValidated: false,
  radarrPreviewWidget: null,
  seerrValidated: false,
  seerrPreviewWidget: null,
  piholeValidated: false,
  piholePreviewWidget: null,
  adguardValidated: false,
  adguardPreviewWidget: null,
  plexValidated: false,
  plexPreviewWidget: null,
  unifiValidated: false,
  unifiPreviewWidget: null,
  sabnzbdValidated: false,
  sabnzbdPreviewWidget: null,
  qbittorrentValidated: false,
  qbittorrentPreviewWidget: null,
  transmissionValidated: false,
  transmissionPreviewWidget: null,
  peanutValidated: false,
  peanutPreviewWidget: null,
  umamiValidated: false,
  umamiPreviewWidget: null,
  speedtestValidated: false,
  speedtestPreviewWidget: null,
  ntfyValidated: false,
  ntfyPreviewWidget: null,
  audiobookshelfValidated: false,
  audiobookshelfPreviewWidget: null,
  navidromeValidated: false,
  navidromePreviewWidget: null,
  prowlarrValidated: false,
  prowlarrPreviewWidget: null,
  tracearrValidated: false,
  tracearrPreviewWidget: null,
  glancesValidated: false, glancesPreviewWidget: null,
  dashdotValidated: false, dashdotPreviewWidget: null,
  unraidValidated: false, unraidPreviewWidget: null,
  openmediavaultValidated: false, openmediavaultPreviewWidget: null,
  truenasValidated: false, truenasPreviewWidget: null,
  proxmoxValidated: false, proxmoxPreviewWidget: null,
  pbsValidated: false, pbsPreviewWidget: null,
  beszelValidated: false, beszelPreviewWidget: null,
  icalValidated: false, icalPreviewWidget: null,
  homeassistantValidated: false, homeassistantPreviewWidget: null,
  nextcloudValidated: false, nextcloudPreviewWidget: null,
  opnsenseValidated: false, opnsensePreviewWidget: null,
  selectedBookmarkIds: new Set(),
  bookmarkNodes: {}, // id -> node
  dashboards: [],
  defaultDashboardId: null,
  activeTab: 'settings',
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);
const apiKeyInput   = $('api-key');
const validateBtn   = $('validate-btn');
const validationRes = $('validation-result');
const modelSelect   = $('model-select');
const pendingBanner = $('pending-banner');
const saveBar       = $('save-bar');
const saveBtn       = $('save-btn');
const discardBtn    = $('discard-btn');
const bookmarkTree  = $('bookmark-tree');
const selectedCount = $('selected-count');
const generateBtn   = $('generate-btn');
const generateError = $('generate-error');
const dashboardList = $('dashboard-list');
const dashNameInput = $('dashboard-name');
const progressOverlay = $('progress-overlay');

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadSettings();
  await loadDashboards();
  setupNavigation();
  setupSettingsListeners();
  setupBookmarkControls();
  setupDashEditModal();

  // If opened with ?tab=dashboards, jump there
  const params = new URLSearchParams(window.location.search);
  if (params.get('tab') === 'dashboards') {
    switchTab('dashboards');
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  const stored = await chromeStorageGet(['settings']);
  if (stored.settings) {
    state.savedSettings   = { ...DEFAULT_SETTINGS, ...stored.settings };
    state.currentSettings = { ...DEFAULT_SETTINGS, ...stored.settings };
    state.apiKeyValidated          = !!stored.settings.apiKey;
    state.weatherApiKeyValidated   = !!stored.settings.weatherApiKey;
    state.tautulliApiKeyValidated  = !!(stored.settings.tautulliApiKey && stored.settings.tautulliUrl);
    state.uptimeKumaValidated      = !!stored.settings.uptimeKumaUrl;
    state.sonarrValidated          = !!(stored.settings.sonarrUrl && stored.settings.sonarrApiKey);
    state.radarrValidated          = !!(stored.settings.radarrUrl && stored.settings.radarrApiKey);
    state.seerrValidated           = !!(stored.settings.seerrUrl && stored.settings.seerrApiKey);
    state.piholeValidated          = !!(stored.settings.piholeUrl && stored.settings.piholeApiKey);
    state.adguardValidated         = !!(stored.settings.adguardUrl && stored.settings.adguardUsername);
    state.plexValidated            = !!(stored.settings.plexUrl && stored.settings.plexToken);
    state.unifiValidated           = !!(stored.settings.unifiUrl && stored.settings.unifiUsername);
    state.sabnzbdValidated         = !!(stored.settings.sabnzbdUrl && stored.settings.sabnzbdApiKey);
    state.qbittorrentValidated     = !!(stored.settings.qbittorrentUrl && stored.settings.qbittorrentUsername);
    state.transmissionValidated    = !!stored.settings.transmissionUrl;
    state.peanutValidated          = !!stored.settings.peanutUrl;
    state.umamiValidated           = !!(stored.settings.umamiUrl && stored.settings.umamiWebsiteId);
    state.speedtestValidated       = !!(stored.settings.speedtestUrl && stored.settings.speedtestToken);
    state.ntfyValidated            = !!(stored.settings.ntfyUrl && stored.settings.ntfyTopic);
    state.audiobookshelfValidated  = !!(stored.settings.audiobookshelfUrl && stored.settings.audiobookshelfToken);
    state.navidromeValidated       = !!(stored.settings.navidromeUrl && stored.settings.navidromeUsername);
    state.prowlarrValidated        = !!(stored.settings.prowlarrUrl && stored.settings.prowlarrApiKey);
    state.tracearrValidated        = !!(stored.settings.tracearrUrl && stored.settings.tracearrApiKey);
    state.glancesValidated         = !!stored.settings.glancesUrl;
    state.dashdotValidated         = !!stored.settings.dashdotUrl;
    state.unraidValidated          = !!(stored.settings.unraidUrl && stored.settings.unraidApiKey);
    state.openmediavaultValidated  = !!(stored.settings.openmediavaultUrl && stored.settings.openmediavaultUsername);
    state.truenasValidated         = !!(stored.settings.truenasUrl && stored.settings.truenasApiKey);
    state.proxmoxValidated         = !!(stored.settings.proxmoxUrl && stored.settings.proxmoxApiKey);
    state.pbsValidated             = !!(stored.settings.pbsUrl && stored.settings.pbsApiKey);
    state.beszelValidated          = !!(stored.settings.beszelUrl && stored.settings.beszelUsername);
    state.icalValidated            = !!stored.settings.icalUrl;
    state.homeassistantValidated   = !!(stored.settings.homeassistantUrl && stored.settings.homeassistantToken);
    state.nextcloudValidated       = !!(stored.settings.nextcloudUrl && stored.settings.nextcloudUsername);
    state.opnsenseValidated        = !!(stored.settings.opnsenseUrl && stored.settings.opnsenseKey && stored.settings.opnsenseSecret);
  }
  applySettingsToUI();
  updateSaveBar();
}

function applySettingsToUI() {
  const s = state.currentSettings;

  // OpenRouter
  apiKeyInput.value  = s.apiKey;
  modelSelect.value  = s.model || DEFAULT_SETTINGS.model;

  // Clock format
  const clockEl = document.getElementById(`clock-${s.clockFormat || '12'}`);
  if (clockEl) clockEl.checked = true;

  // Date visible toggle + format section
  const dateVisible = s.dateVisible !== false; // default true
  const dateVisibleToggle = document.getElementById('date-visible-toggle');
  if (dateVisibleToggle) dateVisibleToggle.checked = dateVisible;
  const dateSection = document.getElementById('date-format-section');
  if (dateSection) dateSection.style.display = dateVisible ? 'block' : 'none';

  // Date format
  const dateFormatEl = document.getElementById('date-format-select');
  if (dateFormatEl) dateFormatEl.value = s.dateFormat || 'long';

  // Weather toggle
  const weatherToggle = document.getElementById('weather-toggle');
  if (weatherToggle) {
    weatherToggle.checked = !!s.weatherEnabled;
    document.getElementById('weather-config').style.display = s.weatherEnabled ? 'block' : 'none';
  }

  // Weather API key
  const weatherKeyEl = document.getElementById('weather-api-key');
  if (weatherKeyEl) weatherKeyEl.value = s.weatherApiKey || '';

  // Weather location
  const weatherLocEl = document.getElementById('weather-location');
  if (weatherLocEl) weatherLocEl.value = s.weatherLocation || '';

  // Weather units
  const unitsEl = document.getElementById(`units-${s.weatherUnits || 'imperial'}`);
  if (unitsEl) unitsEl.checked = true;

  // Weather refresh interval (select)
  const refreshEl = document.getElementById('weather-refresh-mins');
  if (refreshEl) {
    // Snap stored value to the nearest option (handles any legacy numeric value)
    const stored = s.weatherRefreshMins || 60;
    const opts = [...refreshEl.options].map((o) => parseInt(o.value, 10));
    const closest = opts.reduce((a, b) => Math.abs(b - stored) < Math.abs(a - stored) ? b : a);
    refreshEl.value = String(closest);
  }

  // Tautulli toggle
  const tautulliToggle = document.getElementById('tautulli-toggle');
  if (tautulliToggle) {
    tautulliToggle.checked = !!s.tautulliEnabled;
    const cfg = document.getElementById('tautulli-config');
    if (cfg) cfg.style.display = s.tautulliEnabled ? 'block' : 'none';
  }

  // Tautulli server URL + API key
  const tautulliUrlEl = document.getElementById('tautulli-url');
  if (tautulliUrlEl) tautulliUrlEl.value = s.tautulliUrl || '';
  const tautulliKeyEl = document.getElementById('tautulli-api-key');
  if (tautulliKeyEl) tautulliKeyEl.value = s.tautulliApiKey || '';

  // Tautulli max sessions
  const maxSessEl = document.getElementById('tautulli-max-sessions');
  if (maxSessEl) maxSessEl.value = String(s.tautulliMaxSessions || 3);

  // Tautulli carousel speed (dwell ms)
  const speedEl = document.getElementById('tautulli-carousel-speed');
  if (speedEl) speedEl.value = String(s.tautulliCarouselDwellMs || 4000);

  // Preview button reflects whether we have a validated key
  updateTautulliPreviewButton();

  // Uptime Kuma toggle
  const ukToggle = document.getElementById('uptimekuma-toggle');
  if (ukToggle) {
    ukToggle.checked = !!s.uptimeKumaEnabled;
    const cfg = document.getElementById('uptimekuma-config');
    if (cfg) cfg.style.display = s.uptimeKumaEnabled ? 'block' : 'none';
  }

  // Uptime Kuma server URL + slug
  const ukUrlEl = document.getElementById('uptimekuma-url');
  if (ukUrlEl) ukUrlEl.value = s.uptimeKumaUrl || '';
  const ukSlugEl = document.getElementById('uptimekuma-slug');
  if (ukSlugEl) ukSlugEl.value = s.uptimeKumaSlug || 'default';

  // Uptime Kuma display-stat checkboxes
  const ukChecks = {
    'uptimekuma-show-average': 'uptimeKumaShowAverage',
    'uptimekuma-show-ring':    'uptimeKumaShowRing',
    'uptimekuma-show-total':   'uptimeKumaShowTotal',
    'uptimekuma-show-up':      'uptimeKumaShowUp',
    'uptimekuma-show-down':    'uptimeKumaShowDown',
    'uptimekuma-show-paused':  'uptimeKumaShowPaused',
    'uptimekuma-show-list':    'uptimeKumaShowList',
  };
  for (const [id, key] of Object.entries(ukChecks)) {
    const el = document.getElementById(id);
    if (el) el.checked = !!s[key];
  }

  // Uptime Kuma refresh interval (select)
  const ukRefreshEl = document.getElementById('uptimekuma-refresh-secs');
  if (ukRefreshEl) ukRefreshEl.value = String(s.uptimeKumaRefreshSecs || 30);

  updateUptimeKumaPreviewButton();

  // Sonarr + Radarr (parallel "arr" calendar integrations)
  applyArrSettingsToUI('sonarr');
  applyArrSettingsToUI('radarr');

  // Seerr (Overseerr / Jellyseerr media requests)
  const seerrToggle = document.getElementById('seerr-toggle');
  if (seerrToggle) {
    seerrToggle.checked = !!s.seerrEnabled;
    const cfg = document.getElementById('seerr-config');
    if (cfg) cfg.style.display = s.seerrEnabled ? 'block' : 'none';
  }
  const seerrUrlEl = document.getElementById('seerr-url');
  if (seerrUrlEl) seerrUrlEl.value = s.seerrUrl || '';
  const seerrKeyEl = document.getElementById('seerr-api-key');
  if (seerrKeyEl) seerrKeyEl.value = s.seerrApiKey || '';
  const seerrViewEl = document.getElementById('seerr-view');
  if (seerrViewEl) seerrViewEl.value = s.seerrView || 'requests';
  const seerrCountEl = document.getElementById('seerr-count');
  if (seerrCountEl) seerrCountEl.value = String(s.seerrCount || 8);
  const seerrUsersEl = document.getElementById('seerr-show-users');
  if (seerrUsersEl) seerrUsersEl.checked = s.seerrShowUsers !== false;
  updateSeerrPreviewButton();

  // Pi-hole + AdGuard (DNS-hole integrations)
  applyDnsHoleSettingsToUI('pihole');
  applyDnsHoleSettingsToUI('adguard');

  // Plex
  const plexToggle = document.getElementById('plex-toggle');
  if (plexToggle) {
    plexToggle.checked = !!s.plexEnabled;
    const cfg = document.getElementById('plex-config');
    if (cfg) cfg.style.display = s.plexEnabled ? 'block' : 'none';
  }
  const plexUrlEl = document.getElementById('plex-url');
  if (plexUrlEl) plexUrlEl.value = s.plexUrl || '';
  const plexTokenEl = document.getElementById('plex-token');
  if (plexTokenEl) plexTokenEl.value = s.plexToken || '';
  updatePlexPreviewButton();

  // UniFi
  const unifiToggle = document.getElementById('unifi-toggle');
  if (unifiToggle) {
    unifiToggle.checked = !!s.unifiEnabled;
    const cfg = document.getElementById('unifi-config');
    if (cfg) cfg.style.display = s.unifiEnabled ? 'block' : 'none';
  }
  const unifiUrlEl = document.getElementById('unifi-url');
  if (unifiUrlEl) unifiUrlEl.value = s.unifiUrl || '';
  const unifiUserEl = document.getElementById('unifi-username');
  if (unifiUserEl) unifiUserEl.value = s.unifiUsername || '';
  const unifiPassEl = document.getElementById('unifi-password');
  if (unifiPassEl) unifiPassEl.value = s.unifiPassword || '';
  const unifiSiteEl = document.getElementById('unifi-site');
  if (unifiSiteEl) unifiSiteEl.value = s.unifiSite || 'default';
  updateUnifiPreviewButton();

  // Download clients (SABnzbd / qBittorrent / Transmission)
  applyDownloadSettingsToUI('sabnzbd');
  applyDownloadSettingsToUI('qbittorrent');
  applyDownloadSettingsToUI('transmission');

  // Extra integrations (PeaNUT / Umami / Speedtest / ntfy)
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? '' : v; };
  const setToggle = (svc) => {
    const t = document.getElementById(`${svc}-toggle`);
    if (t) { t.checked = !!s[`${svc}Enabled`]; const cfg = document.getElementById(`${svc}-config`); if (cfg) cfg.style.display = t.checked ? 'block' : 'none'; }
  };
  setToggle('peanut'); setVal('peanut-url', s.peanutUrl); setVal('peanut-username', s.peanutUsername); setVal('peanut-password', s.peanutPassword);
  updatePeanutPreviewButton();
  setToggle('umami'); setVal('umami-url', s.umamiUrl); setVal('umami-api-key', s.umamiApiKey); setVal('umami-username', s.umamiUsername);
  setVal('umami-password', s.umamiPassword); setVal('umami-website-id', s.umamiWebsiteId); setVal('umami-timeframe', s.umamiTimeframe || '24h');
  updateUmamiPreviewButton();
  setToggle('speedtest'); setVal('speedtest-url', s.speedtestUrl); setVal('speedtest-token', s.speedtestToken);
  updateSpeedtestPreviewButton();
  setToggle('ntfy'); setVal('ntfy-url', s.ntfyUrl); setVal('ntfy-topic', s.ntfyTopic); setVal('ntfy-token', s.ntfyToken); setVal('ntfy-limit', String(s.ntfyLimit || 10));
  updateNtfyPreviewButton();

  // Media & library integrations (Audiobookshelf / Navidrome / Prowlarr / Tracearr)
  setToggle('audiobookshelf'); setVal('audiobookshelf-url', s.audiobookshelfUrl); setVal('audiobookshelf-token', s.audiobookshelfToken);
  updateAudiobookshelfPreviewButton();
  setToggle('navidrome'); setVal('navidrome-url', s.navidromeUrl); setVal('navidrome-username', s.navidromeUsername); setVal('navidrome-password', s.navidromePassword);
  updateNavidromePreviewButton();
  setToggle('prowlarr'); setVal('prowlarr-url', s.prowlarrUrl); setVal('prowlarr-api-key', s.prowlarrApiKey);
  updateProwlarrPreviewButton();
  setToggle('tracearr'); setVal('tracearr-url', s.tracearrUrl); setVal('tracearr-api-key', s.tracearrApiKey);
  updateTracearrPreviewButton();

  // System health (Glances / Dashdot / Unraid / OpenMediaVault / TrueNAS)
  setToggle('glances'); setVal('glances-url', s.glancesUrl); setVal('glances-username', s.glancesUsername); setVal('glances-password', s.glancesPassword);
  setToggle('dashdot'); setVal('dashdot-url', s.dashdotUrl);
  setToggle('unraid'); setVal('unraid-url', s.unraidUrl); setVal('unraid-api-key', s.unraidApiKey);
  setToggle('openmediavault'); setVal('openmediavault-url', s.openmediavaultUrl); setVal('openmediavault-username', s.openmediavaultUsername); setVal('openmediavault-password', s.openmediavaultPassword);
  setToggle('truenas'); setVal('truenas-url', s.truenasUrl); setVal('truenas-api-key', s.truenasApiKey);
  ['glances', 'dashdot', 'unraid', 'openmediavault', 'truenas'].forEach((svc) => updateSystemHealthPreviewButton(svc));

  // Proxmox / PBS / Beszel
  setToggle('proxmox'); setVal('proxmox-url', s.proxmoxUrl); setVal('proxmox-username', s.proxmoxUsername); setVal('proxmox-realm', s.proxmoxRealm); setVal('proxmox-token-id', s.proxmoxTokenId); setVal('proxmox-api-key', s.proxmoxApiKey);
  updateProxmoxPreviewButton();
  setToggle('pbs'); setVal('pbs-url', s.pbsUrl); setVal('pbs-username', s.pbsUsername); setVal('pbs-realm', s.pbsRealm); setVal('pbs-token-id', s.pbsTokenId); setVal('pbs-api-key', s.pbsApiKey);
  updatePbsPreviewButton();
  setToggle('beszel'); setVal('beszel-url', s.beszelUrl); setVal('beszel-username', s.beszelUsername); setVal('beszel-password', s.beszelPassword);
  updateBeszelPreviewButton();

  // iCal / Home Assistant / Nextcloud
  setToggle('ical'); setVal('ical-name', s.icalName); setVal('ical-url', s.icalUrl); setVal('ical-view', s.icalView || 'upcoming');
  updateIcalPreviewButton();
  setToggle('homeassistant'); setVal('homeassistant-url', s.homeassistantUrl); setVal('homeassistant-token', s.homeassistantToken); setVal('homeassistant-entities', s.homeassistantEntities);
  const haToggleEl = document.getElementById('homeassistant-allow-toggle'); if (haToggleEl) haToggleEl.checked = s.homeassistantAllowToggle !== false;
  updateHomeassistantPreviewButton();
  setToggle('nextcloud'); setVal('nextcloud-url', s.nextcloudUrl); setVal('nextcloud-username', s.nextcloudUsername); setVal('nextcloud-password', s.nextcloudPassword);
  updateNextcloudPreviewButton();
  setToggle('opnsense'); setVal('opnsense-url', s.opnsenseUrl); setVal('opnsense-key', s.opnsenseKey); setVal('opnsense-secret', s.opnsenseSecret);
  updateOpnsensePreviewButton();
}

// Parse the HA entities textarea (one entity id per line) into an array.
function parseHaEntities(str) { return String(str || '').split(/[\n,]/).map((x) => x.trim()).filter(Boolean); }

// Descriptor for the five SystemHealthWidget-backed services.
const SYSTEM_HEALTH = {
  glances:        { fields: { 'glances-url': 'glancesUrl', 'glances-username': 'glancesUsername', 'glances-password': 'glancesPassword' }, secret: ['glances-password', 'glances-key-toggle'], auth: (s) => ({ username: s.glancesUsername, password: s.glancesPassword }), needs: (s) => !!s.glancesUrl, cfg: (s) => ({ baseUrl: s.glancesUrl, username: s.glancesUsername, password: s.glancesPassword }) },
  dashdot:        { fields: { 'dashdot-url': 'dashdotUrl' }, auth: () => ({}), needs: (s) => !!s.dashdotUrl, cfg: (s) => ({ baseUrl: s.dashdotUrl }) },
  unraid:         { fields: { 'unraid-url': 'unraidUrl', 'unraid-api-key': 'unraidApiKey' }, secret: ['unraid-api-key', 'unraid-key-toggle'], auth: (s) => ({ apiKey: s.unraidApiKey }), needs: (s) => !!s.unraidUrl && !!s.unraidApiKey, cfg: (s) => ({ baseUrl: s.unraidUrl, apiKey: s.unraidApiKey }) },
  openmediavault: { fields: { 'openmediavault-url': 'openmediavaultUrl', 'openmediavault-username': 'openmediavaultUsername', 'openmediavault-password': 'openmediavaultPassword' }, secret: ['openmediavault-password', 'openmediavault-key-toggle'], auth: (s) => ({ username: s.openmediavaultUsername, password: s.openmediavaultPassword }), needs: (s) => !!s.openmediavaultUrl && !!s.openmediavaultUsername, cfg: (s) => ({ baseUrl: s.openmediavaultUrl, username: s.openmediavaultUsername, password: s.openmediavaultPassword }) },
  truenas:        { fields: { 'truenas-url': 'truenasUrl', 'truenas-api-key': 'truenasApiKey' }, secret: ['truenas-api-key', 'truenas-key-toggle'], auth: (s) => ({ apiKey: s.truenasApiKey }), needs: (s) => !!s.truenasUrl && !!s.truenasApiKey, cfg: (s) => ({ baseUrl: s.truenasUrl, apiKey: s.truenasApiKey }) },
};

// Descriptor for the three download-client integrations (similar shape).
const DOWNLOAD_CLIENTS = {
  sabnzbd:      { fields: { apiKey: 'sabnzbd-api-key' }, secret: ['sabnzbd-api-key', 'sabnzbd-key-toggle'] },
  qbittorrent:  { fields: { username: 'qbittorrent-username', password: 'qbittorrent-password' }, secret: ['qbittorrent-password', 'qbittorrent-key-toggle'] },
  transmission: { fields: { username: 'transmission-username', password: 'transmission-password' }, secret: ['transmission-password', 'transmission-key-toggle'] },
};
const cap1 = (str) => str.charAt(0).toUpperCase() + str.slice(1);

function applyDownloadSettingsToUI(svc) {
  const s = state.currentSettings;
  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.checked = !!s[`${svc}Enabled`];
    const cfg = document.getElementById(`${svc}-config`);
    if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
  }
  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) urlEl.value = s[`${svc}Url`] || '';
  for (const [field, id] of Object.entries(DOWNLOAD_CLIENTS[svc].fields)) {
    const el = document.getElementById(id);
    if (el) el.value = s[`${svc}${cap1(field)}`] || '';
  }
  const limitEl = document.getElementById(`${svc}-limit`);
  if (limitEl) limitEl.value = String(s[`${svc}Limit`] || 10);
  updateDownloadPreviewButton(svc);
}

// DNS-hole services differ only in their auth fields.
const DNS_HOLE_FIELDS = {
  pihole: { apiKey: 'pihole-api-key' },
  adguard: { username: 'adguard-username', password: 'adguard-password' },
};

function applyDnsHoleSettingsToUI(svc) {
  const s = state.currentSettings;
  const cap = svc.charAt(0).toUpperCase() + svc.slice(1); // 'Pihole' | 'Adguard'

  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.checked = !!s[`${svc}Enabled`];
    const cfg = document.getElementById(`${svc}-config`);
    if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
  }
  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) urlEl.value = s[`${svc}Url`] || '';

  for (const [field, id] of Object.entries(DNS_HOLE_FIELDS[svc])) {
    const el = document.getElementById(id);
    if (el) el.value = s[`${svc}${field.charAt(0).toUpperCase() + field.slice(1)}`] || '';
  }
  updateDnsHolePreviewButton(svc);
}

// Shared apply for the Sonarr/Radarr cards. `svc` is 'sonarr' or 'radarr'.
function applyArrSettingsToUI(svc) {
  const s = state.currentSettings;
  const cap = svc.charAt(0).toUpperCase() + svc.slice(1); // 'Sonarr' | 'Radarr'

  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.checked = !!s[`${svc}Enabled`];
    const cfg = document.getElementById(`${svc}-config`);
    if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
  }

  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) urlEl.value = s[`${svc}Url`] || '';
  const keyEl = document.getElementById(`${svc}-api-key`);
  if (keyEl) keyEl.value = s[`${svc}ApiKey`] || '';

  const viewEl = document.getElementById(`${svc}-view`);
  if (viewEl) viewEl.value = s[`${svc}View`] || 'upcoming';
  const countEl = document.getElementById(`${svc}-count`);
  if (countEl) countEl.value = String(s[`${svc}Count`] || 8);
  const unmonEl = document.getElementById(`${svc}-unmonitored`);
  if (unmonEl) unmonEl.checked = s[`${svc}Unmonitored`] !== false;

  if (svc === 'radarr') {
    const rt = {
      'radarr-rt-cinemas': 'radarrRtCinemas',
      'radarr-rt-digital': 'radarrRtDigital',
      'radarr-rt-physical': 'radarrRtPhysical',
    };
    for (const [id, key] of Object.entries(rt)) {
      const el = document.getElementById(id);
      if (el) el.checked = !!s[key];
    }
  }

  updateArrPreviewButton(svc);
}

/** Toggle an API key input between visible (text) and masked (password). */
function setupEyeballToggle(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;
  // Start visible (input HTML already has type="text")
  btn.addEventListener('click', () => {
    if (input.type === 'text') {
      input.type       = 'password';
      btn.textContent  = '👁';
      btn.title        = 'Show key';
    } else {
      input.type       = 'text';
      btn.textContent  = '🙈';
      btn.title        = 'Hide key';
    }
  });
}

function setupSettingsListeners() {
  // Eyeball toggles — both API key fields start visible
  setupEyeballToggle('api-key', 'api-key-toggle');
  setupEyeballToggle('weather-api-key', 'weather-key-toggle');

  apiKeyInput.addEventListener('input', () => {
    state.currentSettings.apiKey = apiKeyInput.value.trim();
    state.apiKeyValidated = false;
    updateSaveBar();
    hideValidationResult();
  });

  modelSelect.addEventListener('change', () => {
    state.currentSettings.model = modelSelect.value;
    updateSaveBar();
  });

  validateBtn.addEventListener('click', validateApiKey);
  saveBtn.addEventListener('click', saveSettings);
  discardBtn.addEventListener('click', discardChanges);

  // Clock format radios
  document.querySelectorAll('input[name="clock-format"]').forEach((r) => {
    r.addEventListener('change', () => {
      state.currentSettings.clockFormat = r.value;
      updateSaveBar();
    });
  });

  // Date visible toggle
  const dateVisibleToggle = document.getElementById('date-visible-toggle');
  if (dateVisibleToggle) {
    dateVisibleToggle.addEventListener('change', () => {
      state.currentSettings.dateVisible = dateVisibleToggle.checked;
      const section = document.getElementById('date-format-section');
      if (section) section.style.display = dateVisibleToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  // Date format select
  const dateFormatEl = document.getElementById('date-format-select');
  if (dateFormatEl) {
    dateFormatEl.addEventListener('change', () => {
      state.currentSettings.dateFormat = dateFormatEl.value;
      updateSaveBar();
    });
  }

  // Weather toggle
  const weatherToggle = document.getElementById('weather-toggle');
  if (weatherToggle) {
    weatherToggle.addEventListener('change', () => {
      state.currentSettings.weatherEnabled = weatherToggle.checked;
      document.getElementById('weather-config').style.display =
        weatherToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  // Weather API key
  const weatherKeyEl = document.getElementById('weather-api-key');
  if (weatherKeyEl) {
    weatherKeyEl.addEventListener('input', () => {
      state.currentSettings.weatherApiKey = weatherKeyEl.value.trim();
      state.weatherApiKeyValidated = false;
      document.getElementById('weather-validation-result').style.display = 'none';
      updateSaveBar();
    });
  }

  // Weather validate button
  document.getElementById('weather-validate-btn')?.addEventListener('click', validateWeatherKey);

  // Weather location
  const weatherLocEl = document.getElementById('weather-location');
  if (weatherLocEl) {
    weatherLocEl.addEventListener('input', () => {
      state.currentSettings.weatherLocation = weatherLocEl.value.trim();
      updateSaveBar();
    });
  }

  // Weather units radios
  document.querySelectorAll('input[name="weather-units"]').forEach((r) => {
    r.addEventListener('change', () => {
      state.currentSettings.weatherUnits = r.value;
      updateSaveBar();
    });
  });

  // Weather refresh interval (select dropdown)
  const refreshEl = document.getElementById('weather-refresh-mins');
  if (refreshEl) {
    refreshEl.addEventListener('change', () => {
      state.currentSettings.weatherRefreshMins = parseInt(refreshEl.value, 10);
      updateSaveBar();
    });
  }

  // ── Tautulli ───────────────────────────────────────────────────────────
  setupEyeballToggle('tautulli-api-key', 'tautulli-key-toggle');

  const tautulliToggle = document.getElementById('tautulli-toggle');
  if (tautulliToggle) {
    tautulliToggle.addEventListener('change', () => {
      state.currentSettings.tautulliEnabled = tautulliToggle.checked;
      const cfg = document.getElementById('tautulli-config');
      if (cfg) cfg.style.display = tautulliToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  const tautulliUrlEl = document.getElementById('tautulli-url');
  if (tautulliUrlEl) {
    tautulliUrlEl.addEventListener('input', () => {
      state.currentSettings.tautulliUrl = tautulliUrlEl.value.trim();
      // URL change invalidates a prior validation
      state.tautulliApiKeyValidated = false;
      hideTautulliValidationResult();
      updateTautulliPreviewButton();
      updateSaveBar();
    });
  }

  const tautulliKeyEl = document.getElementById('tautulli-api-key');
  if (tautulliKeyEl) {
    tautulliKeyEl.addEventListener('input', () => {
      state.currentSettings.tautulliApiKey = tautulliKeyEl.value.trim();
      state.tautulliApiKeyValidated = false;
      hideTautulliValidationResult();
      updateTautulliPreviewButton();
      updateSaveBar();
    });
  }

  document.getElementById('tautulli-validate-btn')
    ?.addEventListener('click', validateTautulliKey);

  const maxSessEl = document.getElementById('tautulli-max-sessions');
  if (maxSessEl) {
    maxSessEl.addEventListener('change', () => {
      state.currentSettings.tautulliMaxSessions = parseInt(maxSessEl.value, 10);
      // keep an open preview in sync
      if (state.tautulliPreviewWidget) {
        state.tautulliPreviewWidget.setConfig({ maxVisible: state.currentSettings.tautulliMaxSessions });
      }
      updateSaveBar();
    });
  }

  const speedEl = document.getElementById('tautulli-carousel-speed');
  if (speedEl) {
    speedEl.addEventListener('change', () => {
      state.currentSettings.tautulliCarouselDwellMs = parseInt(speedEl.value, 10);
      if (state.tautulliPreviewWidget) {
        state.tautulliPreviewWidget.setConfig({ dwellMs: state.currentSettings.tautulliCarouselDwellMs });
      }
      updateSaveBar();
    });
  }

  // Preview modal
  document.getElementById('tautulli-preview-btn')?.addEventListener('click', openTautulliPreview);
  document.getElementById('tautulli-preview-close')?.addEventListener('click', closeTautulliPreview);
  document.getElementById('tautulli-preview-done')?.addEventListener('click', closeTautulliPreview);
  const previewModal = document.getElementById('tautulli-preview-modal');
  if (previewModal) {
    previewModal.addEventListener('click', (e) => {
      if (e.target === previewModal) closeTautulliPreview();
    });
  }

  // ── Uptime Kuma ──────────────────────────────────────────────────────────
  const ukToggle = document.getElementById('uptimekuma-toggle');
  if (ukToggle) {
    ukToggle.addEventListener('change', () => {
      state.currentSettings.uptimeKumaEnabled = ukToggle.checked;
      const cfg = document.getElementById('uptimekuma-config');
      if (cfg) cfg.style.display = ukToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  const ukUrlEl = document.getElementById('uptimekuma-url');
  if (ukUrlEl) {
    ukUrlEl.addEventListener('input', () => {
      state.currentSettings.uptimeKumaUrl = ukUrlEl.value.trim();
      // URL change invalidates a prior connection test
      state.uptimeKumaValidated = false;
      hideUptimeKumaValidationResult();
      updateUptimeKumaPreviewButton();
      updateSaveBar();
    });
  }

  const ukSlugEl = document.getElementById('uptimekuma-slug');
  if (ukSlugEl) {
    ukSlugEl.addEventListener('input', () => {
      state.currentSettings.uptimeKumaSlug = ukSlugEl.value.trim() || 'default';
      state.uptimeKumaValidated = false;
      hideUptimeKumaValidationResult();
      updateUptimeKumaPreviewButton();
      updateSaveBar();
    });
  }

  document.getElementById('uptimekuma-validate-btn')
    ?.addEventListener('click', validateUptimeKuma);

  // Display-stat checkboxes — update state and live-sync any open preview.
  const ukCheckMap = {
    'uptimekuma-show-average': ['uptimeKumaShowAverage', 'showAverageUptime'],
    'uptimekuma-show-ring':    ['uptimeKumaShowRing', 'showUptimeRing'],
    'uptimekuma-show-total':   ['uptimeKumaShowTotal', 'showTotalMonitors'],
    'uptimekuma-show-up':      ['uptimeKumaShowUp', 'showUpCount'],
    'uptimekuma-show-down':    ['uptimeKumaShowDown', 'showDownCount'],
    'uptimekuma-show-paused':  ['uptimeKumaShowPaused', 'showPausedCount'],
    'uptimekuma-show-list':    ['uptimeKumaShowList', 'showMonitorList'],
  };
  for (const [id, [settingKey, widgetKey]] of Object.entries(ukCheckMap)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      state.currentSettings[settingKey] = el.checked;
      if (state.uptimeKumaPreviewWidget) {
        state.uptimeKumaPreviewWidget.setConfig({ [widgetKey]: el.checked });
      }
      updateSaveBar();
    });
  }

  const ukRefreshEl = document.getElementById('uptimekuma-refresh-secs');
  if (ukRefreshEl) {
    ukRefreshEl.addEventListener('change', () => {
      state.currentSettings.uptimeKumaRefreshSecs = parseInt(ukRefreshEl.value, 10);
      if (state.uptimeKumaPreviewWidget) {
        state.uptimeKumaPreviewWidget.setConfig({ pollMs: state.currentSettings.uptimeKumaRefreshSecs * 1000 });
      }
      updateSaveBar();
    });
  }

  // Preview modal
  document.getElementById('uptimekuma-preview-btn')?.addEventListener('click', openUptimeKumaPreview);
  document.getElementById('uptimekuma-preview-close')?.addEventListener('click', closeUptimeKumaPreview);
  document.getElementById('uptimekuma-preview-done')?.addEventListener('click', closeUptimeKumaPreview);
  const ukPreviewModal = document.getElementById('uptimekuma-preview-modal');
  if (ukPreviewModal) {
    ukPreviewModal.addEventListener('click', (e) => {
      if (e.target === ukPreviewModal) closeUptimeKumaPreview();
    });
  }

  // ── Sonarr + Radarr ──────────────────────────────────────────────────────
  setupArrListeners('sonarr');
  setupArrListeners('radarr');

  // ── Seerr ──────────────────────────────────────────────────────────────────
  setupEyeballToggle('seerr-api-key', 'seerr-key-toggle');

  const seerrToggle = document.getElementById('seerr-toggle');
  if (seerrToggle) {
    seerrToggle.addEventListener('change', () => {
      state.currentSettings.seerrEnabled = seerrToggle.checked;
      const cfg = document.getElementById('seerr-config');
      if (cfg) cfg.style.display = seerrToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  const seerrUrlEl = document.getElementById('seerr-url');
  if (seerrUrlEl) {
    seerrUrlEl.addEventListener('input', () => {
      state.currentSettings.seerrUrl = seerrUrlEl.value.trim();
      state.seerrValidated = false;
      hideSeerrValidationResult();
      updateSeerrPreviewButton();
      updateSaveBar();
    });
  }

  const seerrKeyEl = document.getElementById('seerr-api-key');
  if (seerrKeyEl) {
    seerrKeyEl.addEventListener('input', () => {
      state.currentSettings.seerrApiKey = seerrKeyEl.value.trim();
      state.seerrValidated = false;
      hideSeerrValidationResult();
      updateSeerrPreviewButton();
      updateSaveBar();
    });
  }

  document.getElementById('seerr-validate-btn')?.addEventListener('click', validateSeerr);

  const seerrViewEl = document.getElementById('seerr-view');
  if (seerrViewEl) {
    seerrViewEl.addEventListener('change', () => {
      state.currentSettings.seerrView = seerrViewEl.value;
      if (state.seerrPreviewWidget) state.seerrPreviewWidget.setConfig({ view: seerrViewEl.value });
      updateSaveBar();
    });
  }

  const seerrCountEl = document.getElementById('seerr-count');
  if (seerrCountEl) {
    seerrCountEl.addEventListener('change', () => {
      state.currentSettings.seerrCount = parseInt(seerrCountEl.value, 10);
      if (state.seerrPreviewWidget) state.seerrPreviewWidget.setConfig({ requestCount: state.currentSettings.seerrCount });
      updateSaveBar();
    });
  }

  const seerrUsersEl = document.getElementById('seerr-show-users');
  if (seerrUsersEl) {
    seerrUsersEl.addEventListener('change', () => {
      state.currentSettings.seerrShowUsers = seerrUsersEl.checked;
      if (state.seerrPreviewWidget) state.seerrPreviewWidget.setConfig({ showUsers: seerrUsersEl.checked });
      updateSaveBar();
    });
  }

  document.getElementById('seerr-preview-btn')?.addEventListener('click', openSeerrPreview);
  document.getElementById('seerr-preview-close')?.addEventListener('click', closeSeerrPreview);
  document.getElementById('seerr-preview-done')?.addEventListener('click', closeSeerrPreview);
  const seerrModal = document.getElementById('seerr-preview-modal');
  if (seerrModal) {
    seerrModal.addEventListener('click', (e) => { if (e.target === seerrModal) closeSeerrPreview(); });
  }

  // ── Pi-hole + AdGuard ──────────────────────────────────────────────────────
  setupDnsHoleListeners('pihole');
  setupDnsHoleListeners('adguard');

  // ── Plex ─────────────────────────────────────────────────────────────────
  setupEyeballToggle('plex-token', 'plex-key-toggle');
  const plexToggle = document.getElementById('plex-toggle');
  if (plexToggle) {
    plexToggle.addEventListener('change', () => {
      state.currentSettings.plexEnabled = plexToggle.checked;
      const cfg = document.getElementById('plex-config');
      if (cfg) cfg.style.display = plexToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }
  const plexInvalidate = () => { state.plexValidated = false; hidePlexValidationResult(); updatePlexPreviewButton(); updateSaveBar(); };
  const plexUrlEl = document.getElementById('plex-url');
  if (plexUrlEl) plexUrlEl.addEventListener('input', () => { state.currentSettings.plexUrl = plexUrlEl.value.trim(); plexInvalidate(); });
  const plexTokenEl = document.getElementById('plex-token');
  if (plexTokenEl) plexTokenEl.addEventListener('input', () => { state.currentSettings.plexToken = plexTokenEl.value.trim(); plexInvalidate(); });
  document.getElementById('plex-validate-btn')?.addEventListener('click', validatePlex);
  document.getElementById('plex-preview-btn')?.addEventListener('click', openPlexPreview);
  document.getElementById('plex-preview-close')?.addEventListener('click', closePlexPreview);
  document.getElementById('plex-preview-done')?.addEventListener('click', closePlexPreview);
  const plexModal = document.getElementById('plex-preview-modal');
  if (plexModal) plexModal.addEventListener('click', (e) => { if (e.target === plexModal) closePlexPreview(); });

  // ── UniFi ────────────────────────────────────────────────────────────────
  setupEyeballToggle('unifi-password', 'unifi-key-toggle');
  const unifiToggle = document.getElementById('unifi-toggle');
  if (unifiToggle) {
    unifiToggle.addEventListener('change', () => {
      state.currentSettings.unifiEnabled = unifiToggle.checked;
      const cfg = document.getElementById('unifi-config');
      if (cfg) cfg.style.display = unifiToggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }
  const unifiInvalidate = () => { state.unifiValidated = false; hideUnifiValidationResult(); updateUnifiPreviewButton(); updateSaveBar(); };
  const unifiUrlEl = document.getElementById('unifi-url');
  if (unifiUrlEl) unifiUrlEl.addEventListener('input', () => { state.currentSettings.unifiUrl = unifiUrlEl.value.trim(); unifiInvalidate(); });
  const unifiUserEl = document.getElementById('unifi-username');
  if (unifiUserEl) unifiUserEl.addEventListener('input', () => { state.currentSettings.unifiUsername = unifiUserEl.value.trim(); unifiInvalidate(); });
  const unifiPassEl = document.getElementById('unifi-password');
  if (unifiPassEl) unifiPassEl.addEventListener('input', () => { state.currentSettings.unifiPassword = unifiPassEl.value; unifiInvalidate(); });
  const unifiSiteEl = document.getElementById('unifi-site');
  if (unifiSiteEl) unifiSiteEl.addEventListener('input', () => { state.currentSettings.unifiSite = unifiSiteEl.value.trim() || 'default'; updateSaveBar(); });
  document.getElementById('unifi-validate-btn')?.addEventListener('click', validateUnifi);
  document.getElementById('unifi-preview-btn')?.addEventListener('click', openUnifiPreview);
  document.getElementById('unifi-preview-close')?.addEventListener('click', closeUnifiPreview);
  document.getElementById('unifi-preview-done')?.addEventListener('click', closeUnifiPreview);
  const unifiModal = document.getElementById('unifi-preview-modal');
  if (unifiModal) unifiModal.addEventListener('click', (e) => { if (e.target === unifiModal) closeUnifiPreview(); });

  // ── Download clients ───────────────────────────────────────────────────────
  setupDownloadListeners('sabnzbd');
  setupDownloadListeners('qbittorrent');
  setupDownloadListeners('transmission');

  // ── Extra integrations (PeaNUT / Umami / Speedtest / ntfy) ──────────────────
  setupExtraListeners('peanut', {
    fields: { 'peanut-url': 'peanutUrl', 'peanut-username': 'peanutUsername', 'peanut-password': 'peanutPassword' },
    secret: ['peanut-password', 'peanut-key-toggle'], invalidates: true,
    validate: validatePeanut, update: updatePeanutPreviewButton, open: openPeanutPreview, close: closePeanutPreview,
  });
  setupExtraListeners('umami', {
    fields: { 'umami-url': 'umamiUrl', 'umami-api-key': 'umamiApiKey', 'umami-username': 'umamiUsername', 'umami-password': 'umamiPassword', 'umami-website-id': 'umamiWebsiteId' },
    selects: { 'umami-timeframe': 'umamiTimeframe' }, secret: ['umami-api-key', 'umami-key-toggle'], invalidates: true,
    validate: validateUmami, update: updateUmamiPreviewButton, open: openUmamiPreview, close: closeUmamiPreview,
    live: (w) => w.setConfig({ timeFrame: state.currentSettings.umamiTimeframe }),
  });
  setupExtraListeners('speedtest', {
    fields: { 'speedtest-url': 'speedtestUrl', 'speedtest-token': 'speedtestToken' },
    secret: ['speedtest-token', 'speedtest-key-toggle'], invalidates: true,
    validate: validateSpeedtest, update: updateSpeedtestPreviewButton, open: openSpeedtestPreview, close: closeSpeedtestPreview,
  });
  setupExtraListeners('ntfy', {
    fields: { 'ntfy-url': 'ntfyUrl', 'ntfy-topic': 'ntfyTopic', 'ntfy-token': 'ntfyToken' },
    selects: { 'ntfy-limit': 'ntfyLimit' }, secret: ['ntfy-token', 'ntfy-key-toggle'], invalidates: true,
    validate: validateNtfy, update: updateNtfyPreviewButton, open: openNtfyPreview, close: closeNtfyPreview,
    live: (w) => w.setConfig({ limit: parseInt(state.currentSettings.ntfyLimit, 10) || 10 }),
  });

  // ── Media & library (Audiobookshelf / Navidrome / Prowlarr / Tracearr) ──────
  setupExtraListeners('audiobookshelf', {
    fields: { 'audiobookshelf-url': 'audiobookshelfUrl', 'audiobookshelf-token': 'audiobookshelfToken' },
    secret: ['audiobookshelf-token', 'audiobookshelf-key-toggle'], invalidates: true,
    validate: validateAudiobookshelf, update: updateAudiobookshelfPreviewButton, open: openAudiobookshelfPreview, close: closeAudiobookshelfPreview,
  });
  setupExtraListeners('navidrome', {
    fields: { 'navidrome-url': 'navidromeUrl', 'navidrome-username': 'navidromeUsername', 'navidrome-password': 'navidromePassword' },
    secret: ['navidrome-password', 'navidrome-key-toggle'], invalidates: true,
    validate: validateNavidrome, update: updateNavidromePreviewButton, open: openNavidromePreview, close: closeNavidromePreview,
  });
  setupExtraListeners('prowlarr', {
    fields: { 'prowlarr-url': 'prowlarrUrl', 'prowlarr-api-key': 'prowlarrApiKey' },
    secret: ['prowlarr-api-key', 'prowlarr-key-toggle'], invalidates: true,
    validate: validateProwlarr, update: updateProwlarrPreviewButton, open: openProwlarrPreview, close: closeProwlarrPreview,
  });
  setupExtraListeners('tracearr', {
    fields: { 'tracearr-url': 'tracearrUrl', 'tracearr-api-key': 'tracearrApiKey' },
    secret: ['tracearr-api-key', 'tracearr-key-toggle'], invalidates: true,
    validate: validateTracearr, update: updateTracearrPreviewButton, open: openTracearrPreview, close: closeTracearrPreview,
  });

  // ── System health (Glances / Dashdot / Unraid / OpenMediaVault / TrueNAS) ───
  Object.keys(SYSTEM_HEALTH).forEach((svc) => {
    const d = SYSTEM_HEALTH[svc];
    setupExtraListeners(svc, {
      fields: d.fields, secret: d.secret, invalidates: true,
      validate: () => validateSystemHealth(svc),
      update: () => updateSystemHealthPreviewButton(svc),
      open: () => openSystemHealthPreview(svc),
      close: () => closeExtraPreview(svc),
    });
  });

  // ── Proxmox / PBS / Beszel ──────────────────────────────────────────────────
  setupExtraListeners('proxmox', {
    fields: { 'proxmox-url': 'proxmoxUrl', 'proxmox-username': 'proxmoxUsername', 'proxmox-realm': 'proxmoxRealm', 'proxmox-token-id': 'proxmoxTokenId', 'proxmox-api-key': 'proxmoxApiKey' },
    secret: ['proxmox-api-key', 'proxmox-key-toggle'], invalidates: true,
    validate: validateProxmox, update: updateProxmoxPreviewButton, open: openProxmoxPreview, close: closeProxmoxPreview,
  });
  setupExtraListeners('pbs', {
    fields: { 'pbs-url': 'pbsUrl', 'pbs-username': 'pbsUsername', 'pbs-realm': 'pbsRealm', 'pbs-token-id': 'pbsTokenId', 'pbs-api-key': 'pbsApiKey' },
    secret: ['pbs-api-key', 'pbs-key-toggle'], invalidates: true,
    validate: validatePbs, update: updatePbsPreviewButton, open: openPbsPreview, close: closePbsPreview,
  });
  setupExtraListeners('beszel', {
    fields: { 'beszel-url': 'beszelUrl', 'beszel-username': 'beszelUsername', 'beszel-password': 'beszelPassword' },
    secret: ['beszel-password', 'beszel-key-toggle'], invalidates: true,
    validate: validateBeszel, update: updateBeszelPreviewButton, open: openBeszelPreview, close: closeBeszelPreview,
  });

  // ── iCal / Home Assistant / Nextcloud ───────────────────────────────────────
  setupExtraListeners('ical', {
    fields: { 'ical-url': 'icalUrl' }, selects: { 'ical-view': 'icalView' }, invalidates: true,
    validate: validateIcal, update: updateIcalPreviewButton, open: openIcalPreview, close: closeIcalPreview,
    live: (w) => w.setConfig({ view: state.currentSettings.icalView, title: state.currentSettings.icalName || 'Calendar' }),
  });
  // The calendar name is cosmetic — changing it shouldn't invalidate the feed test.
  const icalNameEl = document.getElementById('ical-name');
  if (icalNameEl) icalNameEl.addEventListener('input', () => { state.currentSettings.icalName = icalNameEl.value; if (state.icalPreviewWidget) state.icalPreviewWidget.setConfig({ title: icalNameEl.value || 'Calendar' }); updateSaveBar(); });

  setupExtraListeners('homeassistant', {
    fields: { 'homeassistant-url': 'homeassistantUrl', 'homeassistant-token': 'homeassistantToken' },
    secret: ['homeassistant-token', 'homeassistant-key-toggle'], invalidates: true,
    validate: validateHomeassistant, update: updateHomeassistantPreviewButton, open: openHomeassistantPreview, close: closeHomeassistantPreview,
  });
  const haEntitiesEl = document.getElementById('homeassistant-entities');
  if (haEntitiesEl) haEntitiesEl.addEventListener('input', () => { state.currentSettings.homeassistantEntities = haEntitiesEl.value; if (state.homeassistantPreviewWidget) state.homeassistantPreviewWidget.setConfig({ entities: parseHaEntities(haEntitiesEl.value) }); updateSaveBar(); });
  const haAllowEl = document.getElementById('homeassistant-allow-toggle');
  if (haAllowEl) haAllowEl.addEventListener('change', () => { state.currentSettings.homeassistantAllowToggle = haAllowEl.checked; if (state.homeassistantPreviewWidget) state.homeassistantPreviewWidget.setConfig({ allowToggle: haAllowEl.checked }); updateSaveBar(); });

  setupExtraListeners('nextcloud', {
    fields: { 'nextcloud-url': 'nextcloudUrl', 'nextcloud-username': 'nextcloudUsername', 'nextcloud-password': 'nextcloudPassword' },
    secret: ['nextcloud-password', 'nextcloud-key-toggle'], invalidates: true,
    validate: validateNextcloud, update: updateNextcloudPreviewButton, open: openNextcloudPreview, close: closeNextcloudPreview,
  });
  setupExtraListeners('opnsense', {
    fields: { 'opnsense-url': 'opnsenseUrl', 'opnsense-key': 'opnsenseKey', 'opnsense-secret': 'opnsenseSecret' },
    secret: ['opnsense-secret', 'opnsense-key-toggle'], invalidates: true,
    validate: validateOpnsense, update: updateOpnsensePreviewButton, open: openOpnsensePreview, close: closeOpnsensePreview,
  });
}

// Generic listener wiring for the four extra integrations.
function setupExtraListeners(svc, opt) {
  if (opt.secret) setupEyeballToggle(opt.secret[0], opt.secret[1]);
  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.addEventListener('change', () => {
      state.currentSettings[`${svc}Enabled`] = toggle.checked;
      const cfg = document.getElementById(`${svc}-config`);
      if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }
  const invalidate = () => { state[`${svc}Validated`] = false; const r = document.getElementById(`${svc}-validation-result`); if (r) r.style.display = 'none'; opt.update(); updateSaveBar(); };
  for (const [id, key] of Object.entries(opt.fields || {})) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', () => { state.currentSettings[key] = (/password|token|api-key|apiKey/i.test(id) ? el.value : el.value.trim()); if (opt.invalidates) invalidate(); else updateSaveBar(); });
  }
  for (const [id, key] of Object.entries(opt.selects || {})) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      const raw = el.value;
      state.currentSettings[key] = /Limit$/.test(key) ? (parseInt(raw, 10) || 10) : raw;
      const w = state[`${svc}PreviewWidget`];
      if (w && opt.live) opt.live(w);
      updateSaveBar();
    });
  }
  document.getElementById(`${svc}-validate-btn`)?.addEventListener('click', opt.validate);
  document.getElementById(`${svc}-preview-btn`)?.addEventListener('click', opt.open);
  document.getElementById(`${svc}-preview-close`)?.addEventListener('click', opt.close);
  document.getElementById(`${svc}-preview-done`)?.addEventListener('click', opt.close);
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) opt.close(); });
}

function setupDownloadListeners(svc) {
  const desc = DOWNLOAD_CLIENTS[svc];
  setupEyeballToggle(desc.secret[0], desc.secret[1]);

  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.addEventListener('change', () => {
      state.currentSettings[`${svc}Enabled`] = toggle.checked;
      const cfg = document.getElementById(`${svc}-config`);
      if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }
  const invalidate = () => { state[`${svc}Validated`] = false; hideDownloadValidationResult(svc); updateDownloadPreviewButton(svc); updateSaveBar(); };

  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) urlEl.addEventListener('input', () => { state.currentSettings[`${svc}Url`] = urlEl.value.trim(); invalidate(); });

  for (const [field, id] of Object.entries(desc.fields)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const key = `${svc}${cap1(field)}`;
    el.addEventListener('input', () => { state.currentSettings[key] = (field === 'password' ? el.value : el.value.trim()); invalidate(); });
  }

  const limitEl = document.getElementById(`${svc}-limit`);
  if (limitEl) {
    limitEl.addEventListener('change', () => {
      state.currentSettings[`${svc}Limit`] = parseInt(limitEl.value, 10) || 10;
      const w = state[`${svc}PreviewWidget`];
      if (w) w.setConfig({ limit: state.currentSettings[`${svc}Limit`] });
      updateSaveBar();
    });
  }

  document.getElementById(`${svc}-validate-btn`)?.addEventListener('click', () => validateDownload(svc));
  document.getElementById(`${svc}-preview-btn`)?.addEventListener('click', () => openDownloadPreview(svc));
  document.getElementById(`${svc}-preview-close`)?.addEventListener('click', () => closeDownloadPreview(svc));
  document.getElementById(`${svc}-preview-done`)?.addEventListener('click', () => closeDownloadPreview(svc));
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeDownloadPreview(svc); });
}

function setupDnsHoleListeners(svc) {
  // Mask the secret field (Pi-hole api key / AdGuard password).
  if (svc === 'pihole') setupEyeballToggle('pihole-api-key', 'pihole-key-toggle');
  else setupEyeballToggle('adguard-password', 'adguard-key-toggle');

  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.addEventListener('change', () => {
      state.currentSettings[`${svc}Enabled`] = toggle.checked;
      const cfg = document.getElementById(`${svc}-config`);
      if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  const invalidate = () => {
    state[`${svc}Validated`] = false;
    hideDnsHoleValidationResult(svc);
    updateDnsHolePreviewButton(svc);
    updateSaveBar();
  };

  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) {
    urlEl.addEventListener('input', () => {
      state.currentSettings[`${svc}Url`] = urlEl.value.trim();
      invalidate();
    });
  }

  for (const [field, id] of Object.entries(DNS_HOLE_FIELDS[svc])) {
    const el = document.getElementById(id);
    if (!el) continue;
    const key = `${svc}${field.charAt(0).toUpperCase() + field.slice(1)}`;
    el.addEventListener('input', () => {
      state.currentSettings[key] = el.value.trim();
      invalidate();
    });
  }

  document.getElementById(`${svc}-validate-btn`)?.addEventListener('click', () => validateDnsHole(svc));
  document.getElementById(`${svc}-preview-btn`)?.addEventListener('click', () => openDnsHolePreview(svc));
  document.getElementById(`${svc}-preview-close`)?.addEventListener('click', () => closeDnsHolePreview(svc));
  document.getElementById(`${svc}-preview-done`)?.addEventListener('click', () => closeDnsHolePreview(svc));
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeDnsHolePreview(svc); });
  }
}

// Shared listener wiring for the Sonarr/Radarr cards.
function setupArrListeners(svc) {
  setupEyeballToggle(`${svc}-api-key`, `${svc}-key-toggle`);

  const toggle = document.getElementById(`${svc}-toggle`);
  if (toggle) {
    toggle.addEventListener('change', () => {
      state.currentSettings[`${svc}Enabled`] = toggle.checked;
      const cfg = document.getElementById(`${svc}-config`);
      if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
      updateSaveBar();
    });
  }

  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) {
    urlEl.addEventListener('input', () => {
      state.currentSettings[`${svc}Url`] = urlEl.value.trim();
      state[`${svc}Validated`] = false;
      hideArrValidationResult(svc);
      updateArrPreviewButton(svc);
      updateSaveBar();
    });
  }

  const keyEl = document.getElementById(`${svc}-api-key`);
  if (keyEl) {
    keyEl.addEventListener('input', () => {
      state.currentSettings[`${svc}ApiKey`] = keyEl.value.trim();
      state[`${svc}Validated`] = false;
      hideArrValidationResult(svc);
      updateArrPreviewButton(svc);
      updateSaveBar();
    });
  }

  document.getElementById(`${svc}-validate-btn`)
    ?.addEventListener('click', () => validateArr(svc));

  const viewEl = document.getElementById(`${svc}-view`);
  if (viewEl) {
    viewEl.addEventListener('change', () => {
      state.currentSettings[`${svc}View`] = viewEl.value;
      const w = state[`${svc}PreviewWidget`];
      if (w) w.setConfig({ view: viewEl.value });
      updateSaveBar();
    });
  }

  const countEl = document.getElementById(`${svc}-count`);
  if (countEl) {
    countEl.addEventListener('change', () => {
      state.currentSettings[`${svc}Count`] = parseInt(countEl.value, 10);
      const w = state[`${svc}PreviewWidget`];
      if (w) w.setConfig({ upcomingCount: state.currentSettings[`${svc}Count`] });
      updateSaveBar();
    });
  }

  const unmonEl = document.getElementById(`${svc}-unmonitored`);
  if (unmonEl) {
    unmonEl.addEventListener('change', () => {
      state.currentSettings[`${svc}Unmonitored`] = unmonEl.checked;
      const w = state[`${svc}PreviewWidget`];
      if (w) w.setConfig({ showUnmonitored: unmonEl.checked });
      updateSaveBar();
    });
  }

  if (svc === 'radarr') {
    const rt = {
      'radarr-rt-cinemas': 'radarrRtCinemas',
      'radarr-rt-digital': 'radarrRtDigital',
      'radarr-rt-physical': 'radarrRtPhysical',
    };
    for (const [id, key] of Object.entries(rt)) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.addEventListener('change', () => {
        state.currentSettings[key] = el.checked;
        const w = state.radarrPreviewWidget;
        if (w) w.setConfig({ releaseTypes: radarrReleaseTypesFromSettings() });
        updateSaveBar();
      });
    }
  }

  // Preview modal
  document.getElementById(`${svc}-preview-btn`)?.addEventListener('click', () => openArrPreview(svc));
  document.getElementById(`${svc}-preview-close`)?.addEventListener('click', () => closeArrPreview(svc));
  document.getElementById(`${svc}-preview-done`)?.addEventListener('click', () => closeArrPreview(svc));
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) {
    modal.addEventListener('click', (e) => { if (e.target === modal) closeArrPreview(svc); });
  }
}

function hasUnsavedChanges() {
  const c = state.currentSettings;
  const s = state.savedSettings;
  return (
    c.apiKey             !== s.apiKey             ||
    c.model              !== s.model              ||
    c.clockFormat        !== s.clockFormat        ||
    c.dateVisible        !== s.dateVisible        ||
    c.dateFormat         !== s.dateFormat         ||
    c.weatherEnabled     !== s.weatherEnabled     ||
    c.weatherApiKey      !== s.weatherApiKey      ||
    c.weatherLocation    !== s.weatherLocation    ||
    c.weatherUnits       !== s.weatherUnits       ||
    c.weatherRefreshMins !== s.weatherRefreshMins ||
    c.tautulliEnabled    !== s.tautulliEnabled    ||
    c.tautulliUrl        !== s.tautulliUrl         ||
    c.tautulliApiKey     !== s.tautulliApiKey      ||
    c.tautulliMaxSessions !== s.tautulliMaxSessions ||
    c.tautulliCarouselDwellMs !== s.tautulliCarouselDwellMs ||
    c.uptimeKumaEnabled  !== s.uptimeKumaEnabled  ||
    c.uptimeKumaUrl      !== s.uptimeKumaUrl       ||
    c.uptimeKumaSlug     !== s.uptimeKumaSlug      ||
    c.uptimeKumaRefreshSecs !== s.uptimeKumaRefreshSecs ||
    c.uptimeKumaShowAverage !== s.uptimeKumaShowAverage ||
    c.uptimeKumaShowRing !== s.uptimeKumaShowRing  ||
    c.uptimeKumaShowTotal !== s.uptimeKumaShowTotal ||
    c.uptimeKumaShowUp   !== s.uptimeKumaShowUp    ||
    c.uptimeKumaShowDown !== s.uptimeKumaShowDown  ||
    c.uptimeKumaShowPaused !== s.uptimeKumaShowPaused ||
    c.uptimeKumaShowList !== s.uptimeKumaShowList ||
    c.sonarrEnabled      !== s.sonarrEnabled      ||
    c.sonarrUrl          !== s.sonarrUrl          ||
    c.sonarrApiKey       !== s.sonarrApiKey       ||
    c.sonarrView         !== s.sonarrView         ||
    c.sonarrCount        !== s.sonarrCount        ||
    c.sonarrUnmonitored  !== s.sonarrUnmonitored  ||
    c.radarrEnabled      !== s.radarrEnabled      ||
    c.radarrUrl          !== s.radarrUrl          ||
    c.radarrApiKey       !== s.radarrApiKey       ||
    c.radarrView         !== s.radarrView         ||
    c.radarrCount        !== s.radarrCount        ||
    c.radarrUnmonitored  !== s.radarrUnmonitored  ||
    c.radarrRtCinemas    !== s.radarrRtCinemas    ||
    c.radarrRtDigital    !== s.radarrRtDigital    ||
    c.radarrRtPhysical   !== s.radarrRtPhysical   ||
    c.seerrEnabled       !== s.seerrEnabled       ||
    c.seerrUrl           !== s.seerrUrl           ||
    c.seerrApiKey        !== s.seerrApiKey        ||
    c.seerrView          !== s.seerrView          ||
    c.seerrCount         !== s.seerrCount         ||
    c.seerrShowUsers     !== s.seerrShowUsers     ||
    c.piholeEnabled      !== s.piholeEnabled      ||
    c.piholeUrl          !== s.piholeUrl          ||
    c.piholeApiKey       !== s.piholeApiKey       ||
    c.adguardEnabled     !== s.adguardEnabled     ||
    c.adguardUrl         !== s.adguardUrl         ||
    c.adguardUsername    !== s.adguardUsername    ||
    c.adguardPassword    !== s.adguardPassword    ||
    c.plexEnabled        !== s.plexEnabled        ||
    c.plexUrl            !== s.plexUrl            ||
    c.plexToken          !== s.plexToken          ||
    c.unifiEnabled       !== s.unifiEnabled       ||
    c.unifiUrl           !== s.unifiUrl           ||
    c.unifiUsername      !== s.unifiUsername      ||
    c.unifiPassword      !== s.unifiPassword      ||
    c.unifiSite          !== s.unifiSite          ||
    c.sabnzbdEnabled     !== s.sabnzbdEnabled     ||
    c.sabnzbdUrl         !== s.sabnzbdUrl         ||
    c.sabnzbdApiKey      !== s.sabnzbdApiKey      ||
    c.sabnzbdLimit       !== s.sabnzbdLimit       ||
    c.qbittorrentEnabled !== s.qbittorrentEnabled ||
    c.qbittorrentUrl     !== s.qbittorrentUrl     ||
    c.qbittorrentUsername !== s.qbittorrentUsername ||
    c.qbittorrentPassword !== s.qbittorrentPassword ||
    c.qbittorrentLimit   !== s.qbittorrentLimit   ||
    c.transmissionEnabled !== s.transmissionEnabled ||
    c.transmissionUrl    !== s.transmissionUrl    ||
    c.transmissionUsername !== s.transmissionUsername ||
    c.transmissionPassword !== s.transmissionPassword ||
    c.transmissionLimit  !== s.transmissionLimit     ||
    c.peanutEnabled      !== s.peanutEnabled         ||
    c.peanutUrl          !== s.peanutUrl             ||
    c.peanutUsername     !== s.peanutUsername         ||
    c.peanutPassword     !== s.peanutPassword         ||
    c.umamiEnabled       !== s.umamiEnabled           ||
    c.umamiUrl           !== s.umamiUrl               ||
    c.umamiApiKey        !== s.umamiApiKey            ||
    c.umamiUsername      !== s.umamiUsername           ||
    c.umamiPassword      !== s.umamiPassword           ||
    c.umamiWebsiteId     !== s.umamiWebsiteId          ||
    c.umamiTimeframe     !== s.umamiTimeframe          ||
    c.speedtestEnabled   !== s.speedtestEnabled        ||
    c.speedtestUrl       !== s.speedtestUrl            ||
    c.speedtestToken     !== s.speedtestToken          ||
    c.ntfyEnabled        !== s.ntfyEnabled             ||
    c.ntfyUrl            !== s.ntfyUrl                 ||
    c.ntfyTopic          !== s.ntfyTopic               ||
    c.ntfyToken          !== s.ntfyToken               ||
    c.ntfyLimit          !== s.ntfyLimit                ||
    c.audiobookshelfEnabled !== s.audiobookshelfEnabled ||
    c.audiobookshelfUrl  !== s.audiobookshelfUrl        ||
    c.audiobookshelfToken !== s.audiobookshelfToken     ||
    c.navidromeEnabled   !== s.navidromeEnabled         ||
    c.navidromeUrl       !== s.navidromeUrl             ||
    c.navidromeUsername  !== s.navidromeUsername        ||
    c.navidromePassword  !== s.navidromePassword        ||
    c.prowlarrEnabled    !== s.prowlarrEnabled          ||
    c.prowlarrUrl        !== s.prowlarrUrl              ||
    c.prowlarrApiKey     !== s.prowlarrApiKey           ||
    c.tracearrEnabled    !== s.tracearrEnabled          ||
    c.tracearrUrl        !== s.tracearrUrl              ||
    c.tracearrApiKey     !== s.tracearrApiKey           ||
    c.glancesEnabled !== s.glancesEnabled || c.glancesUrl !== s.glancesUrl || c.glancesUsername !== s.glancesUsername || c.glancesPassword !== s.glancesPassword ||
    c.dashdotEnabled !== s.dashdotEnabled || c.dashdotUrl !== s.dashdotUrl ||
    c.unraidEnabled !== s.unraidEnabled || c.unraidUrl !== s.unraidUrl || c.unraidApiKey !== s.unraidApiKey ||
    c.openmediavaultEnabled !== s.openmediavaultEnabled || c.openmediavaultUrl !== s.openmediavaultUrl || c.openmediavaultUsername !== s.openmediavaultUsername || c.openmediavaultPassword !== s.openmediavaultPassword ||
    c.truenasEnabled !== s.truenasEnabled || c.truenasUrl !== s.truenasUrl || c.truenasApiKey !== s.truenasApiKey ||
    c.proxmoxEnabled !== s.proxmoxEnabled || c.proxmoxUrl !== s.proxmoxUrl || c.proxmoxUsername !== s.proxmoxUsername || c.proxmoxRealm !== s.proxmoxRealm || c.proxmoxTokenId !== s.proxmoxTokenId || c.proxmoxApiKey !== s.proxmoxApiKey ||
    c.pbsEnabled !== s.pbsEnabled || c.pbsUrl !== s.pbsUrl || c.pbsUsername !== s.pbsUsername || c.pbsRealm !== s.pbsRealm || c.pbsTokenId !== s.pbsTokenId || c.pbsApiKey !== s.pbsApiKey || c.pbsNode !== s.pbsNode ||
    c.beszelEnabled !== s.beszelEnabled || c.beszelUrl !== s.beszelUrl || c.beszelUsername !== s.beszelUsername || c.beszelPassword !== s.beszelPassword ||
    c.icalEnabled !== s.icalEnabled || c.icalName !== s.icalName || c.icalUrl !== s.icalUrl || c.icalView !== s.icalView ||
    c.homeassistantEnabled !== s.homeassistantEnabled || c.homeassistantUrl !== s.homeassistantUrl || c.homeassistantToken !== s.homeassistantToken || c.homeassistantEntities !== s.homeassistantEntities || c.homeassistantAllowToggle !== s.homeassistantAllowToggle ||
    c.nextcloudEnabled !== s.nextcloudEnabled || c.nextcloudUrl !== s.nextcloudUrl || c.nextcloudUsername !== s.nextcloudUsername || c.nextcloudPassword !== s.nextcloudPassword ||
    c.opnsenseEnabled !== s.opnsenseEnabled || c.opnsenseUrl !== s.opnsenseUrl || c.opnsenseKey !== s.opnsenseKey || c.opnsenseSecret !== s.opnsenseSecret
  );
}

function updateSaveBar() {
  const changed = hasUnsavedChanges();
  const onSettingsLike = state.activeTab === 'settings' || state.activeTab === 'widgets';
  pendingBanner.style.display = changed && onSettingsLike ? 'flex' : 'none';
  if (changed) {
    saveBar.classList.add('visible');
    saveBtn.disabled = !state.apiKeyValidated && state.currentSettings.apiKey !== state.savedSettings.apiKey;
    // Allow saving model change without re-validating
    if (state.currentSettings.apiKey === state.savedSettings.apiKey) {
      saveBtn.disabled = false;
    }
  } else {
    saveBar.classList.remove('visible');
    pendingBanner.style.display = 'none';
  }
}

async function saveSettings() {
  const settings = {
    apiKey:              state.currentSettings.apiKey,
    model:               state.currentSettings.model,
    clockFormat:         state.currentSettings.clockFormat,
    dateVisible:         state.currentSettings.dateVisible,
    dateFormat:          state.currentSettings.dateFormat,
    weatherEnabled:      state.currentSettings.weatherEnabled,
    weatherApiKey:       state.currentSettings.weatherApiKey,
    weatherLocation:     state.currentSettings.weatherLocation,
    weatherUnits:        state.currentSettings.weatherUnits,
    weatherRefreshMins:  state.currentSettings.weatherRefreshMins,
    tautulliEnabled:     state.currentSettings.tautulliEnabled,
    tautulliUrl:         state.currentSettings.tautulliUrl,
    tautulliApiKey:      state.currentSettings.tautulliApiKey,
    tautulliMaxSessions: state.currentSettings.tautulliMaxSessions,
    tautulliCarouselDwellMs: state.currentSettings.tautulliCarouselDwellMs,
    uptimeKumaEnabled:   state.currentSettings.uptimeKumaEnabled,
    uptimeKumaUrl:       state.currentSettings.uptimeKumaUrl,
    uptimeKumaSlug:      state.currentSettings.uptimeKumaSlug,
    uptimeKumaRefreshSecs: state.currentSettings.uptimeKumaRefreshSecs,
    uptimeKumaShowAverage: state.currentSettings.uptimeKumaShowAverage,
    uptimeKumaShowRing:  state.currentSettings.uptimeKumaShowRing,
    uptimeKumaShowTotal: state.currentSettings.uptimeKumaShowTotal,
    uptimeKumaShowUp:    state.currentSettings.uptimeKumaShowUp,
    uptimeKumaShowDown:  state.currentSettings.uptimeKumaShowDown,
    uptimeKumaShowPaused: state.currentSettings.uptimeKumaShowPaused,
    uptimeKumaShowList:  state.currentSettings.uptimeKumaShowList,
    sonarrEnabled:       state.currentSettings.sonarrEnabled,
    sonarrUrl:           state.currentSettings.sonarrUrl,
    sonarrApiKey:        state.currentSettings.sonarrApiKey,
    sonarrView:          state.currentSettings.sonarrView,
    sonarrCount:         state.currentSettings.sonarrCount,
    sonarrUnmonitored:   state.currentSettings.sonarrUnmonitored,
    radarrEnabled:       state.currentSettings.radarrEnabled,
    radarrUrl:           state.currentSettings.radarrUrl,
    radarrApiKey:        state.currentSettings.radarrApiKey,
    radarrView:          state.currentSettings.radarrView,
    radarrCount:         state.currentSettings.radarrCount,
    radarrUnmonitored:   state.currentSettings.radarrUnmonitored,
    radarrRtCinemas:     state.currentSettings.radarrRtCinemas,
    radarrRtDigital:     state.currentSettings.radarrRtDigital,
    radarrRtPhysical:    state.currentSettings.radarrRtPhysical,
    seerrEnabled:        state.currentSettings.seerrEnabled,
    seerrUrl:            state.currentSettings.seerrUrl,
    seerrApiKey:         state.currentSettings.seerrApiKey,
    seerrView:           state.currentSettings.seerrView,
    seerrCount:          state.currentSettings.seerrCount,
    seerrShowUsers:      state.currentSettings.seerrShowUsers,
    piholeEnabled:       state.currentSettings.piholeEnabled,
    piholeUrl:           state.currentSettings.piholeUrl,
    piholeApiKey:        state.currentSettings.piholeApiKey,
    adguardEnabled:      state.currentSettings.adguardEnabled,
    adguardUrl:          state.currentSettings.adguardUrl,
    adguardUsername:     state.currentSettings.adguardUsername,
    adguardPassword:     state.currentSettings.adguardPassword,
    plexEnabled:         state.currentSettings.plexEnabled,
    plexUrl:             state.currentSettings.plexUrl,
    plexToken:           state.currentSettings.plexToken,
    unifiEnabled:        state.currentSettings.unifiEnabled,
    unifiUrl:            state.currentSettings.unifiUrl,
    unifiUsername:       state.currentSettings.unifiUsername,
    unifiPassword:       state.currentSettings.unifiPassword,
    unifiSite:           state.currentSettings.unifiSite,
    sabnzbdEnabled:      state.currentSettings.sabnzbdEnabled,
    sabnzbdUrl:          state.currentSettings.sabnzbdUrl,
    sabnzbdApiKey:       state.currentSettings.sabnzbdApiKey,
    sabnzbdLimit:        state.currentSettings.sabnzbdLimit,
    qbittorrentEnabled:  state.currentSettings.qbittorrentEnabled,
    qbittorrentUrl:      state.currentSettings.qbittorrentUrl,
    qbittorrentUsername: state.currentSettings.qbittorrentUsername,
    qbittorrentPassword: state.currentSettings.qbittorrentPassword,
    qbittorrentLimit:    state.currentSettings.qbittorrentLimit,
    transmissionEnabled: state.currentSettings.transmissionEnabled,
    transmissionUrl:     state.currentSettings.transmissionUrl,
    transmissionUsername: state.currentSettings.transmissionUsername,
    transmissionPassword: state.currentSettings.transmissionPassword,
    transmissionLimit:   state.currentSettings.transmissionLimit,
    peanutEnabled:       state.currentSettings.peanutEnabled,
    peanutUrl:           state.currentSettings.peanutUrl,
    peanutUsername:      state.currentSettings.peanutUsername,
    peanutPassword:      state.currentSettings.peanutPassword,
    umamiEnabled:        state.currentSettings.umamiEnabled,
    umamiUrl:            state.currentSettings.umamiUrl,
    umamiApiKey:         state.currentSettings.umamiApiKey,
    umamiUsername:       state.currentSettings.umamiUsername,
    umamiPassword:       state.currentSettings.umamiPassword,
    umamiWebsiteId:      state.currentSettings.umamiWebsiteId,
    umamiTimeframe:      state.currentSettings.umamiTimeframe,
    speedtestEnabled:    state.currentSettings.speedtestEnabled,
    speedtestUrl:        state.currentSettings.speedtestUrl,
    speedtestToken:      state.currentSettings.speedtestToken,
    ntfyEnabled:         state.currentSettings.ntfyEnabled,
    ntfyUrl:             state.currentSettings.ntfyUrl,
    ntfyTopic:           state.currentSettings.ntfyTopic,
    ntfyToken:           state.currentSettings.ntfyToken,
    ntfyLimit:           state.currentSettings.ntfyLimit,
    audiobookshelfEnabled: state.currentSettings.audiobookshelfEnabled,
    audiobookshelfUrl:   state.currentSettings.audiobookshelfUrl,
    audiobookshelfToken: state.currentSettings.audiobookshelfToken,
    navidromeEnabled:    state.currentSettings.navidromeEnabled,
    navidromeUrl:        state.currentSettings.navidromeUrl,
    navidromeUsername:   state.currentSettings.navidromeUsername,
    navidromePassword:   state.currentSettings.navidromePassword,
    prowlarrEnabled:     state.currentSettings.prowlarrEnabled,
    prowlarrUrl:         state.currentSettings.prowlarrUrl,
    prowlarrApiKey:      state.currentSettings.prowlarrApiKey,
    tracearrEnabled:     state.currentSettings.tracearrEnabled,
    tracearrUrl:         state.currentSettings.tracearrUrl,
    tracearrApiKey:      state.currentSettings.tracearrApiKey,
    glancesEnabled: state.currentSettings.glancesEnabled, glancesUrl: state.currentSettings.glancesUrl, glancesUsername: state.currentSettings.glancesUsername, glancesPassword: state.currentSettings.glancesPassword,
    dashdotEnabled: state.currentSettings.dashdotEnabled, dashdotUrl: state.currentSettings.dashdotUrl,
    unraidEnabled: state.currentSettings.unraidEnabled, unraidUrl: state.currentSettings.unraidUrl, unraidApiKey: state.currentSettings.unraidApiKey,
    openmediavaultEnabled: state.currentSettings.openmediavaultEnabled, openmediavaultUrl: state.currentSettings.openmediavaultUrl, openmediavaultUsername: state.currentSettings.openmediavaultUsername, openmediavaultPassword: state.currentSettings.openmediavaultPassword,
    truenasEnabled: state.currentSettings.truenasEnabled, truenasUrl: state.currentSettings.truenasUrl, truenasApiKey: state.currentSettings.truenasApiKey,
    proxmoxEnabled: state.currentSettings.proxmoxEnabled, proxmoxUrl: state.currentSettings.proxmoxUrl, proxmoxUsername: state.currentSettings.proxmoxUsername, proxmoxRealm: state.currentSettings.proxmoxRealm, proxmoxTokenId: state.currentSettings.proxmoxTokenId, proxmoxApiKey: state.currentSettings.proxmoxApiKey,
    pbsEnabled: state.currentSettings.pbsEnabled, pbsUrl: state.currentSettings.pbsUrl, pbsUsername: state.currentSettings.pbsUsername, pbsRealm: state.currentSettings.pbsRealm, pbsTokenId: state.currentSettings.pbsTokenId, pbsApiKey: state.currentSettings.pbsApiKey, pbsNode: state.currentSettings.pbsNode,
    beszelEnabled: state.currentSettings.beszelEnabled, beszelUrl: state.currentSettings.beszelUrl, beszelUsername: state.currentSettings.beszelUsername, beszelPassword: state.currentSettings.beszelPassword,
    icalEnabled: state.currentSettings.icalEnabled, icalName: state.currentSettings.icalName, icalUrl: state.currentSettings.icalUrl, icalView: state.currentSettings.icalView,
    homeassistantEnabled: state.currentSettings.homeassistantEnabled, homeassistantUrl: state.currentSettings.homeassistantUrl, homeassistantToken: state.currentSettings.homeassistantToken, homeassistantEntities: state.currentSettings.homeassistantEntities, homeassistantAllowToggle: state.currentSettings.homeassistantAllowToggle,
    nextcloudEnabled: state.currentSettings.nextcloudEnabled, nextcloudUrl: state.currentSettings.nextcloudUrl, nextcloudUsername: state.currentSettings.nextcloudUsername, nextcloudPassword: state.currentSettings.nextcloudPassword,
    opnsenseEnabled: state.currentSettings.opnsenseEnabled, opnsenseUrl: state.currentSettings.opnsenseUrl, opnsenseKey: state.currentSettings.opnsenseKey, opnsenseSecret: state.currentSettings.opnsenseSecret,
    savedAt: Date.now(),
  };
  await chromeStorageSet({ settings });
  state.savedSettings = { ...settings };
  updateSaveBar();
  showToast('Settings saved ✓');
}

function discardChanges() {
  state.currentSettings = { ...state.savedSettings };
  state.apiKeyValidated        = !!state.savedSettings.apiKey;
  state.weatherApiKeyValidated = !!state.savedSettings.weatherApiKey;
  state.tautulliApiKeyValidated = !!(state.savedSettings.tautulliApiKey && state.savedSettings.tautulliUrl);
  state.uptimeKumaValidated = !!state.savedSettings.uptimeKumaUrl;
  state.sonarrValidated = !!(state.savedSettings.sonarrUrl && state.savedSettings.sonarrApiKey);
  state.radarrValidated = !!(state.savedSettings.radarrUrl && state.savedSettings.radarrApiKey);
  state.seerrValidated = !!(state.savedSettings.seerrUrl && state.savedSettings.seerrApiKey);
  state.piholeValidated = !!(state.savedSettings.piholeUrl && state.savedSettings.piholeApiKey);
  state.adguardValidated = !!(state.savedSettings.adguardUrl && state.savedSettings.adguardUsername);
  state.plexValidated = !!(state.savedSettings.plexUrl && state.savedSettings.plexToken);
  state.unifiValidated = !!(state.savedSettings.unifiUrl && state.savedSettings.unifiUsername);
  state.sabnzbdValidated = !!(state.savedSettings.sabnzbdUrl && state.savedSettings.sabnzbdApiKey);
  state.qbittorrentValidated = !!(state.savedSettings.qbittorrentUrl && state.savedSettings.qbittorrentUsername);
  state.transmissionValidated = !!state.savedSettings.transmissionUrl;
  state.peanutValidated = !!state.savedSettings.peanutUrl;
  state.umamiValidated = !!(state.savedSettings.umamiUrl && state.savedSettings.umamiWebsiteId);
  state.speedtestValidated = !!(state.savedSettings.speedtestUrl && state.savedSettings.speedtestToken);
  state.ntfyValidated = !!(state.savedSettings.ntfyUrl && state.savedSettings.ntfyTopic);
  state.audiobookshelfValidated = !!(state.savedSettings.audiobookshelfUrl && state.savedSettings.audiobookshelfToken);
  state.navidromeValidated = !!(state.savedSettings.navidromeUrl && state.savedSettings.navidromeUsername);
  state.prowlarrValidated = !!(state.savedSettings.prowlarrUrl && state.savedSettings.prowlarrApiKey);
  state.tracearrValidated = !!(state.savedSettings.tracearrUrl && state.savedSettings.tracearrApiKey);
  state.glancesValidated = !!state.savedSettings.glancesUrl;
  state.dashdotValidated = !!state.savedSettings.dashdotUrl;
  state.unraidValidated = !!(state.savedSettings.unraidUrl && state.savedSettings.unraidApiKey);
  state.openmediavaultValidated = !!(state.savedSettings.openmediavaultUrl && state.savedSettings.openmediavaultUsername);
  state.truenasValidated = !!(state.savedSettings.truenasUrl && state.savedSettings.truenasApiKey);
  state.proxmoxValidated = !!(state.savedSettings.proxmoxUrl && state.savedSettings.proxmoxApiKey);
  state.pbsValidated = !!(state.savedSettings.pbsUrl && state.savedSettings.pbsApiKey);
  state.beszelValidated = !!(state.savedSettings.beszelUrl && state.savedSettings.beszelUsername);
  state.icalValidated = !!state.savedSettings.icalUrl;
  state.homeassistantValidated = !!(state.savedSettings.homeassistantUrl && state.savedSettings.homeassistantToken);
  state.nextcloudValidated = !!(state.savedSettings.nextcloudUrl && state.savedSettings.nextcloudUsername);
  state.opnsenseValidated = !!(state.savedSettings.opnsenseUrl && state.savedSettings.opnsenseKey && state.savedSettings.opnsenseSecret);
  applySettingsToUI();
  updateSaveBar();
  hideValidationResult();
  const wvr = document.getElementById('weather-validation-result');
  if (wvr) wvr.style.display = 'none';
  hideTautulliValidationResult();
  hideUptimeKumaValidationResult();
  hideArrValidationResult('sonarr');
  hideArrValidationResult('radarr');
  hideSeerrValidationResult();
  hideDnsHoleValidationResult('pihole');
  hideDnsHoleValidationResult('adguard');
  hidePlexValidationResult();
  hideUnifiValidationResult();
  hideDownloadValidationResult('sabnzbd');
  hideDownloadValidationResult('qbittorrent');
  hideDownloadValidationResult('transmission');
  ['peanut', 'umami', 'speedtest', 'ntfy', 'audiobookshelf', 'navidrome', 'prowlarr', 'tracearr',
   'glances', 'dashdot', 'unraid', 'openmediavault', 'truenas', 'proxmox', 'pbs', 'beszel',
   'ical', 'homeassistant', 'nextcloud', 'opnsense'].forEach((svc) => { const el = document.getElementById(`${svc}-validation-result`); if (el) el.style.display = 'none'; });
}

async function validateApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showValidationResult('error', 'Please enter an API key.');
    return;
  }

  validateBtn.disabled = true;
  validateBtn.innerHTML = '<span class="spinner"></span>';

  try {
    const res = await fetch(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    if (res.ok) {
      state.apiKeyValidated = true;
      showValidationResult('success', '✓ API key is valid!');
      saveBtn.disabled = false;
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data?.error?.message || `Error ${res.status}`;
      showValidationResult('error', `✗ Invalid key: ${msg}`);
      state.apiKeyValidated = false;
    }
  } catch (err) {
    showValidationResult('error', `✗ Network error: ${err.message}`);
    state.apiKeyValidated = false;
  } finally {
    validateBtn.disabled = false;
    validateBtn.innerHTML = 'Validate';
    updateSaveBar();
  }
}

function showValidationResult(type, msg) {
  validationRes.style.display = 'block';
  validationRes.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  validationRes.style.marginTop = '12px';
  validationRes.textContent = msg;
}

function hideValidationResult() {
  validationRes.style.display = 'none';
}

async function validateWeatherKey() {
  const key = document.getElementById('weather-api-key').value.trim();
  const location = document.getElementById('weather-location').value.trim() || 'London';
  const btn = document.getElementById('weather-validate-btn');

  if (!key) {
    showWeatherValidationResult('error', 'Please enter an API key.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather` +
      `?q=${encodeURIComponent(location)}&appid=${key}&units=imperial`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      state.weatherApiKeyValidated = true;
      showWeatherValidationResult('success', `✓ Valid! Connected to weather data for ${data.name}.`);
      saveBtn.disabled = false;
    } else {
      const data = await res.json().catch(() => ({}));
      const msg = data?.message || `Error ${res.status}`;
      showWeatherValidationResult('error', `✗ ${msg}`);
      state.weatherApiKeyValidated = false;
    }
  } catch (err) {
    showWeatherValidationResult('error', `✗ Network error: ${err.message}`);
    state.weatherApiKeyValidated = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Validate';
    updateSaveBar();
  }
}

function showWeatherValidationResult(type, msg) {
  const el = document.getElementById('weather-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

// ─── Tautulli ─────────────────────────────────────────────────────────────────

async function validateTautulliKey() {
  const url = document.getElementById('tautulli-url').value.trim();
  const key = document.getElementById('tautulli-api-key').value.trim();
  const btn = document.getElementById('tautulli-validate-btn');

  if (!url) {
    showTautulliValidationResult('error', 'Please enter your Tautulli server URL.');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    showTautulliValidationResult('error', 'URL must start with http:// or https://');
    return;
  }
  if (!key) {
    showTautulliValidationResult('error', 'Please enter an API key.');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    // A successful get_activity proves both the URL and key are good, and it's
    // the exact endpoint the widget polls — so a pass here means the preview works.
    const data = await TautulliApi.getActivity(url, key);
    state.tautulliApiKeyValidated = true;
    const count = Number(data.stream_count) || 0;
    showTautulliValidationResult(
      'success',
      `✓ API Key Valid — connected to Tautulli (${count} active stream${count === 1 ? '' : 's'}).`
    );
  } catch (err) {
    state.tautulliApiKeyValidated = false;
    showTautulliValidationResult('error', `✗ Unable to validate API Key: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Validate API Key';
    updateTautulliPreviewButton();
    updateSaveBar();
  }
}

function showTautulliValidationResult(type, msg) {
  const el = document.getElementById('tautulli-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

function hideTautulliValidationResult() {
  const el = document.getElementById('tautulli-validation-result');
  if (el) el.style.display = 'none';
}

function updateTautulliPreviewButton() {
  const btn = document.getElementById('tautulli-preview-btn');
  const hint = document.getElementById('tautulli-preview-hint');
  if (!btn) return;
  const ready = state.tautulliApiKeyValidated
    && !!state.currentSettings.tautulliUrl
    && !!state.currentSettings.tautulliApiKey;
  btn.disabled = !ready;
  if (hint) {
    hint.textContent = ready
      ? 'Opens a live preview using your Tautulli data.'
      : 'Validate your API key to enable a live preview.';
  }
}

function openTautulliPreview() {
  if (!state.tautulliApiKeyValidated) return;
  const modal = document.getElementById('tautulli-preview-modal');
  const host  = document.getElementById('tautulli-preview-host');
  if (!modal || !host || typeof TautulliWidget === 'undefined') return;

  // Tear down any prior instance, then mount a fresh one.
  if (state.tautulliPreviewWidget) {
    state.tautulliPreviewWidget.destroy();
    state.tautulliPreviewWidget = null;
  }
  host.innerHTML = '';

  state.tautulliPreviewWidget = new TautulliWidget(host, {
    baseUrl: state.currentSettings.tautulliUrl,
    apiKey: state.currentSettings.tautulliApiKey,
    maxVisible: parseInt(state.currentSettings.tautulliMaxSessions, 10) || 3,
    dwellMs: parseInt(state.currentSettings.tautulliCarouselDwellMs, 10) || 4000,
    pollMs: 5000,
  });
  state.tautulliPreviewWidget.start();
  modal.classList.add('visible');
}

function closeTautulliPreview() {
  const modal = document.getElementById('tautulli-preview-modal');
  if (modal) modal.classList.remove('visible');
  if (state.tautulliPreviewWidget) {
    state.tautulliPreviewWidget.destroy();
    state.tautulliPreviewWidget = null;
  }
}

// ─── Uptime Kuma ────────────────────────────────────────────────────────────

async function validateUptimeKuma() {
  const url = document.getElementById('uptimekuma-url').value.trim();
  const slug = document.getElementById('uptimekuma-slug').value.trim() || 'default';
  const btn = document.getElementById('uptimekuma-validate-btn');

  if (!url) {
    showUptimeKumaValidationResult('error', 'Please enter your Uptime Kuma server URL.');
    return;
  }
  if (!/^https?:\/\//i.test(url)) {
    showUptimeKumaValidationResult('error', 'URL must start with http:// or https://');
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    // A successful getDashboard proves the URL + slug resolve to a readable
    // status page — the exact data the widget renders.
    const data = await UptimeKumaApi.getDashboard(url, slug);
    state.uptimeKumaValidated = true;
    showUptimeKumaValidationResult(
      'success',
      `✓ Connected — ${data.totalMonitors} monitor${data.totalMonitors === 1 ? '' : 's'} ` +
      `(${data.upCount} up, ${data.downCount} down, ${data.pausedCount} paused).`
    );
  } catch (err) {
    state.uptimeKumaValidated = false;
    const msg = /HTTP\s*404/i.test(err.message)
      ? 'status page not found — check the slug'
      : err.message;
    showUptimeKumaValidationResult('error', `✗ Unable to connect: ${msg}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateUptimeKumaPreviewButton();
    updateSaveBar();
  }
}

function showUptimeKumaValidationResult(type, msg) {
  const el = document.getElementById('uptimekuma-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

function hideUptimeKumaValidationResult() {
  const el = document.getElementById('uptimekuma-validation-result');
  if (el) el.style.display = 'none';
}

function updateUptimeKumaPreviewButton() {
  const btn = document.getElementById('uptimekuma-preview-btn');
  const hint = document.getElementById('uptimekuma-preview-hint');
  if (!btn) return;
  const ready = state.uptimeKumaValidated && !!state.currentSettings.uptimeKumaUrl;
  btn.disabled = !ready;
  if (hint) {
    hint.textContent = ready
      ? 'Opens a live preview using your Uptime Kuma status page.'
      : 'Test the connection to enable a live preview.';
  }
}

function uptimeKumaWidgetConfig() {
  const s = state.currentSettings;
  return {
    baseUrl: s.uptimeKumaUrl,
    slug: s.uptimeKumaSlug || 'default',
    pollMs: (parseInt(s.uptimeKumaRefreshSecs, 10) || 30) * 1000,
    showAverageUptime: !!s.uptimeKumaShowAverage,
    showUptimeRing: !!s.uptimeKumaShowRing,
    showTotalMonitors: !!s.uptimeKumaShowTotal,
    showUpCount: !!s.uptimeKumaShowUp,
    showDownCount: !!s.uptimeKumaShowDown,
    showPausedCount: !!s.uptimeKumaShowPaused,
    showMonitorList: !!s.uptimeKumaShowList,
  };
}

function openUptimeKumaPreview() {
  if (!state.uptimeKumaValidated) return;
  const modal = document.getElementById('uptimekuma-preview-modal');
  const host  = document.getElementById('uptimekuma-preview-host');
  if (!modal || !host || typeof UptimeKumaWidget === 'undefined') return;

  if (state.uptimeKumaPreviewWidget) {
    state.uptimeKumaPreviewWidget.destroy();
    state.uptimeKumaPreviewWidget = null;
  }
  host.innerHTML = '';

  state.uptimeKumaPreviewWidget = new UptimeKumaWidget(host, uptimeKumaWidgetConfig());
  state.uptimeKumaPreviewWidget.start();
  modal.classList.add('visible');
}

function closeUptimeKumaPreview() {
  const modal = document.getElementById('uptimekuma-preview-modal');
  if (modal) modal.classList.remove('visible');
  if (state.uptimeKumaPreviewWidget) {
    state.uptimeKumaPreviewWidget.destroy();
    state.uptimeKumaPreviewWidget = null;
  }
}

// ─── Sonarr + Radarr (shared "arr" calendar integrations) ────────────────────

function radarrReleaseTypesFromSettings() {
  const s = state.currentSettings;
  const types = [];
  if (s.radarrRtCinemas) types.push('inCinemas');
  if (s.radarrRtDigital) types.push('digitalRelease');
  if (s.radarrRtPhysical) types.push('physicalRelease');
  return types.length ? types : ['inCinemas', 'digitalRelease', 'physicalRelease'];
}

async function validateArr(svc) {
  const url = document.getElementById(`${svc}-url`).value.trim();
  const key = document.getElementById(`${svc}-api-key`).value.trim();
  const btn = document.getElementById(`${svc}-validate-btn`);
  const cap = svc === 'radarr' ? 'Radarr' : 'Sonarr';

  if (!url) { showArrValidationResult(svc, 'error', `Please enter your ${cap} server URL.`); return; }
  if (!/^https?:\/\//i.test(url)) { showArrValidationResult(svc, 'error', 'URL must start with http:// or https://'); return; }
  if (!key) { showArrValidationResult(svc, 'error', 'Please enter an API key.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const status = await ArrCalendarApi.testConnection(url, key, svc);
    state[`${svc}Validated`] = true;
    const ver = status && status.version ? ` (v${status.version})` : '';
    showArrValidationResult(svc, 'success', `✓ Connected to ${cap}${ver}.`);
  } catch (err) {
    state[`${svc}Validated`] = false;
    showArrValidationResult(svc, 'error', `✗ Unable to connect: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateArrPreviewButton(svc);
    updateSaveBar();
  }
}

function showArrValidationResult(svc, type, msg) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

function hideArrValidationResult(svc) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (el) el.style.display = 'none';
}

function updateArrPreviewButton(svc) {
  const btn = document.getElementById(`${svc}-preview-btn`);
  const hint = document.getElementById(`${svc}-preview-hint`);
  if (!btn) return;
  const ready = state[`${svc}Validated`]
    && !!state.currentSettings[`${svc}Url`]
    && !!state.currentSettings[`${svc}ApiKey`];
  btn.disabled = !ready;
  if (hint) {
    hint.textContent = ready
      ? 'Opens a live preview with both the upcoming list and calendar.'
      : 'Test the connection to enable a live preview.';
  }
}

function arrWidgetConfig(svc) {
  const s = state.currentSettings;
  const cfg = {
    service: svc,
    baseUrl: s[`${svc}Url`],
    apiKey: s[`${svc}ApiKey`],
    view: s[`${svc}View`] || 'upcoming',
    upcomingCount: parseInt(s[`${svc}Count`], 10) || 8,
    showUnmonitored: s[`${svc}Unmonitored`] !== false,
  };
  if (svc === 'radarr') cfg.releaseTypes = radarrReleaseTypesFromSettings();
  return cfg;
}

function openArrPreview(svc) {
  if (!state[`${svc}Validated`]) return;
  const modal = document.getElementById(`${svc}-preview-modal`);
  const host = document.getElementById(`${svc}-preview-host`);
  if (!modal || !host || typeof ArrCalendarWidget === 'undefined') return;

  if (state[`${svc}PreviewWidget`]) {
    state[`${svc}PreviewWidget`].destroy();
    state[`${svc}PreviewWidget`] = null;
  }
  host.innerHTML = '';

  state[`${svc}PreviewWidget`] = new ArrCalendarWidget(host, arrWidgetConfig(svc));
  state[`${svc}PreviewWidget`].start();
  modal.classList.add('visible');
}

function closeArrPreview(svc) {
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.classList.remove('visible');
  if (state[`${svc}PreviewWidget`]) {
    state[`${svc}PreviewWidget`].destroy();
    state[`${svc}PreviewWidget`] = null;
  }
}

// ─── Seerr (Overseerr / Jellyseerr media requests) ───────────────────────────

async function validateSeerr() {
  const url = document.getElementById('seerr-url').value.trim();
  const key = document.getElementById('seerr-api-key').value.trim();
  const btn = document.getElementById('seerr-validate-btn');

  if (!url) { showSeerrValidationResult('error', 'Please enter your server URL.'); return; }
  if (!/^https?:\/\//i.test(url)) { showSeerrValidationResult('error', 'URL must start with http:// or https://'); return; }
  if (!key) { showSeerrValidationResult('error', 'Please enter an API key.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const me = await SeerrApi.testConnection(url, key);
    state.seerrValidated = true;
    const who = me && me.displayName ? ` as ${me.displayName}` : '';
    showSeerrValidationResult('success', `✓ Connected${who}.`);
  } catch (err) {
    state.seerrValidated = false;
    showSeerrValidationResult('error', `✗ Unable to connect: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateSeerrPreviewButton();
    updateSaveBar();
  }
}

function showSeerrValidationResult(type, msg) {
  const el = document.getElementById('seerr-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

function hideSeerrValidationResult() {
  const el = document.getElementById('seerr-validation-result');
  if (el) el.style.display = 'none';
}

function updateSeerrPreviewButton() {
  const btn = document.getElementById('seerr-preview-btn');
  const hint = document.getElementById('seerr-preview-hint');
  if (!btn) return;
  const ready = state.seerrValidated
    && !!state.currentSettings.seerrUrl
    && !!state.currentSettings.seerrApiKey;
  btn.disabled = !ready;
  if (hint) {
    hint.textContent = ready
      ? 'Opens a live preview with both the requests list and stats.'
      : 'Test the connection to enable a live preview.';
  }
}

function seerrWidgetConfig() {
  const s = state.currentSettings;
  return {
    baseUrl: s.seerrUrl,
    apiKey: s.seerrApiKey,
    view: s.seerrView || 'requests',
    requestCount: parseInt(s.seerrCount, 10) || 8,
    showUsers: s.seerrShowUsers !== false,
  };
}

function openSeerrPreview() {
  if (!state.seerrValidated) return;
  const modal = document.getElementById('seerr-preview-modal');
  const host = document.getElementById('seerr-preview-host');
  if (!modal || !host || typeof SeerrWidget === 'undefined') return;

  if (state.seerrPreviewWidget) { state.seerrPreviewWidget.destroy(); state.seerrPreviewWidget = null; }
  host.innerHTML = '';

  state.seerrPreviewWidget = new SeerrWidget(host, seerrWidgetConfig());
  state.seerrPreviewWidget.start();
  modal.classList.add('visible');
}

function closeSeerrPreview() {
  const modal = document.getElementById('seerr-preview-modal');
  if (modal) modal.classList.remove('visible');
  if (state.seerrPreviewWidget) { state.seerrPreviewWidget.destroy(); state.seerrPreviewWidget = null; }
}

// ─── Pi-hole + AdGuard (DNS-hole integrations) ───────────────────────────────

function dnsHoleAuthOpts(svc) {
  const s = state.currentSettings;
  return svc === 'adguard'
    ? { username: s.adguardUsername, password: s.adguardPassword }
    : { apiKey: s.piholeApiKey };
}

// True when the required auth fields for this service are filled in.
function dnsHoleHasAuth(svc) {
  const s = state.currentSettings;
  if (!s[`${svc}Url`]) return false;
  return svc === 'adguard' ? !!s.adguardUsername : !!s.piholeApiKey;
}

async function validateDnsHole(svc) {
  const s = state.currentSettings;
  const cap = svc === 'adguard' ? 'AdGuard Home' : 'Pi-hole';
  const url = (s[`${svc}Url`] || '').trim();
  const btn = document.getElementById(`${svc}-validate-btn`);

  if (!url) { showDnsHoleValidationResult(svc, 'error', `Please enter your ${cap} URL.`); return; }
  if (!/^https?:\/\//i.test(url)) { showDnsHoleValidationResult(svc, 'error', 'URL must start with http:// or https://'); return; }
  if (svc === 'adguard' && !s.adguardUsername) { showDnsHoleValidationResult(svc, 'error', 'Please enter a username.'); return; }
  if (svc === 'pihole' && !s.piholeApiKey) { showDnsHoleValidationResult(svc, 'error', 'Please enter an app password / API token.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    const info = await DnsHoleApi.testConnection(svc, url, dnsHoleAuthOpts(svc));
    state[`${svc}Validated`] = true;
    const ver = info && info.version ? ` (Pi-hole ${info.version})` : '';
    showDnsHoleValidationResult(svc, 'success', `✓ Connected to ${cap}${ver}.`);
  } catch (err) {
    state[`${svc}Validated`] = false;
    showDnsHoleValidationResult(svc, 'error', `✗ Unable to connect: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateDnsHolePreviewButton(svc);
    updateSaveBar();
  }
}

function showDnsHoleValidationResult(svc, type, msg) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

function hideDnsHoleValidationResult(svc) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (el) el.style.display = 'none';
}

function updateDnsHolePreviewButton(svc) {
  const btn = document.getElementById(`${svc}-preview-btn`);
  const hint = document.getElementById(`${svc}-preview-hint`);
  if (!btn) return;
  const ready = state[`${svc}Validated`] && dnsHoleHasAuth(svc);
  btn.disabled = !ready;
  if (hint) {
    hint.textContent = ready
      ? 'Opens a live preview with your DNS-hole stats.'
      : 'Test the connection to enable a live preview.';
  }
}

function dnsHoleWidgetConfig(svc) {
  const s = state.currentSettings;
  const cfg = { service: svc, baseUrl: s[`${svc}Url`] };
  if (svc === 'adguard') { cfg.username = s.adguardUsername; cfg.password = s.adguardPassword; }
  else { cfg.apiKey = s.piholeApiKey; }
  return cfg;
}

function openDnsHolePreview(svc) {
  if (!state[`${svc}Validated`]) return;
  const modal = document.getElementById(`${svc}-preview-modal`);
  const host = document.getElementById(`${svc}-preview-host`);
  if (!modal || !host || typeof DnsHoleWidget === 'undefined') return;

  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
  host.innerHTML = '';

  state[`${svc}PreviewWidget`] = new DnsHoleWidget(host, dnsHoleWidgetConfig(svc));
  state[`${svc}PreviewWidget`].start();
  modal.classList.add('visible');
}

function closeDnsHolePreview(svc) {
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.classList.remove('visible');
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
}

// ─── Plex ────────────────────────────────────────────────────────────────────

async function validatePlex() {
  const url = document.getElementById('plex-url').value.trim();
  const token = document.getElementById('plex-token').value.trim();
  const btn = document.getElementById('plex-validate-btn');

  if (!url) { showPlexValidationResult('error', 'Please enter your Plex server URL.'); return; }
  if (!/^https?:\/\//i.test(url)) { showPlexValidationResult('error', 'URL must start with http:// or https://'); return; }
  if (!token) { showPlexValidationResult('error', 'Please enter your Plex token.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    await PlexApi.testConnection(url, token);
    state.plexValidated = true;
    showPlexValidationResult('success', '✓ Connected to Plex.');
  } catch (err) {
    state.plexValidated = false;
    showPlexValidationResult('error', `✗ Unable to connect: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updatePlexPreviewButton();
    updateSaveBar();
  }
}

function showPlexValidationResult(type, msg) {
  const el = document.getElementById('plex-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}
function hidePlexValidationResult() {
  const el = document.getElementById('plex-validation-result');
  if (el) el.style.display = 'none';
}
function updatePlexPreviewButton() {
  const btn = document.getElementById('plex-preview-btn');
  const hint = document.getElementById('plex-preview-hint');
  if (!btn) return;
  const ready = state.plexValidated && !!state.currentSettings.plexUrl && !!state.currentSettings.plexToken;
  btn.disabled = !ready;
  if (hint) hint.textContent = ready ? 'Opens a live preview of current Plex sessions.' : 'Test the connection to enable a live preview.';
}
function openPlexPreview() {
  if (!state.plexValidated) return;
  const modal = document.getElementById('plex-preview-modal');
  const host = document.getElementById('plex-preview-host');
  if (!modal || !host || typeof PlexWidget === 'undefined') return;
  if (state.plexPreviewWidget) { state.plexPreviewWidget.destroy(); state.plexPreviewWidget = null; }
  host.innerHTML = '';
  state.plexPreviewWidget = new PlexWidget(host, { baseUrl: state.currentSettings.plexUrl, token: state.currentSettings.plexToken });
  state.plexPreviewWidget.start();
  modal.classList.add('visible');
}
function closePlexPreview() {
  const modal = document.getElementById('plex-preview-modal');
  if (modal) modal.classList.remove('visible');
  if (state.plexPreviewWidget) { state.plexPreviewWidget.destroy(); state.plexPreviewWidget = null; }
}

// ─── UniFi Controller ──────────────────────────────────────────────────────────

async function validateUnifi() {
  const s = state.currentSettings;
  const url = document.getElementById('unifi-url').value.trim();
  const btn = document.getElementById('unifi-validate-btn');

  if (!url) { showUnifiValidationResult('error', 'Please enter your controller URL.'); return; }
  if (!/^https?:\/\//i.test(url)) { showUnifiValidationResult('error', 'URL must start with http:// or https://'); return; }
  if (!s.unifiUsername) { showUnifiValidationResult('error', 'Please enter a username.'); return; }
  if (!s.unifiPassword) { showUnifiValidationResult('error', 'Please enter a password.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    await UnifiApi.testConnection(url, { username: s.unifiUsername, password: s.unifiPassword, site: s.unifiSite || 'default' });
    state.unifiValidated = true;
    showUnifiValidationResult('success', '✓ Connected to the UniFi controller.');
  } catch (err) {
    state.unifiValidated = false;
    showUnifiValidationResult('error', `✗ Unable to connect: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateUnifiPreviewButton();
    updateSaveBar();
  }
}

function showUnifiValidationResult(type, msg) {
  const el = document.getElementById('unifi-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}
function hideUnifiValidationResult() {
  const el = document.getElementById('unifi-validation-result');
  if (el) el.style.display = 'none';
}
function updateUnifiPreviewButton() {
  const btn = document.getElementById('unifi-preview-btn');
  const hint = document.getElementById('unifi-preview-hint');
  if (!btn) return;
  const s = state.currentSettings;
  const ready = state.unifiValidated && !!s.unifiUrl && !!s.unifiUsername && !!s.unifiPassword;
  btn.disabled = !ready;
  if (hint) hint.textContent = ready ? 'Opens a live preview of your network summary.' : 'Test the connection to enable a live preview.';
}
function openUnifiPreview() {
  if (!state.unifiValidated) return;
  const modal = document.getElementById('unifi-preview-modal');
  const host = document.getElementById('unifi-preview-host');
  if (!modal || !host || typeof UnifiWidget === 'undefined') return;
  if (state.unifiPreviewWidget) { state.unifiPreviewWidget.destroy(); state.unifiPreviewWidget = null; }
  host.innerHTML = '';
  const s = state.currentSettings;
  state.unifiPreviewWidget = new UnifiWidget(host, { baseUrl: s.unifiUrl, username: s.unifiUsername, password: s.unifiPassword, site: s.unifiSite || 'default' });
  state.unifiPreviewWidget.start();
  modal.classList.add('visible');
}
function closeUnifiPreview() {
  const modal = document.getElementById('unifi-preview-modal');
  if (modal) modal.classList.remove('visible');
  if (state.unifiPreviewWidget) { state.unifiPreviewWidget.destroy(); state.unifiPreviewWidget = null; }
}

// ─── Download clients (SABnzbd / qBittorrent / Transmission) ─────────────────

function downloadAuthOpts(svc) {
  const s = state.currentSettings;
  return svc === 'sabnzbd'
    ? { apiKey: s.sabnzbdApiKey, limit: s[`${svc}Limit`] }
    : { username: s[`${svc}Username`], password: s[`${svc}Password`], limit: s[`${svc}Limit`] };
}

// Required auth to attempt a connection: SAB needs a key, qBit needs a username,
// Transmission can run without auth (optional).
function downloadHasAuth(svc) {
  const s = state.currentSettings;
  if (!s[`${svc}Url`]) return false;
  if (svc === 'sabnzbd') return !!s.sabnzbdApiKey;
  if (svc === 'qbittorrent') return !!s.qbittorrentUsername;
  return true; // transmission: auth optional
}

async function validateDownload(svc) {
  const s = state.currentSettings;
  const title = { sabnzbd: 'SABnzbd', qbittorrent: 'qBittorrent', transmission: 'Transmission' }[svc];
  const url = (s[`${svc}Url`] || '').trim();
  const btn = document.getElementById(`${svc}-validate-btn`);

  if (!url) { showDownloadValidationResult(svc, 'error', `Please enter your ${title} URL.`); return; }
  if (!/^https?:\/\//i.test(url)) { showDownloadValidationResult(svc, 'error', 'URL must start with http:// or https://'); return; }
  if (svc === 'sabnzbd' && !s.sabnzbdApiKey) { showDownloadValidationResult(svc, 'error', 'Please enter an API key.'); return; }
  if (svc === 'qbittorrent' && !s.qbittorrentUsername) { showDownloadValidationResult(svc, 'error', 'Please enter a username.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    await DownloadsApi.testConnection(svc, url, downloadAuthOpts(svc));
    state[`${svc}Validated`] = true;
    showDownloadValidationResult(svc, 'success', `✓ Connected to ${title}.`);
  } catch (err) {
    state[`${svc}Validated`] = false;
    showDownloadValidationResult(svc, 'error', `✗ Unable to connect: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateDownloadPreviewButton(svc);
    updateSaveBar();
  }
}

function showDownloadValidationResult(svc, type, msg) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}
function hideDownloadValidationResult(svc) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (el) el.style.display = 'none';
}
function updateDownloadPreviewButton(svc) {
  const btn = document.getElementById(`${svc}-preview-btn`);
  const hint = document.getElementById(`${svc}-preview-hint`);
  if (!btn) return;
  const ready = state[`${svc}Validated`] && downloadHasAuth(svc);
  btn.disabled = !ready;
  if (hint) hint.textContent = ready ? 'Opens a live preview of current downloads.' : 'Test the connection to enable a live preview.';
}
function downloadWidgetConfig(svc) {
  const s = state.currentSettings;
  const cfg = { service: svc, baseUrl: s[`${svc}Url`], limit: parseInt(s[`${svc}Limit`], 10) || 10 };
  if (svc === 'sabnzbd') cfg.apiKey = s.sabnzbdApiKey;
  else { cfg.username = s[`${svc}Username`]; cfg.password = s[`${svc}Password`]; }
  return cfg;
}
function openDownloadPreview(svc) {
  if (!state[`${svc}Validated`]) return;
  const modal = document.getElementById(`${svc}-preview-modal`);
  const host = document.getElementById(`${svc}-preview-host`);
  if (!modal || !host || typeof DownloadClientWidget === 'undefined') return;
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
  host.innerHTML = '';
  state[`${svc}PreviewWidget`] = new DownloadClientWidget(host, downloadWidgetConfig(svc));
  state[`${svc}PreviewWidget`].start();
  modal.classList.add('visible');
}
function closeDownloadPreview(svc) {
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.classList.remove('visible');
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
}

// ─── Extra integrations: shared preview helpers ──────────────────────────────

function showExtraValidation(svc, type, msg) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}
function setValidateBusy(svc, busy) {
  const btn = document.getElementById(`${svc}-validate-btn`);
  if (!btn) return;
  btn.disabled = busy;
  btn.innerHTML = busy ? '<span class="spinner"></span>' : 'Test Connection';
}
function openExtraPreview(svc, WidgetClass, makeCfg) {
  if (!state[`${svc}Validated`]) return;
  const modal = document.getElementById(`${svc}-preview-modal`);
  const host = document.getElementById(`${svc}-preview-host`);
  if (!modal || !host || typeof WidgetClass === 'undefined') return;
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
  host.innerHTML = '';
  state[`${svc}PreviewWidget`] = new WidgetClass(host, makeCfg());
  state[`${svc}PreviewWidget`].start();
  modal.classList.add('visible');
}
function closeExtraPreview(svc) {
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.classList.remove('visible');
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
}
function setExtraPreviewBtn(svc, ready, readyHint) {
  const btn = document.getElementById(`${svc}-preview-btn`);
  const hint = document.getElementById(`${svc}-preview-hint`);
  if (btn) btn.disabled = !ready;
  if (hint) hint.textContent = ready ? readyHint : 'Test the connection to enable a live preview.';
}

// ── PeaNUT ──
async function validatePeanut() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.peanutUrl || '')) { showExtraValidation('peanut', 'error', 'Enter a URL starting with http:// or https://'); return; }
  setValidateBusy('peanut', true);
  try {
    const devices = await PeanutApi.getData(s.peanutUrl, { username: s.peanutUsername, password: s.peanutPassword });
    state.peanutValidated = true;
    showExtraValidation('peanut', 'success', `✓ Connected — ${devices.length} UPS device${devices.length === 1 ? '' : 's'}.`);
  } catch (err) { state.peanutValidated = false; showExtraValidation('peanut', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('peanut', false); updatePeanutPreviewButton(); updateSaveBar(); }
}
function updatePeanutPreviewButton() { setExtraPreviewBtn('peanut', state.peanutValidated && !!state.currentSettings.peanutUrl, 'Opens a live preview of your UPS devices.'); }
function openPeanutPreview() { openExtraPreview('peanut', typeof PeanutWidget !== 'undefined' ? PeanutWidget : undefined, () => ({ baseUrl: state.currentSettings.peanutUrl, username: state.currentSettings.peanutUsername, password: state.currentSettings.peanutPassword })); }
function closePeanutPreview() { closeExtraPreview('peanut'); }

// ── Umami ──
function umamiHasAuth() { const s = state.currentSettings; return !!s.umamiApiKey || (!!s.umamiUsername && !!s.umamiPassword); }
async function validateUmami() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.umamiUrl || '')) { showExtraValidation('umami', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!umamiHasAuth()) { showExtraValidation('umami', 'error', 'Enter an API key, or a username and password.'); return; }
  if (!s.umamiWebsiteId) { showExtraValidation('umami', 'error', 'Enter the website ID.'); return; }
  setValidateBusy('umami', true);
  try {
    await UmamiApi.getSummary(s.umamiUrl, { apiKey: s.umamiApiKey, username: s.umamiUsername, password: s.umamiPassword, websiteId: s.umamiWebsiteId, timeFrame: s.umamiTimeframe }, {});
    state.umamiValidated = true;
    showExtraValidation('umami', 'success', '✓ Connected to Umami.');
  } catch (err) { state.umamiValidated = false; showExtraValidation('umami', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('umami', false); updateUmamiPreviewButton(); updateSaveBar(); }
}
function updateUmamiPreviewButton() { setExtraPreviewBtn('umami', state.umamiValidated && !!state.currentSettings.umamiUrl && !!state.currentSettings.umamiWebsiteId && umamiHasAuth(), 'Opens a live preview of your website analytics.'); }
function openUmamiPreview() {
  const s = state.currentSettings;
  openExtraPreview('umami', typeof UmamiWidget !== 'undefined' ? UmamiWidget : undefined, () => ({ baseUrl: s.umamiUrl, apiKey: s.umamiApiKey, username: s.umamiUsername, password: s.umamiPassword, websiteId: s.umamiWebsiteId, timeFrame: s.umamiTimeframe }));
}
function closeUmamiPreview() { closeExtraPreview('umami'); }

// ── Speedtest Tracker ──
async function validateSpeedtest() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.speedtestUrl || '')) { showExtraValidation('speedtest', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.speedtestToken) { showExtraValidation('speedtest', 'error', 'Enter your API token.'); return; }
  setValidateBusy('speedtest', true);
  try {
    await SpeedtestApi.testConnection(s.speedtestUrl, { token: s.speedtestToken });
    state.speedtestValidated = true;
    showExtraValidation('speedtest', 'success', '✓ Connected to Speedtest Tracker.');
  } catch (err) { state.speedtestValidated = false; showExtraValidation('speedtest', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('speedtest', false); updateSpeedtestPreviewButton(); updateSaveBar(); }
}
function updateSpeedtestPreviewButton() { setExtraPreviewBtn('speedtest', state.speedtestValidated && !!state.currentSettings.speedtestUrl && !!state.currentSettings.speedtestToken, 'Opens a live preview of your latest speed test.'); }
function openSpeedtestPreview() { openExtraPreview('speedtest', typeof SpeedtestWidget !== 'undefined' ? SpeedtestWidget : undefined, () => ({ baseUrl: state.currentSettings.speedtestUrl, token: state.currentSettings.speedtestToken })); }
function closeSpeedtestPreview() { closeExtraPreview('speedtest'); }

// ── ntfy ──
async function validateNtfy() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.ntfyUrl || '')) { showExtraValidation('ntfy', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.ntfyTopic) { showExtraValidation('ntfy', 'error', 'Enter a topic.'); return; }
  setValidateBusy('ntfy', true);
  try {
    await NtfyApi.testConnection(s.ntfyUrl, { topic: s.ntfyTopic, token: s.ntfyToken });
    state.ntfyValidated = true;
    showExtraValidation('ntfy', 'success', '✓ Connected to the ntfy topic.');
  } catch (err) { state.ntfyValidated = false; showExtraValidation('ntfy', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('ntfy', false); updateNtfyPreviewButton(); updateSaveBar(); }
}
function updateNtfyPreviewButton() { setExtraPreviewBtn('ntfy', state.ntfyValidated && !!state.currentSettings.ntfyUrl && !!state.currentSettings.ntfyTopic, 'Opens a live preview of recent notifications.'); }
function openNtfyPreview() { const s = state.currentSettings; openExtraPreview('ntfy', typeof NtfyWidget !== 'undefined' ? NtfyWidget : undefined, () => ({ baseUrl: s.ntfyUrl, topic: s.ntfyTopic, token: s.ntfyToken, limit: parseInt(s.ntfyLimit, 10) || 10 })); }
function closeNtfyPreview() { closeExtraPreview('ntfy'); }

// ── Audiobookshelf ──
async function validateAudiobookshelf() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.audiobookshelfUrl || '')) { showExtraValidation('audiobookshelf', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.audiobookshelfToken) { showExtraValidation('audiobookshelf', 'error', 'Enter your API token.'); return; }
  setValidateBusy('audiobookshelf', true);
  try {
    await AudiobookshelfApi.testConnection(s.audiobookshelfUrl, { apiKey: s.audiobookshelfToken });
    state.audiobookshelfValidated = true;
    showExtraValidation('audiobookshelf', 'success', '✓ Connected to Audiobookshelf.');
  } catch (err) { state.audiobookshelfValidated = false; showExtraValidation('audiobookshelf', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('audiobookshelf', false); updateAudiobookshelfPreviewButton(); updateSaveBar(); }
}
function updateAudiobookshelfPreviewButton() { setExtraPreviewBtn('audiobookshelf', state.audiobookshelfValidated && !!state.currentSettings.audiobookshelfUrl && !!state.currentSettings.audiobookshelfToken, 'Opens a live preview of your library summary.'); }
function openAudiobookshelfPreview() { const s = state.currentSettings; openExtraPreview('audiobookshelf', typeof AudiobookshelfWidget !== 'undefined' ? AudiobookshelfWidget : undefined, () => ({ baseUrl: s.audiobookshelfUrl, apiKey: s.audiobookshelfToken })); }
function closeAudiobookshelfPreview() { closeExtraPreview('audiobookshelf'); }

// ── Navidrome ──
async function validateNavidrome() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.navidromeUrl || '')) { showExtraValidation('navidrome', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.navidromeUsername || !s.navidromePassword) { showExtraValidation('navidrome', 'error', 'Enter a username and password.'); return; }
  setValidateBusy('navidrome', true);
  try {
    await NavidromeApi.testConnection(s.navidromeUrl, { username: s.navidromeUsername, password: s.navidromePassword });
    state.navidromeValidated = true;
    showExtraValidation('navidrome', 'success', '✓ Connected to Navidrome.');
  } catch (err) { state.navidromeValidated = false; showExtraValidation('navidrome', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('navidrome', false); updateNavidromePreviewButton(); updateSaveBar(); }
}
function updateNavidromePreviewButton() { setExtraPreviewBtn('navidrome', state.navidromeValidated && !!state.currentSettings.navidromeUrl && !!state.currentSettings.navidromeUsername, 'Opens a live preview of your music library.'); }
function openNavidromePreview() { const s = state.currentSettings; openExtraPreview('navidrome', typeof NavidromeWidget !== 'undefined' ? NavidromeWidget : undefined, () => ({ baseUrl: s.navidromeUrl, username: s.navidromeUsername, password: s.navidromePassword })); }
function closeNavidromePreview() { closeExtraPreview('navidrome'); }

// ── Prowlarr ──
async function validateProwlarr() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.prowlarrUrl || '')) { showExtraValidation('prowlarr', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.prowlarrApiKey) { showExtraValidation('prowlarr', 'error', 'Enter your API key.'); return; }
  setValidateBusy('prowlarr', true);
  try {
    const indexers = await ProwlarrApi.getData(s.prowlarrUrl, { apiKey: s.prowlarrApiKey });
    state.prowlarrValidated = true;
    showExtraValidation('prowlarr', 'success', `✓ Connected — ${indexers.length} indexer${indexers.length === 1 ? '' : 's'}.`);
  } catch (err) { state.prowlarrValidated = false; showExtraValidation('prowlarr', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('prowlarr', false); updateProwlarrPreviewButton(); updateSaveBar(); }
}
function updateProwlarrPreviewButton() { setExtraPreviewBtn('prowlarr', state.prowlarrValidated && !!state.currentSettings.prowlarrUrl && !!state.currentSettings.prowlarrApiKey, 'Opens a live preview of your indexers.'); }
function openProwlarrPreview() { const s = state.currentSettings; openExtraPreview('prowlarr', typeof ProwlarrWidget !== 'undefined' ? ProwlarrWidget : undefined, () => ({ baseUrl: s.prowlarrUrl, apiKey: s.prowlarrApiKey })); }
function closeProwlarrPreview() { closeExtraPreview('prowlarr'); }

// ── Tracearr ──
async function validateTracearr() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.tracearrUrl || '')) { showExtraValidation('tracearr', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.tracearrApiKey) { showExtraValidation('tracearr', 'error', 'Enter your API key.'); return; }
  setValidateBusy('tracearr', true);
  try {
    await TracearrApi.testConnection(s.tracearrUrl, { apiKey: s.tracearrApiKey });
    state.tracearrValidated = true;
    showExtraValidation('tracearr', 'success', '✓ Connected to Tracearr.');
  } catch (err) { state.tracearrValidated = false; showExtraValidation('tracearr', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('tracearr', false); updateTracearrPreviewButton(); updateSaveBar(); }
}
function updateTracearrPreviewButton() { setExtraPreviewBtn('tracearr', state.tracearrValidated && !!state.currentSettings.tracearrUrl && !!state.currentSettings.tracearrApiKey, 'Opens a live preview of your stream monitor.'); }
function openTracearrPreview() { const s = state.currentSettings; openExtraPreview('tracearr', typeof TracearrWidget !== 'undefined' ? TracearrWidget : undefined, () => ({ baseUrl: s.tracearrUrl, apiKey: s.tracearrApiKey })); }
function closeTracearrPreview() { closeExtraPreview('tracearr'); }

// ── System health (shared, descriptor-driven) ──
async function validateSystemHealth(svc) {
  const s = state.currentSettings, d = SYSTEM_HEALTH[svc];
  const urlKey = d.fields[`${svc}-url`];
  if (!/^https?:\/\//i.test(s[urlKey] || '')) { showExtraValidation(svc, 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!d.needs(s)) { showExtraValidation(svc, 'error', 'Fill in the required credentials.'); return; }
  setValidateBusy(svc, true);
  try {
    await SystemHealthApi.testConnection(svc, s[urlKey], d.auth(s));
    state[`${svc}Validated`] = true;
    showExtraValidation(svc, 'success', '✓ Connected.');
  } catch (err) { state[`${svc}Validated`] = false; showExtraValidation(svc, 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy(svc, false); updateSystemHealthPreviewButton(svc); updateSaveBar(); }
}
function updateSystemHealthPreviewButton(svc) {
  const d = SYSTEM_HEALTH[svc];
  setExtraPreviewBtn(svc, state[`${svc}Validated`] && d.needs(state.currentSettings), 'Opens a live preview of this host.');
}
function openSystemHealthPreview(svc) {
  const d = SYSTEM_HEALTH[svc];
  openExtraPreview(svc, typeof SystemHealthWidget !== 'undefined' ? SystemHealthWidget : undefined, () => Object.assign({ service: svc }, d.cfg(state.currentSettings)));
}

// ── Proxmox ──
function proxmoxTokenOpts() { const s = state.currentSettings; return { username: s.proxmoxUsername, realm: s.proxmoxRealm, tokenId: s.proxmoxTokenId, apiKey: s.proxmoxApiKey }; }
async function validateProxmox() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.proxmoxUrl || '')) { showExtraValidation('proxmox', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.proxmoxUsername || !s.proxmoxTokenId || !s.proxmoxApiKey) { showExtraValidation('proxmox', 'error', 'Enter user, token ID, and token secret.'); return; }
  setValidateBusy('proxmox', true);
  try { const d = await ProxmoxApi.getData(s.proxmoxUrl, proxmoxTokenOpts()); state.proxmoxValidated = true; showExtraValidation('proxmox', 'success', `✓ Connected — ${d.nodes.length} node${d.nodes.length === 1 ? '' : 's'}, ${d.vms.length} VMs, ${d.lxcs.length} LXC.`); }
  catch (err) { state.proxmoxValidated = false; showExtraValidation('proxmox', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('proxmox', false); updateProxmoxPreviewButton(); updateSaveBar(); }
}
function updateProxmoxPreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('proxmox', state.proxmoxValidated && !!s.proxmoxUrl && !!s.proxmoxApiKey, 'Opens a live preview of your cluster.'); }
function openProxmoxPreview() { const s = state.currentSettings; openExtraPreview('proxmox', typeof ProxmoxWidget !== 'undefined' ? ProxmoxWidget : undefined, () => Object.assign({ baseUrl: s.proxmoxUrl }, proxmoxTokenOpts())); }
function closeProxmoxPreview() { closeExtraPreview('proxmox'); }

// ── PBS ──
function pbsTokenOpts() { const s = state.currentSettings; return { username: s.pbsUsername, realm: s.pbsRealm, tokenId: s.pbsTokenId, apiKey: s.pbsApiKey, node: s.pbsNode || 'localhost' }; }
async function validatePbs() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.pbsUrl || '')) { showExtraValidation('pbs', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.pbsUsername || !s.pbsTokenId || !s.pbsApiKey) { showExtraValidation('pbs', 'error', 'Enter user, token ID, and token secret.'); return; }
  setValidateBusy('pbs', true);
  try { const d = await PbsApi.getData(s.pbsUrl, pbsTokenOpts()); state.pbsValidated = true; showExtraValidation('pbs', 'success', `✓ Connected — ${d.datastores.length} datastore${d.datastores.length === 1 ? '' : 's'}.`); }
  catch (err) { state.pbsValidated = false; showExtraValidation('pbs', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('pbs', false); updatePbsPreviewButton(); updateSaveBar(); }
}
function updatePbsPreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('pbs', state.pbsValidated && !!s.pbsUrl && !!s.pbsApiKey, 'Opens a live preview of your backup server.'); }
function openPbsPreview() { const s = state.currentSettings; openExtraPreview('pbs', typeof PbsWidget !== 'undefined' ? PbsWidget : undefined, () => Object.assign({ baseUrl: s.pbsUrl }, pbsTokenOpts())); }
function closePbsPreview() { closeExtraPreview('pbs'); }

// ── Beszel ──
async function validateBeszel() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.beszelUrl || '')) { showExtraValidation('beszel', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.beszelUsername || !s.beszelPassword) { showExtraValidation('beszel', 'error', 'Enter your Beszel email and password.'); return; }
  setValidateBusy('beszel', true);
  try { await BeszelApi.testConnection(s.beszelUrl, { username: s.beszelUsername, password: s.beszelPassword }); state.beszelValidated = true; showExtraValidation('beszel', 'success', '✓ Connected to Beszel.'); }
  catch (err) { state.beszelValidated = false; showExtraValidation('beszel', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('beszel', false); updateBeszelPreviewButton(); updateSaveBar(); }
}
function updateBeszelPreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('beszel', state.beszelValidated && !!s.beszelUrl && !!s.beszelUsername, 'Opens a live preview of your monitored systems.'); }
function openBeszelPreview() { const s = state.currentSettings; openExtraPreview('beszel', typeof BeszelWidget !== 'undefined' ? BeszelWidget : undefined, () => ({ baseUrl: s.beszelUrl, username: s.beszelUsername, password: s.beszelPassword })); }
function closeBeszelPreview() { closeExtraPreview('beszel'); }

// ── iCal ──
async function validateIcal() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.icalUrl || '')) { showExtraValidation('ical', 'error', 'Enter an .ics URL starting with http:// or https://'); return; }
  setValidateBusy('ical', true);
  try { const raw = await IcalApi.getRawEvents(s.icalUrl); state.icalValidated = true; showExtraValidation('ical', 'success', `✓ Valid feed — ${raw.length} event${raw.length === 1 ? '' : 's'} found.`); }
  catch (err) { state.icalValidated = false; showExtraValidation('ical', 'error', `✗ Unable to read feed: ${err.message}`); }
  finally { setValidateBusy('ical', false); updateIcalPreviewButton(); updateSaveBar(); }
}
function updateIcalPreviewButton() { setExtraPreviewBtn('ical', state.icalValidated && !!state.currentSettings.icalUrl, 'Opens a live preview of your calendar feed.'); }
function openIcalPreview() { const s = state.currentSettings; openExtraPreview('ical', typeof IcalWidget !== 'undefined' ? IcalWidget : undefined, () => ({ url: s.icalUrl, title: s.icalName || 'Calendar', view: s.icalView || 'upcoming' })); }
function closeIcalPreview() { closeExtraPreview('ical'); }

// ── Home Assistant ──
async function validateHomeassistant() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.homeassistantUrl || '')) { showExtraValidation('homeassistant', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.homeassistantToken) { showExtraValidation('homeassistant', 'error', 'Enter your long-lived access token.'); return; }
  setValidateBusy('homeassistant', true);
  try { await HomeAssistantApi.testConnection(s.homeassistantUrl, { apiKey: s.homeassistantToken }); state.homeassistantValidated = true; showExtraValidation('homeassistant', 'success', '✓ Connected to Home Assistant.'); }
  catch (err) { state.homeassistantValidated = false; showExtraValidation('homeassistant', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('homeassistant', false); updateHomeassistantPreviewButton(); updateSaveBar(); }
}
function updateHomeassistantPreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('homeassistant', state.homeassistantValidated && !!s.homeassistantUrl && !!s.homeassistantToken, 'Opens a live preview of your entities.'); }
function openHomeassistantPreview() { const s = state.currentSettings; openExtraPreview('homeassistant', typeof HomeAssistantWidget !== 'undefined' ? HomeAssistantWidget : undefined, () => ({ baseUrl: s.homeassistantUrl, apiKey: s.homeassistantToken, entities: parseHaEntities(s.homeassistantEntities), allowToggle: s.homeassistantAllowToggle !== false })); }
function closeHomeassistantPreview() { closeExtraPreview('homeassistant'); }

// ── Nextcloud ──
async function validateNextcloud() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.nextcloudUrl || '')) { showExtraValidation('nextcloud', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.nextcloudUsername || !s.nextcloudPassword) { showExtraValidation('nextcloud', 'error', 'Enter your username and app password.'); return; }
  setValidateBusy('nextcloud', true);
  try { await NextcloudApi.testConnection(s.nextcloudUrl, { username: s.nextcloudUsername, password: s.nextcloudPassword }); state.nextcloudValidated = true; showExtraValidation('nextcloud', 'success', '✓ Connected to Nextcloud.'); }
  catch (err) { state.nextcloudValidated = false; showExtraValidation('nextcloud', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('nextcloud', false); updateNextcloudPreviewButton(); updateSaveBar(); }
}
function updateNextcloudPreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('nextcloud', state.nextcloudValidated && !!s.nextcloudUrl && !!s.nextcloudUsername, 'Opens a live preview of recent notifications.'); }
function openNextcloudPreview() { const s = state.currentSettings; openExtraPreview('nextcloud', typeof NextcloudWidget !== 'undefined' ? NextcloudWidget : undefined, () => ({ baseUrl: s.nextcloudUrl, username: s.nextcloudUsername, password: s.nextcloudPassword })); }
function closeNextcloudPreview() { closeExtraPreview('nextcloud'); }

// ── OPNsense ──
async function validateOpnsense() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.opnsenseUrl || '')) { showExtraValidation('opnsense', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.opnsenseKey || !s.opnsenseSecret) { showExtraValidation('opnsense', 'error', 'Enter your API key and secret.'); return; }
  setValidateBusy('opnsense', true);
  try { const v = await OpnsenseApi.getVersion(s.opnsenseUrl, { apiKey: s.opnsenseKey, apiSecret: s.opnsenseSecret }); state.opnsenseValidated = true; showExtraValidation('opnsense', 'success', `✓ Connected — OPNsense ${v.version}.`); }
  catch (err) { state.opnsenseValidated = false; showExtraValidation('opnsense', 'error', `✗ Unable to connect: ${err.message}`); }
  finally { setValidateBusy('opnsense', false); updateOpnsensePreviewButton(); updateSaveBar(); }
}
function updateOpnsensePreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('opnsense', state.opnsenseValidated && !!s.opnsenseUrl && !!s.opnsenseKey && !!s.opnsenseSecret, 'Opens a live preview of your firewall.'); }
function openOpnsensePreview() { const s = state.currentSettings; openExtraPreview('opnsense', typeof OpnsenseWidget !== 'undefined' ? OpnsenseWidget : undefined, () => ({ baseUrl: s.opnsenseUrl, apiKey: s.opnsenseKey, apiSecret: s.opnsenseSecret })); }
function closeOpnsensePreview() { closeExtraPreview('opnsense'); }

// ─── Navigation ───────────────────────────────────────────────────────────────

function setupNavigation() {
  // Tab bar buttons
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Getting Started "Go to Settings" / "Open Dashboards" buttons
  // (inline onclick is blocked by MV3 CSP — use data-switch-tab instead)
  document.querySelectorAll('[data-switch-tab]').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.switchTab));
  });
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('active', p.id === `tab-${tab}`);
  });

  if (tab === 'settings' || tab === 'widgets') {
    updateSaveBar();
  } else {
    pendingBanner.style.display = 'none';
    saveBar.classList.remove('visible');
  }

  if (tab === 'dashboards') {
    loadBookmarkTree();
    renderDashboardList();
  }
}


// ─── Bookmark Tree ────────────────────────────────────────────────────────────

async function loadBookmarkTree() {
  $('bookmark-loading').style.display = 'inline-block';
  bookmarkTree.innerHTML = '';
  state.bookmarkNodes = {};

  try {
    const [root] = await chrome.bookmarks.getTree();
    const children = root.children || [];
    const container = document.createDocumentFragment();

    for (const topNode of children) {
      if (topNode.children) {
        const el = renderFolderNode(topNode, 0);
        container.appendChild(el);
      }
    }

    bookmarkTree.appendChild(container);
  } catch (err) {
    bookmarkTree.innerHTML = `<div class="banner banner-danger">Error loading bookmarks: ${err.message}</div>`;
  } finally {
    $('bookmark-loading').style.display = 'none';
  }
}

function indexNode(node) {
  state.bookmarkNodes[node.id] = node;
  if (node.children) node.children.forEach(indexNode);
}

function renderFolderNode(node, depth) {
  indexNode(node);
  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node';

  const folderRow = document.createElement('div');
  folderRow.className = 'tree-folder';
  folderRow.dataset.id = node.id;

  // ▼ toggle — styled box, high contrast, rotates when collapsed
  const toggle = document.createElement('span');
  toggle.className = 'folder-toggle';
  toggle.textContent = '▼';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.id = node.id;
  cb.dataset.isFolder = 'true';
  cb.style.cssText = 'cursor:pointer;width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;';

  const label = document.createElement('span');
  label.className = 'folder-label';
  label.textContent = `📁 ${node.title || 'Untitled'}`;

  const count = document.createElement('span');
  count.className = 'folder-count';
  const leafCount = countLeaves(node);
  count.textContent = leafCount;

  folderRow.appendChild(toggle);
  folderRow.appendChild(cb);
  folderRow.appendChild(label);
  folderRow.appendChild(count);

  const children = document.createElement('div');
  children.className = 'tree-children';

  (node.children || []).forEach((child) => {
    if (child.children) {
      children.appendChild(renderFolderNode(child, depth + 1));
    } else if (child.url) {
      children.appendChild(renderBookmarkNode(child));
    }
  });

  // Toggle expand/collapse
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    folderRow.classList.toggle('collapsed');
    children.classList.toggle('hidden');
  });

  // Folder checkbox selects all children
  cb.addEventListener('change', () => {
    const checked = cb.checked;
    selectAllInFolder(node, checked);
    updateSelectedCount();
  });

  folderRow.addEventListener('click', (e) => {
    if (e.target !== cb) {
      folderRow.classList.toggle('collapsed');
      children.classList.toggle('hidden');
    }
  });

  wrapper.appendChild(folderRow);
  wrapper.appendChild(children);
  return wrapper;
}

function renderBookmarkNode(node) {
  indexNode(node);
  const row = document.createElement('div');
  row.className = 'tree-bookmark';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.dataset.id = node.id;
  cb.dataset.isFolder = 'false';
  cb.style.cursor = 'pointer';
  cb.style.accentColor = 'var(--accent)';

  if (state.selectedBookmarkIds.has(node.id)) cb.checked = true;

  const img = document.createElement('img');
  img.className = 'bm-favicon';
  img.src = getFaviconUrl(node.url);
  img.onerror = () => { img.src = ''; img.style.display = 'none'; };

  const title = document.createElement('span');
  title.className = 'bm-title';
  title.textContent = node.title || node.url;
  title.title = node.url;

  cb.addEventListener('change', () => {
    if (cb.checked) {
      state.selectedBookmarkIds.add(node.id);
    } else {
      state.selectedBookmarkIds.delete(node.id);
    }
    updateFolderCheckboxes();
    updateSelectedCount();
  });

  row.appendChild(cb);
  row.appendChild(img);
  row.appendChild(title);
  return row;
}

function getFaviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return FAVICON_URL(domain);
  } catch {
    return '';
  }
}

function countLeaves(node) {
  if (!node.children) return node.url ? 1 : 0;
  return node.children.reduce((acc, c) => acc + countLeaves(c), 0);
}

function selectAllInFolder(node, checked) {
  if (node.url) {
    if (checked) {
      state.selectedBookmarkIds.add(node.id);
    } else {
      state.selectedBookmarkIds.delete(node.id);
    }
    // Update checkbox in DOM
    const cb = document.querySelector(`input[data-id="${node.id}"][data-is-folder="false"]`);
    if (cb) cb.checked = checked;
  }
  if (node.children) {
    node.children.forEach((c) => selectAllInFolder(c, checked));
  }
  // Update folder checkbox
  const folderCb = document.querySelector(`input[data-id="${node.id}"][data-is-folder="true"]`);
  if (folderCb) folderCb.checked = checked;
}

function updateFolderCheckboxes() {
  document.querySelectorAll('input[data-is-folder="true"]').forEach((folderCb) => {
    const folderId = folderCb.dataset.id;
    const node = state.bookmarkNodes[folderId];
    if (!node) return;
    const leaves = getLeafIds(node);
    if (leaves.length === 0) return;
    const allChecked = leaves.every((id) => state.selectedBookmarkIds.has(id));
    const someChecked = leaves.some((id) => state.selectedBookmarkIds.has(id));
    folderCb.checked = allChecked;
    folderCb.indeterminate = !allChecked && someChecked;
  });
}

function getLeafIds(node) {
  if (node.url) return [node.id];
  if (!node.children) return [];
  return node.children.flatMap(getLeafIds);
}

function updateSelectedCount() {
  const count = state.selectedBookmarkIds.size;
  selectedCount.textContent = count;
  generateBtn.disabled = count === 0;
}

// ─── Bookmark Controls ────────────────────────────────────────────────────────

function setupBookmarkControls() {
  $('select-all-btn').addEventListener('click', () => {
    Object.values(state.bookmarkNodes).forEach((node) => {
      if (node.url) state.selectedBookmarkIds.add(node.id);
    });
    document.querySelectorAll('input[data-is-folder="false"]').forEach((cb) => { cb.checked = true; });
    updateFolderCheckboxes();
    updateSelectedCount();
  });

  $('select-none-btn').addEventListener('click', () => {
    state.selectedBookmarkIds.clear();
    document.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = false;
      cb.indeterminate = false;
    });
    updateSelectedCount();
  });

  $('expand-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.tree-folder').forEach((f) => f.classList.remove('collapsed'));
    document.querySelectorAll('.tree-children').forEach((c) => c.classList.remove('hidden'));
  });

  $('collapse-all-btn').addEventListener('click', () => {
    document.querySelectorAll('.tree-folder').forEach((f) => f.classList.add('collapsed'));
    document.querySelectorAll('.tree-children').forEach((c) => c.classList.add('hidden'));
  });

  setupShapePicker('create-shape-picker');

  generateBtn.addEventListener('click', generateDashboard);
}

// ─── Dashboard Generation ─────────────────────────────────────────────────────

async function generateDashboard() {
  if (state.selectedBookmarkIds.size === 0) return;

  const settings = state.savedSettings;
  if (!settings.apiKey) {
    showGenerateError('Please save your API key in Settings first.');
    return;
  }

  const name = dashNameInput.value.trim() || `Dashboard ${new Date().toLocaleDateString()}`;
  const defaultShape = getSelectedShape('create-shape-picker', 'rounded');
  const showText = $('create-text-toggle')?.checked !== false;
  generateError.style.display = 'none';

  // Collect selected bookmarks with folder context
  const bookmarks = collectSelectedBookmarks();

  showProgress('Preparing bookmarks...', 5);

  try {
    // Process in batches
    const processed = [];
    const batches = chunkArray(bookmarks, AI_BATCH_SIZE);
    const totalSteps = batches.length + 2;

    for (let i = 0; i < batches.length; i++) {
      const pct = Math.round(((i + 1) / totalSteps) * 80);
      updateProgress(
        `Analyzing batch ${i + 1} of ${batches.length} with AI...`,
        pct
      );
      const results = await processBookmarkBatch(batches[i], settings.apiKey, settings.model);
      processed.push(...results);
    }

    updateProgress('Resolving icons from bookmarked sites...', 82);

    // Resolve icons: real favicon (direct + Google cache) → AI brand-icon guess → generic fallback
    await resolveIcons(processed, 8, (done, total) => {
      const pct = 82 + Math.round((done / total) * 8); // 82–90%
      updateProgress(`Fetching icons… ${done}/${total}`, pct);
    });

    updateProgress('Building dashboard...', 90);

    // Sort alphabetically: folder name first, then bookmark title within each folder
    processed.sort((a, b) => {
      const folderCmp = a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base' });
      return folderCmp !== 0 ? folderCmp : a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
    });

    const dashboard = {
      id: `dash_${Date.now()}`,
      name,
      createdAt: Date.now(),
      bookmarks: processed,
      defaultShape,
      showText,
    };

    state.dashboards.push(dashboard);

    // Set as default if first dashboard
    if (state.dashboards.length === 1) {
      state.defaultDashboardId = dashboard.id;
    }

    await saveDashboards();
    updateProgress('Done!', 100);

    // Brief pause then flip to success state inside the modal
    setTimeout(() => showProgressSuccess(dashboard.id, name, processed.length), 400);

  } catch (err) {
    hideProgress();
    showGenerateError(`Error: ${err.message}`);
  }
}

function collectSelectedBookmarks() {
  const result = [];
  const visited = new Set();

  function walk(node, folderPath = []) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    if (node.url && state.selectedBookmarkIds.has(node.id)) {
      result.push({
        id: node.id,
        url: node.url,
        title: node.title || node.url,
        folder: folderPath.join(' > ') || 'General',
        folderPath: [...folderPath],
      });
    }

    if (node.children) {
      const newPath = node.title ? [...folderPath, node.title] : folderPath;
      node.children.forEach((c) => walk(c, newPath));
    }
  }

  // Walk from roots we've indexed
  const roots = Object.values(state.bookmarkNodes).filter(
    (n) => n.children && !Object.values(state.bookmarkNodes).some((p) => p.children?.some((c) => c.id === n.id))
  );

  // Simpler approach: iterate all bookmarks in tree order
  function walkAll(node, path = []) {
    if (node.url && state.selectedBookmarkIds.has(node.id)) {
      result.push({
        id: node.id,
        url: node.url,
        title: node.title || node.url,
        folder: path.length > 0 ? path.join(' > ') : 'General',
        folderPath: [...path],
      });
    }
    if (node.children) {
      const newPath = node.title && node.id !== '0' ? [...path, node.title] : path;
      node.children.forEach((c) => walkAll(c, newPath));
    }
  }

  // Get root nodes
  chrome.bookmarks.getTree().then(([root]) => {}).catch(() => {});
  // Use already-indexed nodes in insertion order
  const allNodes = Object.values(state.bookmarkNodes);
  const topLevelFolders = allNodes.filter((n) => n.children);

  topLevelFolders.forEach((folder) => {
    if (folder.title === 'Bookmarks bar' || folder.title === 'Other bookmarks' || folder.title === 'Mobile bookmarks') {
      walkAll(folder, []);
    } else {
      walkAll(folder, [folder.title]);
    }
  });

  // Deduplicate
  const seen = new Set();
  return result.filter((b) => {
    if (seen.has(b.id)) return false;
    seen.add(b.id);
    return true;
  });
}

async function processBookmarkBatch(bookmarks, apiKey, model) {
  const prompt = `You are a browser bookmark metadata enricher. Analyze these bookmarks and return a JSON array with enriched metadata.

For each bookmark, return an object with exactly these fields:
- "id": the original id string (unchanged)
- "url": the original url (unchanged)
- "name": clean display name, max 35 chars
- "description": what this site/page is about, max 120 chars, be specific and helpful
- "category": one of: Development, Design, News, Social, Entertainment, Finance, Shopping, Productivity, Reference, Education, Health, Travel, Food, Sports, Technology, AI, Other
- "icon_slug": the Simple Icons slug (https://simpleicons.org) for this brand/service if one exists (e.g. "github", "youtube", "notion", "figma", "openai"), otherwise null
- "icon_emoji": a single relevant emoji as last-resort fallback (only used if no icon can be fetched)

Input bookmarks:
${JSON.stringify(bookmarks.map((b) => ({ id: b.id, url: b.url, title: b.title, folder: b.folder })), null, 2)}

Return ONLY a valid JSON array, no markdown, no explanation.`;

  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/auto-dashboard-ai',
      'X-Title': 'Auto Dashboard AI',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API error ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '[]';

  let aiResults;
  try {
    // Strip markdown code blocks if present
    const cleaned = content.replace(/```(?:json)?\n?/g, '').trim();
    aiResults = JSON.parse(cleaned);
    if (!Array.isArray(aiResults)) throw new Error('Not an array');
  } catch {
    // Fallback: return basic metadata without AI enrichment
    aiResults = bookmarks.map((b) => ({
      id: b.id,
      url: b.url,
      name: b.title.slice(0, 35),
      description: b.url,
      category: 'Other',
      icon_emoji: '🔗',
    }));
  }

  // Merge AI results with original bookmark data
  return bookmarks.map((bm) => {
    const ai = aiResults.find((r) => r.id === bm.id) || {};
    return {
      id: bm.id,
      url: bm.url,
      title: ai.name || bm.title,
      description: ai.description || '',
      category: ai.category || 'Other',
      icon_slug: ai.icon_slug || null,
      icon_emoji: ai.icon_emoji || '🔗',
      folder: bm.folder,
      folderPath: bm.folderPath,
      resolved_icon: null, // filled in after icon resolution pass
    };
  });
}

// ─── Icon Resolution ──────────────────────────────────────────────────────────

// Used when no real favicon and no AI-identified brand icon could be found.
// A plain neutral icon (not tied to any guess) is the true last resort.
const GENERIC_ICON_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5"/>
  <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5"/>
</svg>`.trim());

/**
 * Test whether an image URL loads successfully.
 * Returns true/false; times out after `ms` milliseconds.
 */
function testImage(url, ms = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => { img.src = ''; resolve(false); }, ms);
    img.onload  = () => { clearTimeout(timer); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(timer); resolve(false); };
    img.src = url;
  });
}

/**
 * Walk the icon candidate chain for a single bookmark and return
 * the first URL that resolves to an icon, or null if nothing works.
 *
 * Priority order (favicon first, AI guess second, generic last):
 *   1. Direct /apple-touch-icon.png  (high-res, straight from the site)
 *   2. Direct /favicon.ico           (straight from the site)
 *   3. Google Favicon service        (cached per-site favicon lookup)
 *   4. Simple Icons CDN              (AI's best-guess brand icon, used only
 *                                     if no real favicon was found above)
 *
 * If none succeed, the caller applies GENERIC_ICON_URL as the final fallback.
 */
async function resolveIconUrl(bm) {
  let origin, hostname;
  try {
    const u = new URL(bm.url);
    if (!u.protocol.startsWith('http')) return null; // skip file://, chrome://, etc.
    origin   = u.origin;
    hostname = u.hostname;
  } catch {
    return null;
  }

  // 1–3: real favicon lookups, straight from the site or via Google's cache
  const faviconCandidates = [
    `${origin}/apple-touch-icon.png`,
    `${origin}/favicon.ico`,
    `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
  ];
  for (const url of faviconCandidates) {
    if (await testImage(url, 5000)) return url;
  }

  // 4: no real favicon found — fall back to the AI's best-guess brand icon
  if (bm.icon_slug) {
    const slugUrl = `https://cdn.simpleicons.org/${encodeURIComponent(bm.icon_slug)}`;
    if (await testImage(slugUrl, 5000)) return slugUrl;
  }

  // Nothing found — caller applies the generic fallback icon
  return null;
}

/**
 * Resolve icons for all bookmarks, up to `concurrency` in parallel.
 * Updates `bm.resolved_icon` in place; calls `onProgress` with
 * current count and total so the caller can update the progress bar.
 * Bookmarks with no real or AI-guessed icon get the generic fallback icon.
 */
async function resolveIcons(bookmarks, concurrency = 8, onProgress = () => {}) {
  let done = 0;
  const total = bookmarks.length;

  async function worker(bm) {
    bm.resolved_icon = await resolveIconUrl(bm) || GENERIC_ICON_URL;
    bm.icon_is_generic = bm.resolved_icon === GENERIC_ICON_URL;
    onProgress(++done, total);
  }

  // Process in parallel batches of `concurrency`
  for (let i = 0; i < bookmarks.length; i += concurrency) {
    await Promise.all(bookmarks.slice(i, i + concurrency).map(worker));
  }
}

// ─── Dashboard List ───────────────────────────────────────────────────────────

async function loadDashboards() {
  const stored = await chromeStorageGet(['dashboards', 'defaultDashboardId']);
  state.dashboards = stored.dashboards || [];
  state.defaultDashboardId = stored.defaultDashboardId || null;
}

async function saveDashboards() {
  await chromeStorageSet({
    dashboards: state.dashboards,
    defaultDashboardId: state.defaultDashboardId,
  });
}

function renderDashboardList() {
  if (state.dashboards.length === 0) {
    dashboardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No dashboards yet.</p>
        <p>Select bookmarks and click Generate.</p>
      </div>`;
    return;
  }

  dashboardList.innerHTML = '';
  state.dashboards
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((dash) => {
      const isDefault = dash.id === state.defaultDashboardId;
      const card = document.createElement('div');
      card.className = `dashboard-card${isDefault ? ' is-default' : ''}`;
      const folderCount = new Set(dash.bookmarks.map((b) => b.folder)).size;

      card.innerHTML = `
        <div class="dashboard-card-top">
          <div>
            <div class="dashboard-card-name">
              ${escapeHtml(dash.name)}
              ${isDefault ? '<span class="badge badge-accent">Default</span>' : ''}
            </div>
            <div class="dashboard-card-meta">
              ${dash.bookmarks.length} bookmarks · ${folderCount} folders · ${formatDate(dash.createdAt)}
            </div>
          </div>
          <div class="dashboard-card-actions">
            <button class="btn btn-secondary btn-sm" data-action="open" data-id="${dash.id}">Open</button>
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${dash.id}">Edit</button>
            ${!isDefault ? `<button class="btn btn-secondary btn-sm" data-action="set-default" data-id="${dash.id}">Set Default</button>` : ''}
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${dash.id}">Delete</button>
          </div>
        </div>
      `;

      card.querySelectorAll('[data-action]').forEach((btn) => {
        btn.addEventListener('click', () => handleDashboardAction(btn.dataset.action, btn.dataset.id));
      });

      dashboardList.appendChild(card);
    });
}

async function handleDashboardAction(action, id) {
  if (action === 'open') {
    const url = chrome.runtime.getURL(`newtab/newtab.html?dash=${id}`);
    chrome.tabs.create({ url });
  } else if (action === 'edit') {
    openDashEditModal(id);
  } else if (action === 'set-default') {
    state.defaultDashboardId = id;
    await saveDashboards();
    renderDashboardList();
    showToast('Default dashboard updated ✓');
  } else if (action === 'delete') {
    if (!confirm('Delete this dashboard?')) return;
    state.dashboards = state.dashboards.filter((d) => d.id !== id);
    if (state.defaultDashboardId === id) {
      state.defaultDashboardId = state.dashboards[0]?.id || null;
    }
    await saveDashboards();
    renderDashboardList();
    showToast('Dashboard deleted');
  }
}

// ─── Dashboard edit modal (rename, show text, default shape) ──────────────────

let editingDashboardId = null;

function setupDashEditModal() {
  const modal = document.getElementById('dash-edit-modal');
  if (!modal) return;

  document.getElementById('dash-edit-modal-close').addEventListener('click', closeDashEditModal);
  document.getElementById('dash-edit-cancel-btn').addEventListener('click', closeDashEditModal);
  document.getElementById('dash-edit-save-btn').addEventListener('click', saveDashEdit);

  setupShapePicker('dash-edit-shape-picker');

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeDashEditModal();
  });
}

/** Wires click selection for a shape-picker widget; adds .selected to the chosen option. */
function setupShapePicker(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.shape-option').forEach((opt) => {
    opt.addEventListener('click', () => {
      container.querySelectorAll('.shape-option').forEach((o) => o.classList.remove('selected'));
      opt.classList.add('selected');
      opt.querySelector('input').checked = true;
    });
  });
}

function selectShapeOption(containerId, shape) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.shape-option').forEach((opt) => {
    const match = opt.dataset.shape === shape;
    opt.classList.toggle('selected', match);
    opt.querySelector('input').checked = match;
  });
}

function getSelectedShape(containerId, fallback) {
  const container = document.getElementById(containerId);
  if (!container) return fallback;
  const checked = container.querySelector('input:checked');
  return checked ? checked.value : fallback;
}

function openDashEditModal(id) {
  const dash = state.dashboards.find((d) => d.id === id);
  if (!dash) return;
  editingDashboardId = id;

  document.getElementById('dash-edit-name').value = dash.name || '';
  document.getElementById('dash-edit-text-toggle').checked = dash.showText !== false;
  selectShapeOption('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  document.getElementById('dash-edit-modal').classList.add('visible');
  document.getElementById('dash-edit-name').focus();
}

async function saveDashEdit() {
  const dash = state.dashboards.find((d) => d.id === editingDashboardId);
  if (!dash) { closeDashEditModal(); return; }

  const newName = document.getElementById('dash-edit-name').value.trim();
  dash.name         = newName || dash.name;
  dash.showText     = document.getElementById('dash-edit-text-toggle').checked;
  dash.defaultShape = getSelectedShape('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  await saveDashboards();
  closeDashEditModal();
  renderDashboardList();
  showToast('Dashboard updated ✓');
}

function closeDashEditModal() {
  document.getElementById('dash-edit-modal')?.classList.remove('visible');
  editingDashboardId = null;
}

// ─── Progress UI ──────────────────────────────────────────────────────────────

function showProgress(msg, pct) {
  // Restore the standard progress layout in case a previous success state mutated it
  const modal = document.querySelector('.progress-modal');
  modal.innerHTML = `
    <div class="progress-icon">🤖</div>
    <h3>Generating Dashboard</h3>
    <p id="progress-message"></p>
    <div class="progress-bar-track">
      <div class="progress-bar-fill" id="progress-bar" style="width:0%"></div>
    </div>
    <div class="progress-label" id="progress-label">0%</div>
  `;
  progressOverlay.classList.add('visible');
  updateProgress(msg, pct);
}

function updateProgress(msg, pct) {
  const msgEl = $('progress-message');
  const barEl = $('progress-bar');
  const lblEl = $('progress-label');
  if (msgEl) msgEl.textContent = msg;
  if (barEl) barEl.style.width = `${pct}%`;
  if (lblEl) lblEl.textContent = `${pct}%`;
}

function hideProgress() {
  progressOverlay.classList.remove('visible');
}

/** Replace the progress modal content with a success state. */
function showProgressSuccess(dashId, name, count) {
  const modal = document.querySelector('.progress-modal');
  modal.innerHTML = `
    <div class="progress-icon">✅</div>
    <h3 style="margin-bottom:8px;">Dashboard Created!</h3>
    <p style="margin-bottom:20px;">
      <strong>${escapeHtml(name)}</strong> is ready with ${count} bookmark${count !== 1 ? 's' : ''}.
    </p>
    <div style="display:flex;gap:10px;justify-content:center;">
      <button class="btn btn-primary" id="success-view-btn">View Dashboard →</button>
      <button class="btn btn-secondary" id="success-done-btn">Done</button>
    </div>
  `;

  $('success-view-btn').addEventListener('click', () => {
    const url = chrome.runtime.getURL(`newtab/newtab.html?dash=${dashId}`);
    chrome.tabs.create({ url });
    closeProgressSuccess();
  });

  $('success-done-btn').addEventListener('click', closeProgressSuccess);
}

function closeProgressSuccess() {
  hideProgress();
  renderDashboardList();
  dashNameInput.value = '';
  selectShapeOption('create-shape-picker', 'rounded');
  const textToggle = $('create-text-toggle');
  if (textToggle) textToggle.checked = true;
  $('select-none-btn').click();
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function showGenerateError(msg) {
  generateError.style.display = 'flex';
  generateError.textContent = msg;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function chromeStorageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function chromeStorageSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

let toastTimeout;
function showToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #1e1e2e; border: 1px solid #2a2a3e; color: #e2e8f0;
      padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 500;
      box-shadow: 0 4px 24px rgba(0,0,0,0.4); z-index: 999;
      transition: opacity 0.2s; pointer-events: none;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
