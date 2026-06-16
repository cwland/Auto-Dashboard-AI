// Auto Dashboard AI — New Tab Page
'use strict';

// ─── State ────────────────────────────────────────────────────────────────────

// User settings (clock format, weather, etc.) — populated by loadData()
let settings = {};

const state = {
  dashboards: [],
  defaultDashboardId: null,
  activeDashboardId: null,

  // Rearrange mode
  rearrangeMode: false,
  rearrangeModified: false,

  // Edit modal
  editingBmId: null,
};

// Pointer-drag scratch
const pDrag = {
  active:      false,
  srcEl:       null,   // the real card, moved off-screen during drag
  ghost:       null,   // visible clone that follows the cursor
  placeholder: null,   // lightweight div holding the card's grid slot
  ox:          0,      // cursor offset from card left edge at drag start
  oy:          0,      // cursor offset from card top edge at drag start
  ghostW:      0,      // card width (for ghost-center threshold calculation)
  lastTarget:  null,   // last drop-target key (avoids redundant DOM mutations)
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const dashboardArea    = document.getElementById('dashboard-area');
const dashboardSelect  = document.getElementById('dashboard-select');
const switcherWrapper  = document.getElementById('switcher-wrapper');
const searchInput      = document.getElementById('search-input');
const clockEl          = document.getElementById('clock');
const dateEl           = document.getElementById('date-display');
const rearrangeBtn     = document.getElementById('rearrange-btn');
const rearrangeBar     = document.getElementById('rearrange-bar');
const rearrangeSaveBtn = document.getElementById('rearrange-save-btn');
const rearrangeCancel  = document.getElementById('rearrange-cancel-btn');
const changedBadge     = document.getElementById('rearrange-changed-badge');
const editModal        = document.getElementById('edit-modal');
const dashEditModal    = document.getElementById('dash-edit-modal');
const dashEditBtn      = document.getElementById('dash-edit-btn');

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadData();    // loads settings first so clock renders correctly
  startClock();

  if (state.dashboards.length === 0) { showEmptyState(); return; }

  populateSwitcher();
  renderDashboard(state.activeDashboardId);
  setupSearch();
  setupRearrangeControls();
  setupEditModal();
  setupDashEditModal();
  loadWeather();       // async, non-blocking — initial fetch / cache hit

  // Periodic refresh: re-check at the end of each interval.
  // The lock in loadWeather ensures only one tab actually fetches.
  if (settings.weatherEnabled && settings.weatherApiKey && settings.weatherLocation) {
    const refreshMs = Math.max(10, settings.weatherRefreshMins || 60) * 60 * 1000;
    setInterval(loadWeather, refreshMs);
  }
}

async function loadData() {
  const stored = await chromeGet(['dashboards', 'defaultDashboardId', 'settings']);
  state.dashboards         = stored.dashboards         || [];
  state.defaultDashboardId = stored.defaultDashboardId || null;
  settings                 = stored.settings            || {};

  // Allow ?dash=dash_xxx to preview a specific dashboard
  const paramDashId = new URLSearchParams(window.location.search).get('dash');
  const paramDash   = paramDashId && state.dashboards.find((d) => d.id === paramDashId);
  state.activeDashboardId = paramDash
    ? paramDashId
    : (state.defaultDashboardId || state.dashboards[0]?.id || null);
}

// ─── Clock ────────────────────────────────────────────────────────────────────

function startClock() {
  function tick() {
    const now = new Date();
    const fmt = settings.clockFormat || '12';

    if (fmt === '24') {
      clockEl.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    } else {
      const h    = now.getHours();
      const h12  = h % 12 || 12;
      const ampm = h >= 12 ? 'PM' : 'AM';
      clockEl.textContent = `${h12}:${pad(now.getMinutes())} ${ampm}`;
    }

    const dateVisible = settings.dateVisible !== false; // default true
    clockEl.style.display  = dateVisible ? '' : 'none';
    dateEl.style.display   = dateVisible ? '' : 'none';
    if (!dateVisible) {
      // nothing to render
    } else {
      const dfmt = settings.dateFormat || 'long';
      const M = pad(now.getMonth() + 1);
      const D = pad(now.getDate());
      const Y = now.getFullYear();
      switch (dfmt) {
        case 'none':                                   // legacy → hide
          dateEl.textContent = '';
          break;
        case 'medium':
          dateEl.textContent = now.toLocaleDateString(undefined, {
            month: 'long', day: 'numeric', year: 'numeric',
          });
          break;
        case 'short':
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
          });
          break;
        case 'weekday':
          dateEl.textContent = now.toLocaleDateString(undefined, { weekday: 'long' });
          break;
        case 'numeric':                                // legacy → US format
        case 'us':
          dateEl.textContent = `${M}/${D}/${Y}`;
          break;
        case 'eu':
          dateEl.textContent = `${D}.${M}.${Y}`;
          break;
        case 'uk':
          dateEl.textContent = `${D}/${M}/${Y}`;
          break;
        case 'iso':
          dateEl.textContent = `${Y}-${M}-${D}`;
          break;
        default:                                       // 'long'
          dateEl.textContent = now.toLocaleDateString(undefined, {
            weekday: 'long', month: 'long', day: 'numeric',
          });
      }
    }
  }
  tick();
  setInterval(tick, 10000);
}
const pad = (n) => String(n).padStart(2, '0');

// ─── Dashboard switcher ───────────────────────────────────────────────────────

function populateSwitcher() {
  if (state.dashboards.length <= 1) return;
  switcherWrapper.style.display = 'flex';
  dashboardSelect.innerHTML = '';
  state.dashboards
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((dash) => {
      const opt = document.createElement('option');
      opt.value = dash.id;
      opt.textContent = dash.id === state.defaultDashboardId ? `${dash.name} ★` : dash.name;
      if (dash.id === state.activeDashboardId) opt.selected = true;
      dashboardSelect.appendChild(opt);
    });
  dashboardSelect.addEventListener('change', () => {
    state.activeDashboardId = dashboardSelect.value;
    exitRearrangeMode(true);
    renderDashboard(state.activeDashboardId);
  });
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderDashboard(dashId) {
  const dash = state.dashboards.find((d) => d.id === dashId);
  if (!dash) { showEmptyState(); return; }

  // Update dashboard name in topbar
  const nameEl = document.getElementById('dash-name-display');
  if (nameEl) nameEl.textContent = dash.name;

  // Show/hide title text under icons — dashboard-wide default (true unless explicitly off)
  dashboardArea.classList.toggle('text-hidden', dash.showText === false);

  dashboardArea.innerHTML = '';
  const cmp = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  // Group bookmarks by folder
  const groups = {};
  dash.bookmarks.forEach((bm) => {
    const key = bm.folder || 'General';
    if (!groups[key]) groups[key] = [];
    groups[key].push(bm);
  });

  const folderNames = Object.keys(groups).sort((a, b) => cmp.compare(a, b));
  folderNames.forEach((name) => {
    groups[name].sort((a, b) => cmp.compare(a.title || '', b.title || ''));
  });

  folderNames.forEach((folderName) => {
    dashboardArea.appendChild(buildFolderSection(folderName, groups[folderName]));
  });
}

// ─── Folder section ───────────────────────────────────────────────────────────

function buildFolderSection(folderName, bookmarks) {
  const section = document.createElement('div');
  section.className = 'folder-section fade-in';
  section.dataset.folder = folderName;

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.innerHTML = `
    <span class="folder-icon">📁</span>
    <span class="folder-name">${escapeHtml(getFolderDisplayName(folderName))}</span>
    <span class="folder-count">${bookmarks.length} item${bookmarks.length !== 1 ? 's' : ''}</span>
  `;

  const grid = document.createElement('div');
  grid.className = 'bookmark-grid';
  bookmarks.forEach((bm) => grid.appendChild(buildBookmarkCard(bm)));

  section.appendChild(header);
  section.appendChild(grid);
  return section;
}

function getFolderDisplayName(folder) {
  const parts = folder.split(' > ');
  return parts[parts.length - 1] || folder;
}

// ─── Bookmark card ────────────────────────────────────────────────────────────

function buildBookmarkCard(bm) {
  const dash = getActiveDash();
  const shape = bm.shape || dash?.defaultShape || 'rounded';

  const card = document.createElement('a');
  card.className = 'bookmark-card';
  card.href = bm.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.dataset.bmId  = bm.id;
  card.dataset.shape = shape;
  card.dataset.title = (bm.title       || '').toLowerCase();
  card.dataset.url   = (bm.url         || '').toLowerCase();
  card.dataset.desc  = (bm.description || '').toLowerCase();

  // Prevent navigation in rearrange mode
  card.addEventListener('click', (e) => {
    if (state.rearrangeMode) e.preventDefault();
  });

  // ── Drag handle pip (shown only in rearrange mode via CSS) ──
  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.textContent = '⠿';
  card.appendChild(dragHandle);

  // ── Action buttons (info + remove) ──
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const infoBtn = document.createElement('button');
  infoBtn.className = 'card-action-btn card-info-btn';
  infoBtn.title = '';
  infoBtn.textContent = 'ℹ';
  infoBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    hideDescTooltip();
    openEditModal(bm.id);
  });
  // Show description tooltip on hover
  if (bm.description) {
    infoBtn.addEventListener('mouseenter', (e) => showDescTooltip(e, bm.description));
    infoBtn.addEventListener('mouseleave', hideDescTooltip);
  }

  const removeBtn = document.createElement('button');
  removeBtn.className = 'card-action-btn card-remove-btn';
  removeBtn.title = 'Remove from dashboard';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    removeBookmark(bm.id);
  });

  actions.appendChild(infoBtn);
  actions.appendChild(removeBtn);
  card.appendChild(actions);

  // ── Icon ──
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bm-icon-wrapper';

  const fallbackUrls = [
    bm.icon_slug
      ? `https://cdn.simpleicons.org/${encodeURIComponent(bm.icon_slug)}`
      : null,
    (() => {
      try { return `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=64`; }
      catch { return null; }
    })(),
  ].filter(Boolean);

  function showEmoji() {
    iconWrapper.innerHTML = '';
    const em = document.createElement('span');
    em.className = 'bm-emoji-fallback';
    em.textContent = bm.icon_emoji || '🔗';
    iconWrapper.appendChild(em);
  }

  function tryNextUrl(urls, idx = 0) {
    if (idx >= urls.length) { showEmoji(); return; }
    const img = document.createElement('img');
    img.className = 'bm-favicon';
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => tryNextUrl(urls, idx + 1));
    img.src = urls[idx];
    iconWrapper.innerHTML = '';
    iconWrapper.appendChild(img);
  }

  if (bm.resolved_icon) {
    const img = document.createElement('img');
    img.className = 'bm-favicon';
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => tryNextUrl(fallbackUrls));
    img.src = bm.resolved_icon;
    iconWrapper.appendChild(img);
  } else {
    tryNextUrl(fallbackUrls);
  }

  card.appendChild(iconWrapper);

  // ── Title ──
  const title = document.createElement('div');
  title.className = 'bm-title';
  title.textContent = bm.title || tryHostname(bm.url);
  card.appendChild(title);

  // ── Pointer drag (active only in rearrange mode) ──
  initCardPointerDrag(card);

  return card;
}

function tryHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

// ─── Rearrange controls ───────────────────────────────────────────────────────

function setupRearrangeControls() {
  rearrangeBtn.addEventListener('click', () => {
    if (state.rearrangeMode) exitRearrangeMode(true);
    else enterRearrangeMode();
  });
  rearrangeSaveBtn.addEventListener('click', saveRearrangement);
  rearrangeCancel.addEventListener('click', () => exitRearrangeMode(true));
}

function enterRearrangeMode() {
  state.rearrangeMode     = true;
  state.rearrangeModified = false;
  document.body.classList.add('rearrange-mode');
  rearrangeBtn.classList.add('active');
  rearrangeBtn.textContent = '✕ Exit Rearrange';
  rearrangeBar.classList.add('visible');
  changedBadge.classList.remove('visible');
  searchInput.blur();
}

function exitRearrangeMode(discard = false) {
  if (!state.rearrangeMode) return;

  // End any in-progress drag
  if (pDrag.active) endPointerDrag();

  state.rearrangeMode     = false;
  state.rearrangeModified = false;
  document.body.classList.remove('rearrange-mode');
  rearrangeBtn.classList.remove('active');
  rearrangeBtn.textContent = '⇄ Rearrange';
  rearrangeBar.classList.remove('visible');

  // Reset any FLIP translate on cards before re-rendering
  document.querySelectorAll('.bookmark-card').forEach((c) => {
    c.style.transition = '';
    c.style.translate  = '';
  });

  if (discard) renderDashboard(state.activeDashboardId);
}

async function saveRearrangement() {
  const dash = getActiveDash();
  if (!dash) return;

  // Read current DOM order
  const newBookmarks = [];
  document.querySelectorAll('.folder-section').forEach((section) => {
    const folderName = section.dataset.folder;
    section.querySelectorAll('.bookmark-card').forEach((card) => {
      const bm = dash.bookmarks.find((b) => b.id === card.dataset.bmId);
      if (bm) newBookmarks.push({ ...bm, folder: folderName });
    });
  });

  dash.bookmarks = newBookmarks;
  await chromeSet({ dashboards: state.dashboards });

  exitRearrangeMode(false); // DOM is already correct; don't re-render
  showToast('Layout saved ✓');
}

function markRearrangeChanged() {
  state.rearrangeModified = true;
  changedBadge.classList.add('visible');
}

// ─── Pointer-events drag with FLIP animation ──────────────────────────────────

// ── Attach pointerdown; actual drag logic is in module-level handlers ─────────

function initCardPointerDrag(cardEl) {
  cardEl.addEventListener('pointerdown', (e) => {
    if (!state.rearrangeMode || e.button !== 0) return;
    e.preventDefault();
    dragStart(cardEl, e);
  });
}

function dragStart(cardEl, e) {
  const rect = cardEl.getBoundingClientRect();

  // 1. Placeholder div — holds the card's grid slot while we drag
  const ph = document.createElement('div');
  ph.className    = 'drag-placeholder';
  ph.style.width  = rect.width  + 'px';
  ph.style.height = rect.height + 'px';
  cardEl.parentNode.insertBefore(ph, cardEl); // placeholder takes card's spot in grid

  // 2. Move real card out of the grid entirely (body, off-screen)
  //    This avoids pointer-capture breakage when re-parenting across grids.
  document.body.appendChild(cardEl);
  cardEl.style.cssText = 'position:fixed;left:-9999px;top:-9999px;' +
    'opacity:0;pointer-events:none;animation:none;transition:none;';

  // 3. Ghost — visible clone that follows cursor
  const ghost = document.createElement('div');
  ghost.className   = 'bookmark-card drag-ghost';
  ghost.innerHTML   = cardEl.innerHTML;
  ghost.style.width = rect.width  + 'px';
  ghost.style.height = rect.height + 'px';
  ghost.style.left  = rect.left   + 'px';
  ghost.style.top   = rect.top    + 'px';
  document.body.appendChild(ghost);

  pDrag.active      = true;
  pDrag.srcEl       = cardEl;
  pDrag.ghost       = ghost;
  pDrag.placeholder = ph;
  pDrag.ox          = e.clientX - rect.left;
  pDrag.oy          = e.clientY - rect.top;
  pDrag.ghostW      = rect.width;  // used for ghost-center threshold
  pDrag.lastTarget  = null;

  // Document-level listeners — no pointer capture needed
  document.addEventListener('pointermove',   onDragMove,   { passive: false });
  document.addEventListener('pointerup',     onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!pDrag.active) return;
  e.preventDefault();

  // Move ghost with cursor
  pDrag.ghost.style.left = (e.clientX - pDrag.ox) + 'px';
  pDrag.ghost.style.top  = (e.clientY - pDrag.oy) + 'px';

  // Ghost center x — using this (rather than raw cursor x) as the threshold
  // makes the swap trigger as soon as the dragged card's center crosses the
  // target card's center, which feels much more responsive.
  const gcx = e.clientX - pDrag.ox + pDrag.ghostW * 0.5;

  // Find elements under cursor (hide ghost so it's not in the stack)
  pDrag.ghost.style.visibility = 'hidden';
  const els = document.elementsFromPoint(e.clientX, e.clientY);
  pDrag.ghost.style.visibility = '';

  // ── Try direct card hit ──────────────────────────────────────────────────
  const targetCard = els.find(
    (el) => el.classList.contains('bookmark-card') && el !== pDrag.srcEl,
  );

  if (targetCard) {
    const tr    = targetCard.getBoundingClientRect();
    const ins   = gcx < tr.left + tr.width * 0.5; // ghost center vs card center
    const key   = targetCard.dataset.bmId + (ins ? ':b' : ':a');
    if (key !== pDrag.lastTarget) {
      pDrag.lastTarget = key;
      const grid = targetCard.closest('.bookmark-grid');
      if (grid) {
        flipDo(() => ins
          ? grid.insertBefore(pDrag.placeholder, targetCard)
          : grid.insertBefore(pDrag.placeholder, targetCard.nextSibling),
        );
      }
    }
    return;
  }

  // ── No direct card hit — find the grid under cursor and nearest card ─────
  // This handles: space before the first card, gaps between cards, empty grids.
  const grid = findGridFromEls(els);
  if (!grid) return;

  const cards = [...grid.querySelectorAll('.bookmark-card')].filter(c => c !== pDrag.srcEl);

  if (cards.length === 0) {
    // Empty grid — just move placeholder here
    const fKey = grid.closest('.folder-section')?.dataset.folder + ':empty';
    if (fKey !== pDrag.lastTarget) {
      pDrag.lastTarget = fKey;
      flipDo(() => grid.appendChild(pDrag.placeholder));
    }
    return;
  }

  // Find the card whose center is horizontally closest to the cursor
  let nearest = cards[0];
  let nearestDist = Infinity;
  cards.forEach((c) => {
    const r    = c.getBoundingClientRect();
    const dist = Math.abs(e.clientX - (r.left + r.width * 0.5));
    if (dist < nearestDist) { nearestDist = dist; nearest = c; }
  });

  const nr  = nearest.getBoundingClientRect();
  const ins = gcx < nr.left + nr.width * 0.5;
  const key = nearest.dataset.bmId + (ins ? ':b' : ':a');
  if (key !== pDrag.lastTarget) {
    pDrag.lastTarget = key;
    flipDo(() => ins
      ? grid.insertBefore(pDrag.placeholder, nearest)
      : grid.insertBefore(pDrag.placeholder, nearest.nextSibling),
    );
  }
}

/** Walk the elementsFromPoint stack to find the nearest .bookmark-grid. */
function findGridFromEls(els) {
  for (const el of els) {
    if (el.classList.contains('bookmark-grid')) return el;
    if (el.classList.contains('folder-section') || el.classList.contains('folder-header')) {
      const g = el.querySelector('.bookmark-grid');
      if (g) return g;
    }
  }
  return null;
}

function onDragEnd() {
  if (!pDrag.active) return;

  const ph   = pDrag.placeholder;
  const grid = ph?.parentNode;

  // Drop: insert real card at placeholder's slot, then remove placeholder
  if (grid && ph) {
    pDrag.srcEl.style.cssText = ''; // restore inline styles to nothing
    grid.insertBefore(pDrag.srcEl, ph);
    ph.remove();
  } else if (pDrag.srcEl) {
    pDrag.srcEl.style.cssText = ''; // safety restore
  }

  pDrag.ghost?.remove();

  document.removeEventListener('pointermove',   onDragMove);
  document.removeEventListener('pointerup',     onDragEnd);
  document.removeEventListener('pointercancel', onDragEnd);

  const changed = pDrag.lastTarget !== null;

  pDrag.active      = false;
  pDrag.srcEl       = null;
  pDrag.ghost       = null;
  pDrag.placeholder = null;
  pDrag.lastTarget  = null;

  if (changed) markRearrangeChanged();
}

// Called by exitRearrangeMode when aborting mid-drag
function endPointerDrag() { onDragEnd(); }

/**
 * FLIP — animate cards displaced by moving the placeholder.
 *
 * Uses the standalone `translate` CSS property so it doesn't conflict with
 * the jiggle animation (which uses `rotate`).
 *
 * 1. Snap any in-progress FLIP translate back to natural position (synchronous).
 * 2. Snapshot natural "before" positions.
 * 3. Mutate DOM (move placeholder).
 * 4. Measure "after" positions.
 * 5. Snap displaced cards to "before" position, then CSS-transition to natural.
 */
function flipDo(fn) {
  // All real cards currently in the grids (not ghost, not srcEl which is off-screen)
  const cards = [...document.querySelectorAll('.bookmark-card:not(.drag-ghost)')]
    .filter((c) => c !== pDrag.srcEl);

  // Step 1 — reset any running FLIP translate so measurements are accurate
  cards.forEach((c) => {
    c.style.transition = 'none';
    c.style.translate  = '';
  });
  void document.body.offsetHeight; // force layout

  // Step 2 — measure natural "before" positions
  const before = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));

  // Step 3 — DOM mutation
  fn();
  void document.body.offsetHeight; // force layout after mutation

  // Steps 4+5 — for each moved card: snap to old pos, then animate to new pos
  cards.forEach((c) => {
    const b = before.get(c);
    if (!b) return;
    const a = c.getBoundingClientRect();
    const dx = b.left - a.left;
    const dy = b.top  - a.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return; // didn't move

    // Invert: place card visually at its old position (no transition)
    c.style.transition = 'none';
    c.style.translate  = `${dx}px ${dy}px`;

    // Play: next frame, let the CSS `transition: translate 0.2s` animate it home
    requestAnimationFrame(() => {
      c.style.transition = ''; // CSS rule takes over: transition: translate 0.2s
      c.style.translate  = ''; // triggers animation to natural (0,0)
    });
  });
}

// ─── Edit modal ───────────────────────────────────────────────────────────────

function setupEditModal() {
  document.getElementById('edit-modal-close').addEventListener('click', closeEditModal);
  document.getElementById('edit-cancel-btn').addEventListener('click', closeEditModal);
  document.getElementById('edit-save-btn').addEventListener('click', saveBookmarkEdit);

  // Delete Item button — close modal first, then confirm + remove
  document.getElementById('edit-delete-btn').addEventListener('click', () => {
    const bmId = state.editingBmId;
    closeEditModal();
    removeBookmark(bmId);
  });

  // Test icon URL
  document.getElementById('edit-icon-test-btn').addEventListener('click', () => {
    const url = document.getElementById('edit-icon-url').value.trim();
    if (url) previewModalIcon(url);
  });

  // Live emoji preview
  document.getElementById('edit-icon-emoji').addEventListener('input', (e) => {
    if (e.target.value) updateModalPreviewEmoji(e.target.value);
  });

  // Live name preview
  document.getElementById('edit-name').addEventListener('input', (e) => {
    document.getElementById('modal-preview-name').textContent = e.target.value || '—';
  });

  // Shape picker (icon shape for this bookmark)
  setupShapePicker('edit-shape-picker');

  // Close on overlay click
  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) closeEditModal();
  });
}

/** Wires click/keyboard selection for a shape-picker widget; adds .selected to the chosen option. */
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

function openEditModal(bmId) {
  const bm = findBookmark(bmId);
  if (!bm) return;
  state.editingBmId = bmId;

  document.getElementById('edit-name').value        = bm.title        || '';
  document.getElementById('edit-description').value = bm.description  || '';
  document.getElementById('edit-icon-url').value    = bm.resolved_icon || '';
  document.getElementById('edit-icon-emoji').value  = bm.icon_emoji   || '🔗';
  document.getElementById('edit-url').value         = bm.url          || '';

  const dash = getActiveDash();
  selectShapeOption('edit-shape-picker', bm.shape || dash?.defaultShape || 'rounded');

  document.getElementById('modal-preview-name').textContent = bm.title || bm.url;
  document.getElementById('modal-preview-url').textContent  = bm.url;
  previewModalIcon(bm.resolved_icon || null, bm.icon_emoji || '🔗');

  editModal.classList.add('visible');
  document.getElementById('edit-name').focus();
}

function previewModalIcon(url, emojiStr) {
  const preview = document.getElementById('modal-icon-preview');
  if (url) {
    let img = preview.querySelector('img');
    if (!img) {
      preview.innerHTML = '';
      img = document.createElement('img');
      img.style.cssText = 'width:36px;height:36px;object-fit:contain;';
      img.addEventListener('error', () => {
        preview.innerHTML = '';
        const em = document.createElement('span');
        em.className = 'preview-emoji';
        em.textContent = document.getElementById('edit-icon-emoji').value || '🔗';
        preview.appendChild(em);
      });
      preview.appendChild(img);
    }
    img.src = url;
  } else {
    updateModalPreviewEmoji(emojiStr || '🔗');
  }
}

function updateModalPreviewEmoji(emoji) {
  const preview = document.getElementById('modal-icon-preview');
  preview.innerHTML = '';
  const em = document.createElement('span');
  em.className = 'preview-emoji';
  em.textContent = emoji;
  preview.appendChild(em);
}

async function saveBookmarkEdit() {
  const bm = findBookmark(state.editingBmId);
  if (!bm) { closeEditModal(); return; }

  bm.title         = document.getElementById('edit-name').value.trim()        || bm.title;
  bm.description   = document.getElementById('edit-description').value.trim();
  bm.resolved_icon = document.getElementById('edit-icon-url').value.trim()   || null;
  bm.icon_emoji    = document.getElementById('edit-icon-emoji').value.trim()  || '🔗';
  bm.shape         = getSelectedShape('edit-shape-picker', bm.shape || 'rounded');

  await chromeSet({ dashboards: state.dashboards });
  closeEditModal();

  // Swap the card in place
  const cardEl = document.querySelector(`.bookmark-card[data-bm-id="${bm.id}"]`);
  if (cardEl) cardEl.replaceWith(buildBookmarkCard(bm));

  showToast('Bookmark updated ✓');
}

function closeEditModal() {
  editModal.classList.remove('visible');
  state.editingBmId = null;
}

// ─── Dashboard edit modal (rename, show text, default shape) ──────────────────

function setupDashEditModal() {
  if (!dashEditModal) return;

  dashEditBtn?.addEventListener('click', openDashEditModal);
  document.getElementById('dash-edit-modal-close')?.addEventListener('click', closeDashEditModal);
  document.getElementById('dash-edit-cancel-btn')?.addEventListener('click', closeDashEditModal);
  document.getElementById('dash-edit-save-btn')?.addEventListener('click', saveDashEdit);

  setupShapePicker('dash-edit-shape-picker');

  dashEditModal.addEventListener('click', (e) => {
    if (e.target === dashEditModal) closeDashEditModal();
  });
}

function openDashEditModal() {
  const dash = getActiveDash();
  if (!dash) return;

  document.getElementById('dash-edit-name').value = dash.name || '';
  document.getElementById('dash-edit-text-toggle').checked = dash.showText !== false;
  selectShapeOption('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  dashEditModal.classList.add('visible');
  document.getElementById('dash-edit-name').focus();
}

async function saveDashEdit() {
  const dash = getActiveDash();
  if (!dash) { closeDashEditModal(); return; }

  const newName = document.getElementById('dash-edit-name').value.trim();
  dash.name        = newName || dash.name;
  dash.showText    = document.getElementById('dash-edit-text-toggle').checked;
  dash.defaultShape = getSelectedShape('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  await chromeSet({ dashboards: state.dashboards });
  closeDashEditModal();

  // Re-render so name, text visibility, and any un-customized icon shapes update
  renderDashboard(state.activeDashboardId);

  // Update the switcher dropdown label in place (avoid re-binding its listener)
  const opt = dashboardSelect?.querySelector(`option[value="${dash.id}"]`);
  if (opt) opt.textContent = dash.id === state.defaultDashboardId ? `${dash.name} ★` : dash.name;

  showToast('Dashboard updated ✓');
}

function closeDashEditModal() {
  dashEditModal?.classList.remove('visible');
}

// ─── Remove bookmark ──────────────────────────────────────────────────────────

async function removeBookmark(bmId) {
  const dash = getActiveDash();
  if (!dash) return;

  const bm   = dash.bookmarks.find((b) => b.id === bmId);
  const name = bm?.title || 'this bookmark';
  if (!confirm(`Remove "${name}" from this dashboard?`)) return;

  dash.bookmarks = dash.bookmarks.filter((b) => b.id !== bmId);
  await chromeSet({ dashboards: state.dashboards });

  const cardEl = document.querySelector(`.bookmark-card[data-bm-id="${bmId}"]`);
  if (cardEl) {
    const grid = cardEl.closest('.bookmark-grid');
    cardEl.remove();
    if (grid && grid.querySelectorAll('.bookmark-card').length === 0) {
      grid.closest('.folder-section')?.remove();
    }
  }
  showToast('Bookmark removed');
}

// ─── Search ───────────────────────────────────────────────────────────────────

function setupSearch() {
  searchInput.addEventListener('input', () =>
    filterBookmarks(searchInput.value.trim().toLowerCase())
  );

  document.addEventListener('keydown', (e) => {
    if (
      e.key === '/' &&
      document.activeElement !== searchInput &&
      !editModal.classList.contains('visible')
    ) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape') {
      if (editModal.classList.contains('visible')) { closeEditModal(); return; }
      searchInput.value = '';
      filterBookmarks('');
      searchInput.blur();
    }
  });
}

function filterBookmarks(query) {
  document.querySelectorAll('.bookmark-card').forEach((card) => {
    const match =
      !query ||
      card.dataset.title.includes(query) ||
      card.dataset.url.includes(query)   ||
      card.dataset.desc.includes(query);
    card.classList.toggle('search-hidden', !match);
  });
  document.querySelectorAll('.folder-section').forEach((section) => {
    const visible = section.querySelectorAll('.bookmark-card:not(.search-hidden)').length;
    section.classList.toggle('search-empty', visible === 0);
  });
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function showEmptyState() {
  dashboardArea.innerHTML = `
    <div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;text-align:center;color:var(--text-muted);padding:40px;">
      <div style="font-size:56px;">🤖</div>
      <div>
        <div style="font-size:22px;font-weight:600;color:var(--text-primary);margin-bottom:8px;">Welcome to Auto Dashboard AI</div>
        <div style="font-size:14px;color:var(--text-secondary);margin-bottom:20px;">Create your first dashboard from your bookmarks.</div>
        <a href="../config/config.html?tab=dashboards" style="
          display:inline-flex;align-items:center;gap:8px;
          background:var(--accent);color:#fff;
          padding:10px 22px;border-radius:8px;
          text-decoration:none;font-size:14px;font-weight:500;
          transition:background 0.15s;
        ">✨ Create Dashboard</a>
      </div>
    </div>
  `;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getActiveDash() {
  return state.dashboards.find((d) => d.id === state.activeDashboardId) || null;
}

function findBookmark(bmId) {
  return getActiveDash()?.bookmarks.find((b) => b.id === bmId) || null;
}

function chromeGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function chromeSet(data) {
  return new Promise((resolve) => chrome.storage.local.set(data, resolve));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let _toastTimer;
function showToast(msg) {
  let t = document.getElementById('dashboard-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'dashboard-toast';
    t.style.cssText = `
      position:fixed;bottom:80px;left:50%;transform:translateX(-50%);
      background:var(--bg-card);border:1px solid var(--border);
      color:var(--text-primary);padding:10px 20px;border-radius:8px;
      font-size:13px;font-weight:500;box-shadow:var(--shadow);
      z-index:300;transition:opacity 0.2s;pointer-events:none;
    `;
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2400);
}

// ─── Description tooltip ──────────────────────────────────────────────────────

const _tooltip = document.getElementById('bm-desc-tooltip');

function showDescTooltip(e, text) {
  if (!_tooltip) return;
  _tooltip.textContent = text;
  _tooltip.classList.remove('visible');

  // Position above the button; clamp to viewport after measuring
  const btn = e.currentTarget.getBoundingClientRect();
  _tooltip.style.left = '0px';
  _tooltip.style.top  = '0px';
  _tooltip.style.display = 'block'; // measure in DOM

  requestAnimationFrame(() => {
    const tw = _tooltip.offsetWidth;
    const th = _tooltip.offsetHeight;

    let top  = btn.top - th - 8;
    let left = btn.left + btn.width / 2 - tw / 2;

    // Flip below if not enough space above
    if (top < 6) top = btn.bottom + 6;
    // Clamp horizontal
    if (left < 6) left = 6;
    if (left + tw > window.innerWidth - 6) left = window.innerWidth - tw - 6;

    _tooltip.style.top  = top  + 'px';
    _tooltip.style.left = left + 'px';
    _tooltip.classList.add('visible');
  });
}

function hideDescTooltip() {
  if (!_tooltip) return;
  _tooltip.classList.remove('visible');
}

// ─── Weather ──────────────────────────────────────────────────────────────────

async function loadWeather() {
  if (!settings.weatherEnabled || !settings.weatherApiKey || !settings.weatherLocation) return;

  const panel = document.getElementById('weather-panel');
  if (panel) panel.style.display = 'flex';

  const units      = settings.weatherUnits || 'imperial';
  const refreshMs  = Math.max(10, settings.weatherRefreshMins || 60) * 60 * 1000;
  const lockMaxAge = 30_000; // give up on stale lock after 30 s

  // ── 1. Read cache + lock ──────────────────────────────────────────────────
  const stored = await chromeGet(['weatherCache', 'weatherFetching']);
  const cache  = stored.weatherCache;
  const lock   = stored.weatherFetching; // timestamp or null

  // Cache is fresh — just render
  if (cache && cache.units === units && cache.ts && Date.now() - cache.ts < refreshMs) {
    renderWeather(cache.data, units);
    return;
  }

  // Another tab already fetching (lock < 30 s old) — show stale data and bail
  if (lock && Date.now() - lock < lockMaxAge) {
    if (cache) renderWeather(cache.data, units);
    return;
  }

  // ── 2. Acquire lock ───────────────────────────────────────────────────────
  await chromeSet({ weatherFetching: Date.now() });

  // Re-read cache in case another tab beat us to the fetch between our check
  // and our lock write (storage is async, not atomic)
  const stored2 = await chromeGet(['weatherCache']);
  const cache2  = stored2.weatherCache;
  if (cache2 && cache2.units === units && cache2.ts && Date.now() - cache2.ts < refreshMs) {
    await chromeSet({ weatherFetching: null });
    renderWeather(cache2.data, units);
    return;
  }

  // ── 3. Fetch ──────────────────────────────────────────────────────────────
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather` +
      `?q=${encodeURIComponent(settings.weatherLocation)}` +
      `&appid=${settings.weatherApiKey}` +
      `&units=${units}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    await chromeSet({ weatherCache: { ts: Date.now(), data, units }, weatherFetching: null });
    renderWeather(data, units);
  } catch {
    await chromeSet({ weatherFetching: null });
    // Fall back to stale cached data if available
    if (cache) {
      renderWeather(cache.data, units);
    } else {
      setWeatherEl('weather-desc', 'Unavailable');
      const d = document.getElementById('weather-details');
      if (d) d.style.display = 'none';
    }
  }
}

function renderWeather(data, units) {
  const w    = data.weather?.[0] || {};
  const main = data.main  || {};
  const wind = data.wind  || {};
  const sys  = data.sys   || {};

  const unitSym   = units === 'metric' ? '°C' : '°F';
  const speedUnit = units === 'metric' ? 'km/h' : 'mph';

  const temp = Math.round(main.temp    ?? 0);
  const high = Math.round(main.temp_max ?? 0);
  const low  = Math.round(main.temp_min ?? 0);

  // OWM returns m/s for metric, mph for imperial
  const rawSpeed  = wind.speed ?? 0;
  const windSpeed = units === 'metric'
    ? Math.round(rawSpeed * 3.6)  // m/s → km/h
    : Math.round(rawSpeed);

  const sunrise = sys.sunrise ? formatSunTime(sys.sunrise) : '--';
  const sunset  = sys.sunset  ? formatSunTime(sys.sunset)  : '--';
  const desc    = w.description ? capitalize(w.description) : '';
  const emoji   = weatherEmoji(w.id, w.icon);

  setWeatherEl('weather-icon', emoji);
  setWeatherEl('weather-temp', `${temp}${unitSym}`);
  setWeatherEl('weather-desc', desc);
  setWeatherEl('weather-hilo', `H:${high}° L:${low}°`);
  setWeatherEl('weather-wind', `💨 ${windSpeed} ${speedUnit}`);
  setWeatherEl('weather-sun',  `🌅 ${sunrise}  🌇 ${sunset}`);
}

function setWeatherEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function weatherEmoji(id, icon) {
  if (!id) return '🌡️';
  const night = icon?.endsWith('n');
  if (id >= 200 && id < 300) return '⛈️';
  if (id >= 300 && id < 400) return '🌦️';
  if (id >= 500 && id < 511) return '🌧️';
  if (id === 511)             return '❄️';
  if (id >= 512 && id < 600) return '🌧️';
  if (id >= 600 && id < 700) return '❄️';
  if (id >= 700 && id < 800) return '🌫️';
  if (id === 800)  return night ? '🌙' : '☀️';
  if (id === 801)  return night ? '🌙' : '🌤️';
  if (id === 802)  return '⛅';
  if (id >= 803)   return '☁️';
  return '🌡️';
}

function formatSunTime(unixTs) {
  return new Date(unixTs * 1000).toLocaleTimeString([], {
    hour: 'numeric', minute: '2-digit',
  });
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
