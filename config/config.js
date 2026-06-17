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
};

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  savedSettings: { ...DEFAULT_SETTINGS },
  currentSettings: { ...DEFAULT_SETTINGS },
  apiKeyValidated: false,
  weatherApiKeyValidated: false,
  tautulliApiKeyValidated: false,
  tautulliPreviewWidget: null,
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
    c.tautulliCarouselDwellMs !== s.tautulliCarouselDwellMs
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
  applySettingsToUI();
  updateSaveBar();
  hideValidationResult();
  const wvr = document.getElementById('weather-validation-result');
  if (wvr) wvr.style.display = 'none';
  hideTautulliValidationResult();
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
