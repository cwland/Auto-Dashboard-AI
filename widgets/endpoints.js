// Auto Dashboard AI — multi-endpoint data layer (shared by config + dashboard).
//
// Historically every integration stored ONE configuration in flat settings keys
// (e.g. tautulliUrl, tautulliApiKey). This module lets a service hold MANY named
// endpoints while keeping the rest of the app (mounts, validation, previews)
// reading the same flat keys — by resolving a chosen endpoint back onto those
// keys on demand.
//
// Shape:
//   settings.instances = {
//     tautulli: [
//       { id:'tautulli-1', name:'Living Room', validated:true,
//         fields:{ tautulliUrl:'…', tautulliApiKey:'…', tautulliMaxSessions:3, … } },
//       { id:'tautulli-ab12', name:'Cabin', validated:false, fields:{ … } },
//     ],
//     portainer: [ … ],
//   }
//
// Weather and Stocks are intentionally excluded (single-instance by design).
'use strict';

(function (global) {
  // ── Per-integration endpoint schema ──────────────────────────────────────
  // `fields`     : every per-endpoint settings key (connection + per-endpoint options).
  // `primary`    : the key shown as the endpoint's main identifier (usually the URL).
  // `secrets`    : keys whose value is a credential (masked in the UI).
  // `enabledKey` : legacy master on/off flag for the service.
  // `validatedKey`: legacy "connection tested OK" flag.
  // Field key strings are transcribed verbatim from DEFAULT_SETTINGS (some camelCase
  // prefixes differ from the integration id, e.g. uptimekuma → uptimeKuma*).
  const SCHEMAS = {
    tautulli: { fields: ['tautulliUrl', 'tautulliApiKey', 'tautulliMaxSessions', 'tautulliCarouselDwellMs'], primary: 'tautulliUrl', secrets: ['tautulliApiKey'], enabledKey: 'tautulliEnabled', validatedKey: 'tautulliApiKeyValidated' },
    uptimekuma: { fields: ['uptimeKumaUrl', 'uptimeKumaSlug', 'uptimeKumaRefreshSecs', 'uptimeKumaShowAverage', 'uptimeKumaShowRing', 'uptimeKumaShowTotal', 'uptimeKumaShowUp', 'uptimeKumaShowDown', 'uptimeKumaShowPaused', 'uptimeKumaShowList'], primary: 'uptimeKumaUrl', secrets: [], enabledKey: 'uptimeKumaEnabled', validatedKey: 'uptimeKumaValidated' },
    sonarr: { fields: ['sonarrUrl', 'sonarrApiKey', 'sonarrView', 'sonarrCount', 'sonarrUnmonitored'], primary: 'sonarrUrl', secrets: ['sonarrApiKey'], enabledKey: 'sonarrEnabled', validatedKey: 'sonarrValidated' },
    radarr: { fields: ['radarrUrl', 'radarrApiKey', 'radarrView', 'radarrCount', 'radarrUnmonitored', 'radarrRtCinemas', 'radarrRtDigital', 'radarrRtPhysical'], primary: 'radarrUrl', secrets: ['radarrApiKey'], enabledKey: 'radarrEnabled', validatedKey: 'radarrValidated' },
    seerr: { fields: ['seerrUrl', 'seerrApiKey', 'seerrView', 'seerrCount', 'seerrShowUsers'], primary: 'seerrUrl', secrets: ['seerrApiKey'], enabledKey: 'seerrEnabled', validatedKey: 'seerrValidated' },
    pihole: { fields: ['piholeUrl', 'piholeApiKey'], primary: 'piholeUrl', secrets: ['piholeApiKey'], enabledKey: 'piholeEnabled', validatedKey: 'piholeValidated' },
    adguard: { fields: ['adguardUrl', 'adguardUsername', 'adguardPassword'], primary: 'adguardUrl', secrets: ['adguardPassword'], enabledKey: 'adguardEnabled', validatedKey: 'adguardValidated' },
    plex: { fields: ['plexUrl', 'plexToken'], primary: 'plexUrl', secrets: ['plexToken'], enabledKey: 'plexEnabled', validatedKey: 'plexValidated' },
    jellyfin: { fields: ['jellyfinUrl', 'jellyfinApiKey'], primary: 'jellyfinUrl', secrets: ['jellyfinApiKey'], enabledKey: 'jellyfinEnabled', validatedKey: 'jellyfinValidated' },
    emby: { fields: ['embyUrl', 'embyApiKey'], primary: 'embyUrl', secrets: ['embyApiKey'], enabledKey: 'embyEnabled', validatedKey: 'embyValidated' },
    unifi: { fields: ['unifiUrl', 'unifiUsername', 'unifiPassword', 'unifiSite'], primary: 'unifiUrl', secrets: ['unifiPassword'], enabledKey: 'unifiEnabled', validatedKey: 'unifiValidated' },
    sabnzbd: { fields: ['sabnzbdUrl', 'sabnzbdApiKey', 'sabnzbdLimit'], primary: 'sabnzbdUrl', secrets: ['sabnzbdApiKey'], enabledKey: 'sabnzbdEnabled', validatedKey: 'sabnzbdValidated' },
    qbittorrent: { fields: ['qbittorrentUrl', 'qbittorrentUsername', 'qbittorrentPassword', 'qbittorrentLimit'], primary: 'qbittorrentUrl', secrets: ['qbittorrentPassword'], enabledKey: 'qbittorrentEnabled', validatedKey: 'qbittorrentValidated' },
    transmission: { fields: ['transmissionUrl', 'transmissionUsername', 'transmissionPassword', 'transmissionLimit'], primary: 'transmissionUrl', secrets: ['transmissionPassword'], enabledKey: 'transmissionEnabled', validatedKey: 'transmissionValidated' },
    peanut: { fields: ['peanutUrl', 'peanutUsername', 'peanutPassword'], primary: 'peanutUrl', secrets: ['peanutPassword'], enabledKey: 'peanutEnabled', validatedKey: 'peanutValidated' },
    umami: { fields: ['umamiUrl', 'umamiApiKey', 'umamiUsername', 'umamiPassword', 'umamiWebsiteId', 'umamiTimeframe'], primary: 'umamiUrl', secrets: ['umamiApiKey', 'umamiPassword'], enabledKey: 'umamiEnabled', validatedKey: 'umamiValidated' },
    speedtest: { fields: ['speedtestUrl', 'speedtestToken'], primary: 'speedtestUrl', secrets: ['speedtestToken'], enabledKey: 'speedtestEnabled', validatedKey: 'speedtestValidated' },
    ntfy: { fields: ['ntfyUrl', 'ntfyTopic', 'ntfyToken', 'ntfyLimit'], primary: 'ntfyUrl', secrets: ['ntfyToken'], enabledKey: 'ntfyEnabled', validatedKey: 'ntfyValidated' },
    audiobookshelf: { fields: ['audiobookshelfUrl', 'audiobookshelfToken'], primary: 'audiobookshelfUrl', secrets: ['audiobookshelfToken'], enabledKey: 'audiobookshelfEnabled', validatedKey: 'audiobookshelfValidated' },
    navidrome: { fields: ['navidromeUrl', 'navidromeUsername', 'navidromePassword'], primary: 'navidromeUrl', secrets: ['navidromePassword'], enabledKey: 'navidromeEnabled', validatedKey: 'navidromeValidated' },
    prowlarr: { fields: ['prowlarrUrl', 'prowlarrApiKey'], primary: 'prowlarrUrl', secrets: ['prowlarrApiKey'], enabledKey: 'prowlarrEnabled', validatedKey: 'prowlarrValidated' },
    tracearr: { fields: ['tracearrUrl', 'tracearrApiKey'], primary: 'tracearrUrl', secrets: ['tracearrApiKey'], enabledKey: 'tracearrEnabled', validatedKey: 'tracearrValidated' },
    glances: { fields: ['glancesUrl', 'glancesUsername', 'glancesPassword'], primary: 'glancesUrl', secrets: ['glancesPassword'], enabledKey: 'glancesEnabled', validatedKey: 'glancesValidated' },
    dashdot: { fields: ['dashdotUrl'], primary: 'dashdotUrl', secrets: [], enabledKey: 'dashdotEnabled', validatedKey: 'dashdotValidated' },
    unraid: { fields: ['unraidUrl', 'unraidApiKey'], primary: 'unraidUrl', secrets: ['unraidApiKey'], enabledKey: 'unraidEnabled', validatedKey: 'unraidValidated' },
    openmediavault: { fields: ['openmediavaultUrl', 'openmediavaultUsername', 'openmediavaultPassword'], primary: 'openmediavaultUrl', secrets: ['openmediavaultPassword'], enabledKey: 'openmediavaultEnabled', validatedKey: 'openmediavaultValidated' },
    truenas: { fields: ['truenasUrl', 'truenasApiKey'], primary: 'truenasUrl', secrets: ['truenasApiKey'], enabledKey: 'truenasEnabled', validatedKey: 'truenasValidated' },
    proxmox: { fields: ['proxmoxUrl', 'proxmoxUsername', 'proxmoxRealm', 'proxmoxTokenId', 'proxmoxApiKey'], primary: 'proxmoxUrl', secrets: ['proxmoxApiKey'], enabledKey: 'proxmoxEnabled', validatedKey: 'proxmoxValidated' },
    portainer: { fields: ['portainerUrl', 'portainerApiKey'], primary: 'portainerUrl', secrets: ['portainerApiKey'], enabledKey: 'portainerEnabled', validatedKey: 'portainerValidated' },
    pbs: { fields: ['pbsUrl', 'pbsUsername', 'pbsRealm', 'pbsTokenId', 'pbsApiKey', 'pbsNode'], primary: 'pbsUrl', secrets: ['pbsApiKey'], enabledKey: 'pbsEnabled', validatedKey: 'pbsValidated' },
    beszel: { fields: ['beszelUrl', 'beszelUsername', 'beszelPassword'], primary: 'beszelUrl', secrets: ['beszelPassword'], enabledKey: 'beszelEnabled', validatedKey: 'beszelValidated' },
    ical: { fields: ['icalName', 'icalUrl', 'icalView'], primary: 'icalUrl', secrets: [], enabledKey: 'icalEnabled', validatedKey: 'icalValidated' },
    homeassistant: { fields: ['homeassistantUrl', 'homeassistantToken', 'homeassistantEntities', 'homeassistantAllowToggle'], primary: 'homeassistantUrl', secrets: ['homeassistantToken'], enabledKey: 'homeassistantEnabled', validatedKey: 'homeassistantValidated' },
    nextcloud: { fields: ['nextcloudUrl', 'nextcloudUsername', 'nextcloudPassword'], primary: 'nextcloudUrl', secrets: ['nextcloudPassword'], enabledKey: 'nextcloudEnabled', validatedKey: 'nextcloudValidated' },
    opnsense: { fields: ['opnsenseUrl', 'opnsenseKey', 'opnsenseSecret'], primary: 'opnsenseUrl', secrets: ['opnsenseSecret'], enabledKey: 'opnsenseEnabled', validatedKey: 'opnsenseValidated' },
    // Weather is multi-CITY and provider-agnostic. The provider choice
    // (weatherProvider) and the OpenWeather API key (weatherApiKey) are shared
    // GLOBAL settings, so they are intentionally NOT in `fields`. Each city
    // stores its resolved coordinates (weatherLat/weatherLon — used by both
    // providers) plus its display name and per-city units/refresh.
    weather: { fields: ['weatherLocation', 'weatherLat', 'weatherLon', 'weatherUnits', 'weatherRefreshMins'], primary: 'weatherLocation', secrets: [], enabledKey: 'weatherEnabled', validatedKey: 'weatherApiKeyValidated' },
  };

  // intIds excluded from multi-endpoint support.
  const SINGLE_INSTANCE = { stocks: true };

  function schema(intId) { return SCHEMAS[intId] || null; }
  function isMulti(intId) { return !!SCHEMAS[intId] && !SINGLE_INSTANCE[intId]; }
  function allIds() { return Object.keys(SCHEMAS); }

  function newId(intId) {
    return intId + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  // Pull an endpoint's field values out of flat settings keys.
  function fieldsFromFlat(settings, intId) {
    const sc = schema(intId); const out = {};
    if (!sc) return out;
    sc.fields.forEach((k) => { if (settings[k] !== undefined) out[k] = settings[k]; });
    return out;
  }

  // True when the legacy flat config for a service holds anything worth keeping.
  function hasLegacyConfig(settings, intId) {
    const sc = schema(intId); if (!sc) return false;
    if (settings[sc.enabledKey]) return true;
    const prim = settings[sc.primary];
    return !!(prim && String(prim).trim());
  }

  // ── Migration ─────────────────────────────────────────────────────────────
  // Ensure settings.instances[intId] exists for every multi-endpoint service.
  // Legacy flat config becomes endpoint #1 so nothing is lost. Idempotent.
  // `names` (optional) maps intId → display name used to label the first endpoint.
  function migrate(settings, names) {
    if (!settings || typeof settings !== 'object') return settings;
    names = names || {};
    const inst = settings.instances = (settings.instances && typeof settings.instances === 'object') ? settings.instances : {};
    const descs = settings.integrationDescriptions || {};
    allIds().forEach((intId) => {
      if (Array.isArray(inst[intId])) return; // already migrated
      const sc = SCHEMAS[intId];
      if (hasLegacyConfig(settings, intId)) {
        const name = (descs[intId] || names[intId] || intId).toString().slice(0, 24);
        inst[intId] = [{
          id: intId + '-1',
          name,
          validated: !!settings[sc.validatedKey],
          fields: fieldsFromFlat(settings, intId),
        }];
      } else {
        inst[intId] = [];
      }
    });
    return settings;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────
  function list(settings, intId) {
    const inst = settings && settings.instances;
    return (inst && Array.isArray(inst[intId])) ? inst[intId] : [];
  }
  function get(settings, intId, endpointId) {
    const eps = list(settings, intId);
    if (!eps.length) return null;
    if (endpointId == null) return eps[0];
    return eps.find((e) => e.id === endpointId) || null;
  }
  function count(settings, intId) { return list(settings, intId).length; }
  // A service is "active" when it has at least one endpoint.
  function serviceEnabled(settings, intId) { return count(settings, intId) > 0; }

  function add(settings, intId, name, fields) {
    if (!isMulti(intId)) return null;
    const eps = list(settings, intId);
    const ep = { id: newId(intId), name: (name || 'Endpoint').toString().slice(0, 24), validated: false, fields: Object.assign({}, fields || {}) };
    settings.instances = settings.instances || {};
    settings.instances[intId] = eps.concat([ep]);
    return ep;
  }
  function remove(settings, intId, endpointId) {
    const eps = list(settings, intId);
    settings.instances = settings.instances || {};
    settings.instances[intId] = eps.filter((e) => e.id !== endpointId);
    return settings.instances[intId];
  }

  // ── Resolution ────────────────────────────────────────────────────────────
  // Produce a settings object where the chosen endpoint's fields are written onto
  // the flat keys, so existing mounts/validators/previews work unmodified.
  // Returns null when the endpoint no longer exists (→ "configuration removed").
  function resolve(settings, intId, endpointId) {
    if (!isMulti(intId)) return settings; // weather/stocks: pass through
    const ep = get(settings, intId, endpointId);
    if (!ep) return null;
    const sc = SCHEMAS[intId];
    const out = Object.assign({}, settings);
    sc.fields.forEach((k) => { if (ep.fields[k] !== undefined) out[k] = ep.fields[k]; });
    out[sc.enabledKey] = true;
    out[sc.validatedKey] = !!ep.validated;
    return out;
  }

  global.Endpoints = {
    SCHEMAS, SINGLE_INSTANCE,
    schema, isMulti, allIds, newId,
    fieldsFromFlat, hasLegacyConfig,
    migrate, list, get, count, serviceEnabled, add, remove, resolve,
  };
})(typeof window !== 'undefined' ? window : this);
