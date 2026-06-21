// Auto Dashboard AI — Config Page
'use strict';

// ─── Integration icon fallback ────────────────────────────────────────────────
// Brand icons (.int-icon in section titles, .wg-icon in widget headers) live in
// icons/integrations/ and are downloaded by icons/integrations/fetch-icons.sh.
// If a file hasn't been fetched yet, hide the <img> instead of showing a broken
// image. Done here (not via an inline onerror=) because MV3's content-security
// policy blocks inline event handlers on extension pages. Capture-phase covers
// images added dynamically (e.g. widget previews); the load sweep covers any
// that errored before this listener attached.
(function () {
  function hideBroken(img) {
    if (img && img.tagName === 'IMG' &&
        (img.classList.contains('int-icon') || img.classList.contains('wg-icon'))) {
      img.style.display = 'none';
    }
  }
  window.addEventListener('error', function (e) { hideBroken(e.target); }, true);
  window.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('img.int-icon, img.wg-icon').forEach(function (img) {
      if (img.complete && img.naturalWidth === 0) hideBroken(img);
    });
  });
})();

// Apply the saved theme as early as possible (before settings finish loading)
// to avoid a flash of the default palette. applyTheme is hoisted below.
chrome.storage.local.get('settings', ({ settings: s }) => { injectCustomThemeStyles(s && s.customThemes); applyTheme(s && s.theme); });

// Detect the browser brand (Brave reports a Chrome UA, so use navigator.brave)
// and store it so the background uses the right per-browser-brand gist file.
(function () {
  (async () => {
    let bt = 'chrome';
    try { if (navigator.brave && navigator.brave.isBrave && await navigator.brave.isBrave()) bt = 'brave'; } catch (_) {}
    if (bt === 'chrome') {
      const ua = navigator.userAgent || '';
      if (/\bEdg\//.test(ua)) bt = 'edge';
      else if (/\bOPR\//.test(ua) || /\bOpera\b/.test(ua)) bt = 'opera';
      else if (/\bVivaldi\b/.test(ua)) bt = 'vivaldi';
    }
    try { chrome.storage.local.get('browserType', (d) => { if (!chrome.runtime.lastError && d.browserType !== bt) chrome.storage.local.set({ browserType: bt }); }); } catch (_) {}
  })();
})();

// ─── Constants ────────────────────────────────────────────────────────────────

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const AI_BATCH_SIZE = 15; // bookmarks per AI request
const FAVICON_URL = (domain) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;

// ─── AI Providers ───────────────────────────────────────────────────────────
// Default (built-in) providers. The AI bookmark-enrichment request is routed to
// the selected provider; each provider can have its own API key, model, and
// (optionally) an overridden endpoint. Providers speak one of three request
// formats — OpenAI-compatible (the majority), Anthropic, or Cohere.
const PROVIDER_ENDPOINTS = {
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
  openai:     'https://api.openai.com/v1/chat/completions',
  anthropic:  'https://api.anthropic.com/v1/messages',
  google:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
  mistral:    'https://api.mistral.ai/v1/chat/completions',
  meta:       'https://openrouter.ai/api/v1/chat/completions', // routed via OpenRouter
  groq:       'https://api.groq.com/openai/v1/chat/completions',
  cohere:     'https://api.cohere.ai/v2/chat',
  together:   'https://api.together.xyz/v1/chat/completions',
  fireworks:  'https://api.fireworks.ai/inference/v1/chat/completions',
  deepseek:   'https://api.deepseek.com/v1/chat/completions',
  xai:        'https://api.x.ai/v1/chat/completions',
};

const PROVIDER_INFO = {
  openrouter: { name: 'OpenRouter', desc: 'One key for all providers — OpenAI, Anthropic, Google, Mistral, Meta, and more. Includes a free-tier router.', url: 'https://openrouter.ai/keys', urlLabel: 'openrouter.ai/keys', modelsUrl: 'https://openrouter.ai/models', modelsUrlLabel: 'Browse all OpenRouter models →' },
  openai:     { name: 'OpenAI', desc: 'GPT-4.1, GPT-4.1 Mini/Nano, GPT-4o. Pay-per-use.', url: 'https://platform.openai.com/api-keys', urlLabel: 'platform.openai.com', modelsUrl: 'https://platform.openai.com/docs/models', modelsUrlLabel: 'Browse all OpenAI models →' },
  anthropic:  { name: 'Anthropic', desc: 'Claude Haiku 4.5, Sonnet 4.6, Opus 4.8.', url: 'https://console.anthropic.com', urlLabel: 'console.anthropic.com', modelsUrl: 'https://docs.claude.com/en/docs/about-claude/models', modelsUrlLabel: 'Browse all Anthropic models →' },
  google:     { name: 'Google Gemini', desc: 'Gemini 2.5 Flash Lite (cheapest), 2.5 Flash, 3.5 Flash (best).', url: 'https://aistudio.google.com/app/apikey', urlLabel: 'aistudio.google.com', modelsUrl: 'https://ai.google.dev/gemini-api/docs/models', modelsUrlLabel: 'Browse all Gemini models →' },
  mistral:    { name: 'Mistral AI', desc: 'European AI — Mistral Small 4 and Large 3.', url: 'https://console.mistral.ai', urlLabel: 'console.mistral.ai', modelsUrl: 'https://docs.mistral.ai/getting-started/models/models_overview/', modelsUrlLabel: 'Browse all Mistral models →' },
  meta:       { name: 'Meta / Llama', desc: 'Open-weight Llama 4 models, routed via OpenRouter.', url: 'https://openrouter.ai/keys', urlLabel: 'Use via OpenRouter', modelsUrl: 'https://openrouter.ai/meta-llama', modelsUrlLabel: 'Browse all Meta/Llama models →' },
  groq:       { name: 'Groq', desc: 'Blazing-fast inference for Llama, Qwen, GPT-OSS. Free tier.', url: 'https://console.groq.com/keys', urlLabel: 'console.groq.com', modelsUrl: 'https://console.groq.com/docs/models', modelsUrlLabel: 'Browse all Groq models →' },
  cohere:     { name: 'Cohere', desc: 'Command R+ for summarization and structured output. Free trial.', url: 'https://dashboard.cohere.com/api-keys', urlLabel: 'dashboard.cohere.com', modelsUrl: 'https://docs.cohere.com/docs/models', modelsUrlLabel: 'Browse all Cohere models →' },
  together:   { name: 'Together AI', desc: 'Open-source model hosting — Llama, DeepSeek. Free credit.', url: 'https://api.together.xyz/settings/api-keys', urlLabel: 'api.together.xyz', modelsUrl: 'https://www.together.ai/models', modelsUrlLabel: 'Browse all Together AI models →' },
  fireworks:  { name: 'Fireworks AI', desc: 'Fast open-model inference — Llama, DeepSeek. Free tier.', url: 'https://fireworks.ai/account/api-keys', urlLabel: 'fireworks.ai', modelsUrl: 'https://fireworks.ai/models', modelsUrlLabel: 'Browse all Fireworks models →' },
  deepseek:   { name: 'DeepSeek', desc: 'DeepSeek V3 (Chat) and R1 (Reasoner). Very affordable.', url: 'https://platform.deepseek.com/api_keys', urlLabel: 'platform.deepseek.com', modelsUrl: 'https://api-docs.deepseek.com/quick_start/pricing', modelsUrlLabel: 'Browse all DeepSeek models →' },
  xai:        { name: 'xAI / Grok', desc: 'Grok 4 and 4.3. Fast and capable.', url: 'https://console.x.ai', urlLabel: 'console.x.ai', modelsUrl: 'https://docs.x.ai/docs/models', modelsUrlLabel: 'Browse all xAI models →' },
};

const PROVIDER_MODELS = {
  openrouter: [
    { value: 'openrouter/auto', label: 'Auto — OpenRouter picks an available model (recommended)' },
    { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini — fast & cheap' },
    { value: 'openai/gpt-4o', label: 'GPT-4o — high quality' },
    { value: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5 — fast & cheap' },
    { value: 'deepseek/deepseek-chat', label: 'DeepSeek V3 — best value' },
    { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
    { value: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet — high quality' },
  ],
  openai: [
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini — fast & cheap' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano — cheapest' },
    { value: 'gpt-4.1', label: 'GPT-4.1 — best quality' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — fast & cheap' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 — balanced' },
    { value: 'claude-opus-4-8', label: 'Claude Opus 4.8 — most capable' },
  ],
  google: [
    { value: 'gemini-2.5-flash-lite-preview-06-17', label: 'Gemini 2.5 Flash Lite — cheapest' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash — fast' },
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — best quality' },
  ],
  mistral: [
    { value: 'mistral-small-latest', label: 'Mistral Small 4 — lightweight' },
    { value: 'mistral-large-latest', label: 'Mistral Large 3 — best quality' },
  ],
  meta: [
    { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B — free' },
    { value: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick — paid' },
  ],
  groq: [
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant — fastest' },
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile — best quality' },
    { value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B' },
  ],
  cohere: [
    { value: 'command-r-plus', label: 'Command R+ — best quality' },
    { value: 'command-r', label: 'Command R — balanced' },
  ],
  together: [
    { value: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo — cheapest' },
    { value: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo — best quality' },
    { value: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
  ],
  fireworks: [
    { value: 'accounts/fireworks/models/llama-v3p1-8b-instruct', label: 'Llama 3.1 8B — fastest' },
    { value: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B — best quality' },
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek V3 — best value' },
    { value: 'deepseek-reasoner', label: 'DeepSeek R1 — reasoning' },
  ],
  xai: [
    { value: 'grok-4.3', label: 'Grok 4.3 — fast & reliable' },
    { value: 'grok-4', label: 'Grok 4 — most capable' },
  ],
};

const PROVIDER_ORDER = Object.keys(PROVIDER_INFO);

// Built-in providers "anthropic"/"cohere" imply their own request format;
// everything else is OpenAI-compatible.
function aiFormatFor(provider) {
  return (provider === 'anthropic' || provider === 'cohere') ? provider : 'openai';
}

// Resolve the effective AI config (provider/key/model/endpoint/format) from a
// settings object's per-provider maps.
function activeAI(s) {
  const provider = s.aiProvider || 'openrouter';
  const apiKey   = (s.aiApiKeys && s.aiApiKeys[provider]) || '';
  const model    = (s.aiModels && s.aiModels[provider]) || (PROVIDER_MODELS[provider] && PROVIDER_MODELS[provider][0] && PROVIDER_MODELS[provider][0].value) || '';
  const endpoint = (s.aiEndpoints && s.aiEndpoints[provider]) || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openrouter;
  return { provider, apiKey, model, endpoint, format: aiFormatFor(provider) };
}

// Ensure the per-provider maps exist and migrate the legacy single OpenRouter
// apiKey/model into them. Keeps s.apiKey / s.model mirrored to the *active*
// provider so existing call sites keep working.
function normalizeAISettings(s) {
  s.aiProvider  = s.aiProvider || 'openrouter';
  // Clone the maps so currentSettings and savedSettings never share references
  // (a shallow {...DEFAULT_SETTINGS} spread would otherwise alias them).
  s.aiApiKeys   = { ...(s.aiApiKeys   || {}) };
  s.aiModels    = { ...(s.aiModels    || {}) };
  s.aiEndpoints = { ...(s.aiEndpoints || {}) };
  s.pollSecs    = { ...(s.pollSecs    || {}) };
  // One-time migration from the old single-key/model fields.
  if (!('openrouter' in s.aiApiKeys) && s.apiKey) s.aiApiKeys.openrouter = s.apiKey;
  if (!('openrouter' in s.aiModels)  && s.model)  s.aiModels.openrouter  = s.model;
  // Repair OpenRouter model IDs that shipped earlier but are no longer valid.
  const BAD_OPENROUTER = new Set([
    'google/gemini-2.5-flash', 'openai/gpt-4.1-mini', 'openai/gpt-4.1-nano',
    'anthropic/claude-haiku-4.5', 'anthropic/claude-sonnet-4.6',
    'deepseek/deepseek-chat-v3-0324', 'meta-llama/llama-3.3-70b-instruct:free',
    'openrouter/free', 'google/gemini-flash-1.5',
  ]);
  if (BAD_OPENROUTER.has(s.aiModels.openrouter)) s.aiModels.openrouter = 'openrouter/auto';
  const a = activeAI(s);
  s.apiKey = a.apiKey;   // mirror active provider
  s.model  = a.model;
  return s;
}

// Provider-aware chat completion → returns the assistant's text content.
async function callProviderAI(messages, opts = {}) {
  const settings = opts.settings || state.currentSettings;
  const maxTokens = opts.maxTokens || 2000;
  const temperature = opts.temperature != null ? opts.temperature : 0.3;
  const { provider, apiKey, model, endpoint, format } = activeAI(settings);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    if (format === 'anthropic') { headers['anthropic-version'] = '2023-06-01'; headers['x-api-key'] = apiKey; }
    else headers['Authorization'] = `Bearer ${apiKey}`;
  }
  if (provider === 'openrouter' || provider === 'meta') {
    headers['HTTP-Referer'] = 'https://github.com/auto-dashboard-ai';
    headers['X-Title'] = 'Auto Dashboard AI';
  }

  let body;
  if (format === 'anthropic') {
    const sys = messages.find((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');
    body = { model, max_tokens: maxTokens, messages: rest };
    if (sys) body.system = sys.content;
  } else if (format === 'cohere') {
    body = { model, messages };
  } else {
    body = { model, messages, temperature, max_tokens: maxTokens };
  }

  let res;
  try {
    res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (netErr) {
    // fetch only rejects on network-level failures (DNS, offline, CORS, bad URL).
    const err = new Error(`Network error: could not reach the endpoint (${netErr.message}).`);
    err.kind = 'network';
    err.provider = provider; err.endpoint = endpoint; err.model = model;
    throw err;
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let parsed = null;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { /* non-JSON body */ }
    const apiMsg = parsed?.error?.message
      || parsed?.error?.metadata?.raw
      || parsed?.message
      || (typeof parsed?.error === 'string' ? parsed.error : '')
      || `HTTP ${res.status} ${res.statusText || ''}`.trim();
    const err = new Error(apiMsg);
    err.kind = 'http';
    err.status = res.status;
    err.statusText = res.statusText;
    err.code = parsed?.error?.code || parsed?.error?.type;
    err.provider = provider; err.endpoint = endpoint; err.model = model;
    err.body = raw;
    throw err;
  }
  const data = await res.json();
  if (format === 'anthropic') return data.content?.[0]?.text || '';
  if (format === 'cohere') return (data.message?.content || []).map((c) => c.text).join('') || data.choices?.[0]?.message?.content || '';
  return data.choices?.[0]?.message?.content || '';
}

// Per-widget polling interval (seconds): default + minimum floor. These mirror
// each widget's built-in defaults; users can override per integration via the
// Refresh-interval control in the integration modal (stored in settings.pollSecs).
const POLL_DEFAULTS = {
  tautulli: { def: 5, min: 5 },
  plex: { def: 15, min: 5 }, jellyfin: { def: 15, min: 5 }, emby: { def: 15, min: 5 },
  sabnzbd: { def: 10, min: 5 }, qbittorrent: { def: 10, min: 5 }, transmission: { def: 10, min: 5 },
  opnsense: { def: 10, min: 5 }, homeassistant: { def: 15, min: 5 }, tracearr: { def: 15, min: 10 },
  uptimekuma: { def: 30, min: 5 }, pihole: { def: 30, min: 10 }, adguard: { def: 30, min: 10 },
  unifi: { def: 30, min: 10 }, proxmox: { def: 30, min: 10 }, peanut: { def: 30, min: 10 },
  ntfy: { def: 30, min: 10 }, beszel: { def: 30, min: 10 }, portainer: { def: 15, min: 5 },
  stocks: { def: 300, min: 60 },
  glances: { def: 30, min: 10 }, dashdot: { def: 30, min: 10 }, unraid: { def: 30, min: 10 },
  openmediavault: { def: 30, min: 10 }, truenas: { def: 30, min: 10 },
  seerr: { def: 60, min: 15 }, prowlarr: { def: 60, min: 15 }, speedtest: { def: 60, min: 15 },
  umami: { def: 60, min: 15 }, audiobookshelf: { def: 60, min: 15 }, pbs: { def: 60, min: 15 },
  navidrome: { def: 60, min: 20 }, nextcloud: { def: 60, min: 20 },
  sonarr: { def: 300, min: 15 }, radarr: { def: 300, min: 15 },
  ical: { def: 600, min: 60 },
};
const POLL_OPTIONS = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

// Effective poll interval (ms) for an integration, honoring the user override
// and the per-widget minimum floor. Returns undefined for non-widget entries.
function pollMsFor(id) {
  const d = POLL_DEFAULTS[id];
  if (!d) return undefined;
  const stored = state.currentSettings && state.currentSettings.pollSecs && state.currentSettings.pollSecs[id];
  return Math.max(d.min, parseInt(stored, 10) || d.def) * 1000;
}

// Merge the resolved pollMs into a widget config without clobbering it when
// there's no value (avoids overwriting a widget's own default with undefined).
function withPoll(id, cfg) {
  const pm = pollMsFor(id);
  return pm ? Object.assign({ pollMs: pm }, cfg) : cfg;
}

function fmtInterval(secs) {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return secs % 60 === 0 ? `${secs / 60} min` : `${(secs / 60).toFixed(1)} min`;
  return `${secs / 3600} hr`;
}

const DEFAULT_SETTINGS = {
  apiKey: '',
  model: 'google/gemini-flash-1.5',
  aiProvider: 'openrouter',
  aiApiKeys: {},     // { providerId: apiKey }
  aiModels: {},      // { providerId: model }
  aiEndpoints: {},   // { providerId: endpointOverride }
  theme: 'auto',     // 'auto' = follow OS light/dark; otherwise a named theme
  newTabOverride: false,  // show the dashboard on new tabs (off by default)
  openOnStartup: false,   // open the dashboard when the browser launches (off by default)
  syncBookmarks: false,   // mirror dashboard links into a "Dashboard AI" bookmark-bar folder
  gistSync: false,        // back up settings + dashboards to a private GitHub Gist
  gistToken: '',          // fine-grained GitHub token (gists scope) for Gist backup
  gistAutoSync: false,    // auto-load a newer Gist backup (one-way pull; push stays manual)
  backupPassphrase: '',   // optional — encrypts the Gist backup before upload
  searchEnabled: true,    // show the dashboard search bar (on by default)
  dashboardSwitcher: 'dropdown',  // 'dropdown' | 'tabs' | 'sidebar'
  pollSecs: {},      // { integrationId: refreshIntervalSeconds } — per-widget override
  integrationDescriptions: {},  // { serviceKey: 'short label' } — identifies a configuration
  customThemes: [],             // [{ id, name, colors:{...} }] — user-created themes
  instances: {},                // { intId: [{ id, name, validated, fields:{...} }] } — multi-endpoint configs
  clockFormat: '12',
  dateVisible: true,
  dateFormat: 'long',
  weatherEnabled: false,
  weatherProvider: '',            // '' = derive ('openweathermap' if a key exists, else 'openmeteo'); set explicitly once chosen
  weatherApiKey: '',
  weatherLocation: '',
  weatherLat: null,               // resolved via Open-Meteo geocoding (used by both providers)
  weatherLon: null,
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
  jellyfinEnabled: false,
  jellyfinUrl: '',
  jellyfinApiKey: '',
  embyEnabled: false,
  embyUrl: '',
  embyApiKey: '',
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
  portainerEnabled: false, portainerUrl: '', portainerApiKey: '',
  stocksEnabled: false, stocksSymbols: 'AAPL, MSFT, NVDA',
  countdownEnabled: false, countdownItems: [], countdownExpired: 'started', countdownUnits: ['years', 'months', 'days', 'hours', 'minutes', 'seconds'],
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
  jellyfinValidated: false,
  jellyfinPreviewWidget: null,
  embyValidated: false,
  embyPreviewWidget: null,
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
  portainerValidated: false, portainerPreviewWidget: null,
  stocksValidated: false, stocksPreviewWidget: null,
  countdownValidated: false, countdownPreviewWidget: null,
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
  // Keep the header version badge in sync with the manifest (never hard-code it).
  try {
    const v = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : null;
    const verEl = document.getElementById('app-version');
    if (v && verEl) verEl.textContent = 'v' + v;
  } catch (_) { /* ignore */ }
  await loadSettings();
  await loadDashboards();
  setupNavigation();
  setupSettingsListeners();
  setupBookmarkControls();
  setupDashEditModal();
  setupIntegrationsCatalog();
  setupDashboardSetup();
  setupWizard();

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
    state.savedSettings   = normalizeAISettings({ ...DEFAULT_SETTINGS, ...stored.settings });
    state.currentSettings = normalizeAISettings({ ...DEFAULT_SETTINGS, ...stored.settings });
    state.apiKeyValidated          = !!state.currentSettings.apiKey;
    state.weatherApiKeyValidated   = !!stored.settings.weatherApiKey;
    state.tautulliApiKeyValidated  = !!(stored.settings.tautulliApiKey && stored.settings.tautulliUrl);
    state.uptimeKumaValidated      = !!stored.settings.uptimeKumaUrl;
    state.sonarrValidated          = !!(stored.settings.sonarrUrl && stored.settings.sonarrApiKey);
    state.radarrValidated          = !!(stored.settings.radarrUrl && stored.settings.radarrApiKey);
    state.seerrValidated           = !!(stored.settings.seerrUrl && stored.settings.seerrApiKey);
    state.piholeValidated          = !!(stored.settings.piholeUrl && stored.settings.piholeApiKey);
    state.adguardValidated         = !!(stored.settings.adguardUrl && stored.settings.adguardUsername);
    state.plexValidated            = !!(stored.settings.plexUrl && stored.settings.plexToken);
    state.jellyfinValidated        = !!(stored.settings.jellyfinUrl && stored.settings.jellyfinApiKey);
    state.embyValidated            = !!(stored.settings.embyUrl && stored.settings.embyApiKey);
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
    state.portainerValidated       = !!(stored.settings.portainerUrl && stored.settings.portainerApiKey);
    state.stocksValidated          = !!(stored.settings.stocksSymbols && String(stored.settings.stocksSymbols).trim());
    state.countdownValidated       = Array.isArray(stored.settings.countdownItems) && stored.settings.countdownItems.length > 0;
    state.pbsValidated             = !!(stored.settings.pbsUrl && stored.settings.pbsApiKey);
    state.beszelValidated          = !!(stored.settings.beszelUrl && stored.settings.beszelUsername);
    state.icalValidated            = !!stored.settings.icalUrl;
    state.homeassistantValidated   = !!(stored.settings.homeassistantUrl && stored.settings.homeassistantToken);
    state.nextcloudValidated       = !!(stored.settings.nextcloudUrl && stored.settings.nextcloudUsername);
    state.opnsenseValidated        = !!(stored.settings.opnsenseUrl && stored.settings.opnsenseKey && stored.settings.opnsenseSecret);

    // Backfill descriptions for integrations enabled before this feature shipped:
    // default each to its integration name so every configuration is labelled.
    const descs = state.currentSettings.integrationDescriptions =
      Object.assign({}, state.currentSettings.integrationDescriptions);
    INTEGRATIONS.forEach((e) => {
      const k = e.enabledKey.replace(/Enabled$/, '');
      if (state.currentSettings[e.enabledKey] && !descs[k]) descs[k] = e.name.slice(0, 20);
    });
  }
  // Multi-endpoint migration: fold legacy flat config into instances[intId].
  if (window.Endpoints) {
    const names = {}; INTEGRATIONS.forEach((e) => { names[e.id] = e.name; });
    Endpoints.migrate(state.savedSettings, names);
    Endpoints.migrate(state.currentSettings, names);
  }
  // countdownItems is an array edited in place — give saved/current their own
  // copies so editing one never aliases the other (breaks change detection).
  const cloneArr = (v) => (Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : []);
  state.savedSettings.countdownItems = cloneArr(state.savedSettings.countdownItems);
  state.currentSettings.countdownItems = cloneArr(state.currentSettings.countdownItems);
  applySettingsToUI();
  updateSaveBar();
}

// ─── Theme ──────────────────────────────────────────────────────────────────
// Sets the named theme on <html> (overriding the design tokens in common.css).
// 'auto' / empty removes the attribute so the OS light/dark default applies.
function applyTheme(theme) {
  const t = theme && theme !== 'auto' ? theme : null;
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

function renderThemePicker() {
  const grid = document.getElementById('theme-grid');
  if (!grid) return;
  const current = state.currentSettings.theme || 'auto';
  grid.querySelectorAll('.theme-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.theme === current);
  });
  renderCustomThemes();
}

// ─── Custom themes ────────────────────────────────────────────────────────────
// A custom theme = { id:'custom-xxxx', name, colors:{ bgPrimary, bgSecondary,
// textPrimary, textMuted, border, accent } }. The remaining design tokens are
// derived. The full set is injected as html[data-theme="custom-xxxx"] rules.
const CT_FIELDS = [
  ['bgPrimary', 'Page background', '#0f0f13'],
  ['bgSecondary', 'Card / surface', '#1a1a24'],
  ['textPrimary', 'Text', '#e2e8f0'],
  ['textMuted', 'Muted text', '#a8bac8'],
  ['border', 'Borders', '#2a2a3e'],
  ['accent', 'Accent', '#6366f1'],
];

// Pure color/derivation helpers live in the shared theme-engine.js.
const TE = (typeof window !== 'undefined' && window.ThemeEngine) || {};
const ctContrast = (a, b) => TE.contrast(a, b);
const ctValidHex = (v) => TE.validHex(v);
const ctNormHex = (v) => TE.normHex(v);
function injectCustomThemeStyles(themes) { window.ThemeEngine.injectCustomThemeStyles(themes || []); }
function applyCustomThemeStyles() { injectCustomThemeStyles(state.currentSettings.customThemes || []); }

// Swatches (page bg, card bg, text, accent) for a custom-theme card.
function ctSwatches(c) {
  return `<div class="theme-swatches">` +
    [c.bgPrimary, c.bgSecondary, c.textPrimary, c.accent]
      .map((col) => `<span class="swatch" style="background:${escapeHtml(col)}"></span>`).join('') +
    `</div>`;
}

function renderCustomThemes() {
  const grid = document.getElementById('custom-theme-grid');
  if (!grid) return;
  applyCustomThemeStyles();
  const current = state.currentSettings.theme || 'auto';
  const themes = state.currentSettings.customThemes || [];
  grid.innerHTML = '';
  themes.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'theme-card ct-card' + (t.id === current ? ' active' : '');
    card.dataset.theme = t.id;
    card.innerHTML = ctSwatches(t.colors || {}) +
      `<div class="theme-name">${escapeHtml(t.name || 'Custom')}</div>` +
      `<button class="ct-del" type="button" title="Delete theme" aria-label="Delete theme">✕</button>`;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.ct-del')) { e.stopPropagation(); deleteCustomTheme(t.id); return; }
      state.currentSettings.theme = t.id;
      applyTheme(t.id);
      renderThemePicker();
      updateSaveBar();
    });
    grid.appendChild(card);
  });
}

function deleteCustomTheme(id) {
  const list = state.currentSettings.customThemes || [];
  state.currentSettings.customThemes = list.filter((t) => t.id !== id);
  if (state.currentSettings.theme === id) { state.currentSettings.theme = 'auto'; applyTheme('auto'); }
  applyCustomThemeStyles();
  renderThemePicker();
  updateSaveBar();
}

function addCustomTheme(name, colors, select) {
  const id = 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const theme = { id, name: (name || 'Custom').slice(0, 24), colors };
  if (!Array.isArray(state.currentSettings.customThemes)) state.currentSettings.customThemes = [];
  state.currentSettings.customThemes.push(theme);
  applyCustomThemeStyles();
  if (select) { state.currentSettings.theme = id; applyTheme(id); }
  renderThemePicker();
  updateSaveBar();
  return theme;
}

// ─── Add-theme modal ──────────────────────────────────────────────────────────
const ctModalState = { aiThemes: [], aiSelected: new Set(), manual: {} };

// Minimum WCAG AA contrast for body text.
const CT_MIN_CONTRAST = 4.5;
function ctTextContrast(c) {
  return Math.min(ctContrast(c.textPrimary, c.bgPrimary), ctContrast(c.textPrimary, c.bgSecondary));
}
function ctMissing(c) { return CT_FIELDS.filter(([k]) => !ctValidHex(c[k])).map(([, label]) => label); }

function openCustomThemeModal() {
  ctModalState.aiThemes = []; ctModalState.aiSelected = new Set();
  ctModalState.manual = {}; CT_FIELDS.forEach(([k, , def]) => { ctModalState.manual[k] = def; });
  document.getElementById('ct-prompt').value = '';
  document.getElementById('ct-name').value = '';
  document.getElementById('ct-ai-warn').textContent = '';
  document.getElementById('ct-palettes').innerHTML = '';
  buildManualRows();
  setCtMode('ai');
  document.getElementById('custom-theme-modal').classList.add('visible');
}
function closeCustomThemeModal() { document.getElementById('custom-theme-modal').classList.remove('visible'); }

function setCtMode(mode) {
  document.querySelectorAll('.ct-tab').forEach((b) => b.classList.toggle('active', b.dataset.ctmode === mode));
  document.getElementById('ct-pane-ai').classList.toggle('active', mode === 'ai');
  document.getElementById('ct-pane-manual').classList.toggle('active', mode === 'manual');
  document.getElementById('ct-save-manual').style.display = mode === 'manual' ? '' : 'none';
  const addSel = document.getElementById('ct-add-selected');
  addSel.style.display = mode === 'ai' ? '' : 'none';
  if (mode === 'ai') updateCtAddSelected();
}

// ── Manual tab ──
function buildManualRows() {
  const wrap = document.getElementById('ct-color-rows');
  wrap.innerHTML = '';
  CT_FIELDS.forEach(([key, label]) => {
    const row = document.createElement('div');
    row.className = 'ct-color-row';
    const val = ctNormHex(ctModalState.manual[key] || '#000000');
    row.innerHTML =
      `<input type="color" value="${val}" data-ctk="${key}" aria-label="${escapeHtml(label)}">` +
      `<label>${escapeHtml(label)}</label>` +
      `<input type="text" value="${val}" data-ctk="${key}" maxlength="7" spellcheck="false">`;
    const [picker, , text] = row.children;
    picker.addEventListener('input', () => {
      ctModalState.manual[key] = picker.value; text.value = picker.value; refreshManualPreview();
    });
    text.addEventListener('input', () => {
      const v = text.value.trim();
      if (ctValidHex(v)) { const n = ctNormHex(v); ctModalState.manual[key] = n; picker.value = n; }
      refreshManualPreview();
    });
    wrap.appendChild(row);
  });
  refreshManualPreview();
}
function refreshManualPreview() {
  const c = ctModalState.manual;
  const prev = document.getElementById('ct-manual-prev');
  prev.innerHTML =
    `<span class="seg" style="background:${escapeHtml(c.bgPrimary)};color:${escapeHtml(c.textPrimary)}">Page</span>` +
    `<span class="seg" style="background:${escapeHtml(c.bgSecondary)};color:${escapeHtml(c.textPrimary)}">Card</span>` +
    `<span class="seg" style="background:${escapeHtml(c.accent)};color:#fff">Accent</span>`;
  const warn = document.getElementById('ct-manual-warn');
  const missing = ctMissing(c);
  if (missing.length) { warn.style.color = 'var(--danger)'; warn.textContent = `Enter a valid hex for: ${missing.join(', ')}.`; return; }
  const ratio = ctTextContrast(c);
  if (ratio < CT_MIN_CONTRAST) {
    warn.style.color = 'var(--warning)';
    warn.textContent = `Text contrast is ${ratio.toFixed(1)}:1 — below the 4.5:1 readability guideline. You can still save it.`;
  } else { warn.style.color = 'var(--text-muted)'; warn.textContent = `Text contrast ${ratio.toFixed(1)}:1 ✓ meets WCAG AA.`; }
}
function saveManualTheme() {
  const c = ctModalState.manual;
  const missing = ctMissing(c);
  if (missing.length) { refreshManualPreview(); return; }
  const name = (document.getElementById('ct-name').value || '').trim() || 'Custom';
  const colors = {}; CT_FIELDS.forEach(([k]) => { colors[k] = ctNormHex(c[k]); });
  addCustomTheme(name, colors, true);
  closeCustomThemeModal();
}

// ── AI tab ──
async function generateAiPalettes() {
  const desc = (document.getElementById('ct-prompt').value || '').trim();
  const warn = document.getElementById('ct-ai-warn');
  const btn = document.getElementById('ct-generate');
  if (!desc) { warn.style.color = 'var(--warning)'; warn.textContent = 'Describe the theme first.'; return; }
  if (!activeAI(state.currentSettings).apiKey) {
    warn.style.color = 'var(--warning)';
    warn.textContent = 'Add an AI API key in the AI subtab to generate palettes — or use the Manual tab.';
    return;
  }
  btn.disabled = true;
  warn.style.color = 'var(--text-muted)';
  warn.innerHTML = '<span class="ct-spinner"></span>Generating accessible palettes…';
  const sys = 'You are a UI color designer. Return ONLY valid JSON: an array of exactly 3 objects, no prose, no markdown fences. ' +
    'Each object: {"name":string,"bgPrimary":hex,"bgSecondary":hex,"textPrimary":hex,"textMuted":hex,"border":hex,"accent":hex}. ' +
    'bgPrimary=page background, bgSecondary=card/surface (slightly different from bgPrimary), textPrimary=body text, ' +
    'textMuted=secondary text, border=subtle separators, accent=primary action color. ' +
    'CRITICAL accessibility: textPrimary must have a WCAG contrast ratio of at least 4.7:1 against BOTH bgPrimary and bgSecondary. ' +
    'Give each palette a short evocative name. The 3 palettes should be distinct interpretations.';
  const user = `Theme description: "${desc}". Generate 3 distinct, accessible palettes.`;
  try {
    const raw = await callProviderAI(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { maxTokens: 1200, temperature: 0.7, settings: state.currentSettings }
    );
    const themes = parseAiPalettes(raw);
    if (!themes.length) throw new Error('No usable palettes returned.');
    ctModalState.aiThemes = themes; ctModalState.aiSelected = new Set();
    renderAiPalettes();
    warn.style.color = 'var(--text-muted)';
    warn.textContent = 'Select one or more palettes, then “Add selected”.';
  } catch (err) {
    warn.style.color = 'var(--danger)';
    warn.textContent = `Could not generate palettes: ${err.message}`;
  } finally {
    btn.disabled = false;
  }
}
function parseAiPalettes(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('['); const end = s.lastIndexOf(']');
  if (start !== -1 && end !== -1) s = s.slice(start, end + 1);
  let arr;
  try { arr = JSON.parse(s); } catch (_) { return []; }
  if (!Array.isArray(arr)) return [];
  return arr.map((o) => {
    const colors = {};
    CT_FIELDS.forEach(([k]) => { colors[k] = ctValidHex(o[k]) ? ctNormHex(o[k]) : null; });
    return { name: String(o.name || 'Custom').slice(0, 24), colors };
  }).filter((t) => CT_FIELDS.every(([k]) => t.colors[k]));
}
function renderAiPalettes() {
  const wrap = document.getElementById('ct-palettes');
  wrap.innerHTML = '';
  ctModalState.aiThemes.forEach((t, i) => {
    const c = t.colors;
    const ratio = ctTextContrast(c);
    const ok = ratio >= CT_MIN_CONTRAST;
    const el = document.createElement('div');
    el.className = 'ct-pal' + (ctModalState.aiSelected.has(i) ? ' selected' : '');
    el.innerHTML =
      `<div class="ct-pal-top">` +
        `<span class="ct-pal-name">${escapeHtml(t.name)}</span>` +
        `<span class="ct-pal-badge ${ok ? 'ok' : 'warn'}">${ratio.toFixed(1)}:1 ${ok ? 'AA ✓' : 'low'}</span>` +
        `<span class="ct-pal-check">✓ selected</span>` +
      `</div>` +
      `<div class="ct-pal-prev">` +
        `<span class="seg" style="background:${c.bgPrimary};color:${c.textPrimary}">Page</span>` +
        `<span class="seg" style="background:${c.bgSecondary};color:${c.textPrimary}">Card</span>` +
        `<span class="seg" style="background:${c.bgSecondary};color:${c.textMuted}">Muted</span>` +
        `<span class="seg" style="background:${c.accent};color:#fff">Accent</span>` +
      `</div>`;
    el.addEventListener('click', () => {
      if (ctModalState.aiSelected.has(i)) ctModalState.aiSelected.delete(i);
      else ctModalState.aiSelected.add(i);
      el.classList.toggle('selected');
      updateCtAddSelected();
    });
    wrap.appendChild(el);
  });
  updateCtAddSelected();
}
function updateCtAddSelected() {
  const btn = document.getElementById('ct-add-selected');
  const n = ctModalState.aiSelected.size;
  btn.disabled = n === 0;
  btn.textContent = n > 1 ? `Add ${n} themes` : 'Add selected';
}
function addSelectedAiThemes() {
  const idx = [...ctModalState.aiSelected].sort((a, b) => a - b);
  idx.forEach((i, n) => {
    const t = ctModalState.aiThemes[i];
    addCustomTheme(t.name, t.colors, n === idx.length - 1); // select the last one added
  });
  if (idx.length) closeCustomThemeModal();
}

function setupCustomThemeModal() {
  const addBtn = document.getElementById('add-custom-theme');
  if (!addBtn || addBtn.dataset.wired) return;
  addBtn.dataset.wired = '1';
  addBtn.addEventListener('click', openCustomThemeModal);
  document.getElementById('ct-close')?.addEventListener('click', closeCustomThemeModal);
  document.getElementById('ct-cancel')?.addEventListener('click', closeCustomThemeModal);
  document.getElementById('custom-theme-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'custom-theme-modal') closeCustomThemeModal();
  });
  document.querySelectorAll('.ct-tab').forEach((b) => b.addEventListener('click', () => setCtMode(b.dataset.ctmode)));
  document.getElementById('ct-generate')?.addEventListener('click', generateAiPalettes);
  document.getElementById('ct-add-selected')?.addEventListener('click', addSelectedAiThemes);
  document.getElementById('ct-save-manual')?.addEventListener('click', saveManualTheme);
}

// Keep state.currentSettings.apiKey / .model mirrored to the active provider's
// values (legacy fields read by generateDashboard and the save bar).
function syncActiveMirror() {
  const a = activeAI(state.currentSettings);
  state.currentSettings.apiKey = a.apiKey;
  state.currentSettings.model = a.model;
}

// Read the model from the UI (custom field overrides the dropdown) into the
// active provider's entry.
function setModelFromUI() {
  const p = state.currentSettings.aiProvider;
  const custom = (document.getElementById('ai-custom-model')?.value || '').trim();
  const model = custom || modelSelect.value;
  state.currentSettings.aiModels = { ...state.currentSettings.aiModels, [p]: model };
  syncActiveMirror();
}

// Render the AI Provider card from the current per-provider maps.
function renderAIProviderUI() {
  const s = state.currentSettings;
  const provider = s.aiProvider || 'openrouter';
  const info = PROVIDER_INFO[provider] || {};

  const psel = document.getElementById('ai-provider-select');
  if (psel) {
    if (!psel.dataset.built) {
      PROVIDER_ORDER.forEach((id) => {
        const o = document.createElement('option');
        o.value = id; o.textContent = PROVIDER_INFO[id].name;
        psel.appendChild(o);
      });
      psel.dataset.built = '1';
    }
    psel.value = provider;
  }

  const desc = document.getElementById('ai-provider-desc');
  if (desc) desc.innerHTML = info.desc || '';
  const keyLink = document.getElementById('ai-provider-key-link');
  if (keyLink) { keyLink.href = info.url || '#'; keyLink.textContent = info.urlLabel || info.url || ''; }
  const modelsLink = document.getElementById('ai-provider-models-link');
  if (modelsLink) { modelsLink.href = info.modelsUrl || '#'; modelsLink.textContent = info.modelsUrlLabel || ''; modelsLink.style.display = info.modelsUrl ? '' : 'none'; }

  if (apiKeyInput) apiKeyInput.value = (s.aiApiKeys && s.aiApiKeys[provider]) || '';

  // model dropdown
  if (modelSelect) {
    modelSelect.innerHTML = '';
    (PROVIDER_MODELS[provider] || []).forEach((m) => {
      const o = document.createElement('option');
      o.value = m.value; o.textContent = m.label;
      modelSelect.appendChild(o);
    });
    const model = (s.aiModels && s.aiModels[provider]) || (PROVIDER_MODELS[provider]?.[0]?.value) || '';
    const known = (PROVIDER_MODELS[provider] || []).some((m) => m.value === model);
    const custom = document.getElementById('ai-custom-model');
    if (known) { modelSelect.value = model; if (custom) custom.value = ''; }
    else { if (PROVIDER_MODELS[provider]?.[0]) modelSelect.value = PROVIDER_MODELS[provider][0].value; if (custom) custom.value = model; }
  }

  const ep = document.getElementById('ai-endpoint');
  if (ep) { ep.value = (s.aiEndpoints && s.aiEndpoints[provider]) || ''; ep.placeholder = PROVIDER_ENDPOINTS[provider] || ''; }
}

function applySettingsToUI() {
  const s = state.currentSettings;

  // AI provider — renders provider / key / model / endpoint from the
  // per-provider maps in state.currentSettings.
  renderAIProviderUI();

  // Theme
  applyTheme(s.theme);
  renderThemePicker();

  // Clock format
  const clockEl = document.getElementById(`clock-${s.clockFormat || '12'}`);
  if (clockEl) clockEl.checked = true;

  // Date visible toggle + format section
  const dateVisible = s.dateVisible !== false; // default true
  const dateVisibleToggle = document.getElementById('date-visible-toggle');
  if (dateVisibleToggle) dateVisibleToggle.checked = dateVisible;
  const dateSection = document.getElementById('date-format-section');
  if (dateSection) dateSection.style.display = dateVisible ? 'block' : 'none';

  // Startup & new-tab toggles (both default off)
  const ntToggle = document.getElementById('newtab-override-toggle');
  if (ntToggle) ntToggle.checked = s.newTabOverride === true;
  const startToggle = document.getElementById('open-on-startup-toggle');
  if (startToggle) startToggle.checked = s.openOnStartup === true;
  const syncBmToggle = document.getElementById('sync-bookmarks-toggle');
  if (syncBmToggle) syncBmToggle.checked = s.syncBookmarks === true;
  const gistToggle = document.getElementById('gist-sync-toggle');
  if (gistToggle) gistToggle.checked = s.gistSync === true;
  const gistAutoEl = document.getElementById('gist-autosync-toggle');
  if (gistAutoEl) gistAutoEl.checked = s.gistAutoSync === true;
  const gistTokenEl = document.getElementById('gist-token');
  if (gistTokenEl) gistTokenEl.value = s.gistToken || '';
  const passEl = document.getElementById('backup-passphrase');
  if (passEl) passEl.value = s.backupPassphrase || '';
  if (typeof updateGistControls === 'function') updateGistControls();
  const searchToggle = document.getElementById('search-enabled-toggle');
  if (searchToggle) searchToggle.checked = s.searchEnabled !== false;
  const switcherStyle = s.dashboardSwitcher || 'dropdown';
  const switcherRadio = document.querySelector(`input[name="switcher-style"][value="${switcherStyle}"]`);
  if (switcherRadio) switcherRadio.checked = true;

  // Date format
  const dateFormatEl = document.getElementById('date-format-select');
  if (dateFormatEl) dateFormatEl.value = s.dateFormat || 'long';

  // Weather toggle
  const weatherToggle = document.getElementById('weather-toggle');
  if (weatherToggle) {
    weatherToggle.checked = !!s.weatherEnabled;
    document.getElementById('weather-config').style.display = s.weatherEnabled ? 'block' : 'none';
  }

  // Weather provider selection + show/hide the OWM key section
  const wxProvider = s.weatherProvider || (s.weatherApiKey ? 'openweathermap' : 'openmeteo');
  const wxProvEl = document.querySelector(`input[name="weather-provider"][value="${wxProvider}"]`);
  if (wxProvEl) wxProvEl.checked = true;
  const wxKeySec = document.getElementById('weather-owm-key-section');
  if (wxKeySec) wxKeySec.style.display = wxProvider === 'openweathermap' ? '' : 'none';
  document.querySelectorAll('.wx-prov').forEach((el) => { const i = el.querySelector('input'); el.classList.toggle('selected', !!(i && i.checked)); });

  // Weather API key
  const weatherKeyEl = document.getElementById('weather-api-key');
  if (weatherKeyEl) weatherKeyEl.value = s.weatherApiKey || '';

  // Weather location (legacy element; no-op when absent)
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

  // Weather preview button reflects whether we have a validated key + location
  updateWeatherPreviewButton();

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

  // Jellyfin / Emby
  ['jellyfin', 'emby'].forEach((svc) => {
    const toggle = document.getElementById(`${svc}-toggle`);
    if (toggle) {
      toggle.checked = !!s[`${svc}Enabled`];
      const cfg = document.getElementById(`${svc}-config`);
      if (cfg) cfg.style.display = s[`${svc}Enabled`] ? 'block' : 'none';
    }
    const urlEl = document.getElementById(`${svc}-url`);
    if (urlEl) urlEl.value = s[`${svc}Url`] || '';
    const keyEl = document.getElementById(`${svc}-api-key`);
    if (keyEl) keyEl.value = s[`${svc}ApiKey`] || '';
    updateMediaServerPreviewButton(svc);
  });

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
  setToggle('portainer'); setVal('portainer-url', s.portainerUrl); setVal('portainer-api-key', s.portainerApiKey);
  updatePortainerPreviewButton();
  setToggle('stocks'); setVal('stocks-symbols', s.stocksSymbols);
  updateStocksPreviewButton();
  setToggle('countdown');
  setVal('countdown-expired', s.countdownExpired || 'started');
  renderCountdownItems();
  renderCountdownUnits();
  updateCountdownPreviewButton();
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
// Eye icons (Feather-style, themed via currentColor). Open eye = "click to
// show" (field currently hidden); slashed eye = "click to hide" (field shown).
const EYE_OPEN = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF  = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20C5 20 1 12 1 12a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// Set a secret field + its toggle button to the given visibility.
function applyEyeballState(input, btn, visible) {
  if (!input || !btn) return;
  if (visible) {
    input.type     = 'text';
    btn.innerHTML  = EYE_OFF;   // action: hide
    btn.title      = 'Hide';
  } else {
    input.type     = 'password';
    btn.innerHTML  = EYE_OPEN;  // action: show
    btn.title      = 'Show';
  }
}

function setupEyeballToggle(inputId, btnId) {
  const input = document.getElementById(inputId);
  const btn   = document.getElementById(btnId);
  if (!input || !btn) return;
  // Reflect the field's current state (HTML defaults to type="text" = visible).
  applyEyeballState(input, btn, input.type !== 'password');
  btn.addEventListener('click', () => {
    applyEyeballState(input, btn, input.type === 'password');  // flip
  });
}

function setupSettingsListeners() {
  // Settings sub-tabs (AI / Theme / Startup / Clock).
  document.querySelectorAll('.set-subnav .set-subtab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.sub;
      document.querySelectorAll('.set-subnav .set-subtab').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.set-sub').forEach((p) => p.classList.toggle('active', p.id === `set-sub-${sub}`));
    });
  });

  // Eyeball toggles — both API key fields start visible
  setupEyeballToggle('api-key', 'api-key-toggle');
  setupEyeballToggle('weather-api-key', 'weather-key-toggle');

  // Provider switch
  document.getElementById('ai-provider-select')?.addEventListener('change', (e) => {
    state.currentSettings.aiProvider = e.target.value;
    syncActiveMirror();
    state.apiKeyValidated = false;
    hideValidationResult();
    renderAIProviderUI();
    updateSaveBar();
  });

  // API key (per active provider)
  apiKeyInput.addEventListener('input', () => {
    const p = state.currentSettings.aiProvider;
    state.currentSettings.aiApiKeys = { ...state.currentSettings.aiApiKeys, [p]: apiKeyInput.value.trim() };
    syncActiveMirror();
    state.apiKeyValidated = false;
    updateSaveBar();
    hideValidationResult();
  });

  // Model (dropdown + custom override). An explicit dropdown pick wins over any
  // existing custom id — otherwise a leftover custom value silently overrides
  // the dropdown and the change never registers (no Save prompt).
  modelSelect.addEventListener('change', () => {
    const custom = document.getElementById('ai-custom-model');
    if (custom) custom.value = '';
    setModelFromUI();
    updateSaveBar();
  });
  document.getElementById('ai-custom-model')?.addEventListener('input', () => { setModelFromUI(); updateSaveBar(); });

  // Endpoint override (advanced)
  document.getElementById('ai-endpoint')?.addEventListener('input', () => {
    const p = state.currentSettings.aiProvider;
    const v = document.getElementById('ai-endpoint').value.trim();
    const eps = { ...state.currentSettings.aiEndpoints };
    if (!v || v === PROVIDER_ENDPOINTS[p]) delete eps[p]; else eps[p] = v;
    state.currentSettings.aiEndpoints = eps;
    updateSaveBar();
  });
  document.getElementById('ai-endpoint-reset')?.addEventListener('click', () => {
    const p = state.currentSettings.aiProvider;
    const eps = { ...state.currentSettings.aiEndpoints }; delete eps[p];
    state.currentSettings.aiEndpoints = eps;
    const ep = document.getElementById('ai-endpoint'); if (ep) ep.value = '';
    updateSaveBar();
  });

  validateBtn.addEventListener('click', validateApiKey);
  saveBtn.addEventListener('click', saveSettings);
  discardBtn.addEventListener('click', discardChanges);

  // Theme picker — applies a live preview immediately; persisted on Save.
  document.getElementById('theme-grid')?.addEventListener('click', (e) => {
    const card = e.target.closest('.theme-card');
    if (!card) return;
    state.currentSettings.theme = card.dataset.theme;
    applyTheme(state.currentSettings.theme);
    renderThemePicker();
    updateSaveBar();
  });

  setupCustomThemeModal();

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

  // Startup & new-tab toggles
  const ntToggle = document.getElementById('newtab-override-toggle');
  if (ntToggle) ntToggle.addEventListener('change', () => {
    state.currentSettings.newTabOverride = ntToggle.checked; updateSaveBar();
  });
  const startToggle = document.getElementById('open-on-startup-toggle');
  if (startToggle) startToggle.addEventListener('change', () => {
    state.currentSettings.openOnStartup = startToggle.checked; updateSaveBar();
  });
  const syncBmToggle = document.getElementById('sync-bookmarks-toggle');
  if (syncBmToggle) syncBmToggle.addEventListener('change', () => {
    state.currentSettings.syncBookmarks = syncBmToggle.checked; updateSaveBar();
  });
  const gistToggle = document.getElementById('gist-sync-toggle');
  if (gistToggle) gistToggle.addEventListener('change', () => {
    state.currentSettings.gistSync = gistToggle.checked; updateSaveBar(); updateGistControls();
  });
  const gistAutoEl = document.getElementById('gist-autosync-toggle');
  if (gistAutoEl) gistAutoEl.addEventListener('change', () => {
    state.currentSettings.gistAutoSync = gistAutoEl.checked; updateSaveBar();
  });
  const gistTokenEl = document.getElementById('gist-token');
  if (gistTokenEl) gistTokenEl.addEventListener('input', () => {
    state.currentSettings.gistToken = gistTokenEl.value.trim(); updateSaveBar(); updateGistControls();
  });
  const passEl = document.getElementById('backup-passphrase');
  if (passEl) passEl.addEventListener('input', () => {
    state.currentSettings.backupPassphrase = passEl.value; updateSaveBar(); updateGistControls();
  });
  setupEyeballToggle('gist-token', 'gist-token-toggle');
  setupEyeballToggle('backup-passphrase', 'backup-passphrase-toggle');
  const gistTestBtn = document.getElementById('gist-test-btn');
  if (gistTestBtn) gistTestBtn.addEventListener('click', gistTestToken);
  const gistBackupBtn = document.getElementById('gist-backup-btn');
  if (gistBackupBtn) gistBackupBtn.addEventListener('click', async () => {
    // Embed icons first so the backup always includes them.
    const orig = gistBackupBtn.textContent;
    gistBackupBtn.disabled = true; gistBackupBtn.textContent = 'Embedding icons…';
    try { await embedDashboardIcons(); } catch (_) {}
    gistBackupBtn.disabled = false; gistBackupBtn.textContent = orig;
    gistAction('gistBackup', gistBackupBtn, 'Backing up…');
  });
  const gistRestoreBtn = document.getElementById('gist-restore-btn');
  if (gistRestoreBtn) gistRestoreBtn.addEventListener('click', () => {
    if (!confirm('Restore will REPLACE your current settings and dashboards with the GitHub Gist backup. Continue?')) return;
    gistAction('gistRestore', gistRestoreBtn, 'Restoring…');
  });
  refreshGistStatus();
  const exportBtn = document.getElementById('export-config-btn');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    const orig = exportBtn.textContent;
    exportBtn.disabled = true; exportBtn.textContent = 'Embedding icons…';
    try { await embedDashboardIcons(); } catch (_) {}
    exportBtn.disabled = false; exportBtn.textContent = orig;
    exportConfig();
  });
  const importBtn = document.getElementById('import-config-btn');
  const importFile = document.getElementById('import-config-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const f = importFile.files && importFile.files[0];
      importFile.value = '';            // allow re-importing the same file
      if (f) importConfig(f);
    });
  }
  const searchToggle = document.getElementById('search-enabled-toggle');
  if (searchToggle) searchToggle.addEventListener('change', () => {
    state.currentSettings.searchEnabled = searchToggle.checked; updateSaveBar();
  });
  document.querySelectorAll('input[name="switcher-style"]').forEach((r) => {
    r.addEventListener('change', () => {
      if (r.checked) { state.currentSettings.dashboardSwitcher = r.value; updateSaveBar(); }
    });
  });

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
      const vr = document.getElementById('weather-validation-result');
      if (vr) vr.style.display = 'none';
      updateSaveBar();
      updateWeatherPreviewButton();
      refreshIntegrationModalSave();
    });
  }

  // Weather provider switch (confirmation; cities are preserved either way).
  document.querySelectorAll('input[name="weather-provider"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const next = radio.value;
      const cur = weatherProvider();
      if (next === cur) return;
      const label = next === 'openmeteo' ? 'Open-Meteo (free, no API key)' : 'OpenWeatherMap (API key required)';
      const ok = confirm(`Switch your weather provider to ${label}?\n\nYour saved cities are kept and every weather widget will use the new provider automatically.`);
      if (!ok) {
        const back = document.querySelector(`input[name="weather-provider"][value="${cur}"]`);
        if (back) back.checked = true;
        return;
      }
      state.currentSettings.weatherProvider = next;
      setWeatherProviderUI();
      backfillWeatherCoords();   // ensure cities have coords for the new provider
      updateSaveBar();
    });
  });

  // Weather: add one verified location at a time.
  document.getElementById('weather-add-btn')?.addEventListener('click', addWeatherLocation);
  const weatherLocInput = document.getElementById('weather-loc-input');
  if (weatherLocInput) {
    weatherLocInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); addWeatherLocation(); }
    });
  }

  // Weather validate button
  document.getElementById('weather-validate-btn')?.addEventListener('click', validateWeatherKey);

  // Weather live preview (all three widgets)
  document.getElementById('weather-preview-btn')?.addEventListener('click', openWeatherPreview);
  document.getElementById('weather-preview-close')?.addEventListener('click', closeWeatherPreview);
  document.getElementById('weather-preview-done')?.addEventListener('click', closeWeatherPreview);
  const weatherPreviewModal = document.getElementById('weather-preview-modal');
  if (weatherPreviewModal) {
    weatherPreviewModal.addEventListener('click', (e) => {
      if (e.target === weatherPreviewModal) closeWeatherPreview();
    });
  }

  // Weather location
  const weatherLocEl = document.getElementById('weather-location');
  if (weatherLocEl) {
    weatherLocEl.addEventListener('input', () => {
      state.currentSettings.weatherLocation = weatherLocEl.value.trim();
      // Changing the city invalidates this endpoint until it's re-verified.
      state.weatherApiKeyValidated = false;
      const vr = document.getElementById('weather-validation-result');
      if (vr) vr.style.display = 'none';
      updateSaveBar();
      updateWeatherPreviewButton();
      refreshIntegrationModalSave();
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

  // ── Jellyfin / Emby (shared media-server widget) ───────────────────────────
  setupMediaServerListeners('jellyfin');
  setupMediaServerListeners('emby');

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
  setupExtraListeners('portainer', {
    fields: { 'portainer-url': 'portainerUrl', 'portainer-api-key': 'portainerApiKey' },
    secret: ['portainer-api-key', 'portainer-key-toggle'], invalidates: true,
    validate: validatePortainer, update: updatePortainerPreviewButton, open: openPortainerPreview, close: closePortainerPreview,
  });
  setupExtraListeners('stocks', {
    fields: { 'stocks-symbols': 'stocksSymbols' }, invalidates: true,
    validate: validateStocks, update: updateStocksPreviewButton, open: openStocksPreview, close: closeStocksPreview,
  });
  setupCountdownConfig();
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
    c.weatherProvider    !== s.weatherProvider    ||
    c.weatherApiKey      !== s.weatherApiKey      ||
    c.weatherLocation    !== s.weatherLocation    ||
    c.weatherLat         !== s.weatherLat         ||
    c.weatherLon         !== s.weatherLon         ||
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
    c.portainerEnabled !== s.portainerEnabled || c.portainerUrl !== s.portainerUrl || c.portainerApiKey !== s.portainerApiKey ||
    c.stocksEnabled !== s.stocksEnabled || c.stocksSymbols !== s.stocksSymbols ||
    c.countdownEnabled !== s.countdownEnabled || c.countdownExpired !== s.countdownExpired || j(c.countdownItems) !== j(s.countdownItems) || j(c.countdownUnits) !== j(s.countdownUnits) ||
    c.pbsEnabled !== s.pbsEnabled || c.pbsUrl !== s.pbsUrl || c.pbsUsername !== s.pbsUsername || c.pbsRealm !== s.pbsRealm || c.pbsTokenId !== s.pbsTokenId || c.pbsApiKey !== s.pbsApiKey || c.pbsNode !== s.pbsNode ||
    c.beszelEnabled !== s.beszelEnabled || c.beszelUrl !== s.beszelUrl || c.beszelUsername !== s.beszelUsername || c.beszelPassword !== s.beszelPassword ||
    c.icalEnabled !== s.icalEnabled || c.icalName !== s.icalName || c.icalUrl !== s.icalUrl || c.icalView !== s.icalView ||
    c.homeassistantEnabled !== s.homeassistantEnabled || c.homeassistantUrl !== s.homeassistantUrl || c.homeassistantToken !== s.homeassistantToken || c.homeassistantEntities !== s.homeassistantEntities || c.homeassistantAllowToggle !== s.homeassistantAllowToggle ||
    c.nextcloudEnabled !== s.nextcloudEnabled || c.nextcloudUrl !== s.nextcloudUrl || c.nextcloudUsername !== s.nextcloudUsername || c.nextcloudPassword !== s.nextcloudPassword ||
    c.opnsenseEnabled !== s.opnsenseEnabled || c.opnsenseUrl !== s.opnsenseUrl || c.opnsenseKey !== s.opnsenseKey || c.opnsenseSecret !== s.opnsenseSecret
  );
}

// Settings-tab only fields. Integrations no longer use the global save bar —
// they persist from their own modal (validation-gated). This keeps integration
// edits from ever surfacing the page-level Save button.
function hasSettingsTabChanges() {
  const c = state.currentSettings, s = state.savedSettings;
  const j = (v) => JSON.stringify(v || {});
  return c.apiKey !== s.apiKey || c.model !== s.model ||
         c.aiProvider !== s.aiProvider ||
         j(c.aiApiKeys) !== j(s.aiApiKeys) ||
         j(c.aiModels) !== j(s.aiModels) ||
         j(c.aiEndpoints) !== j(s.aiEndpoints) ||
         c.theme !== s.theme ||
         !!c.newTabOverride !== !!s.newTabOverride ||
         !!c.openOnStartup !== !!s.openOnStartup ||
         !!c.syncBookmarks !== !!s.syncBookmarks ||
         !!c.gistSync !== !!s.gistSync ||
         !!c.gistAutoSync !== !!s.gistAutoSync ||
         (c.gistToken || '') !== (s.gistToken || '') ||
         (c.backupPassphrase || '') !== (s.backupPassphrase || '') ||
         (c.searchEnabled !== false) !== (s.searchEnabled !== false) ||
         (c.dashboardSwitcher || 'dropdown') !== (s.dashboardSwitcher || 'dropdown') ||
         j(c.pollSecs) !== j(s.pollSecs) ||
         j(c.integrationDescriptions) !== j(s.integrationDescriptions) ||
         j(c.customThemes) !== j(s.customThemes) ||
         c.clockFormat !== s.clockFormat || c.dateVisible !== s.dateVisible ||
         c.dateFormat !== s.dateFormat;
}

function updateSaveBar() {
  const changed = hasSettingsTabChanges();
  const onSettings = state.activeTab === 'settings';
  if (changed && onSettings) {
    pendingBanner.style.display = 'flex';
    saveBar.classList.add('visible');
    saveBtn.disabled = !state.apiKeyValidated && state.currentSettings.apiKey !== state.savedSettings.apiKey;
    // Allow saving model change without re-validating
    if (state.currentSettings.apiKey === state.savedSettings.apiKey) {
      saveBtn.disabled = false;
    }
    // Gist backup requires an encryption passphrase before it can be saved.
    if (state.currentSettings.gistSync && !state.currentSettings.backupPassphrase) {
      saveBtn.disabled = true;
      saveBtn.title = 'Set an encryption passphrase to enable Gist backup';
    } else {
      saveBtn.title = '';
    }
  } else {
    saveBar.classList.remove('visible');
    pendingBanner.style.display = 'none';
  }
  // Keep the integration modal's Save button in sync with live validation state.
  refreshIntegrationModalSave();
}

async function saveSettings() {
  const settings = {
    apiKey:              state.currentSettings.apiKey,
    model:               state.currentSettings.model,
    aiProvider:          state.currentSettings.aiProvider,
    aiApiKeys:           state.currentSettings.aiApiKeys,
    aiModels:            state.currentSettings.aiModels,
    aiEndpoints:         state.currentSettings.aiEndpoints,
    theme:               state.currentSettings.theme,
    newTabOverride:      state.currentSettings.newTabOverride,
    openOnStartup:       state.currentSettings.openOnStartup,
    syncBookmarks:       state.currentSettings.syncBookmarks,
    gistSync:            state.currentSettings.gistSync,
    gistAutoSync:        state.currentSettings.gistAutoSync,
    gistToken:           state.currentSettings.gistToken,
    backupPassphrase:    state.currentSettings.backupPassphrase,
    searchEnabled:       state.currentSettings.searchEnabled,
    dashboardSwitcher:   state.currentSettings.dashboardSwitcher,
    pollSecs:            state.currentSettings.pollSecs,
    integrationDescriptions: state.currentSettings.integrationDescriptions,
    customThemes:        state.currentSettings.customThemes,
    clockFormat:         state.currentSettings.clockFormat,
    dateVisible:         state.currentSettings.dateVisible,
    dateFormat:          state.currentSettings.dateFormat,
    weatherEnabled:      state.currentSettings.weatherEnabled,
    weatherProvider:     state.currentSettings.weatherProvider,
    weatherApiKey:       state.currentSettings.weatherApiKey,
    weatherLocation:     state.currentSettings.weatherLocation,
    weatherLat:          state.currentSettings.weatherLat,
    weatherLon:          state.currentSettings.weatherLon,
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
    jellyfinEnabled:     state.currentSettings.jellyfinEnabled,
    jellyfinUrl:         state.currentSettings.jellyfinUrl,
    jellyfinApiKey:      state.currentSettings.jellyfinApiKey,
    embyEnabled:         state.currentSettings.embyEnabled,
    embyUrl:             state.currentSettings.embyUrl,
    embyApiKey:          state.currentSettings.embyApiKey,
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
    portainerEnabled: state.currentSettings.portainerEnabled, portainerUrl: state.currentSettings.portainerUrl, portainerApiKey: state.currentSettings.portainerApiKey,
    stocksEnabled: state.currentSettings.stocksEnabled, stocksSymbols: state.currentSettings.stocksSymbols,
    countdownEnabled: state.currentSettings.countdownEnabled, countdownItems: JSON.parse(JSON.stringify(state.currentSettings.countdownItems || [])), countdownExpired: state.currentSettings.countdownExpired, countdownUnits: JSON.parse(JSON.stringify(countdownUnitsArr())),
    pbsEnabled: state.currentSettings.pbsEnabled, pbsUrl: state.currentSettings.pbsUrl, pbsUsername: state.currentSettings.pbsUsername, pbsRealm: state.currentSettings.pbsRealm, pbsTokenId: state.currentSettings.pbsTokenId, pbsApiKey: state.currentSettings.pbsApiKey, pbsNode: state.currentSettings.pbsNode,
    beszelEnabled: state.currentSettings.beszelEnabled, beszelUrl: state.currentSettings.beszelUrl, beszelUsername: state.currentSettings.beszelUsername, beszelPassword: state.currentSettings.beszelPassword,
    icalEnabled: state.currentSettings.icalEnabled, icalName: state.currentSettings.icalName, icalUrl: state.currentSettings.icalUrl, icalView: state.currentSettings.icalView,
    homeassistantEnabled: state.currentSettings.homeassistantEnabled, homeassistantUrl: state.currentSettings.homeassistantUrl, homeassistantToken: state.currentSettings.homeassistantToken, homeassistantEntities: state.currentSettings.homeassistantEntities, homeassistantAllowToggle: state.currentSettings.homeassistantAllowToggle,
    nextcloudEnabled: state.currentSettings.nextcloudEnabled, nextcloudUrl: state.currentSettings.nextcloudUrl, nextcloudUsername: state.currentSettings.nextcloudUsername, nextcloudPassword: state.currentSettings.nextcloudPassword,
    opnsenseEnabled: state.currentSettings.opnsenseEnabled, opnsenseUrl: state.currentSettings.opnsenseUrl, opnsenseKey: state.currentSettings.opnsenseKey, opnsenseSecret: state.currentSettings.opnsenseSecret,
    instances:           state.currentSettings.instances,
    savedAt: Date.now(),
  };
  await chromeStorageSet({ settings });
  state.savedSettings = { ...settings };
  updateSaveBar();
  showToast('Settings saved ✓');
  // Reflect newly-saved backup settings without a page reload (enables the
  // Gist buttons and refreshes the status lines).
  if (typeof refreshGistStatus === 'function') refreshGistStatus();
}

function discardChanges() {
  state.currentSettings = { ...state.savedSettings };
  state.currentSettings.instances = JSON.parse(JSON.stringify(state.savedSettings.instances || {}));
  state.currentSettings.countdownItems = JSON.parse(JSON.stringify(state.savedSettings.countdownItems || []));
  state.currentSettings.countdownUnits = JSON.parse(JSON.stringify(state.savedSettings.countdownUnits || ['years', 'months', 'days', 'hours', 'minutes', 'seconds']));
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
  state.jellyfinValidated = !!(state.savedSettings.jellyfinUrl && state.savedSettings.jellyfinApiKey);
  state.embyValidated = !!(state.savedSettings.embyUrl && state.savedSettings.embyApiKey);
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
   'ical', 'homeassistant', 'nextcloud', 'opnsense', 'jellyfin', 'emby'].forEach((svc) => { const el = document.getElementById(`${svc}-validation-result`); if (el) el.style.display = 'none'; });
}

async function validateApiKey() {
  syncActiveMirror();
  const a = activeAI(state.currentSettings);
  if (!a.apiKey) {
    showValidationResult('error', 'Please enter an API key.');
    return;
  }
  // Catch an obviously-wrong key (e.g. an OpenRouter key on the OpenAI provider)
  // before wasting a round-trip and showing a misleading error.
  const mismatch = keyProviderMismatch(a.apiKey, a.provider);
  if (mismatch) {
    state.apiKeyValidated = false;
    showValidationResult('error', `✗ ${mismatch}`);
    return;
  }

  validateBtn.disabled = true;
  validateBtn.innerHTML = '<span class="spinner"></span>';

  try {
    // Provider-agnostic check: a tiny completion confirms the key, endpoint,
    // and model all work together for the selected provider.
    // maxTokens must clear every provider's minimum — some upstreams (Azure/
    // OpenAI via OpenRouter) reject anything below 16, so use a safe floor.
    const reply = await callProviderAI(
      [{ role: 'user', content: 'Reply with the single word: OK' }],
      { maxTokens: 32, temperature: 0 }
    );
    if (typeof reply !== 'string') throw new Error('Unexpected response from provider.');
    state.apiKeyValidated = true;
    showValidationResult('success', `✓ Connected to ${PROVIDER_INFO[a.provider]?.name || a.provider}.`);
    saveBtn.disabled = false;
  } catch (err) {
    state.apiKeyValidated = false;
    showValidationResult('error', buildAIErrorReport(err, a));
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
  validationRes.style.whiteSpace = 'pre-wrap';        // keep multi-line diagnostics readable
  validationRes.style.fontFamily = type === 'success' ? '' : 'var(--font-mono, ui-monospace, monospace)';
  validationRes.style.fontSize = type === 'success' ? '' : '12px';
  validationRes.style.lineHeight = type === 'success' ? '' : '1.5';
  validationRes.style.textAlign = 'left';
  validationRes.textContent = msg;
}

// Show first/last few characters of a secret so the user can confirm which key
// is in use without exposing it.
function maskSecret(s) {
  if (!s) return '(empty)';
  if (s.length <= 12) return s[0] + '…' + s[s.length - 1] + ` (${s.length} chars)`;
  return `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
}

// Build a verbose, troubleshooting-friendly error report for a failed AI
// validation. `a` is the activeAI() descriptor used for the request.
function buildAIErrorReport(err, a) {
  const L = [];
  L.push(`✗ Could not validate ${PROVIDER_INFO[a.provider]?.name || a.provider}.`);
  L.push('');
  L.push(err.message || 'Validation failed.');

  // Status-specific guidance (covers the common OpenRouter failure modes).
  const hint = aiErrorHint(err, a);
  if (hint) { L.push(''); L.push(hint); }

  // Request context — what was actually sent.
  L.push('');
  L.push('── Request details ──');
  L.push(`provider:  ${a.provider}`);
  L.push(`model:     ${a.model || '(none selected)'}`);
  L.push(`endpoint:  ${a.endpoint}`);
  L.push(`api key:   ${maskSecret(a.apiKey)}`);
  if (err.kind === 'http') {
    L.push(`http:      ${err.status}${err.statusText ? ' ' + err.statusText : ''}`);
    if (err.code) L.push(`code:      ${err.code}`);
  } else if (err.kind === 'network') {
    L.push('http:      (request never completed — network/CORS/URL failure)');
  }

  // Raw response body, truncated — the ground truth for troubleshooting.
  if (err.body) {
    const raw = err.body.length > 600 ? err.body.slice(0, 600) + ' …(truncated)' : err.body;
    L.push('');
    L.push('── Raw response ──');
    L.push(raw);
  }
  return L.join('\n');
}

// Detect a key that obviously belongs to a different provider (the #1 cause of
// confusing 401s). Returns a clear message, or null if the key looks plausible.
function keyProviderMismatch(key, provider) {
  const k = (key || '').trim();
  if (!k) return null;
  const name = PROVIDER_INFO[provider]?.name || provider;
  const keyPage = PROVIDER_INFO[provider]?.urlLabel || PROVIDER_INFO[provider]?.url || 'your provider';
  if (/^sk-or-/i.test(k) && provider !== 'openrouter' && provider !== 'meta') {
    return `This looks like an OpenRouter key (it starts with “sk-or-”), but the selected provider is ${name}. Either set Provider to OpenRouter, or paste a ${name} key from ${keyPage}.`;
  }
  if (/^sk-ant-/i.test(k) && provider !== 'anthropic') {
    return `This looks like an Anthropic key (it starts with “sk-ant-”), but the selected provider is ${name}.`;
  }
  if (provider === 'openrouter' && /^sk-/i.test(k) && !/^sk-or-/i.test(k)) {
    return 'This looks like a direct provider key (it starts with “sk-”), but the selected provider is OpenRouter, which needs a key from openrouter.ai/keys (starts with “sk-or-”).';
  }
  return null;
}

// Map an error to actionable, provider-aware advice based on HTTP status / kind.
function aiErrorHint(err, a) {
  const info = PROVIDER_INFO[a.provider] || {};
  const name = info.name || a.provider;
  const keyPage = info.urlLabel || info.url || 'your provider account';
  if (err.kind === 'network') {
    return 'The request never reached the server. Check your internet connection, that the endpoint URL above is correct, and that the host isn’t blocked by a firewall or VPN.';
  }
  // A key from the wrong provider often surfaces as 401/403 — call it out.
  const mism = keyProviderMismatch(a.apiKey, a.provider);
  if (mism && (err.status === 401 || err.status === 403)) return mism;

  switch (err.status) {
    case 400:
      return 'Bad request (400). Often a malformed or unsupported model id — pick a different model from the list.';
    case 401:
      return `Unauthorized (401). The API key is missing, mistyped, revoked, or for a different provider. Generate a fresh ${name} key at ${keyPage} and paste it exactly (no quotes or spaces).`;
    case 402:
      return `Payment required (402). Your ${name} account needs billing/credits set up. Add credits in your ${name} account, or pick a free model.`;
    case 403:
      return `Forbidden (403). The key is recognized but isn’t allowed to use this model — it may need billing enabled, a privacy/data setting, or a different model.`;
    case 404:
      return 'Not found (404). The selected model id doesn’t exist for this provider. Pick another model from the list.';
    case 408:
    case 504:
      return 'Timed out. The provider took too long — try again, or switch to a faster model.';
    case 429:
      return 'Rate limited (429). Too many requests, or a free-tier daily limit was hit. Wait a moment and retry, or add credits / choose a paid model.';
    case 500:
    case 502:
    case 503:
      return 'Provider error (5xx). This is on the provider’s side — wait a bit and try again, or select a different model.';
    default:
      if (/model/i.test(err.message || '')) {
        return 'This usually means the selected Model isn’t available. Pick another model from the list.';
      }
      return '';
  }
}

function hideValidationResult() {
  validationRes.style.display = 'none';
}

// ── Weather: location-focused setup (multi-city) ───────────────────────────
// The OpenWeather API key is configured ONCE and shared by every location.
// Each location is stored as an endpoint in settings.instances.weather, with the
// city name auto-used as the endpoint Name (the Name field is no longer shown).

function weatherEps() { return (window.Endpoints) ? Endpoints.list(state.currentSettings, 'weather') : []; }
function weatherGlobalUnits() { return state.currentSettings.weatherUnits || 'imperial'; }
function weatherGlobalRefresh() { return parseInt(state.currentSettings.weatherRefreshMins, 10) || 60; }
function weatherProvider() { return state.currentSettings.weatherProvider || (state.currentSettings.weatherApiKey ? 'openweathermap' : 'openmeteo'); }

// Mirror the first location onto the legacy flat keys so previews + any
// not-yet-migrated readers stay coherent.
function weatherMirrorFirstToFlat() {
  const first = weatherEps()[0];
  state.currentSettings.weatherUnits = weatherGlobalUnits();
  state.currentSettings.weatherRefreshMins = weatherGlobalRefresh();
  state.currentSettings.weatherLocation = first ? (first.fields.weatherLocation || '') : '';
  state.currentSettings.weatherLat = first ? (first.fields.weatherLat ?? null) : null;
  state.currentSettings.weatherLon = first ? (first.fields.weatherLon ?? null) : null;
}

// Validate just the API key (uses an existing location as the probe, else London).
async function validateWeatherKey() {
  const key = (document.getElementById('weather-api-key')?.value || '').trim();
  const btn = document.getElementById('weather-validate-btn');
  state.currentSettings.weatherApiKey = key;

  if (!key) { showWeatherValidationResult('error', 'Please enter an API key.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  const probe = (weatherEps()[0] && weatherEps()[0].fields.weatherLocation) || 'London';
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather` +
      `?q=${encodeURIComponent(probe)}&appid=${key}&units=imperial`;
    const res = await fetch(url);
    if (res.ok) {
      state.weatherApiKeyValidated = true;
      showWeatherValidationResult('success', '✓ API key is valid — add your locations below.');
    } else {
      const data = await res.json().catch(() => ({}));
      showWeatherValidationResult('error', `✗ ${data?.message || ('Error ' + res.status)}`);
      state.weatherApiKeyValidated = false;
    }
  } catch (err) {
    showWeatherValidationResult('error', `✗ Network error: ${err.message}`);
    state.weatherApiKeyValidated = false;
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Validate';
    updateSaveBar();
    updateWeatherPreviewButton();
    refreshIntegrationModalSave();
  }
}

// OpenWeather expects a single location as "City,STATE,COUNTRY" where the state
// code is only used for the US (ISO-3166 country codes). Commas separate those
// parts of ONE place — they are NOT a multi-city separator. We accept full US
// state names (e.g. "Paul, Idaho") and convert them to the 2-letter code OWM
// wants, defaulting the country to US when a state is given on its own.
const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS',
  kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA',
  michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT',
  nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC', 'washington dc': 'DC',
};
const US_STATE_CODES = new Set(Object.values(US_STATES));
const US_CODE_TO_NAME = Object.fromEntries(Object.entries(US_STATES).map(([n, c]) => [c, n]));

// Resolve a city to coordinates via Open-Meteo geocoding (keyless — used for BOTH
// providers, per spec). Input is one place; optional comma parts (state/country)
// narrow the match. Returns a display name + lat/lon.
async function geocodeViaOpenMeteo(raw) {
  const parts = String(raw || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { ok: false };
  const name = parts[0];
  const filters = parts.slice(1).map((f) => f.toLowerCase());
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const j = await res.json();
    const results = Array.isArray(j.results) ? j.results : [];
    if (!results.length) return { ok: false };
    const matchesFilter = (r, f) => {
      const cand = [r.admin1, r.country, r.country_code].filter(Boolean).map((x) => String(x).toLowerCase());
      if (cand.includes(f)) return true;
      const full = US_CODE_TO_NAME[f.toUpperCase()];        // "id" → "idaho"
      if (full && cand.includes(full)) return true;
      const code = US_STATES[f];                            // "idaho" → "ID" (already covered by admin1, belt & braces)
      if (code && cand.includes(code.toLowerCase())) return true;
      return false;
    };
    const r = filters.length ? results.find((x) => filters.every((f) => matchesFilter(x, f))) : results[0];
    if (!r) return { ok: false };
    const display = [r.name, r.admin1, r.country_code].filter(Boolean).join(', ');
    return { ok: true, name: display, lat: r.latitude, lon: r.longitude };
  } catch (_) { return { ok: false }; }
}

function setWeatherLocStatus(html, type) {
  const el = document.getElementById('weather-loc-status');
  if (!el) return;
  if (!html) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'block';
  el.className = 'banner banner-' + (type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info');
  el.innerHTML = html;
}

// Show/hide the OWM key section + selected-card styling for the active provider.
function setWeatherProviderUI() {
  const provider = weatherProvider();
  const r = document.querySelector(`input[name="weather-provider"][value="${provider}"]`);
  if (r) r.checked = true;
  const keySec = document.getElementById('weather-owm-key-section');
  if (keySec) keySec.style.display = provider === 'openweathermap' ? '' : 'none';
  document.querySelectorAll('.wx-prov').forEach((el) => {
    const i = el.querySelector('input'); el.classList.toggle('selected', !!(i && i.checked));
  });
  updateWeatherPreviewButton();
  refreshIntegrationModalSave();
}

function renderWeatherLocations() {
  const list = document.getElementById('weather-loc-list');
  if (!list) return;
  const eps = weatherEps();
  list.innerHTML = '';
  if (!eps.length) {
    const empty = document.createElement('div');
    empty.className = 'weather-loc-empty';
    empty.textContent = 'No locations yet — add one above.';
    list.appendChild(empty);
  } else {
    eps.forEach((ep, i) => {
      const row = document.createElement('div');
      row.className = 'weather-loc-row';
      const up = document.createElement('button');
      up.className = 'weather-loc-act'; up.type = 'button'; up.title = 'Move up'; up.textContent = '▲';
      up.disabled = i === 0;
      up.addEventListener('click', () => moveWeatherLocation(ep.id, -1));
      const down = document.createElement('button');
      down.className = 'weather-loc-act'; down.type = 'button'; down.title = 'Move down'; down.textContent = '▼';
      down.disabled = i === eps.length - 1;
      down.addEventListener('click', () => moveWeatherLocation(ep.id, 1));
      const nm = document.createElement('span');
      nm.className = 'weather-loc-name';
      nm.textContent = ep.name || ep.fields.weatherLocation || 'Location';
      const badge = document.createElement('span');
      badge.className = 'weather-loc-badge'; badge.textContent = '✓'; badge.title = 'Verified';
      const edit = document.createElement('button');
      edit.className = 'weather-loc-act'; edit.type = 'button'; edit.title = 'Edit'; edit.textContent = '✏️';
      edit.addEventListener('click', () => editWeatherLocation(ep.id));
      const del = document.createElement('button');
      del.className = 'weather-loc-act'; del.type = 'button'; del.title = 'Remove'; del.textContent = '🗑️';
      del.addEventListener('click', () => deleteWeatherLocation(ep.id));
      row.append(up, down, nm, badge, edit, del);
      list.appendChild(row);
    });
  }
  weatherMirrorFirstToFlat();
  refreshIntegrationModalSave();
  updateWeatherPreviewButton();
}

// Add ONE location, resolved to coordinates via Open-Meteo geocoding (keyless;
// works for both providers). The whole input is a single place — commas refine
// it (City, State, Country). Invalid input is kept in the box for correction.
async function addWeatherLocation() {
  const input = document.getElementById('weather-loc-input');
  const btn = document.getElementById('weather-add-btn');
  const raw = (input?.value || '').trim();

  if (!raw) { setWeatherLocStatus('Type a city — e.g. <b>Paul, ID</b> or <b>Paris, FR</b>.', 'error'); return; }

  const oldTxt = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  setWeatherLocStatus('Verifying…', 'info');

  const r = await geocodeViaOpenMeteo(raw);

  if (btn) { btn.disabled = false; btn.textContent = oldTxt; }

  if (!r.ok) {
    setWeatherLocStatus(`✗ Couldn't find <b>${escapeHtml(raw)}</b>. Try adding a state or country — e.g. <b>Paul, ID</b>.`, 'error');
    return;
  }
  // Duplicate? (same resolved coordinates)
  const dup = weatherEps().some((ep) => Number(ep.fields.weatherLat) === Number(r.lat) && Number(ep.fields.weatherLon) === Number(r.lon));
  if (dup) { setWeatherLocStatus(`<b>${escapeHtml(r.name)}</b> is already in your list.`, 'info'); if (input) input.value = ''; return; }

  // Name = the resolved city (auto-filled; no separate Name field).
  Endpoints.add(state.currentSettings, 'weather', r.name, {
    weatherLocation: r.name, weatherLat: r.lat, weatherLon: r.lon,
    weatherUnits: weatherGlobalUnits(), weatherRefreshMins: weatherGlobalRefresh(),
  });
  const eps = weatherEps(); const ep = eps[eps.length - 1]; if (ep) ep.validated = true;
  if (input) input.value = '';
  setWeatherLocStatus(`✓ Added <b>${escapeHtml(r.name)}</b>.`, 'success');

  renderWeatherLocations();
  updateSaveBar();
}

function deleteWeatherLocation(id) {
  Endpoints.remove(state.currentSettings, 'weather', id);
  renderWeatherLocations();
  updateSaveBar();
}

// Reorder a location (dir = -1 up / +1 down).
function moveWeatherLocation(id, dir) {
  const arr = state.currentSettings.instances && state.currentSettings.instances.weather;
  if (!Array.isArray(arr)) return;
  const i = arr.findIndex((e) => e.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderWeatherLocations();
  updateSaveBar();
}

// "Edit" = drop the city back into the add box for a quick correction.
function editWeatherLocation(id) {
  const ep = weatherEps().find((e) => e.id === id);
  if (!ep) return;
  const input = document.getElementById('weather-loc-input');
  if (input) { input.value = ep.fields.weatherLocation || ep.name || ''; input.focus(); }
  Endpoints.remove(state.currentSettings, 'weather', id);
  renderWeatherLocations();
  updateSaveBar();
}

// Best-effort: fill in coordinates for any saved city that predates coord
// storage (legacy OWM setups), so switching to Open-Meteo works seamlessly.
async function backfillWeatherCoords() {
  const eps = weatherEps().filter((ep) => ep.fields && (ep.fields.weatherLat == null || ep.fields.weatherLon == null) && (ep.fields.weatherLocation || '').trim());
  if (!eps.length) return;
  for (const ep of eps) {
    const r = await geocodeViaOpenMeteo(ep.fields.weatherLocation);
    if (r.ok) { ep.fields.weatherLat = r.lat; ep.fields.weatherLon = r.lon; ep.fields.weatherLocation = r.name; ep.name = r.name; }
  }
  renderWeatherLocations();
}

function showWeatherValidationResult(type, msg) {
  const el = document.getElementById('weather-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}

function updateWeatherPreviewButton() {
  const btn = document.getElementById('weather-preview-btn');
  const hint = document.getElementById('weather-preview-hint');
  if (!btn) return;
  const owm = weatherProvider() === 'openweathermap';
  const keyOk = !owm || (state.weatherApiKeyValidated && !!state.currentSettings.weatherApiKey);
  const ready = keyOk && weatherEps().length > 0;
  btn.disabled = !ready;
  if (hint) {
    hint.textContent = ready
      ? 'Opens a live preview of all weather widgets using your data.'
      : (owm ? 'Validate your API key and add a location to enable a live preview.'
             : 'Add a location to enable a live preview.');
  }
}

function openWeatherPreview() {
  if (weatherProvider() === 'openweathermap' && !state.weatherApiKeyValidated) return;
  if (!weatherEps().length) return;
  const modal = document.getElementById('weather-preview-modal');
  const host  = document.getElementById('weather-preview-host');
  if (!modal || !host || typeof WeatherCurrentWidget === 'undefined') return;

  closeWeatherPreviewWidgets();
  host.innerHTML = '';

  const cfg = {
    provider: weatherProvider(),
    apiKey: state.currentSettings.weatherApiKey,
    lat: state.currentSettings.weatherLat,
    lon: state.currentSettings.weatherLon,
    location: state.currentSettings.weatherLocation,
    units: state.currentSettings.weatherUnits || 'imperial',
  };
  state.weatherPreviewWidgets = [];

  const mk = (label, factory) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '18px';
    const cap = document.createElement('div');
    cap.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px;';
    cap.textContent = label;
    const hostEl = document.createElement('div');
    wrap.append(cap, hostEl);
    host.appendChild(wrap);
    const w = factory(hostEl);
    w.start();
    state.weatherPreviewWidgets.push(w);
  };

  if (typeof WeatherCombinedWidget !== 'undefined') mk('Weather — Combined', (el) => new WeatherCombinedWidget(el, Object.assign({ hours: 12, days: 5 }, cfg)));
  mk('Current Weather', (el) => new WeatherCurrentWidget(el, cfg));
  mk('Hourly Forecast', (el) => new WeatherHourlyWidget(el, Object.assign({ hours: 5 }, cfg)));
  mk('5-Day Forecast',  (el) => new WeatherForecastWidget(el, Object.assign({ days: 5 }, cfg)));

  modal.classList.add('visible');
}

function closeWeatherPreviewWidgets() {
  if (state.weatherPreviewWidgets) {
    state.weatherPreviewWidgets.forEach((w) => { try { w.destroy(); } catch (_) {} });
    state.weatherPreviewWidgets = null;
  }
}

function closeWeatherPreview() {
  const modal = document.getElementById('weather-preview-modal');
  if (modal) modal.classList.remove('visible');
  closeWeatherPreviewWidgets();
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

  // Tear down any prior instances, then mount fresh ones — both Tautulli
  // widgets (the activity carousel and the Plex-style streams list).
  closeTautulliPreviewWidgets();
  host.innerHTML = '';

  const base = state.currentSettings.tautulliUrl;
  const apiKey = state.currentSettings.tautulliApiKey;
  const pollMs = pollMsFor('tautulli');
  state.tautulliPreviewWidgets = [];

  const mk = (label, factory) => {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '18px';
    const cap = document.createElement('div');
    cap.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:8px;';
    cap.textContent = label;
    const hostEl = document.createElement('div');
    wrap.append(cap, hostEl);
    host.appendChild(wrap);
    const w = factory(hostEl);
    w.start();
    state.tautulliPreviewWidgets.push(w);
  };

  mk('Activity (carousel)', (el) => new TautulliWidget(el, {
    baseUrl: base, apiKey,
    maxVisible: parseInt(state.currentSettings.tautulliMaxSessions, 10) || 3,
    dwellMs: parseInt(state.currentSettings.tautulliCarouselDwellMs, 10) || 4000,
    pollMs,
  }));
  if (typeof TautulliListWidget !== 'undefined') {
    mk('Streams (list)', (el) => new TautulliListWidget(el, { baseUrl: base, apiKey, pollMs }));
  }
  if (typeof TautulliRecentWidget !== 'undefined') mk('Recently Added', (el) => new TautulliRecentWidget(el, { baseUrl: base, apiKey, pollMs }));
  if (typeof TautulliWatchStatsWidget !== 'undefined') mk('Most Watched', (el) => new TautulliWatchStatsWidget(el, { baseUrl: base, apiKey, pollMs }));
  if (typeof TautulliLibrariesWidget !== 'undefined') mk('Libraries', (el) => new TautulliLibrariesWidget(el, { baseUrl: base, apiKey, pollMs }));
  if (typeof TautulliTopUsersWidget !== 'undefined') mk('Top Users & Platforms', (el) => new TautulliTopUsersWidget(el, { baseUrl: base, apiKey, pollMs }));

  modal.classList.add('visible');
}

function closeTautulliPreviewWidgets() {
  if (state.tautulliPreviewWidgets) {
    state.tautulliPreviewWidgets.forEach((w) => { try { w.destroy(); } catch (_) {} });
    state.tautulliPreviewWidgets = null;
  }
  if (state.tautulliPreviewWidget) { // legacy single-instance cleanup
    try { state.tautulliPreviewWidget.destroy(); } catch (_) {}
    state.tautulliPreviewWidget = null;
  }
}

function closeTautulliPreview() {
  const modal = document.getElementById('tautulli-preview-modal');
  if (modal) modal.classList.remove('visible');
  closeTautulliPreviewWidgets();
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

  state.uptimeKumaPreviewWidget = new UptimeKumaWidget(host, withPoll('uptimekuma', uptimeKumaWidgetConfig()));
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

  state[`${svc}PreviewWidget`] = new ArrCalendarWidget(host, withPoll(svc, arrWidgetConfig(svc)));
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

  state.seerrPreviewWidget = new SeerrWidget(host, withPoll('seerr', seerrWidgetConfig()));
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

  state[`${svc}PreviewWidget`] = new DnsHoleWidget(host, withPoll(svc, dnsHoleWidgetConfig(svc)));
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
  state.plexPreviewWidget = new PlexWidget(host, withPoll('plex', { baseUrl: state.currentSettings.plexUrl, token: state.currentSettings.plexToken }));
  state.plexPreviewWidget.start();
  modal.classList.add('visible');
}
function closePlexPreview() {
  const modal = document.getElementById('plex-preview-modal');
  if (modal) modal.classList.remove('visible');
  if (state.plexPreviewWidget) { state.plexPreviewWidget.destroy(); state.plexPreviewWidget = null; }
}

// ─── Jellyfin / Emby (shared media-server widget) ────────────────────────────
// svc is 'jellyfin' or 'emby'. Both expose the same Emby REST API, so the same
// MediaServerApi/MediaServerWidget covers both, parametrised by service.

const MEDIA_SERVER_LABEL = { jellyfin: 'Jellyfin', emby: 'Emby' };

async function validateMediaServer(svc) {
  const label = MEDIA_SERVER_LABEL[svc] || svc;
  const url = document.getElementById(`${svc}-url`).value.trim();
  const apiKey = document.getElementById(`${svc}-api-key`).value.trim();
  const btn = document.getElementById(`${svc}-validate-btn`);

  if (!url) { showMediaServerValidationResult(svc, 'error', `Please enter your ${label} server URL.`); return; }
  if (!/^https?:\/\//i.test(url)) { showMediaServerValidationResult(svc, 'error', 'URL must start with http:// or https://'); return; }
  if (!apiKey) { showMediaServerValidationResult(svc, 'error', 'Please enter an API key.'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  try {
    await MediaServerApi.testConnection(url, apiKey);
    state[`${svc}Validated`] = true;
    showMediaServerValidationResult(svc, 'success', `✓ Connected to ${label}.`);
  } catch (err) {
    state[`${svc}Validated`] = false;
    const msg = /invalid key|HTTP\s*401/i.test(err.message) ? 'invalid API key' : err.message;
    showMediaServerValidationResult(svc, 'error', `✗ Unable to connect: ${msg}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Test Connection';
    updateMediaServerPreviewButton(svc);
    updateSaveBar();
  }
}

function showMediaServerValidationResult(svc, type, msg) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}
function hideMediaServerValidationResult(svc) {
  const el = document.getElementById(`${svc}-validation-result`);
  if (el) el.style.display = 'none';
}
function updateMediaServerPreviewButton(svc) {
  const btn = document.getElementById(`${svc}-preview-btn`);
  const hint = document.getElementById(`${svc}-preview-hint`);
  if (!btn) return;
  const ready = state[`${svc}Validated`] && !!state.currentSettings[`${svc}Url`] && !!state.currentSettings[`${svc}ApiKey`];
  btn.disabled = !ready;
  if (hint) hint.textContent = ready
    ? `Opens a live preview of current ${MEDIA_SERVER_LABEL[svc] || svc} sessions.`
    : 'Test the connection to enable a live preview.';
}
function openMediaServerPreview(svc) {
  if (!state[`${svc}Validated`]) return;
  const modal = document.getElementById(`${svc}-preview-modal`);
  const host = document.getElementById(`${svc}-preview-host`);
  if (!modal || !host || typeof MediaServerWidget === 'undefined') return;
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
  host.innerHTML = '';
  state[`${svc}PreviewWidget`] = new MediaServerWidget(host, withPoll(svc, {
    service: svc,
    baseUrl: state.currentSettings[`${svc}Url`],
    apiKey: state.currentSettings[`${svc}ApiKey`],
  }));
  state[`${svc}PreviewWidget`].start();
  modal.classList.add('visible');
}
function closeMediaServerPreview(svc) {
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.classList.remove('visible');
  if (state[`${svc}PreviewWidget`]) { state[`${svc}PreviewWidget`].destroy(); state[`${svc}PreviewWidget`] = null; }
}

function setupMediaServerListeners(svc) {
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

  const invalidate = () => {
    state[`${svc}Validated`] = false;
    hideMediaServerValidationResult(svc);
    updateMediaServerPreviewButton(svc);
    updateSaveBar();
  };
  const urlEl = document.getElementById(`${svc}-url`);
  if (urlEl) urlEl.addEventListener('input', () => { state.currentSettings[`${svc}Url`] = urlEl.value.trim(); invalidate(); });
  const keyEl = document.getElementById(`${svc}-api-key`);
  if (keyEl) keyEl.addEventListener('input', () => { state.currentSettings[`${svc}ApiKey`] = keyEl.value.trim(); invalidate(); });

  document.getElementById(`${svc}-validate-btn`)?.addEventListener('click', () => validateMediaServer(svc));
  document.getElementById(`${svc}-preview-btn`)?.addEventListener('click', () => openMediaServerPreview(svc));
  document.getElementById(`${svc}-preview-close`)?.addEventListener('click', () => closeMediaServerPreview(svc));
  document.getElementById(`${svc}-preview-done`)?.addEventListener('click', () => closeMediaServerPreview(svc));
  const modal = document.getElementById(`${svc}-preview-modal`);
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeMediaServerPreview(svc); });
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
  state.unifiPreviewWidget = new UnifiWidget(host, withPoll('unifi', { baseUrl: s.unifiUrl, username: s.unifiUsername, password: s.unifiPassword, site: s.unifiSite || 'default' }));
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
  state[`${svc}PreviewWidget`] = new DownloadClientWidget(host, withPoll(svc, downloadWidgetConfig(svc)));
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
  state[`${svc}PreviewWidget`] = new WidgetClass(host, withPoll(svc, makeCfg()));
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

// ── Portainer ──
async function validatePortainer() {
  const s = state.currentSettings;
  if (!/^https?:\/\//i.test(s.portainerUrl || '')) { showExtraValidation('portainer', 'error', 'Enter a URL starting with http:// or https://'); return; }
  if (!s.portainerApiKey) { showExtraValidation('portainer', 'error', 'Enter your Portainer API access token.'); return; }
  setValidateBusy('portainer', true);
  try {
    const r = await PortainerApi.testConnection(s.portainerUrl, s.portainerApiKey);
    state.portainerValidated = true;
    showExtraValidation('portainer', 'success', `✓ Connected — ${r.endpoints} environment${r.endpoints === 1 ? '' : 's'}.`);
  } catch (err) {
    state.portainerValidated = false;
    showExtraValidation('portainer', 'error', /apikey|401|403/i.test(err.message) ? '✗ Invalid API key.' : `✗ Unable to connect: ${err.message}`);
  } finally { setValidateBusy('portainer', false); updatePortainerPreviewButton(); updateSaveBar(); }
}
function updatePortainerPreviewButton() { const s = state.currentSettings; setExtraPreviewBtn('portainer', state.portainerValidated && !!s.portainerUrl && !!s.portainerApiKey, 'Opens a live preview of your containers.'); }
function openPortainerPreview() { const s = state.currentSettings; openExtraPreview('portainer', typeof PortainerWidget !== 'undefined' ? PortainerWidget : undefined, () => ({ baseUrl: s.portainerUrl, apiKey: s.portainerApiKey })); }
function closePortainerPreview() { closeExtraPreview('portainer'); }

// ── Stocks ──
async function validateStocks() {
  const list = (typeof StocksApi !== 'undefined') ? StocksApi.parseSymbols(state.currentSettings.stocksSymbols) : [];
  if (!list.length) { showExtraValidation('stocks', 'error', 'Enter at least one ticker symbol (e.g. AAPL, MSFT).'); return; }
  setValidateBusy('stocks', true);
  try {
    const r = await StocksApi.validateMany(list);
    if (r.valid.length && !r.invalid.length) {
      state.stocksValidated = true;
      showExtraValidation('stocks', 'success', `✓ ${r.valid.length} symbol${r.valid.length === 1 ? '' : 's'} verified: ${r.valid.join(', ')}`);
    } else if (r.valid.length) {
      state.stocksValidated = true;
      showExtraValidation('stocks', 'success', `✓ Verified: ${r.valid.join(', ')}.  ✗ Not found: ${r.invalid.join(', ')}`);
    } else {
      state.stocksValidated = false;
      showExtraValidation('stocks', 'error', `✗ No valid symbols found: ${r.invalid.join(', ')}`);
    }
  } catch (err) {
    state.stocksValidated = false;
    showExtraValidation('stocks', 'error', `✗ Unable to reach the quote service: ${err.message}`);
  } finally { setValidateBusy('stocks', false); updateStocksPreviewButton(); updateSaveBar(); }
}
function updateStocksPreviewButton() {
  const has = (typeof StocksApi !== 'undefined') && StocksApi.parseSymbols(state.currentSettings.stocksSymbols).length > 0;
  setExtraPreviewBtn('stocks', state.stocksValidated && has, 'Opens a live preview of your tickers.');
}
function openStocksPreview() { openExtraPreview('stocks', typeof StocksWidget !== 'undefined' ? StocksWidget : undefined, () => ({ symbols: StocksApi.parseSymbols(state.currentSettings.stocksSymbols) })); }
function closeStocksPreview() { closeExtraPreview('stocks'); }

// ── Countdown ──
function countdownItemsArr() {
  if (!Array.isArray(state.currentSettings.countdownItems)) state.currentSettings.countdownItems = [];
  return state.currentSettings.countdownItems;
}
function countdownValidCount() {
  return countdownItemsArr().filter((it) => it && /^\d{4}-\d{2}-\d{2}$/.test(String(it.date || ''))).length;
}
// Countdown has no async check — validity is simply "≥1 item with a date".
function countdownRecompute() {
  state.countdownValidated = countdownValidCount() > 0;
  updateCountdownPreviewButton();
  updateSaveBar();
}
function updateCountdownPreviewButton() {
  const ready = countdownValidCount() > 0;
  const btn = document.getElementById('countdown-preview-btn');
  const hint = document.getElementById('countdown-preview-hint');
  if (btn) btn.disabled = !ready;
  if (hint) hint.textContent = ready ? 'Opens a live preview of your countdowns.' : 'Add a countdown (with a date) to enable a live preview.';
}
// A date/time field that must be filled via the native picker — typing and
// pasting are blocked, and clicking/focusing pops the calendar/clock picker.
function mkPickerInput(type, val) {
  const el = document.createElement('input');
  el.className = 'input';
  el.type = type;
  el.value = val || '';
  el.setAttribute('inputmode', 'none');
  const openPicker = () => { try { if (typeof el.showPicker === 'function') el.showPicker(); } catch (_) {} };
  // Block manual keystrokes (allow Tab/Escape for keyboard navigation only).
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' || e.key === 'Escape') return;
    e.preventDefault();
    openPicker();
  });
  el.addEventListener('paste', (e) => e.preventDefault());
  el.addEventListener('drop', (e) => e.preventDefault());
  el.addEventListener('click', openPicker);
  el.addEventListener('focus', openPicker);
  return el;
}

// A small "grip" drag handle (six-dot icon) used to reorder countdown rows.
function mkDragHandle() {
  const h = document.createElement('span');
  h.className = 'cd-drag-handle';
  h.title = 'Drag to reorder';
  h.setAttribute('aria-label', 'Drag to reorder');
  h.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="currentColor">' +
    '<circle cx="7" cy="4" r="1.6"/><circle cx="13" cy="4" r="1.6"/>' +
    '<circle cx="7" cy="10" r="1.6"/><circle cx="13" cy="10" r="1.6"/>' +
    '<circle cx="7" cy="16" r="1.6"/><circle cx="13" cy="16" r="1.6"/></svg>';
  h.style.cssText = 'cursor:grab;display:inline-flex;align-items:center;color:var(--text-muted);flex:0 0 auto;touch-action:none;';
  return h;
}

function renderCountdownItems() {
  const wrap = document.getElementById('countdown-items');
  if (!wrap) return;
  const items = countdownItemsArr();
  wrap.innerHTML = '';
  if (!items.length) {
    const p = document.createElement('p');
    p.style.cssText = 'font-size:12px;color:var(--text-muted);margin:0;';
    p.textContent = 'No countdowns yet — click “Add countdown” below.';
    wrap.appendChild(p);
    return;
  }
  // Native HTML5 drag-and-drop reordering. Rows are only draggable while the
  // grip handle is held (so the text/date fields stay usable).
  let dragFrom = -1;
  const reorder = (from, to) => {
    if (from < 0 || to < 0 || from === to || from >= items.length) return;
    const moved = items.splice(from, 1)[0];
    items.splice(to, 0, moved);
    renderCountdownItems();
    countdownRecompute();
  };
  items.forEach((it, i) => {
    // Migrate legacy {title,desc} → single name on first render.
    if (it.name == null) it.name = it.title || it.desc || '';
    const row = document.createElement('div');
    row.className = 'cd-config-row';
    row.dataset.index = String(i);
    row.style.cssText = 'border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px;';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:auto 1fr 160px 130px auto;gap:8px;align-items:center;';

    const handle = mkDragHandle();
    const name = document.createElement('input');
    name.className = 'input cd-name-input';
    name.type = 'text';
    name.placeholder = 'Name (e.g. Christmas)';
    name.maxLength = 25;
    name.value = it.name || '';
    name.style.cssText = 'font-size:16px;font-weight:600;';
    const date = mkPickerInput('date', it.date);
    const time = mkPickerInput('time', it.time);
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'btn btn-ghost'; del.textContent = '✕';
    del.title = 'Remove'; del.style.cssText = 'padding:4px 9px;';

    grid.append(handle, name, date, time, del);
    row.append(grid);

    name.addEventListener('input', () => { it.name = name.value.slice(0, 25); it.title = it.name; countdownRecompute(); });
    date.addEventListener('input', () => { it.date = date.value; countdownRecompute(); });
    time.addEventListener('input', () => { it.time = time.value; countdownRecompute(); });
    del.addEventListener('click', () => { items.splice(i, 1); renderCountdownItems(); countdownRecompute(); });

    // Drag wiring: arm draggability only when the grip is pressed.
    handle.addEventListener('mousedown', () => { row.setAttribute('draggable', 'true'); handle.style.cursor = 'grabbing'; });
    handle.addEventListener('mouseup', () => { handle.style.cursor = 'grab'; });
    row.addEventListener('dragstart', (e) => {
      dragFrom = i; row.classList.add('cd-dragging');
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); } catch (_) {}
    });
    row.addEventListener('dragend', () => { row.classList.remove('cd-dragging'); row.removeAttribute('draggable'); handle.style.cursor = 'grab'; wrap.querySelectorAll('.cd-drop-target').forEach((r) => r.classList.remove('cd-drop-target')); });
    row.addEventListener('dragover', (e) => { e.preventDefault(); try { e.dataTransfer.dropEffect = 'move'; } catch (_) {} row.classList.add('cd-drop-target'); });
    row.addEventListener('dragleave', () => row.classList.remove('cd-drop-target'));
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('cd-drop-target');
      const to = parseInt(row.dataset.index, 10);
      reorder(dragFrom, to);
      dragFrom = -1;
    });

    wrap.appendChild(row);
  });
}

// ── Countdown display units (per-widget visibility toggles) ──
const COUNTDOWN_UNIT_ORDER = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];
const COUNTDOWN_UNIT_LABELS = { years: 'Years', months: 'Months', days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' };
function countdownUnitsArr() {
  let u = state.currentSettings.countdownUnits;
  if (!Array.isArray(u)) u = COUNTDOWN_UNIT_ORDER.slice();
  const set = new Set(u.filter((x) => COUNTDOWN_UNIT_ORDER.includes(x)));
  const out = COUNTDOWN_UNIT_ORDER.filter((x) => set.has(x));
  return out.length ? out : COUNTDOWN_UNIT_ORDER.slice();
}
function renderCountdownUnits() {
  const wrap = document.getElementById('countdown-units');
  if (!wrap) return;
  const enabled = new Set(countdownUnitsArr());
  wrap.innerHTML = '';
  COUNTDOWN_UNIT_ORDER.forEach((u) => {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:13px;margin:0 14px 8px 0;cursor:pointer;';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = enabled.has(u); cb.dataset.unit = u;
    cb.addEventListener('change', () => {
      const cur = new Set(countdownUnitsArr());
      if (cb.checked) cur.add(u); else cur.delete(u);
      // Keep at least one unit visible.
      if (cur.size === 0) { cur.add(u); cb.checked = true; }
      state.currentSettings.countdownUnits = COUNTDOWN_UNIT_ORDER.filter((x) => cur.has(x));
      syncCountdownPreview({ units: state.currentSettings.countdownUnits });
      updateSaveBar();
    });
    const span = document.createElement('span'); span.textContent = COUNTDOWN_UNIT_LABELS[u];
    lab.append(cb, span);
    wrap.appendChild(lab);
  });
}
function setupCountdownConfig() {
  const toggle = document.getElementById('countdown-toggle');
  if (toggle) toggle.addEventListener('change', () => {
    state.currentSettings.countdownEnabled = toggle.checked;
    const cfg = document.getElementById('countdown-config');
    if (cfg) cfg.style.display = toggle.checked ? 'block' : 'none';
    updateSaveBar();
  });
  document.getElementById('countdown-add-btn')?.addEventListener('click', () => {
    countdownItemsArr().push({ id: 'cd' + Math.random().toString(36).slice(2, 9), name: '', title: '', date: '', time: '' });
    renderCountdownItems(); countdownRecompute();
    const inputs = document.querySelectorAll('#countdown-items input.cd-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  });
  renderCountdownUnits();
  const exp = document.getElementById('countdown-expired');
  if (exp) exp.addEventListener('change', () => {
    state.currentSettings.countdownExpired = exp.value; updateSaveBar();
    syncCountdownPreview({ expired: exp.value });
  });
  document.getElementById('countdown-preview-btn')?.addEventListener('click', openCountdownPreview);
  document.getElementById('countdown-preview-close')?.addEventListener('click', closeCountdownPreview);
  document.getElementById('countdown-preview-done')?.addEventListener('click', closeCountdownPreview);
  const modal = document.getElementById('countdown-preview-modal');
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeCountdownPreview(); });
}
// Destroy any live preview widgets currently mounted in the modal.
function destroyCountdownPreviewWidgets() {
  if (Array.isArray(state.countdownPreviewWidgets)) {
    state.countdownPreviewWidgets.forEach((w) => { try { w.destroy(); } catch (_) {} });
  }
  state.countdownPreviewWidgets = [];
  state.countdownPreviewWidget = null;
}
// Push a config patch (units / expired) to every open preview widget.
function syncCountdownPreview(patch) {
  if (Array.isArray(state.countdownPreviewWidgets)) {
    state.countdownPreviewWidgets.forEach((w) => { try { w.setConfig(patch); } catch (_) {} });
  }
}
function openCountdownPreview() {
  if (countdownValidCount() === 0) return;
  const modal = document.getElementById('countdown-preview-modal');
  const host = document.getElementById('countdown-preview-host');
  if (!modal || !host || typeof CountdownWidget === 'undefined' || typeof CountdownListWidget === 'undefined') return;
  destroyCountdownPreviewWidgets();
  host.innerHTML = '';

  const items = countdownItemsArr();
  const units = countdownUnitsArr();
  const expired = state.currentSettings.countdownExpired || 'started';

  // Two live cards side by side — the single big timer and the scrolling list —
  // exactly as they render on the dashboard. No configuration controls are
  // mounted here (no onConfigChange is passed), so the preview is display-only.
  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;';
  const mkCard = (label) => {
    const card = document.createElement('div');
    const cap = document.createElement('div');
    cap.textContent = label;
    cap.style.cssText = 'font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:8px;';
    const tile = document.createElement('div');
    tile.style.cssText = 'border:1px solid var(--border);border-radius:12px;padding:14px;height:240px;background:var(--bg-card,rgba(255,255,255,0.03));overflow:hidden;';
    const inner = document.createElement('div'); inner.style.cssText = 'height:100%;';
    tile.appendChild(inner);
    card.append(cap, tile);
    return { card, host: inner };
  };
  const single = mkCard('Countdown');
  const list = mkCard('Countdown List');
  grid.append(single.card, list.card);
  host.appendChild(grid);

  state.countdownPreviewWidgets = [];
  const w1 = new CountdownWidget(single.host, { items: items.slice(0, 1), expired, units });
  w1.start(); state.countdownPreviewWidgets.push(w1);
  const w2 = new CountdownListWidget(list.host, { items, expired, units, carousel: true, visibleCount: 5 });
  w2.start(); state.countdownPreviewWidgets.push(w2);

  modal.classList.add('visible');
}
function closeCountdownPreview() {
  const modal = document.getElementById('countdown-preview-modal');
  if (modal) modal.classList.remove('visible');
  destroyCountdownPreviewWidgets();
}

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

  if (tab === 'settings') {
    updateSaveBar();
  } else {
    pendingBanner.style.display = 'none';
    saveBar.classList.remove('visible');
  }

  if (tab === 'integrations') {
    renderIntegrationGrid();
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

  // Collapsed by default — users expand the folders they want (or search).
  folderRow.classList.add('collapsed');
  children.classList.add('hidden');

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

function wizTreeCollapseAll(collapse) {
  bookmarkTree.querySelectorAll('.tree-folder').forEach((f) => f.classList.toggle('collapsed', collapse));
  bookmarkTree.querySelectorAll('.tree-children').forEach((c) => c.classList.toggle('hidden', collapse));
}

// Filter the bookmark tree by a query: hide non-matching rows, auto-expand
// folders that contain a match. Empty query restores the collapsed default.
function wizFilterTree(query) {
  if (!bookmarkTree) return;
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    bookmarkTree.querySelectorAll('.tree-node, .tree-bookmark').forEach((el) => { el.style.display = ''; });
    wizTreeCollapseAll(true);
    return;
  }
  const visit = (wrapper) => {
    const folder = wrapper.querySelector(':scope > .tree-folder');
    const children = wrapper.querySelector(':scope > .tree-children');
    if (!folder || !children) return false;
    const label = (folder.querySelector('.folder-label') || {}).textContent || '';
    let any = false;
    children.querySelectorAll(':scope > .tree-node').forEach((child) => { if (visit(child)) any = true; });
    children.querySelectorAll(':scope > .tree-bookmark').forEach((bm) => {
      const t = bm.querySelector('.bm-title');
      const hay = ((t && t.textContent) || '').toLowerCase() + ' ' + ((t && t.title) || '').toLowerCase();
      const m = hay.includes(q);
      bm.style.display = m ? '' : 'none';
      if (m) any = true;
    });
    const show = label.toLowerCase().includes(q) || any;
    wrapper.style.display = show ? '' : 'none';
    if (any) { folder.classList.remove('collapsed'); children.classList.remove('hidden'); }
    return show;
  };
  bookmarkTree.querySelectorAll(':scope > .tree-node').forEach(visit);
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
  // Mirror into the wizard's selection count + clear its error once non-zero.
  const wc = document.getElementById('wiz-sel-count');
  if (wc) wc.textContent = count;
  const we = document.getElementById('wiz-sel-err');
  if (we && count > 0) we.style.display = 'none';
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
      const results = await processBookmarkBatch(batches[i], settings);
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

async function processBookmarkBatch(bookmarks, settings) {
  const prompt = `You are a browser bookmark metadata enricher. Analyze these bookmarks and return a JSON array with enriched metadata.

For each bookmark, return an object with exactly these fields:
- "id": the original id string (unchanged)
- "url": the original url (unchanged)
- "name": clean display name, max 35 chars
- "description": what this site/page is about, max 120 chars, be specific and helpful
- "category": one of: Development, Design, News, Social, Entertainment, Finance, Shopping, Productivity, Reference, Education, Health, Travel, Food, Sports, Technology, AI, Other
- "icon_slug": the app/brand slug for this site, lowercase with words separated by hyphens. Use the common product name. This is matched against dashboard-icons and Simple Icons, which include self-hosted apps, so include those too. Examples: "github", "youtube", "notion", "sabnzbd", "sonarr", "radarr", "jellyfin", "home-assistant", "pi-hole", "uptime-kuma". Use null only if it's not a recognizable product.
- "icon_emoji": a single relevant emoji as last-resort fallback (only used if no icon can be fetched)

Input bookmarks:
${JSON.stringify(bookmarks.map((b) => ({ id: b.id, url: b.url, title: b.title, folder: b.folder })), null, 2)}

Return ONLY a valid JSON array, no markdown, no explanation.`;

  // Route to the selected AI provider (OpenRouter / OpenAI / Anthropic / etc.).
  const content = (await callProviderAI(
    [{ role: 'user', content: prompt }],
    { maxTokens: 4000, temperature: 0.3, settings }
  )) || '[]';

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

// ── Tier 1: Chrome's own cached favicon (the one you see in the bookmark) ─────
// Uses the MV3 _favicon API (requires the "favicon" permission). Chrome returns
// a generic default-globe image when it has no favicon for a URL, so we detect
// and reject that placeholder by comparing a pixel signature against a known
// reference (the icon Chrome returns for a guaranteed-nonexistent page).

let _faviconDefaultSig; // cached signature of Chrome's default-globe placeholder

function chromeFaviconUrl(pageUrl, size = 64) {
  try {
    return chrome.runtime.getURL(
      '/_favicon/?pageUrl=' + encodeURIComponent(pageUrl) + '&size=' + size);
  } catch { return null; }
}

// Load an image (same-origin extension URL) and return it, or null on failure.
function loadImageEl(url, ms = 5000) {
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ''; resolve(null); }, ms);
    img.onload  = () => { clearTimeout(t); resolve(img.naturalWidth > 0 ? img : null); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = url;
  });
}

// Compact pixel signature of an image (downscaled to 16×16). Same-origin
// extension images aren't tainted, so getImageData is allowed.
function imageSignature(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, 16, 16);
    const d = ctx.getImageData(0, 0, 16, 16).data;
    let s = '';
    for (let i = 0; i < d.length; i += 8) s += d[i].toString(16);
    return s;
  } catch { return null; }
}

async function getFaviconDefaultSig() {
  if (_faviconDefaultSig !== undefined) return _faviconDefaultSig;
  const refUrl = chromeFaviconUrl('https://no-such-site-' + Date.now() + '.invalid/');
  const img = refUrl ? await loadImageEl(refUrl) : null;
  _faviconDefaultSig = img ? imageSignature(img) : null;
  return _faviconDefaultSig;
}

async function chromeCachedFavicon(pageUrl) {
  const url = chromeFaviconUrl(pageUrl);
  if (!url) return null;
  const img = await loadImageEl(url);
  if (!img) return null;
  // Reject Chrome's default-globe placeholder.
  const sig = imageSignature(img);
  const def = await getFaviconDefaultSig();
  if (sig && def && sig === def) return null;
  return url;
}

// ── Tier 2: the site's own declared icon, read from its HTML metadata ─────────
// Extension fetches bypass CORS (host_permissions cover http/https), so we can
// pull the page, parse <link rel=icon/apple-touch-icon> and og:image, and fall
// back to the well-known /favicon.ico and /apple-touch-icon.png paths.
async function siteIcon(origin, pageUrl) {
  try {
    const resp = await fetch(pageUrl, { redirect: 'follow' });
    if (resp.ok) {
      const html = await resp.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const cands = [];
      doc.querySelectorAll(
        'link[rel~="apple-touch-icon"], link[rel~="icon"], link[rel="shortcut icon"]'
      ).forEach((el) => { const h = el.getAttribute('href'); if (h) cands.push(h); });
      const og = doc.querySelector('meta[property="og:image"], meta[name="og:image"]');
      const ogc = og && og.getAttribute('content');
      if (ogc) cands.push(ogc); // last — may be a wide banner, but better than a globe
      for (const href of cands) {
        try {
          const abs = new URL(href, pageUrl).href;
          if (await testImage(abs, 5000)) return abs;
        } catch { /* bad href */ }
      }
    }
  } catch { /* fetch blocked / network error — fall through to path guesses */ }

  // Well-known paths some sites serve without declaring them.
  for (const p of ['/apple-touch-icon.png', '/favicon.ico']) {
    if (await testImage(origin + p, 5000)) return origin + p;
  }
  return null;
}

// Build an ordered list of brand-icon URLs to try for an AI-guessed slug.
// dashboard-icons (homarr-labs) and selfh.st cover hundreds of self-hosted apps
// (SABnzbd, Sonarr, Radarr, Jellyfin, …) that Simple Icons deliberately omits,
// so they go first; Simple Icons is the last brand source for big-name brands.
function brandIconCandidates(slug) {
  const base = String(slug || '').toLowerCase().trim();
  if (!base) return [];
  // Slug spelling varies between repos: "home-assistant" vs "homeassistant".
  const variants = [];
  const add = (v) => { if (v && !variants.includes(v)) variants.push(v); };
  add(base.replace(/\s+/g, '-'));   // hyphenated
  add(base.replace(/[\s-]+/g, ''));  // no separators
  const urls = [];
  for (const v of variants) {
    urls.push(`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg/${v}.svg`);
    urls.push(`https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/${v}.png`);
    urls.push(`https://cdn.jsdelivr.net/gh/selfhst/icons/svg/${v}.svg`);
  }
  for (const v of variants) {
    urls.push(`https://cdn.simpleicons.org/${encodeURIComponent(v)}`);
  }
  return urls;
}

// Try each brand-icon candidate; return the first that loads, or null.
async function resolveBrandIcon(slug) {
  for (const url of brandIconCandidates(slug)) {
    if (await testImage(url, 4000)) return url;
  }
  return null;
}

/**
 * Resolve a single bookmark's icon. Returns { url, source } or null.
 *
 * Order (best/most-accurate first):
 *   1. chrome  — Chrome's own cached favicon (instant, matches the bookmark)
 *   2. site    — the site's declared icon / well-known favicon paths
 *   3. brand   — the AI's best-guess glyph (dashboard-icons → selfh.st → Simple Icons)
 *   4. google  — Google's favicon cache (often a generic globe → weak)
 * If none succeed, the caller applies GENERIC_ICON_URL.
 */
async function resolveIconUrl(bm) {
  let origin, hostname, pageUrl;
  try {
    const u = new URL(bm.url);
    if (!u.protocol.startsWith('http')) return null; // skip file://, chrome://, etc.
    origin = u.origin; hostname = u.hostname; pageUrl = u.href;
  } catch {
    return null;
  }

  // 1. Chrome's cached favicon — what the user already sees in their bookmark.
  const chromeUrl = await chromeCachedFavicon(pageUrl);
  if (chromeUrl) return { url: chromeUrl, source: 'chrome' };

  // 2. The site's own icon (declared metadata, then well-known paths).
  const site = await siteIcon(origin, pageUrl);
  if (site) return { url: site, source: 'site' };

  // 3. AI's best-guess brand glyph (self-hosted icon repos first, then Simple Icons).
  if (bm.icon_slug) {
    const brand = await resolveBrandIcon(bm.icon_slug);
    if (brand) return { url: brand, source: 'brand' };
  }

  // 4. Last resort: Google's favicon cache (often a generic globe → weak).
  const googleUrl = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  if (await testImage(googleUrl, 5000)) return { url: googleUrl, source: 'google' };

  return null;
}

// Brand-first resolution used by "Refresh missing icons": prefer the AI's
// brand glyph over a weak favicon fallback. Returns the same shape.
async function resolveIconBrandFirst(bm) {
  if (bm.icon_slug) {
    const brand = await resolveBrandIcon(bm.icon_slug);
    if (brand) return { url: brand, source: 'brand' };
  }
  return resolveIconUrl(bm);
}

// True when a bookmark's icon is a weak/default fallback the user may want to
// improve: the generic placeholder, an empty icon, or a Google-globe favicon.
// Works for freshly built dashboards (via the icon_source/icon_is_fallback
// flags) and older ones (by sniffing the stored URL).
function iconIsWeak(b) {
  return b.icon_is_generic
    || b.icon_is_fallback
    || b.icon_source === 'google'
    || b.icon_source === 'generic'
    || !b.resolved_icon
    || b.resolved_icon === GENERIC_ICON_URL
    || (typeof b.resolved_icon === 'string' && b.resolved_icon.includes('google.com/s2/favicons'));
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
    const r = await resolveIconUrl(bm);
    if (r) {
      // Bake the resolved icon into a self-contained data: URI so it survives a
      // backup/restore on any browser — the chrome _favicon cache URL (and other
      // live URLs) are otherwise local references that go blank elsewhere.
      let url = r.url;
      if (url && !url.startsWith('data:')) {
        try { url = await downloadIconAsDataUri(url); } catch (_) { /* keep the URL as a fallback */ }
      }
      bm.resolved_icon = url;
      bm.icon_source = r.source;
    } else {
      bm.resolved_icon = GENERIC_ICON_URL;
      bm.icon_source = 'generic';
    }
    bm.icon_is_generic = bm.icon_source === 'generic';
    // Behind-the-scenes flag: a weak/default fallback the user can later refresh.
    bm.icon_is_fallback = bm.icon_source === 'google' || bm.icon_source === 'generic';
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

// The default dashboard is always the first (top) active one in the list.
function syncDefaultDashboard() {
  const first = state.dashboards.find((d) => d.active !== false) || state.dashboards[0];
  state.defaultDashboardId = first ? first.id : null;
}

async function saveDashboards() {
  syncDefaultDashboard();   // top of the list = default
  await chromeStorageSet({
    dashboards: state.dashboards,
    defaultDashboardId: state.defaultDashboardId,
  });
}

// ── Cloud backup helpers (talk to the service worker) ───────────────────────
function sendBg(msg) {
  return new Promise((resolve) => {
    try { chrome.runtime.sendMessage(msg, (resp) => { resolve(chrome.runtime.lastError ? null : resp); }); }
    catch (_) { resolve(null); }
  });
}

// ── GitHub Gist backup (talks to the service worker) ─────────────────────────
function updateGistControls() {
  const s = state.currentSettings || {};
  const on = !!s.gistSync;
  const hasPass = !!s.backupPassphrase;
  const hasToken = !!s.gistToken;
  const setDisabled = (id, d) => { const el = document.getElementById(id); if (el) el.disabled = d; };
  // Token + passphrase can only be edited when the backup service is enabled.
  setDisabled('backup-passphrase', !on);
  setDisabled('backup-passphrase-toggle', !on);
  setDisabled('gist-token', !on);
  setDisabled('gist-token-toggle', !on);
  // A passphrase is required before you can test the token.
  setDisabled('gist-test-btn', !(on && hasPass));
  // Back up / restore need the service on, a token, and a passphrase.
  setDisabled('gist-backup-btn', !(on && hasToken && hasPass));
  setDisabled('gist-restore-btn', !(on && hasToken && hasPass));
  // Auto-sync needs the same prerequisites as a backup.
  setDisabled('gist-autosync-toggle', !(on && hasToken && hasPass));
}
async function refreshGistStatus() {
  const line = document.getElementById('gist-status');
  updateGistControls();
  if (!line) return;
  const resp = await sendBg({ type: 'gistStatus' });
  if (!resp) { line.textContent = ''; line.style.display = 'none'; return; }
  let txt;
  if (resp.error && resp.error.code === 'schema') {
    txt = 'A newer version of the extension created the Gist backup. Update this browser to resume.';
  } else if (resp.error && resp.error.code === 'passphrase') {
    txt = 'This backup is encrypted. Enter the matching passphrase below and click Save to unlock it.';
  } else if (!resp.enabled) {
    txt = 'Turn this on, add a token + passphrase, and click Save to enable Gist backup.';
  } else if (!resp.hasToken) {
    txt = 'Paste a GitHub token (gists scope) and click Save.';
  } else if (!resp.hasPassphrase || (resp.error && resp.error.code === 'noPassphrase')) {
    txt = 'An encryption passphrase is required. Set one below and click Save to enable Gist backup.';
  } else if (resp.error && resp.error.code === 'auth') {
    txt = 'GitHub rejected the token. Click Test, and check it has the "gists" scope and is not expired.';
  } else {
    txt = 'GitHub Gist backup is active.';
    if (resp.lastBackupAt) txt += ' Last backup: ' + new Date(resp.lastBackupAt).toLocaleString() + '.';
  }
  line.textContent = txt;
  line.style.display = '';
}
async function gistAction(type, btn, busyLabel) {
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = busyLabel;
  const resp = await sendBg({ type });
  btn.textContent = orig; btn.disabled = false;
  if (type === 'gistRestore' && resp && resp.ok) { location.reload(); return; }
  if (resp && !resp.ok) {
    const reason = resp.reason;
    if (reason === 'disabled') alert('Turn on "Back up to GitHub Gist", add a token + passphrase, and click Save first.');
    else if (reason === 'noPassphrase') alert('An encryption passphrase is required for Gist backup. Set one in the field below and click Save first.');
    else if (reason === 'none') alert('No backup found in your gists yet. Use "Back up to Gist" to create one.');
    else if (reason === 'schema') alert('The Gist backup was created by a newer version of the extension. Update this browser first.');
    else if (reason === 'passphrase') alert('This backup is encrypted. Enter the matching passphrase in the field below and click Save, then try again.');
    else if (reason === 'auth') alert('GitHub rejected the request. Make sure your token is saved and has Gist access, then click Test.');
  }
  refreshGistStatus();
}
function showGistValidationResult(type, msg) {
  const el = document.getElementById('gist-validation-result');
  if (!el) return;
  el.style.display = 'block';
  el.className = `banner banner-${type === 'success' ? 'success' : 'danger'}`;
  el.textContent = msg;
}
// Test the token currently in the field (may be unsaved), like the API Validate button.
async function gistTestToken() {
  const input = document.getElementById('gist-token');
  const btn = document.getElementById('gist-test-btn');
  const token = (input && input.value || '').trim();
  if (!state.currentSettings.backupPassphrase) { showGistValidationResult('error', 'Set an encryption passphrase first.'); return; }
  if (!token) { showGistValidationResult('error', 'Please paste a GitHub token first.'); return; }
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  const resp = await sendBg({ type: 'gistTest', token });
  if (btn) { btn.disabled = false; btn.innerHTML = 'Test'; }
  if (resp && resp.ok) {
    showGistValidationResult('success', '✓ Token works' + (resp.login ? ` — signed in as ${resp.login}` : '') + '. Gist access confirmed.');
  } else {
    const r = resp && resp.reason;
    if (r === 'empty') showGistValidationResult('error', 'Please paste a GitHub token first.');
    else if (r === 'unauthorized') showGistValidationResult('error', '✗ Token is invalid or expired.');
    else if (r === 'noGistScope') showGistValidationResult('error', '✗ Signed in, but this token doesn’t have permission to access Gists.');
    else if (r === 'network') showGistValidationResult('error', '✗ Network error: ' + (resp.msg || 'could not reach GitHub.'));
    else showGistValidationResult('error', '✗ Could not validate the token' + (resp && resp.status ? ` (HTTP ${resp.status})` : '') + '.');
  }
}

// ── Export / Import (universal cross-browser backup) ─────────────────────────
// Writes the full configuration to a JSON file the user can carry to any browser.
// The file holds settings (incl. any API keys), dashboards (with embedded icons),
// and the default-dashboard pointer.
function exportConfig() {
  const version = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '';
  const payload = {
    app: 'Auto Dashboard AI',
    type: 'config-backup',
    version,
    exportedAt: new Date().toISOString(),
    settings: state.currentSettings,
    dashboards: state.dashboards,
    defaultDashboardId: state.defaultDashboardId,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auto-dashboard-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importConfig(file) {
  let text;
  try { text = await file.text(); } catch (_) { alert('Could not read that file.'); return; }
  let data;
  try { data = JSON.parse(text); } catch (_) { alert('That file is not valid JSON.'); return; }
  const hasSettings = data && typeof data.settings === 'object' && data.settings;
  const hasDashboards = data && Array.isArray(data.dashboards);
  if (!hasSettings && !hasDashboards) {
    alert('This does not look like an Auto Dashboard AI configuration file.');
    return;
  }
  if (!confirm('Import will REPLACE your current settings and dashboards with the contents of this file. This cannot be undone.\n\nContinue?')) return;
  const writeObj = {};
  if (hasSettings) writeObj.settings = normalizeAISettings({ ...DEFAULT_SETTINGS, ...data.settings });
  if (hasDashboards) writeObj.dashboards = data.dashboards;
  if (typeof data.defaultDashboardId === 'string' || data.defaultDashboardId === null) {
    writeObj.defaultDashboardId = data.defaultDashboardId;
  }
  await chromeStorageSet(writeObj);
  location.reload();   // re-read everything from storage so the UI reflects the import
}

function renderDashboardList() {
  if (state.dashboards.length === 0) {
    dashboardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>No dashboards yet.</p>
        <p>Click “+ Create Dashboard” to make your first one.</p>
      </div>`;
    return;
  }

  dashboardList.innerHTML = '';
  syncDefaultDashboard();
  // The default dashboard is the first active one (top of the list).
  const defaultId = (state.dashboards.find((d) => d.active !== false) || state.dashboards[0])?.id;
  // Render in the persisted array order (drag-and-drop reorders this array).
  state.dashboards.forEach((dash) => {
    const isDefault = dash.id === defaultId;
    const isActive = dash.active !== false; // default visible
    const card = document.createElement('div');
    card.className = `dashboard-card${isDefault ? ' is-default' : ''}${isActive ? '' : ' is-inactive'}`;
    card.draggable = true;
    card.dataset.id = dash.id;
    const bms = dash.bookmarks || [];
    const folderCount = new Set(bms.map((b) => b.folder)).size;

    card.innerHTML = `
      <span class="dash-grip" title="Drag to reorder">⠿</span>
      <div class="dashboard-card-top" style="flex:1;min-width:0;">
        <div>
          <div class="dashboard-card-name">
            ${escapeHtml(dash.name)}
            ${isDefault ? '<span class="badge badge-accent">Default</span>' : ''}
            ${isActive ? '' : '<span class="badge badge-muted">Hidden</span>'}
          </div>
          ${isDefault ? '<div class="dashboard-card-meta" style="color:var(--text-muted);">Top of the list — shown by default</div>' : ''}
          <div class="dashboard-card-meta">
            ${bms.length} bookmarks · ${folderCount} folders · ${formatDate(dash.createdAt)}
          </div>
        </div>
        <div class="dashboard-card-actions">
          <label class="dash-active" title="Show this dashboard in the switcher">
            <span class="dash-active-label">Active</span>
            <span class="toggle-switch">
              <input type="checkbox" class="dash-active-input" ${isActive ? 'checked' : ''}>
              <span class="toggle-slider"></span>
            </span>
          </label>
          <button class="btn btn-secondary btn-sm" data-action="open" data-id="${dash.id}">Open</button>
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${dash.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-action="delete" data-id="${dash.id}">Delete</button>
        </div>
      </div>`;

    card.querySelector('.dash-active-input')?.addEventListener('change', async (e) => {
      dash.active = e.target.checked;
      await saveDashboards();
      renderDashboardList();
    });

    card.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => handleDashboardAction(btn.dataset.action, btn.dataset.id));
    });
    card.addEventListener('dragstart', () => card.classList.add('dragging'));
    card.addEventListener('dragend', onDashDragEnd);

    dashboardList.appendChild(card);
  });
}

// Which card the dragged one should be inserted before, based on cursor Y.
function dashAfterElement(y) {
  const els = [...dashboardList.querySelectorAll('.dashboard-card:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element || null;
}

async function onDashDragEnd() {
  dashboardList.querySelectorAll('.dragging').forEach((c) => c.classList.remove('dragging'));
  // Reorder state.dashboards to match the new DOM order and persist it.
  const order = [...dashboardList.querySelectorAll('.dashboard-card')].map((c) => c.dataset.id);
  state.dashboards.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  await saveDashboards();
  renderDashboardList();   // refresh the "Default" badge on the new top item
}

function setupDashboardSetup() {
  dashboardList.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = dashboardList.querySelector('.dragging');
    if (!dragging) return;
    const after = dashAfterElement(e.clientY);
    if (after == null) dashboardList.appendChild(dragging);
    else dashboardList.insertBefore(dragging, after);
  });

  document.getElementById('create-dashboard-btn')?.addEventListener('click', openWizard);
}

// ─── Dashboard creation wizard ────────────────────────────────────────────────
const WIZ_STEPS = 4;
const WIZ_LABELS = { 1: 'Details', 2: 'Bookmark organization', 3: 'Processing', 4: 'Preview & edit' };
const wizard = { step: 1, data: {}, editId: null };

// Relocate the existing bookmark tree + controls into the wizard (once), so the
// wizard reuses all the selection / expand-collapse logic already wired up.
function wizMountTree() {
  const mount = document.getElementById('wiz-tree-mount');
  if (!mount || mount.dataset.mounted) return;
  const controls = document.querySelector('#legacy-create-ui .tree-controls');
  const tree = document.getElementById('bookmark-tree');
  if (controls) mount.appendChild(controls);
  if (tree) mount.appendChild(tree);
  mount.dataset.mounted = '1';
}

function openWizard() {
  wizard.editId = null;
  wizard.step = 1;
  wizWidgetTab = 'live';
  wizard.data = { title: '', description: '', theme: '', widgets: [] };
  ['wiz-title', 'wiz-desc', 'wiz-theme', 'wiz-bm-search'].forEach((id) => { const el = document.getElementById(id); if (el) el.value = ''; });
  const err = document.getElementById('wiz-title-err'); if (err) err.style.display = 'none';

  // Step 2 defaults: fresh selection, folder mode, hidden max-sections.
  const folderRadio = document.querySelector('input[name="wiz-org"][value="folder"]');
  if (folderRadio) folderRadio.checked = true;
  const maxRow = document.getElementById('wiz-maxsec-row'); if (maxRow) maxRow.style.display = 'none';
  const maxSec = document.getElementById('wiz-maxsec'); if (maxSec) maxSec.value = '8';
  const selErr = document.getElementById('wiz-sel-err'); if (selErr) selErr.style.display = 'none';
  // Reset icon shape → Rounded, show-text → on.
  selectShapeOption('wiz-shape-picker', 'rounded');
  const textToggle = document.getElementById('wiz-text-toggle'); if (textToggle) textToggle.checked = true;
  state.selectedBookmarkIds.clear();
  wizMountTree();
  loadBookmarkTree();          // re-renders the tree (all unchecked) and updates the count

  renderEditHeader();          // hides the edit-mode header in create flow
  wizGoTo(1);
  document.getElementById('dash-wizard').classList.add('open');
  setTimeout(() => document.getElementById('wiz-title')?.focus(), 50);
}
function closeWizard() { document.getElementById('dash-wizard').classList.remove('open'); }

function wizGoTo(n) {
  wizard.step = n;
  for (let i = 1; i <= WIZ_STEPS; i++) {
    const el = document.getElementById(`wiz-step-${i}`);
    if (el) el.style.display = i === n ? ((i === 2 || i === 4) ? 'flex' : 'block') : 'none';
  }
  // Steps 2 & 4 use a wide, full-height modal (tree / preview need the room).
  document.querySelector('.wiz-modal')?.classList.toggle('wiz-wide', n === 2 || n === 4);
  const editing = !!wizard.editId;
  const titleEl = document.querySelector('.wiz-title');
  if (titleEl) titleEl.textContent = editing ? 'Edit Dashboard' : 'Create Dashboard';
  const ind = document.getElementById('wiz-stepind');
  if (ind) ind.textContent = editing ? 'Rearrange & edit' : `Step ${n} of ${WIZ_STEPS} · ${WIZ_LABELS[n]}`;
  document.getElementById('wiz-back').disabled = editing || n === 1;
  document.getElementById('wiz-next').textContent = editing ? 'Save Changes' : (n === WIZ_STEPS ? 'Generate Dashboard' : 'Next');
  // Step 3 (processing) auto-advances, so hide the Back/Next footer there.
  const foot = document.querySelector('.wiz-foot');
  if (foot) foot.style.display = n === 3 ? 'none' : '';
  if (n === 4) renderWizWidgetPanel();   // optional "Add Widgets" panel (create flow)
}

// Validate + capture the current step's input. Returns false to block advancing.
function wizValidateStep(n) {
  if (n === 1) {
    const title = document.getElementById('wiz-title').value.trim();
    const err = document.getElementById('wiz-title-err');
    if (!title) { if (err) err.style.display = 'block'; document.getElementById('wiz-title').focus(); return false; }
    if (err) err.style.display = 'none';
    wizard.data.title = title;
    wizard.data.description = document.getElementById('wiz-desc').value.trim();
    wizard.data.theme = document.getElementById('wiz-theme').value.trim();
  }
  if (n === 2) {
    if (state.selectedBookmarkIds.size === 0) {
      const se = document.getElementById('wiz-sel-err'); if (se) se.style.display = 'block';
      return false;
    }
    wizard.data.orgMethod = document.querySelector('input[name="wiz-org"]:checked')?.value || 'folder';
    wizard.data.maxSections = Math.max(1, Math.min(30, parseInt(document.getElementById('wiz-maxsec').value, 10) || 8));
    wizard.data.selectedIds = new Set(state.selectedBookmarkIds);
  }
  return true;
}

function wizNext() {
  if (!wizValidateStep(wizard.step)) return;
  if (wizard.step === 2) { wizGoTo(3); wizProcess(); return; }  // start processing
  if (wizard.step === 4) { wizGenerate(); return; }             // final generation
  if (wizard.step < WIZ_STEPS) wizGoTo(wizard.step + 1);
}
function wizBack() { if (wizard.step > 1) wizGoTo(wizard.step - 1); }

// ─── Wizard step 3: processing ────────────────────────────────────────────────
function wizProgress(status, pct, msg) {
  const s = document.getElementById('wiz-proc-status'); if (s && status != null) s.textContent = status;
  const b = document.getElementById('wiz-proc-bar'); if (b && pct != null) b.style.width = `${pct}%`;
  if (msg !== undefined) { const m = document.getElementById('wiz-proc-msg'); if (m) m.textContent = msg; }
}

// Group enriched bookmarks (by their .folder = section name) into ordered
// sections; "Other" always sorts last.
function buildStructure(bookmarks) {
  const map = new Map();
  bookmarks.forEach((b) => {
    const sec = b.folder || 'Other';
    if (!map.has(sec)) map.set(sec, []);
    map.get(sec).push(b);
  });
  const sections = [...map.entries()].map(([name, bms]) => ({ name, bookmarks: bms }));
  sections.sort((a, b) => (a.name === 'Other' ? 1 : 0) - (b.name === 'Other' ? 1 : 0));
  return sections;
}

// Keep at most `max` non-"Other" sections (by frequency); demote the rest to Other.
function enforceMaxSections(bookmarks, idToSection, max) {
  const counts = {};
  bookmarks.forEach((b) => { const s = idToSection[b.id] || 'Other'; if (s !== 'Other') counts[s] = (counts[s] || 0) + 1; });
  const keep = new Set(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, max).map((e) => e[0]));
  const out = {};
  bookmarks.forEach((b) => { const s = idToSection[b.id] || 'Other'; out[b.id] = (s === 'Other' || keep.has(s)) ? s : 'Other'; });
  return out;
}

// Ask the AI to assign each bookmark to a concise, theme-aware section name.
// Returns a map of bookmark id → section name. Tolerant of truncated responses:
// it salvages whatever complete pairs the model returned, and the caller falls
// back to folder names for any bookmark the AI didn't return.
async function aiCategorize(bookmarks, maxSections, theme) {
  const prompt =
`Organize these browser bookmarks into at most ${maxSections} dashboard sections.
${theme ? `Dashboard theme/context: "${theme}". Use it to guide grouping and naming.\n` : ''}Rules:
- Create concise, meaningful section names (1-3 words).
- Avoid redundant or overlapping sections.
- Do not exceed ${maxSections} sections (the "Other" bucket does not count).
- Put anything that doesn't fit into a section named exactly "Other".

Bookmarks:
${JSON.stringify(bookmarks.map((b) => ({ id: b.id, title: (b.title || '').slice(0, 80), url: b.url, description: (b.description || '').slice(0, 80) })))}

Return ONLY a compact JSON array: [{"id":"<id>","section":"<name>"}, ...]. No markdown, no commentary.`;

  let content = '';
  try {
    content = await callProviderAI([{ role: 'user', content: prompt }], { maxTokens: 8000, temperature: 0.2, settings: state.savedSettings });
  } catch (_) { content = ''; }

  const cleaned = (content || '').replace(/```(?:json)?\n?/g, '').trim();
  let arr = [];
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) arr = parsed;
  } catch (_) {
    // Truncated / malformed → salvage every complete {"id":...,"section":...} pair.
    const re = /\{\s*"id"\s*:\s*"([^"]+)"\s*,\s*"section"\s*:\s*"([^"]*)"\s*\}/g;
    let m;
    while ((m = re.exec(cleaned))) arr.push({ id: m[1], section: m[2] });
  }

  const map = {};
  arr.forEach((x) => { if (x && x.id) map[x.id] = (x.section || 'Other').toString().trim() || 'Other'; });
  return map;
}

async function wizProcess() {
  document.getElementById('wiz-proc-err').style.display = 'none';
  wizProgress('Preparing bookmarks…', 4, '');
  try {
    const bookmarks = collectSelectedBookmarks().filter((b) => wizard.data.selectedIds.has(b.id));
    if (!bookmarks.length) throw new Error('No bookmarks selected.');

    const dynamic = wizard.data.orgMethod === 'dynamic';
    const ai = activeAI(state.savedSettings);
    if (dynamic && !ai.apiKey) {
      throw new Error('Dynamic categorization needs an AI provider. Set one up in Settings → AI Provider, then try again — or use “Folder names” instead.');
    }

    // 1) Enrich (AI best-effort; falls back to basic metadata per batch on failure).
    const processed = [];
    const batches = chunkArray(bookmarks, AI_BATCH_SIZE);
    for (let i = 0; i < batches.length; i++) {
      wizProgress('Analyzing bookmarks with AI…', 8 + Math.round((i / batches.length) * 55), `Batch ${i + 1} of ${batches.length}`);
      let res;
      try {
        res = await processBookmarkBatch(batches[i], state.savedSettings);
      } catch (_) {
        res = batches[i].map((b) => ({
          id: b.id, url: b.url, title: (b.title || b.url).slice(0, 35), description: '',
          category: 'Other', icon_slug: null, icon_emoji: '🔗', folder: b.folder, folderPath: b.folderPath, resolved_icon: null,
        }));
      }
      processed.push(...res);
    }

    // 2) Resolve icons (real favicon → brand-icon guess → generic).
    wizProgress('Resolving icons…', 66, '');
    await resolveIcons(processed, 8, (done, total) => {
      wizProgress('Resolving icons…', 66 + Math.round((done / total) * 20), `${done}/${total}`);
    });

    // 3) Assign sections.
    if (dynamic) {
      wizProgress('Categorizing with AI…', 88, '');
      const map = await aiCategorize(processed, wizard.data.maxSections, wizard.data.theme);
      const enforced = enforceMaxSections(processed, map, wizard.data.maxSections);
      processed.forEach((b) => {
        if (enforced[b.id]) { b.folder = enforced[b.id]; return; }
        // AI didn't return this one (e.g. truncated) → use its folder name, or "Other".
        const path = b.folderPath || [];
        b.folder = path.length ? path[path.length - 1] : 'Other';
      });
    } else {
      wizProgress('Building sections from folders…', 88, '');
      processed.forEach((b) => {
        const path = b.folderPath || [];
        b.folder = path.length ? path[path.length - 1] : 'Other';
      });
    }

    // 4) Build the editable structure and advance.
    wizard.data.structure = buildStructure(processed);
    wizProgress('Done', 100, '');
    setTimeout(() => { renderWizPreview(); wizGoTo(4); }, 350);
  } catch (err) {
    wizProgress('Couldn’t build the dashboard', 0, '');
    const box = document.getElementById('wiz-proc-err');
    const txt = document.getElementById('wiz-proc-err-text');
    if (txt) txt.textContent = err.message;
    if (box) box.style.display = 'block';
  }
}

// ─── Wizard step 4: preview & edit ────────────────────────────────────────────
let wizDrag = null;       // { type: 'section' | 'bm' } during a drag
let wizEditRef = null;    // the bookmark object currently open in the edit modal

function wizBmIcon(b) {
  return b.resolved_icon
    || (b.icon_slug ? brandIconCandidates(b.icon_slug)[0] : '')
    || getFaviconUrl(b.url);
}

function renderWizPreview() {
  const host = document.getElementById('wiz-preview');
  if (!host) return;
  host.innerHTML = '';

  (wizard.data.structure || []).forEach((section, si) => {
    const sec = document.createElement('div');
    sec.className = 'wiz-sec';
    sec.draggable = true;
    sec.dataset.si = si;

    // header: grip + editable name + count + delete (enabled only when empty)
    const head = document.createElement('div');
    head.className = 'wiz-sec-head';
    const sgrip = document.createElement('span'); sgrip.className = 'dash-grip'; sgrip.title = 'Drag to reorder section'; sgrip.textContent = '⠿';
    const nameInput = document.createElement('input');
    nameInput.className = 'wiz-sec-name'; nameInput.value = section.name;
    nameInput.addEventListener('input', () => { section.name = nameInput.value; });
    const count = document.createElement('span'); count.className = 'wiz-sec-count'; count.textContent = section.bookmarks.length;

    // Per-section icon size (S/M/L) — stored on the section, persisted to layout.
    if (!section.iconSize) section.iconSize = 'medium';
    const sizeSel = document.createElement('div');
    sizeSel.className = 'wiz-sec-size';
    [['small', 'S'], ['medium', 'M'], ['large', 'L']].forEach(([sz, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'wiz-size-btn' + (section.iconSize === sz ? ' active' : '');
      b.dataset.size = sz; b.textContent = label;
      b.title = sz.charAt(0).toUpperCase() + sz.slice(1) + ' icons';
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        section.iconSize = sz;
        sizeSel.querySelectorAll('.wiz-size-btn').forEach((x) => x.classList.toggle('active', x.dataset.size === sz));
      });
      sizeSel.appendChild(b);
    });

    const del = document.createElement('button'); del.className = 'wiz-sec-del'; del.type = 'button'; del.textContent = '✕';
    del.disabled = section.bookmarks.length > 0;
    del.title = del.disabled ? 'Move all bookmarks out to delete this section' : 'Delete section';
    del.addEventListener('click', () => { wizard.data.structure.splice(si, 1); renderWizPreview(); });
    head.append(sgrip, nameInput, sizeSel, count, del);

    // bookmark list (drop target)
    const list = document.createElement('div');
    list.className = 'wiz-sec-bms' + (section.bookmarks.length ? '' : ' empty');
    list.dataset.si = si;
    if (!section.bookmarks.length) list.textContent = 'Drop bookmarks here';

    section.bookmarks.forEach((b, bi) => {
      const row = document.createElement('div');
      row.className = 'wiz-bm'; row.draggable = true; row._bm = b;
      const grip = document.createElement('span'); grip.className = 'dash-grip'; grip.textContent = '⠿';
      const ico = document.createElement('img'); ico.className = 'wiz-bm-ico'; ico.alt = ''; ico.src = wizBmIcon(b);
      ico.onerror = () => { ico.style.visibility = 'hidden'; };
      const title = document.createElement('span'); title.className = 'wiz-bm-title'; title.textContent = b.title || b.url;
      const editBtn = document.createElement('button'); editBtn.className = 'wiz-bm-edit-btn'; editBtn.type = 'button'; editBtn.title = 'Edit'; editBtn.textContent = '✎';
      const delBtn = document.createElement('button'); delBtn.className = 'wiz-bm-del'; delBtn.type = 'button'; delBtn.title = 'Delete'; delBtn.textContent = '✕';
      editBtn.addEventListener('click', (e) => { e.stopPropagation(); openBmEdit(b); });
      delBtn.addEventListener('click', (e) => { e.stopPropagation(); section.bookmarks.splice(bi, 1); renderWizPreview(); });
      row.addEventListener('dragstart', (e) => { e.stopPropagation(); wizDrag = { type: 'bm' }; row.classList.add('dragging'); });
      row.addEventListener('dragend', wizDragEnd);
      row.append(grip, ico, title, editBtn, delBtn);
      list.appendChild(row);
    });

    list.addEventListener('dragover', (e) => {
      if (!wizDrag || wizDrag.type !== 'bm') return;
      e.preventDefault(); e.stopPropagation();
      const dragging = document.querySelector('.wiz-bm.dragging');
      if (!dragging) return;
      const after = wizAfter(list, '.wiz-bm', e.clientY);
      if (after == null) list.appendChild(dragging); else list.insertBefore(dragging, after);
    });

    sec.append(head, list);
    sec.addEventListener('dragstart', () => { wizDrag = { type: 'section' }; sec.classList.add('dragging'); });
    sec.addEventListener('dragend', wizDragEnd);
    host.appendChild(sec);
  });
}

function wizAfter(container, selector, y) {
  const els = [...container.querySelectorAll(`${selector}:not(.dragging)`)];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element || null;
}

function wizDragEnd() {
  document.querySelectorAll('.wiz-sec.dragging, .wiz-bm.dragging').forEach((el) => el.classList.remove('dragging'));
  // Rebuild the structure from the DOM (captures section order, bookmark order,
  // and cross-section moves), then re-render to refresh counts/delete states.
  const host = document.getElementById('wiz-preview');
  const out = [];
  host.querySelectorAll('.wiz-sec').forEach((secEl) => {
    const name = secEl.querySelector('.wiz-sec-name').value;
    const bms = [];
    secEl.querySelectorAll('.wiz-bm').forEach((bmEl) => { if (bmEl._bm) bms.push(bmEl._bm); });
    out.push({ name, bookmarks: bms });
  });
  wizard.data.structure = out;
  wizDrag = null;
  renderWizPreview();
}

// ── Bookmark edit modal ──
function openBmEdit(b) {
  wizEditRef = b;
  document.getElementById('wiz-bm-title').value = b.title || '';
  document.getElementById('wiz-bm-desc').value = b.description || '';
  document.getElementById('wiz-bm-icon').value = (b.resolved_icon && !b.resolved_icon.startsWith('data:')) ? b.resolved_icon : '';
  const prev = document.getElementById('wiz-bm-icon-prev'); prev.src = wizBmIcon(b); prev.style.visibility = '';
  document.getElementById('wiz-bm-icon-hint').textContent = 'Paste an image URL — it’s downloaded and stored with the dashboard.';
  document.getElementById('wiz-bm-edit').classList.add('open');
}
function closeBmEdit() { document.getElementById('wiz-bm-edit').classList.remove('open'); wizEditRef = null; }

async function saveBmEdit() {
  const b = wizEditRef;
  if (!b) return;
  b.title = document.getElementById('wiz-bm-title').value.trim() || b.title;
  b.description = document.getElementById('wiz-bm-desc').value.trim();
  const iconUrl = document.getElementById('wiz-bm-icon').value.trim();
  if (iconUrl && iconUrl !== b.resolved_icon) {
    const hint = document.getElementById('wiz-bm-icon-hint');
    const saveBtn = document.getElementById('wiz-bm-save');
    saveBtn.disabled = true; hint.textContent = 'Downloading icon…';
    try { b.resolved_icon = await downloadIconAsDataUri(iconUrl); b.icon_is_generic = false; }
    catch (_) { b.resolved_icon = iconUrl; }   // fall back to using the URL directly
    finally { saveBtn.disabled = false; }
  }
  closeBmEdit();
  renderWizPreview();
}

// Fetch an image URL and store it as a self-contained data URI so it travels
// with the dashboard (works offline, no re-fetch needed).
async function downloadIconAsDataUri(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (!/^image\//.test(blob.type)) throw new Error('Not an image');
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
}

// Convert every dashboard icon that's still a live/local URL into a self-contained
// data: URI, so icons are included in backups and survive a restore on any browser.
// Already-embedded (data:) icons and the built-in generic are skipped. Returns
// { total, embedded, failed }.
async function embedDashboardIcons(onProgress = () => {}) {
  const targets = [];
  (state.dashboards || []).forEach((d) => (d.bookmarks || []).forEach((b) => {
    if (b && b.url && typeof b.resolved_icon === 'string' && b.resolved_icon
        && !b.resolved_icon.startsWith('data:')
        && b.resolved_icon !== GENERIC_ICON_URL) {
      targets.push(b);
    }
  }));
  const total = targets.length;
  let done = 0, embedded = 0, failed = 0;
  const CONC = 6;
  for (let i = 0; i < targets.length; i += CONC) {
    await Promise.all(targets.slice(i, i + CONC).map(async (b) => {
      try {
        const data = await downloadIconAsDataUri(b.resolved_icon);
        if (data && data.startsWith('data:')) { b.resolved_icon = data; embedded++; }
        else failed++;
      } catch (_) { failed++; }   // leave the existing URL in place
      onProgress(++done, total);
    }));
  }
  if (embedded) await saveDashboards();
  return { total, embedded, failed };
}

// ── Edit an existing dashboard via the preview/edit screen ──
function buildStructureFromDashboard(dash) {
  const groups = new Map();
  const seen = [];
  (dash.bookmarks || []).forEach((b) => {
    const key = b.folder || 'Other';
    if (!groups.has(key)) { groups.set(key, []); seen.push(key); }
    groups.get(key).push(Object.assign({}, b));
  });
  let order;
  if (Array.isArray(dash.sectionOrder) && dash.sectionOrder.length) {
    const present = new Set(seen);
    order = dash.sectionOrder.filter((s) => present.has(s));
    seen.forEach((s) => { if (!order.includes(s)) order.push(s); });
  } else { order = seen; }
  const layout = dash.layout || {};
  return order.map((name) => ({
    name,
    bookmarks: groups.get(name),
    iconSize: (layout[name] && layout[name].iconSize) || 'medium',
  }));
}

function renderEditHeader() {
  const hdr = document.getElementById('wiz-edit-hdr');
  if (!hdr) return;
  if (!wizard.editId) { hdr.style.display = 'none'; hdr.innerHTML = ''; return; }
  hdr.style.display = '';
  const shapes = ['rounded', 'square', 'circle', 'squircle'];
  hdr.innerHTML =
    '<div class="form-group" style="margin-bottom:12px;">' +
      '<label class="label" for="wiz-edit-title">Dashboard title</label>' +
      '<input class="input" type="text" id="wiz-edit-title">' +
    '</div>' +
    '<div class="wiz-edit-row">' +
      '<div class="form-group" style="margin:0;">' +
        '<label class="label">Icon shape</label>' +
        '<div class="shape-picker" id="wiz-edit-shape-picker">' +
          shapes.map((s) =>
            '<label class="shape-option" data-shape="' + s + '">' +
              '<input type="radio" name="wiz-edit-shape" value="' + s + '">' +
              '<span class="shape-swatch shape-' + s + '"></span>' +
              '<span class="shape-option-label">' + s.charAt(0).toUpperCase() + s.slice(1) + '</span>' +
            '</label>').join('') +
        '</div>' +
      '</div>' +
      '<button type="button" class="btn btn-secondary" id="wiz-refresh-icons" style="margin-left:auto;" ' +
        'title="Re-fetch any bookmarks still showing the default icon">↻ Refresh missing icons</button>' +
    '</div>' +
    '<div id="wiz-refresh-status" class="wiz-refresh-status" style="display:none;"></div>';
  hdr.querySelector('#wiz-edit-title').value = wizard.data.title || '';
  hdr.querySelector('#wiz-refresh-icons').addEventListener('click', wizRefreshIcons);
  setupShapePicker('wiz-edit-shape-picker');
  selectShapeOption('wiz-edit-shape-picker', wizard.data.defaultShape || 'rounded');
}

// Re-fetch icons for any bookmarks still showing the generic/default icon.
// Goes back out to the AI for fresh brand-icon guesses, then re-runs the
// favicon/brand-icon lookup. Reports progress in a status line so the user
// can see it's working.
async function wizRefreshIcons() {
  const btn = document.getElementById('wiz-refresh-icons');
  const status = document.getElementById('wiz-refresh-status');
  const say = (msg, kind) => {
    if (!status) return;
    status.style.display = 'block';
    status.textContent = msg;
    status.className = 'wiz-refresh-status' + (kind ? ' is-' + kind : '');
  };

  const all = [];
  (wizard.data.structure || []).forEach((s) => s.bookmarks.forEach((b) => all.push(b)));
  // Target the weak/default icons (generic placeholder, empty, or Google-globe
  // fallback). iconIsWeak() also catches older dashboards built before we
  // tracked the icon source.
  const weak = all.filter(iconIsWeak);

  if (!weak.length) { say('Every bookmark already has a real icon — nothing to refresh.', 'ok'); return; }

  const orig = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  say(`Found ${weak.length} bookmark${weak.length === 1 ? '' : 's'} using a default icon. Asking the AI to identify them…`);

  // 1) Re-query the AI for fresh brand-icon guesses (re-guess even ones whose
  //    previous slug failed — the prior guess clearly didn't resolve).
  let aiFailed = false;
  try {
    let aiDone = 0;
    for (const batch of chunkArray(weak, AI_BATCH_SIZE)) {
      const res = await processBookmarkBatch(batch, state.savedSettings);
      res.forEach((r) => {
        const tgt = weak.find((b) => b.id === r.id);
        if (!tgt) return;
        if (r.icon_slug) tgt.icon_slug = r.icon_slug;
        if (r.icon_emoji) tgt.icon_emoji = r.icon_emoji;
      });
      aiDone += batch.length;
      say(`Identifying icons with AI… ${aiDone}/${weak.length}`);
    }
  } catch (err) {
    aiFailed = true;
    say(`AI lookup failed (${err.message}). Trying favicons only…`, 'warn');
  }

  // 2) Re-resolve, preferring the AI brand icon over the weak fallback. Keep
  //    the previous icon if nothing better turns up (never downgrade).
  say('Fetching icon images…');
  let improved = 0, done = 0;
  for (const b of weak) {
    const prev = b.resolved_icon;
    const r = await resolveIconBrandFirst(b);
    if (r && r.source === 'brand') {
      // Upgraded to a real brand glyph.
      b.resolved_icon = r.url; b.icon_source = 'brand';
      b.icon_is_generic = false; b.icon_is_fallback = false;
      improved++;
    } else if (r) {
      // Only a favicon/google result — keep it if we had nothing real before.
      if (!prev || prev === GENERIC_ICON_URL) {
        b.resolved_icon = r.url; b.icon_source = r.source;
        b.icon_is_generic = false;
        b.icon_is_fallback = r.source === 'google';
        if (r.source !== 'google') improved++;
      }
    } else if (!prev) {
      b.resolved_icon = GENERIC_ICON_URL; b.icon_source = 'generic';
      b.icon_is_generic = true; b.icon_is_fallback = true;
    }
    done++;
    say(`Fetching icon images… ${done}/${weak.length}`);
  }

  const stillWeak = weak.filter(iconIsWeak).length;
  renderWizPreview();                 // redraw tiles with the new icons
  if (btn) { btn.disabled = false; btn.textContent = orig; }

  if (improved) {
    say(`Filled in ${improved} icon${improved === 1 ? '' : 's'}.`
      + (stillWeak ? ` ${stillWeak} still couldn’t be matched — you can set those manually via the ✎ button.` : '')
      + ' Click “Save Changes” to keep them.', 'ok');
  } else if (aiFailed) {
    say('Couldn’t reach the AI for brand-icon guesses. Check your AI provider in Settings, then try again.', 'warn');
  } else {
    say('No better icons could be found — these sites may not have a recognizable brand icon. You can set one manually via the ✎ button.', 'warn');
  }
}

function openWizardEdit(id) {
  const dash = state.dashboards.find((d) => d.id === id);
  if (!dash) return;
  wizard.editId = id;
  wizard.data = {
    title: dash.name || '',
    description: dash.description || '',
    theme: dash.theme || '',
    defaultShape: dash.defaultShape || 'rounded',
    showText: dash.showText !== false,
    structure: buildStructureFromDashboard(dash),
  };
  renderEditHeader();
  renderWizPreview();
  document.getElementById('dash-wizard').classList.add('open');
  wizGoTo(4);   // jump straight to preview/edit
}

// ── Final generation ──
// Merge each section's chosen icon size into dash.layout (keyed by section
// name), preserving any existing geometry and pruning removed sections.
function applyIconSizesToLayout(dash, secs) {
  const layout = (dash.layout && typeof dash.layout === 'object') ? dash.layout : {};
  secs.forEach((s) => {
    layout[s.name] = Object.assign({}, layout[s.name], { iconSize: s.iconSize || 'medium' });
  });
  const names = new Set(secs.map((s) => s.name));
  Object.keys(layout).forEach((k) => { if (!names.has(k)) delete layout[k]; });
  dash.layout = layout;
}

async function wizGenerate() {
  const secs = wizard.data.structure || [];
  const bookmarks = [];
  secs.forEach((s) => s.bookmarks.forEach((b) => bookmarks.push(Object.assign({}, b, { folder: s.name }))));
  if (!bookmarks.length) { showToast('Add at least one bookmark first'); return; }

  // Edit mode: update the existing dashboard in place (keep id + createdAt).
  if (wizard.editId) {
    const dash = state.dashboards.find((d) => d.id === wizard.editId);
    if (!dash) { closeWizard(); return; }
    const newName = document.getElementById('wiz-edit-title')?.value.trim();
    dash.name = newName || dash.name;
    dash.bookmarks = bookmarks;
    dash.sectionOrder = secs.map((s) => s.name);
    dash.defaultShape = getSelectedShape('wiz-edit-shape-picker', dash.defaultShape || 'rounded');
    applyIconSizesToLayout(dash, secs);
    await saveDashboards();
    closeWizard();
    renderDashboardList();
    showToast('Dashboard updated ✓');
    return;
  }

  const dashboard = {
    id: `dash_${Date.now()}`,
    name: wizard.data.title || `Dashboard ${new Date().toLocaleDateString()}`,
    description: wizard.data.description || '',
    theme: wizard.data.theme || '',
    createdAt: Date.now(),
    bookmarks,
    sectionOrder: secs.map((s) => s.name),
    defaultShape: getSelectedShape('wiz-shape-picker', 'rounded'),
    showText: document.getElementById('wiz-text-toggle')?.checked !== false,
    widgets: Array.isArray(wizard.data.widgets) ? wizard.data.widgets : [],
    // One-time flag: the dashboard view compacts the freshly-placed sections to
    // the top on first render (removing the gaps left by pre-render height
    // estimates), persists the result, and clears this flag.
    autoArrange: true,
  };
  applyIconSizesToLayout(dashboard, secs);
  state.dashboards.push(dashboard);
  if (state.dashboards.length === 1) state.defaultDashboardId = dashboard.id;
  await saveDashboards();
  closeWizard();
  renderDashboardList();
  showToast('Dashboard created ✓');
}

function setupWizard() {
  document.getElementById('wiz-close')?.addEventListener('click', closeWizard);
  document.getElementById('wiz-back')?.addEventListener('click', wizBack);
  document.getElementById('wiz-next')?.addEventListener('click', wizNext);
  // Bookmark search (step 2) + clear.
  const bmSearch = document.getElementById('wiz-bm-search');
  if (bmSearch) bmSearch.addEventListener('input', () => wizFilterTree(bmSearch.value));
  document.getElementById('wiz-bm-search-clear')?.addEventListener('click', () => {
    if (bmSearch) { bmSearch.value = ''; bmSearch.focus(); }
    wizFilterTree('');
  });
  document.getElementById('wiz-proc-back')?.addEventListener('click', () => wizGoTo(2));
  setupShapePicker('wiz-shape-picker');

  // Step 4: section-level drag (bookmark-level drag is handled per list).
  document.getElementById('wiz-preview')?.addEventListener('dragover', (e) => {
    if (!wizDrag || wizDrag.type !== 'section') return;
    e.preventDefault();
    const host = document.getElementById('wiz-preview');
    const dragging = host.querySelector('.wiz-sec.dragging');
    if (!dragging) return;
    const after = wizAfter(host, '.wiz-sec', e.clientY);
    if (after == null) host.appendChild(dragging); else host.insertBefore(dragging, after);
  });

  // Bookmark edit modal.
  document.getElementById('wiz-bm-close')?.addEventListener('click', closeBmEdit);
  document.getElementById('wiz-bm-cancel')?.addEventListener('click', closeBmEdit);
  document.getElementById('wiz-bm-save')?.addEventListener('click', saveBmEdit);
  document.getElementById('wiz-bm-icon')?.addEventListener('input', () => {
    const prev = document.getElementById('wiz-bm-icon-prev');
    const url = document.getElementById('wiz-bm-icon').value.trim();
    if (prev && url) { prev.src = url; prev.style.visibility = ''; }
  });
  // Hide the title error as soon as the user starts typing.
  document.getElementById('wiz-title')?.addEventListener('input', () => {
    const err = document.getElementById('wiz-title-err');
    if (err && document.getElementById('wiz-title').value.trim()) err.style.display = 'none';
  });
  // Organization method → show "Max sections" only for Dynamic AI.
  document.querySelectorAll('input[name="wiz-org"]').forEach((r) => {
    r.addEventListener('change', () => {
      const dynamic = document.querySelector('input[name="wiz-org"]:checked')?.value === 'dynamic';
      const row = document.getElementById('wiz-maxsec-row');
      if (row) row.style.display = dynamic ? '' : 'none';
    });
  });
}

async function handleDashboardAction(action, id) {
  if (action === 'open') {
    const url = chrome.runtime.getURL(`newtab/newtab.html?dash=${id}`);
    chrome.tabs.create({ url });
  } else if (action === 'edit') {
    openWizardEdit(id);
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
  selectShapeOption('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  document.getElementById('dash-edit-modal').classList.add('visible');
  document.getElementById('dash-edit-name').focus();
}

async function saveDashEdit() {
  const dash = state.dashboards.find((d) => d.id === editingDashboardId);
  if (!dash) { closeDashEditModal(); return; }

  const newName = document.getElementById('dash-edit-name').value.trim();
  dash.name         = newName || dash.name;
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
    <div class="progress-icon"><img src="../icons/logo.png" alt="" style="width:44px;height:44px;object-fit:contain;display:inline-block;"></div>
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
// ═══════════════════════════════════════════════════════════════════════════
// Integrations catalog (redesigned "Widgets" → "Integrations" tab)
// ---------------------------------------------------------------------------
// A Homarr-style responsive card grid. Each card maps 1:1 to an existing
// per-integration config form (#<id>-config). Enabling a card, or clicking an
// enabled one, opens a shared modal whose body is the relocated config form —
// so every existing validate/preview handler keeps working unchanged. Save is
// gated on the integration's existing state.<x>Validated flag and is the only
// way an integration is persisted as enabled; closing without saving reverts
// the toggle to off.
// ═══════════════════════════════════════════════════════════════════════════

const INT_SUN_ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>');

const INT_HOURGLASS_ICON = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"/></svg>');

const INTEGRATIONS = [
  { id:'adguard',        name:'AdGuard Home',          cat:'DNS Ad-Blocking',  icon:'adguard-home.svg',          w:1 },
  { id:'audiobookshelf', name:'Audiobookshelf',        cat:'Media Library',    icon:'audiobookshelf.svg',        w:1 },
  { id:'beszel',         name:'Beszel',                cat:'System Health',    icon:'beszel.svg',                w:1 },
  { id:'dashdot',        name:'Dash.',                 cat:'System Health',    icon:'dashdot.png',               w:1 },
  { id:'glances',        name:'Glances',               cat:'System Health',    icon:'glances.svg',               w:1 },
  { id:'homeassistant',  name:'Home Assistant',        cat:'Smart Home',       icon:'home-assistant.svg',        w:1 },
  { id:'ical',           name:'iCal',                  cat:'Calendar',         icon:'ical.svg',                  w:1 },
  { id:'jellyfin',       name:'Jellyfin',              cat:'Media Server',     icon:'jellyfin.svg',              w:1 },
  { id:'emby',           name:'Emby',                  cat:'Media Server',     icon:'emby.svg',                  w:1 },
  { id:'navidrome',      name:'Navidrome',             cat:'Media Library',    icon:'navidrome.svg',             w:1 },
  { id:'nextcloud',      name:'Nextcloud',             cat:'Productivity',     icon:'nextcloud.svg',             w:1 },
  { id:'ntfy',           name:'ntfy',                  cat:'Notifications',    icon:'ntfy.svg',                  w:1 },
  { id:'openmediavault', name:'OpenMediaVault',        cat:'System Health',    icon:'openmediavault.svg',        w:1 },
  { id:'opnsense',       name:'OPNsense',              cat:'Firewall',         icon:'opnsense.svg',              w:1 },
  { id:'pihole',         name:'Pi-hole',               cat:'DNS Ad-Blocking',  icon:'pi-hole.svg',               w:1 },
  { id:'plex',           name:'Plex',                  cat:'Media Server',     icon:'plex.svg',                  w:1 },
  { id:'portainer',      name:'Portainer',             cat:'Containers',       icon:'portainer.svg',             w:1, validatedKey:'portainerValidated' },
  { id:'stocks',         name:'Stocks',                cat:'Finance',          icon:'stocks.svg',                w:1, validatedKey:'stocksValidated' },
  { id:'countdown',      name:'Countdown',             cat:'Utilities',        icon:INT_HOURGLASS_ICON,          w:2, validatedKey:'countdownValidated' },
  { id:'proxmox',        name:'Proxmox VE',            cat:'Virtualization',   icon:'proxmox.svg',               w:1 },
  { id:'pbs',            name:'Proxmox Backup Server', cat:'Backup',           icon:'proxmox-backup-server.svg', w:1 },
  { id:'prowlarr',       name:'Prowlarr',              cat:'Indexer Manager',  icon:'prowlarr.svg',              w:1 },
  { id:'peanut',         name:'PeaNUT',                cat:'UPS',              icon:'peanut.svg',                w:1 },
  { id:'qbittorrent',    name:'qBittorrent',           cat:'Downloads',        icon:'qbittorrent.svg',           w:1 },
  { id:'radarr',         name:'Radarr',                cat:'Media Management', icon:'radarr.svg',                w:1 },
  { id:'sabnzbd',        name:'SABnzbd',               cat:'Downloads',        icon:'sabnzbd.svg',               w:1 },
  { id:'seerr',          name:'Seerr',                 cat:'Media Requests',   icon:'seerr.svg',                 w:1 },
  { id:'sonarr',         name:'Sonarr',                cat:'Media Management', icon:'sonarr.svg',                w:1 },
  { id:'speedtest',      name:'Speedtest Tracker',     cat:'Network',          icon:'speedtest-tracker.png',     w:1 },
  { id:'tautulli',       name:'Tautulli',              cat:'Media Server',     icon:'tautulli.svg',              w:6, validatedKey:'tautulliApiKeyValidated' },
  { id:'tracearr',       name:'Tracearr',              cat:'Media Monitoring', icon:'tracearr.svg',              w:1 },
  { id:'transmission',   name:'Transmission',          cat:'Downloads',        icon:'transmission.svg',          w:1 },
  { id:'truenas',        name:'TrueNAS',               cat:'System Health',    icon:'truenas.svg',               w:1 },
  { id:'umami',          name:'Umami',                 cat:'Analytics',        icon:'umami.svg',                 w:1 },
  { id:'unifi',          name:'UniFi Controller',      cat:'Network',          icon:'unifi.png',                 w:1 },
  { id:'unraid',         name:'Unraid',                cat:'System Health',    icon:'unraid.svg',                w:1 },
  { id:'uptimekuma',     name:'Uptime Kuma',           cat:'Monitoring',       icon:'uptime-kuma.svg',           w:1, enabledKey:'uptimeKumaEnabled', validatedKey:'uptimeKumaValidated' },
  { id:'weather',        name:'Weather',               cat:'Utilities',        icon:INT_SUN_ICON,                w:4, validatedKey:'weatherApiKeyValidated' },
].map((e) => ({
  ...e,
  configId:     `${e.id}-config`,
  toggleId:     `${e.id}-toggle`,
  enabledKey:   e.enabledKey   || `${e.id}Enabled`,
  validatedKey: e.validatedKey || `${e.id}Validated`,
}));

// Per-widget catalog for the create-dashboard wizard (mirrors newtab's
// WIDGET_CATALOG). One entry per addable widget, incl. multi-widget variants.
const WIZ_WIDGETS = (() => {
  const list = INTEGRATIONS
    .filter((e) => e.id !== 'weather')   // weather only exposes the variant widgets below
    .map((e) => ({ wid: e.id, intId: e.id, name: e.name, icon: e.icon, enabledKey: e.enabledKey }));
  list.push(
    { wid: 'tautulli-list',    intId: 'tautulli-list',    name: 'Tautulli Streams',  icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
    { wid: 'tautulli-recent',  intId: 'tautulli-recent',  name: 'Tautulli Recently Added', icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
    { wid: 'tautulli-watch',   intId: 'tautulli-watch',   name: 'Tautulli Most Watched',   icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
    { wid: 'tautulli-libraries', intId: 'tautulli-libraries', name: 'Tautulli Libraries',  icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
    { wid: 'tautulli-top',     intId: 'tautulli-top',     name: 'Tautulli Top Users',      icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
    { wid: 'weather-combined', intId: 'weather-combined', name: 'Weather (Combined)', icon: INT_SUN_ICON,   enabledKey: 'weatherEnabled' },
    { wid: 'weather-current',  intId: 'weather-current',  name: 'Current Weather',    icon: INT_SUN_ICON,   enabledKey: 'weatherEnabled' },
    { wid: 'weather-hourly',   intId: 'weather-hourly',   name: 'Hourly Forecast',    icon: INT_SUN_ICON,   enabledKey: 'weatherEnabled' },
    { wid: 'weather-forecast', intId: 'weather-forecast', name: '5-Day Forecast',     icon: INT_SUN_ICON,   enabledKey: 'weatherEnabled' },
    { wid: 'countdown-list',   intId: 'countdown-list',   name: 'Countdown List',     icon: INT_HOURGLASS_ICON, enabledKey: 'countdownEnabled' },
  );
  return list;
})();

// Multi-widget services get an explicit label/icon; single-widget services
// derive theirs from the widget itself.
const WIZ_SERVICE_META = {
  weather:  { name: 'Weather',  icon: INT_SUN_ICON },
  tautulli: { name: 'Tautulli', icon: 'tautulli.svg' },
};
let wizWidgetTab = 'live';   // 'live' | 'sample'
function wizServiceKey(w) { return (w.enabledKey || '').replace(/Enabled$/, ''); }
// Variant widget id → base integration id (config.js has no dashboard-mounts.js).
const WIZ_BASE_INT = {
  'tautulli-list': 'tautulli', 'tautulli-recent': 'tautulli', 'tautulli-watch': 'tautulli',
  'tautulli-libraries': 'tautulli', 'tautulli-top': 'tautulli',
  'weather-combined': 'weather', 'weather-current': 'weather', 'weather-hourly': 'weather', 'weather-forecast': 'weather',
  'countdown-list': 'countdown',
};
function wizBaseInt(intId) { return WIZ_BASE_INT[intId] || intId; }
function wizServiceMeta(key, widgets) {
  const o = WIZ_SERVICE_META[key] || {};
  const first = widgets[0] || {};
  return { name: o.name || first.name || key, icon: o.icon || first.icon };
}

function wizWidgetCard(w, sample, updateCount, endpointId, endpointName) {
  const epKey = endpointId || null;
  const matches = (x) => x.wid === w.wid && !!x.sample === sample && (x.endpointId || null) === epKey;
  const card = document.createElement('div');
  card.className = 'wiz-wp-card' + (sample ? ' is-sample' : '') + (wizard.data.widgets.some(matches) ? ' selected' : '');
  const check = document.createElement('span'); check.className = 'wp-check'; check.textContent = '✓';
  const img = document.createElement('img'); img.alt = ''; img.src = intIconSrc(w.icon); img.onerror = () => { img.style.visibility = 'hidden'; };
  const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = w.name + (sample ? ' (Sample)' : '');
  card.append(check, img, nm);
  card.addEventListener('click', () => {
    const i = wizard.data.widgets.findIndex(matches);
    if (i >= 0) { wizard.data.widgets.splice(i, 1); card.classList.remove('selected'); }
    else {
      const entry = { uid: 'wg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), wid: w.wid, intId: w.intId, name: w.name };
      if (sample) entry.sample = true;
      if (endpointId) {
        entry.endpointId = endpointId;
        if (endpointName) {
          entry.endpointName = endpointName;
          if (window.Endpoints && Endpoints.count(state.currentSettings, wizBaseInt(w.intId)) > 1) entry.name = `${w.name} — ${endpointName}`;
        }
      }
      wizard.data.widgets.push(entry); card.classList.add('selected');
    }
    updateCount();
  });
  return card;
}

// Render the optional "Add Widgets" panel (Live / Sample tabs) in the wizard's
// preview step. Live widgets are grouped by service and labelled with their
// configuration description; Sample widgets are greyed previews with demo data.
function renderWizWidgetPanel() {
  const panel = document.getElementById('wiz-widget-panel');
  if (!panel) return;
  if (wizard.editId) { panel.style.display = 'none'; return; }   // create flow only
  if (!Array.isArray(wizard.data.widgets)) wizard.data.widgets = [];
  panel.style.display = '';
  panel.innerHTML = '';

  const head = document.createElement('div'); head.className = 'wiz-wp-head';
  const title = document.createElement('div'); title.className = 'wiz-wp-title';
  title.innerHTML = 'Add Widgets <span class="muted">(optional)</span>';
  const tabs = document.createElement('div'); tabs.className = 'wiz-wp-tabs';
  [['live', 'Live'], ['sample', 'Sample']].forEach(([t, lbl]) => {
    const b = document.createElement('button'); b.type = 'button';
    b.className = 'wiz-wp-tab' + (wizWidgetTab === t ? ' active' : ''); b.textContent = lbl;
    b.addEventListener('click', () => { wizWidgetTab = t; renderWizWidgetPanel(); });
    tabs.appendChild(b);
  });
  const count = document.createElement('span'); count.className = 'wiz-hint'; count.style.margin = '0';
  head.append(title, tabs, count);
  panel.appendChild(head);

  const updateCount = () => { const n = wizard.data.widgets.length; count.textContent = n ? `${n} added` : 'None added'; };
  const sample = wizWidgetTab === 'sample';
  const source = sample ? WIZ_WIDGETS.slice() : WIZ_WIDGETS.filter((w) => state.currentSettings[w.enabledKey] === true);

  if (!source.length) {
    const e = document.createElement('div'); e.className = 'wiz-wp-empty';
    e.innerHTML = sample
      ? 'No sample widgets available.'
      : 'No action cards are enabled yet — enable some in <a href="?tab=integrations">Setup → Action Cards</a> to add live widgets, or use the <b>Sample</b> tab to add demo widgets.';
    panel.appendChild(e); updateCount(); return;
  }

  // Group by base integration → (multi-endpoint) one block per endpoint → widgets.
  const descs = state.currentSettings.integrationDescriptions || {};
  const groups = new Map();
  source.forEach((w) => { const k = wizBaseInt(w.intId); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(w); });

  const addDescRow = (g, text) => { const dl = document.createElement('div'); dl.className = 'wiz-wp-desc'; dl.textContent = text; g.appendChild(dl); };
  const addGrid = (g, widgets, endpointId, endpointName) => {
    const grid = document.createElement('div'); grid.className = 'wiz-wp-grid';
    widgets.forEach((w) => grid.appendChild(wizWidgetCard(w, sample, updateCount, endpointId, endpointName)));
    g.appendChild(grid);
  };

  const body = document.createElement('div');
  body.className = 'wiz-wp-body';
  Array.from(groups.entries())
    .map(([k, ws]) => [k, ws, wizServiceMeta(k, ws)])
    .sort((a, b) => a[2].name.localeCompare(b[2].name))
    .forEach(([key, widgets, meta]) => {
      const g = document.createElement('div'); g.className = 'wiz-wp-group';
      const gh = document.createElement('div'); gh.className = 'wiz-wp-ghead';
      const img = document.createElement('img'); img.alt = ''; img.src = intIconSrc(meta.icon); img.onerror = () => { img.style.visibility = 'hidden'; };
      const nm = document.createElement('span'); nm.className = 'wiz-wp-gname'; nm.textContent = meta.name;
      gh.append(img, nm); g.appendChild(gh);

      if (!sample && window.Endpoints && Endpoints.isMulti(key)) {
        const eps = Endpoints.list(state.currentSettings, key);
        if (!eps.length) addDescRow(g, 'No endpoints configured');
        eps.forEach((ep) => { addDescRow(g, ep.name || 'Endpoint'); addGrid(g, widgets, ep.id, ep.name); });
      } else {
        addDescRow(g, sample ? 'Sample (demo data)' : (descs[key] || meta.name));
        addGrid(g, widgets, null, null);
      }
      body.appendChild(g);
    });
  panel.appendChild(body);
  updateCount();
}

// Integrations that have an offline sample. Each is rendered by
// widgets/sample.html?w=<id>, which mounts that integration's widget(s) with
// fake data. Weather's sample shows all three weather widgets at once.
const SAMPLE_IDS = new Set(INTEGRATIONS.map((e) => e.id));

const intCatalog = { cat: 'All', query: '', openId: null, epIndex: 0 };

const intEntry      = (id) => INTEGRATIONS.find((e) => e.id === id);
const intIconSrc    = (icon) => icon.startsWith('data:') ? icon : `../icons/integrations/${icon}`;
const intIsEnabled  = (e) => !!state.currentSettings[e.enabledKey];
const intIsValidated = (e) => !!state[e.validatedKey];
const intWasSaved   = (e) => !!state.savedSettings[e.enabledKey];
// A configuration's description is keyed by its settings prefix (enabledKey
// minus the trailing "Enabled"), e.g. uptimeKumaEnabled -> uptimeKuma.
const intDescKey    = (e) => e.enabledKey.replace(/Enabled$/, '');
const intGetDesc    = (e) => (state.currentSettings.integrationDescriptions || {})[intDescKey(e)] || '';
function intSetDesc(e, v) {
  const m = state.currentSettings.integrationDescriptions =
    Object.assign({}, state.currentSettings.integrationDescriptions);
  m[intDescKey(e)] = v;
}

function intSyncLegacyToggle(e, val) {
  const t = document.getElementById(e.toggleId);
  if (t) t.checked = val;
}

function renderIntegrationGrid() {
  const grid = document.getElementById('integrations-grid');
  if (!grid) return;

  // Category filter chips (built once).
  const filters = document.getElementById('int-filters');
  if (filters && !filters.dataset.built) {
    // 'Active' is a special filter (enabled-only); the rest are real categories.
    const cats = ['All', 'Active', ...Array.from(new Set(INTEGRATIONS.map((e) => e.cat))).sort()];
    filters.innerHTML = '';
    cats.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'int-chip' + (c === intCatalog.cat ? ' active' : '');
      b.textContent = c;
      b.addEventListener('click', () => {
        intCatalog.cat = c;
        [...filters.children].forEach((x) => x.classList.toggle('active', x === b));
        renderIntegrationGrid();
      });
      filters.appendChild(b);
    });
    filters.dataset.built = '1';
  }

  const matchesCat = (e) =>
    intCatalog.cat === 'All' ||
    (intCatalog.cat === 'Active' ? intIsEnabled(e) : e.cat === intCatalog.cat);
  const items = INTEGRATIONS
    .filter((e) => matchesCat(e) &&
                   (!intCatalog.query ||
                    e.name.toLowerCase().includes(intCatalog.query) ||
                    e.cat.toLowerCase().includes(intCatalog.query)))
    .sort((a, b) => a.name.localeCompare(b.name));

  const enabledCount = INTEGRATIONS.filter((e) => intIsEnabled(e)).length;
  const note = document.getElementById('int-count');
  if (note) note.textContent = `${items.length} shown · ${enabledCount} of ${INTEGRATIONS.length} enabled`;

  grid.innerHTML = '';
  items.forEach((e) => {
    const enabled = intIsEnabled(e);
    // "active" once persisted-enabled; amber "setup" while a fresh enable's
    // modal is open and not yet saved.
    let s = 'disabled';
    if (enabled) s = (e.id === intCatalog.openId && !intWasSaved(e)) ? 'enabled' : 'active';

    const card = document.createElement('div');
    card.className = 'int-card state-' + s + (enabled ? ' clickable' : '');
    const sampleBtn = SAMPLE_IDS.has(e.id)
      ? '<button class="int-sample-btn" type="button" title="View a sample of this widget">👁</button>' : '';
    // "+" quick-add appears only when the integration is enabled, saved
    // (operational), exposes a widget, and — if multi-endpoint — has at least
    // one configured endpoint to point the widget at.
    const hasEndpoint = !window.Endpoints || !Endpoints.isMulti(e.id) || Endpoints.count(state.currentSettings, e.id) > 0;
    const showAddDash = enabled && intWasSaved(e) && intSupportsWidgets(e) && hasEndpoint;
    const addDashBtn = showAddDash
      ? '<button class="int-add-dash" type="button" title="Add to Dashboard" aria-label="Add to Dashboard">＋</button>' : '';
    card.innerHTML =
      '<span class="int-badge setup">⚙ Setup required</span>' +
      '<span class="int-badge active">✓ Active</span>' +
      sampleBtn +
      addDashBtn +
      `<img class="int-card-ico" src="${intIconSrc(e.icon)}" alt="">` +
      `<p class="int-card-nm">${e.name}</p>` +
      `<p class="int-card-cat">${e.cat}</p>` +
      `<p class="int-card-wc"><b>${e.w}</b> Widget${e.w === 1 ? '' : 's'} Available</p>` +
      '<div class="int-card-foot"><label class="int-sw" title="Enable / disable">' +
        `<input type="checkbox" ${enabled ? 'checked' : ''}><span class="int-sl"></span></label></div>` +
      '<div class="int-card-hint">Enable to configure ↑</div>';

    const cb = card.querySelector('input');
    cb.addEventListener('change', async (ev) => {
      ev.stopPropagation();
      if (cb.checked) {
        state.currentSettings[e.enabledKey] = true;
        intSyncLegacyToggle(e, true);
        renderIntegrationGrid();
        openIntegrationModal(e.id);
      } else {
        state.currentSettings[e.enabledKey] = false;
        intSyncLegacyToggle(e, false);
        await saveSettings();           // persist the disable immediately
        renderIntegrationGrid();
      }
    });
    card.querySelector('.int-sw').addEventListener('click', (ev) => ev.stopPropagation());
    card.querySelector('.int-sample-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openSampleModal(e.id);
    });
    card.querySelector('.int-add-dash')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openAddToDashModal(e.id);
    });

    card.addEventListener('click', () => {
      if (intIsEnabled(e)) {
        openIntegrationModal(e.id);
      } else {
        card.classList.add('flash');
        setTimeout(() => card.classList.remove('flash'), 1100);
      }
    });

    grid.appendChild(card);
  });
}

// ─── Multi-endpoint editing (inside the integration modal) ───────────────────
// A service may hold several named endpoints. The existing per-integration form
// edits the flat settings keys as a "working buffer" for the SELECTED endpoint;
// we sync that buffer into the endpoint on switch/save and load it back on open.
function epIsMulti(e) { return !!(window.Endpoints && Endpoints.isMulti(e.id)); }
function epList(e) { return (window.Endpoints) ? Endpoints.list(state.currentSettings, e.id) : []; }
function epCurrent(e) { return epList(e)[intCatalog.epIndex] || null; }
function intCurrentName(e) { return epIsMulti(e) ? ((epCurrent(e) && epCurrent(e).name) || '') : intGetDesc(e); }

// Guarantee a freshly-enabled service has at least one endpoint to edit,
// seeded from any legacy flat values that are already present.
function epEnsureOne(e) {
  if (!epIsMulti(e)) return;
  if (Endpoints.count(state.currentSettings, e.id) === 0) {
    const seed = {};
    Endpoints.schema(e.id).fields.forEach((k) => {
      seed[k] = (state.currentSettings[k] !== undefined) ? state.currentSettings[k] : DEFAULT_SETTINGS[k];
    });
    Endpoints.add(state.currentSettings, e.id, e.name.slice(0, 20), seed);
  }
}

// Write the live form (flat keys) + validation + name into endpoint #idx.
function syncFormToEndpoint(e, idx) {
  if (!epIsMulti(e)) return;
  const ep = epList(e)[idx]; if (!ep) return;
  Endpoints.schema(e.id).fields.forEach((k) => { ep.fields[k] = state.currentSettings[k]; });
  ep.validated = !!state[e.validatedKey];
}

// Load endpoint #idx into the live form (flat keys) and repopulate the inputs.
function loadEndpointIntoForm(e, idx) {
  if (!epIsMulti(e)) return;
  const ep = epList(e)[idx]; if (!ep) return;
  Endpoints.schema(e.id).fields.forEach((k) => {
    state.currentSettings[k] = (ep.fields[k] !== undefined) ? ep.fields[k] : DEFAULT_SETTINGS[k];
  });
  state[e.validatedKey] = !!ep.validated;
  const descEl = document.getElementById('int-m-desc');
  if (descEl) descEl.value = ep.name || '';
  const cnt = document.getElementById('int-m-desc-count');
  if (cnt) cnt.textContent = `${(ep.name || '').length}/20`;
  applySettingsToUI();   // repopulates every form input from the flat keys
  // Re-apply secret eyeball visibility for this integration's form, and keep the
  // (relocated) form visible regardless of what applySettingsToUI set.
  const cfg = document.getElementById(e.configId);
  if (cfg) cfg.style.display = 'block';
  const showSecrets = !intWasSaved(e);
  if (cfg) cfg.querySelectorAll('.eyeball-btn').forEach((btn) => {
    const input = btn.closest('.api-key-row')?.querySelector('input');
    if (input) applyEyeballState(input, btn, showSecrets);
  });
}

function renderEndpointTabs(e) {
  const bar = document.getElementById('int-m-eps');
  const tabs = document.getElementById('int-m-eps-tabs');
  const del = document.getElementById('int-m-eps-del');
  if (!bar || !tabs) return;
  if (!epIsMulti(e)) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const eps = epList(e);
  tabs.innerHTML = '';
  eps.forEach((ep, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'int-m-ep' + (i === intCatalog.epIndex ? ' active' : '');
    b.innerHTML = `<span class="int-m-ep-nm">${escapeHtml(ep.name || ('Endpoint ' + (i + 1)))}</span>` +
      (ep.validated ? '<span class="int-m-ep-ok" title="Validated">✓</span>' : '');
    b.addEventListener('click', () => switchEndpoint(e, i));
    tabs.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'int-m-ep int-m-ep-add';
  add.textContent = '+ Add endpoint';
  add.addEventListener('click', () => addEndpointInModal(e));
  tabs.appendChild(add);
  if (del) del.style.display = eps.length ? '' : 'none';
}

function switchEndpoint(e, i) {
  if (i === intCatalog.epIndex) return;
  syncFormToEndpoint(e, intCatalog.epIndex);
  intCatalog.epIndex = i;
  loadEndpointIntoForm(e, i);
  renderEndpointTabs(e);
  refreshIntegrationModalSave();
}

function addEndpointInModal(e) {
  syncFormToEndpoint(e, intCatalog.epIndex);
  const blank = {};
  Endpoints.schema(e.id).fields.forEach((k) => { blank[k] = DEFAULT_SETTINGS[k]; });
  Endpoints.add(state.currentSettings, e.id, '', blank);
  intCatalog.epIndex = Endpoints.count(state.currentSettings, e.id) - 1;
  state[e.validatedKey] = false;
  loadEndpointIntoForm(e, intCatalog.epIndex);
  renderEndpointTabs(e);
  const descEl = document.getElementById('int-m-desc'); if (descEl) descEl.focus();
  refreshIntegrationModalSave();
}

function deleteEndpointInModal(e) {
  const eps = epList(e);
  const ep = eps[intCatalog.epIndex]; if (!ep) return;
  if (!confirm(`Delete endpoint "${ep.name || 'this endpoint'}"?\nAny dashboard widget using it will show "configuration removed".`)) return;
  Endpoints.remove(state.currentSettings, e.id, ep.id);
  const left = epList(e);
  // The service stays enabled even at zero endpoints, so existing dashboard
  // placements that referenced the deleted endpoint render "configuration
  // removed" (rather than a generic "service disabled"). Use the card toggle to
  // turn the service off entirely.
  // Keep legacy flat keys + description pointed at the surviving first endpoint.
  if (left[0]) {
    Endpoints.schema(e.id).fields.forEach((k) => { if (left[0].fields[k] !== undefined) state.currentSettings[k] = left[0].fields[k]; });
    intSetDesc(e, left[0].name || e.name);
  }
  saveSettings();   // deletes are committed immediately
  if (left.length === 0) { closeIntegrationModal(); return; }
  intCatalog.epIndex = Math.min(intCatalog.epIndex, left.length - 1);
  loadEndpointIntoForm(e, intCatalog.epIndex);
  renderEndpointTabs(e);
  refreshIntegrationModalSave();
}

function openIntegrationModal(id) {
  const e = intEntry(id);
  if (!e) return;
  intCatalog.openId = id;
  intCatalog.epIndex = 0;

  document.getElementById('int-m-ico').src = intIconSrc(e.icon);
  document.getElementById('int-m-name').textContent = e.name;
  document.getElementById('int-m-cat').textContent = `${e.cat} · ${e.w} widget${e.w === 1 ? '' : 's'}`;

  // Relocate the existing config form into the modal body (preserves all
  // element IDs and event handlers).
  const cfg = document.getElementById(e.configId);
  const body = document.getElementById('int-m-body');
  if (cfg && body) { body.appendChild(cfg); cfg.style.display = 'block'; }

  const descLabel = document.querySelector('.int-m-desc-label');
  const descRow = document.getElementById('int-m-desc-row');
  if (e.id === 'weather') {
    // Location-focused setup: no endpoint tabs, no Name field. Locations are
    // managed by a dedicated list; the city auto-fills each location's Name.
    if (descRow) descRow.style.display = 'none';
    const epsBar = document.getElementById('int-m-eps');
    if (epsBar) epsBar.style.display = 'none';
    // Drop any stray blank-location endpoints; auto-name each from its city.
    if (state.currentSettings.instances && Array.isArray(state.currentSettings.instances.weather)) {
      state.currentSettings.instances.weather = state.currentSettings.instances.weather
        .filter((ep) => ep && ep.fields && (ep.fields.weatherLocation || '').trim());
    }
    // Auto-name from the location only when missing or still the generic default
    // (keeps the nice geocoded "City, State, Country" names already set).
    weatherEps().forEach((ep) => {
      if (!ep.name || ep.name.toLowerCase() === 'weather') ep.name = ep.fields.weatherLocation;
      ep.validated = true;
    });
    // Default the provider if unset (legacy installs): OWM if a key exists.
    if (!state.currentSettings.weatherProvider) {
      state.currentSettings.weatherProvider = state.currentSettings.weatherApiKey ? 'openweathermap' : 'openmeteo';
    }
    // A saved OWM key is treated as already valid (it worked when saved).
    state.weatherApiKeyValidated = !!state.currentSettings.weatherApiKey;
    applySettingsToUI();
    if (cfg) cfg.style.display = 'block';
    setWeatherProviderUI();
    renderWeatherLocations();
    backfillWeatherCoords();   // best-effort: fill coords for legacy cities
  } else if (epIsMulti(e)) {
    // Multi-endpoint: the "description" field becomes the selected endpoint's
    // NAME, and a selector bar lets the user switch / add / delete endpoints.
    if (descRow) descRow.style.display = '';
    if (descLabel) descLabel.textContent = 'Name';
    const descEl = document.getElementById('int-m-desc');
    if (descEl) descEl.placeholder = 'Name this endpoint (e.g. Living Room)';
    epEnsureOne(e);
    intCatalog.epIndex = 0;
    loadEndpointIntoForm(e, 0);   // sets the name field + repopulates the form
    renderEndpointTabs(e);
  } else {
    // Single-instance (Stocks): keep the per-service description.
    if (descRow) descRow.style.display = '';
    if (descLabel) descLabel.textContent = 'Description';
    const epsBar = document.getElementById('int-m-eps');
    if (epsBar) epsBar.style.display = 'none';
    intCatalog.descKey = intDescKey(e);
    let dv = intGetDesc(e);
    if (!dv) { dv = e.name.slice(0, 20); intSetDesc(e, dv); }
    const descEl = document.getElementById('int-m-desc');
    const descCnt = document.getElementById('int-m-desc-count');
    if (descEl) { descEl.value = dv; descEl.placeholder = 'Label this configuration (max 20)'; }
    if (descCnt) descCnt.textContent = `${dv.length}/20`;
  }

  // Secret fields default to VISIBLE during first-time setup, and HIDDEN when
  // re-opening an integration that's already been saved.
  const showSecrets = !intWasSaved(e);
  if (cfg) cfg.querySelectorAll('.eyeball-btn').forEach((btn) => {
    const input = btn.closest('.api-key-row')?.querySelector('input');
    if (input) applyEyeballState(input, btn, showSecrets);
  });

  // Refresh-interval control (per-widget polling override). Hidden for entries
  // without a pollable widget (e.g. Weather, which has its own refresh setting).
  const pd = POLL_DEFAULTS[id];
  const pollRow = document.getElementById('int-m-poll');
  const pollSel = document.getElementById('int-poll-select');
  if (pd && pollRow && pollSel) {
    pollRow.style.display = 'flex';
    pollSel.innerHTML = '';
    POLL_OPTIONS.filter((s) => s >= pd.min).forEach((s) => {
      const o = document.createElement('option');
      o.value = String(s);
      o.textContent = fmtInterval(s) + (s === pd.def ? ' (default)' : '');
      pollSel.appendChild(o);
    });
    const cur = (state.currentSettings.pollSecs && state.currentSettings.pollSecs[id]) || pd.def;
    pollSel.value = String(Math.max(pd.min, parseInt(cur, 10) || pd.def));
  } else if (pollRow) {
    pollRow.style.display = 'none';
  }

  refreshIntegrationModalSave();
  document.getElementById('int-modal').classList.add('open');
  // Safety net: some validators don't route through updateSaveBar, so poll the
  // validation flag while the modal is open to keep the Save button in sync.
  clearInterval(intCatalog.timer);
  intCatalog.timer = setInterval(refreshIntegrationModalSave, 400);
}

function closeIntegrationModal() {
  const e = intEntry(intCatalog.openId);
  clearInterval(intCatalog.timer);
  document.getElementById('int-modal').classList.remove('open');

  if (e) {
    // Move the form back to the hidden store.
    const cfg = document.getElementById(e.configId);
    const store = document.getElementById('integration-config-store');
    if (cfg && store) { store.appendChild(cfg); cfg.style.display = 'none'; }
    // Restore enabled to its persisted value: a fresh, un-saved enable reverts
    // to OFF; an already-active integration stays ON.
    const savedVal = intWasSaved(e);
    state.currentSettings[e.enabledKey] = savedVal;
    intSyncLegacyToggle(e, savedVal);
    // Discard any unsaved endpoint edits/additions by restoring this service's
    // instances from the last saved state (Save commits; Cancel/close reverts).
    if (state.currentSettings.instances) {
      const saved = state.savedSettings.instances && state.savedSettings.instances[e.id];
      state.currentSettings.instances[e.id] = Array.isArray(saved) ? JSON.parse(JSON.stringify(saved)) : [];
    }
    const descLabel = document.querySelector('.int-m-desc-label');
    if (descLabel) descLabel.textContent = 'Description';
    const descRow = document.getElementById('int-m-desc-row');
    if (descRow) descRow.style.display = '';   // weather hides it; restore for others
  }

  intCatalog.openId = null;
  intCatalog.epIndex = 0;
  renderIntegrationGrid();
}

function refreshIntegrationModalSave() {
  const e = intEntry(intCatalog.openId);
  if (!e) return;
  const save = document.getElementById('int-m-save');
  const note = document.getElementById('int-m-note');
  if (!save) return;
  if (e.id === 'weather') {
    const eps = weatherEps();
    const provider = weatherProvider();
    let ready, noteText;
    if (provider === 'openweathermap') {
      const keyOk = !!(state.currentSettings.weatherApiKey && state.weatherApiKeyValidated);
      ready = eps.length > 0 && keyOk;
      noteText = !keyOk ? 'Validate your OpenWeatherMap API key to enable Save.'
        : !eps.length ? 'Add at least one location.'
          : `Ready — ${eps.length} location${eps.length > 1 ? 's' : ''}. Click Save.`;
    } else {
      ready = eps.length > 0;
      noteText = !eps.length ? 'Add at least one location to enable Save.'
        : `Ready — ${eps.length} location${eps.length > 1 ? 's' : ''}. Click Save.`;
    }
    save.disabled = !ready;
    save.classList.toggle('is-ready', ready);
    if (note) note.textContent = noteText;
    return;
  }
  const multi = epIsMulti(e);
  let ready, noteText;
  if (multi) {
    // Every endpoint must be named AND validated before the service can save.
    // The currently-open endpoint uses the live validation flag; the others use
    // their stored flag (set when they were last validated).
    const eps = epList(e);
    const curIdx = intCatalog.epIndex;
    const named = eps.every((ep) => ep.name && ep.name.trim().length > 0 && ep.name.length <= 20);
    const validatedAll = eps.length > 0 && eps.every((ep, i) => (i === curIdx ? !!state[e.validatedKey] : !!ep.validated));
    ready = eps.length > 0 && named && validatedAll;
    noteText = !eps.length ? 'Add at least one endpoint.'
      : !named ? 'Name every endpoint (1–20 characters).'
        : !validatedAll ? 'Validate every endpoint before saving.'
          : 'All endpoints validated — click Save.';
  } else {
    const ok = intIsValidated(e);
    const desc = intCurrentName(e).trim();
    const descOk = desc.length > 0 && desc.length <= 20;
    ready = ok && descOk;
    noteText = !descOk ? 'Enter a description (1–20 characters) to identify this configuration.'
      : !ok ? 'Validate the connection to enable Save.'
        : 'Validated — click Save to activate this integration.';
  }
  save.disabled = !ready;
  save.classList.toggle('is-ready', ready);
  if (note) note.textContent = noteText;
}

async function saveIntegrationFromModal() {
  const e = intEntry(intCatalog.openId);
  if (!e) return;
  if (e.id === 'weather') {
    const eps = weatherEps();
    if (!eps.length) return;
    if (weatherProvider() === 'openweathermap' && !state.weatherApiKeyValidated) return;
    const units = weatherGlobalUnits();
    const refresh = weatherGlobalRefresh();
    eps.forEach((ep) => {
      ep.fields = ep.fields || {};
      ep.fields.weatherUnits = units;
      ep.fields.weatherRefreshMins = refresh;
      if (!ep.name) ep.name = ep.fields.weatherLocation;   // Name auto-fills from the city
      ep.validated = true;
    });
    state.currentSettings.weatherEnabled = eps.length > 0;
    state.currentSettings.weatherProvider = weatherProvider();   // persist the resolved choice
    weatherMirrorFirstToFlat();
    intSetDesc(e, eps[0].name || 'Weather');
    await saveSettings();
    closeIntegrationModal();
    return;
  }
  if (!intIsValidated(e)) return;
  if (epIsMulti(e)) {
    syncFormToEndpoint(e, intCatalog.epIndex);
    const ep = epCurrent(e);
    if (ep && !ep.name) ep.name = e.name.slice(0, 20);
    state.currentSettings[e.enabledKey] = Endpoints.count(state.currentSettings, e.id) > 0;
    // Mirror the first endpoint onto the legacy flat keys + description so any
    // not-yet-migrated reader still sees a coherent configuration.
    const first = epList(e)[0];
    if (first) {
      Endpoints.schema(e.id).fields.forEach((k) => { if (first.fields[k] !== undefined) state.currentSettings[k] = first.fields[k]; });
      intSetDesc(e, first.name || e.name);
    }
  } else {
    state.currentSettings[e.enabledKey] = true;
  }
  await saveSettings();               // persists everything from currentSettings
  closeIntegrationModal();            // saved value is now ON, so it stays ON
}

// Pop an offline sample of the widget (iframe of the widgets/*-demo.html page).
function openSampleModal(id) {
  const e = intEntry(id);
  if (!e || !SAMPLE_IDS.has(id)) return;
  // Resolve the page path FIRST, then append the query — chrome.runtime.getURL
  // treats its argument as a resource path, so a query string passed inside it
  // becomes part of the filename and the page fails to load (blank iframe).
  const base = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('widgets/sample.html') : '../widgets/sample.html';
  const url = base + '?w=' + encodeURIComponent(id);
  document.getElementById('int-sample-ico').src = intIconSrc(e.icon);
  document.getElementById('int-sample-name').textContent = `${e.name} — Sample`;
  document.getElementById('int-sample-frame').src = url;
  const openLink = document.getElementById('int-sample-open');
  if (openLink) openLink.href = url;
  document.getElementById('int-sample-modal').classList.add('open');
}
function closeSampleModal() {
  document.getElementById('int-sample-modal').classList.remove('open');
  const frame = document.getElementById('int-sample-frame');
  if (frame) frame.src = 'about:blank';   // stop the demo's polling/timers
}

// ─── Quick "Add to Dashboard" from an integration card ───────────────────────
// The default widget added by the card's "+" button. Most integrations expose a
// base widget whose id === the integration id; weather has only variants, so it
// defaults to the combined widget. Any future integration with a base widget
// gains this automatically.
const INT_DEFAULT_WID = { weather: 'weather-combined' };
function intDefaultWid(e) { return INT_DEFAULT_WID[e.id] || e.id; }
function intDefaultWidgetName(e) { return e.id === 'weather' ? 'Weather (Combined)' : e.name; }
function intSupportsWidgets(e) { return !!intDefaultWid(e); }

const a2dState = { intId: null, wid: null, endpointId: null, endpointName: null, sel: new Set() };

async function openAddToDashModal(intId) {
  const e = intEntry(intId);
  if (!e) return;
  a2dState.intId = intId;
  a2dState.wid = intDefaultWid(e);
  a2dState.endpointId = null;
  a2dState.endpointName = null;
  // Multi-endpoint services quick-add the FIRST endpoint's widget.
  if (window.Endpoints && Endpoints.isMulti(intId)) {
    const eps = Endpoints.list(state.currentSettings, intId);
    if (eps[0]) { a2dState.endpointId = eps[0].id; a2dState.endpointName = eps[0].name; }
  }
  a2dState.sel = new Set();

  // Always work from the freshest dashboards in storage.
  const stored = await chromeStorageGet(['dashboards']);
  state.dashboards = stored.dashboards || [];

  document.getElementById('a2d-title').textContent = `Add ${e.name} to dashboard`;
  const widName = intDefaultWidgetName(e) + (a2dState.endpointName ? ` — ${a2dState.endpointName}` : '');
  const sub = document.getElementById('a2d-sub');
  if (sub) sub.textContent = `Choose which dashboards get the “${widName}” widget.`;
  renderA2dList();
  document.getElementById('add-to-dash-modal').classList.add('visible');
}

function closeAddToDashModal() {
  document.getElementById('add-to-dash-modal')?.classList.remove('visible');
}

// Does this dashboard already hold the widget we're about to add?
function a2dHasWidget(dash) {
  return Array.isArray(dash.widgets) && dash.widgets.some((w) =>
    w.wid === a2dState.wid && (w.endpointId || null) === (a2dState.endpointId || null) && !w.sample);
}

function renderA2dList() {
  const list = document.getElementById('a2d-list');
  if (!list) return;
  list.innerHTML = '';
  if (!state.dashboards.length) {
    list.innerHTML = '<div class="a2d-empty">No dashboards yet — create one in the Dashboards tab first.</div>';
    a2dUpdateAdd();
    return;
  }
  state.dashboards.forEach((dash) => {
    const exists = a2dHasWidget(dash);
    const row = document.createElement('label');
    row.className = 'a2d-row' + (exists ? ' is-added' : '');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.disabled = exists;
    cb.checked = a2dState.sel.has(dash.id);
    cb.addEventListener('change', () => {
      if (cb.checked) a2dState.sel.add(dash.id); else a2dState.sel.delete(dash.id);
      a2dUpdateAdd();
    });
    const main = document.createElement('div');
    main.className = 'a2d-main';
    const nm = document.createElement('div');
    nm.className = 'a2d-name';
    nm.textContent = dash.name || 'Untitled dashboard';
    main.appendChild(nm);
    if (dash.description) {
      const d = document.createElement('div');
      d.className = 'a2d-desc';
      d.textContent = dash.description;
      main.appendChild(d);
    }
    row.append(cb, main);
    if (exists) {
      const tag = document.createElement('span');
      tag.className = 'a2d-added-tag';
      tag.textContent = 'Already added';
      tag.title = 'Already added to this dashboard';
      row.appendChild(tag);
    }
    list.appendChild(row);
  });
  a2dUpdateAdd();
}

function a2dUpdateAdd() {
  const n = a2dState.sel.size;
  const btn = document.getElementById('a2d-add');
  const note = document.getElementById('a2d-note');
  if (btn) { btn.disabled = n === 0; btn.textContent = n > 1 ? `Add to ${n} dashboards` : 'Add to dashboard'; }
  if (note) note.textContent = n ? `${n} selected` : 'Select one or more dashboards';
}

async function confirmAddToDash() {
  const e = intEntry(a2dState.intId);
  if (!e || !a2dState.sel.size) return;
  const widName = intDefaultWidgetName(e);
  let count = 0;
  a2dState.sel.forEach((dashId) => {
    const dash = state.dashboards.find((d) => d.id === dashId);
    if (!dash || a2dHasWidget(dash)) return;     // skip duplicates defensively
    if (!Array.isArray(dash.widgets)) dash.widgets = [];
    const entry = {
      uid: 'wg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      wid: a2dState.wid,
      intId: a2dState.wid,
      name: widName,
    };
    if (a2dState.endpointId) {
      entry.endpointId = a2dState.endpointId;
      entry.endpointName = a2dState.endpointName;
      entry.name = `${widName} — ${a2dState.endpointName}`;
    }
    dash.widgets.push(entry);
    count++;
  });
  await saveDashboards();
  closeAddToDashModal();
  showToast(`Widget added to ${count} dashboard${count === 1 ? '' : 's'} ✓`);
}

function setupIntegrationsCatalog() {
  const search = document.getElementById('int-search');
  if (search) search.addEventListener('input', (ev) => {
    intCatalog.query = ev.target.value.toLowerCase().trim();
    renderIntegrationGrid();
  });
  // Clear button: wipe the field, reset the query, restore the default list.
  document.getElementById('int-search-clear')?.addEventListener('click', () => {
    if (search) { search.value = ''; search.focus(); }
    intCatalog.query = '';
    renderIntegrationGrid();
  });
  document.getElementById('int-m-close')?.addEventListener('click', closeIntegrationModal);
  document.getElementById('int-m-cancel')?.addEventListener('click', closeIntegrationModal);
  document.getElementById('int-m-save')?.addEventListener('click', saveIntegrationFromModal);

  // Required Description field (identifies this configuration; ≤20 chars).
  const descEl = document.getElementById('int-m-desc');
  if (descEl) descEl.addEventListener('input', () => {
    const e = intEntry(intCatalog.openId);
    if (!e) return;
    const v = descEl.value.slice(0, 20);
    if (epIsMulti(e)) {
      const ep = epCurrent(e);
      if (ep) ep.name = v;
      intSetDesc(e, (epList(e)[0] && epList(e)[0].name) || v);  // keep legacy map coherent
      renderEndpointTabs(e);
    } else {
      intSetDesc(e, v);
    }
    const cnt = document.getElementById('int-m-desc-count');
    if (cnt) cnt.textContent = `${v.length}/20`;
    refreshIntegrationModalSave();
    updateSaveBar();
  });

  // Delete the currently-selected endpoint.
  document.getElementById('int-m-eps-del')?.addEventListener('click', () => {
    const e = intEntry(intCatalog.openId);
    if (e) deleteEndpointInModal(e);
  });

  // Refresh-interval change → store per-integration override.
  document.getElementById('int-poll-select')?.addEventListener('change', (e) => {
    const id = intCatalog.openId;
    if (!id) return;
    state.currentSettings.pollSecs = { ...state.currentSettings.pollSecs, [id]: parseInt(e.target.value, 10) };
    updateSaveBar();
  });
  // NOTE: intentionally no backdrop-click / Esc close — the modal closes only
  // via × or Cancel so a stray click can't drop an in-progress setup.

  // Sample modal — informational, so backdrop-click and Esc close it too.
  document.getElementById('int-sample-close')?.addEventListener('click', closeSampleModal);
  const sampleOverlay = document.getElementById('int-sample-modal');
  sampleOverlay?.addEventListener('click', (e) => { if (e.target === sampleOverlay) closeSampleModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sampleOverlay && sampleOverlay.classList.contains('open')) closeSampleModal();
  });

  // Add-to-dashboard modal — backdrop-click and Esc close it.
  document.getElementById('a2d-close')?.addEventListener('click', closeAddToDashModal);
  document.getElementById('a2d-cancel')?.addEventListener('click', closeAddToDashModal);
  document.getElementById('a2d-add')?.addEventListener('click', confirmAddToDash);
  const a2dOverlay = document.getElementById('add-to-dash-modal');
  a2dOverlay?.addEventListener('click', (e) => { if (e.target === a2dOverlay) closeAddToDashModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && a2dOverlay && a2dOverlay.classList.contains('visible')) closeAddToDashModal();
  });

  renderIntegrationGrid();
}

document.addEventListener('DOMContentLoaded', init);
