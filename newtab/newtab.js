// Auto Dashboard AI — New Tab Page
'use strict';

// ─── Integration icon fallback ────────────────────────────────────────────────
// Hide widget-header brand icons (.wg-icon) that haven't been downloaded yet
// (icons/integrations/fetch-icons.sh) rather than showing a broken image. Done
// here because MV3's CSP blocks inline onerror= handlers on extension pages.
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

// Last-resort icon when no real favicon and no AI brand-icon guess succeed.
// Mirrors the constant in config/config.js so dashboards look consistent
// whether an icon was resolved at generation time or re-resolved here.
const GENERIC_ICON_URL = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 13a5 5 0 0 0 7.07 0l1.93-1.93a5 5 0 0 0-7.07-7.07L10.5 5.5"/>
  <path d="M14 11a5 5 0 0 0-7.07 0l-1.93 1.93a5 5 0 0 0 7.07 7.07L13.5 18.5"/>
</svg>`.trim());

// ─── State ────────────────────────────────────────────────────────────────────

// User settings (clock format, weather, etc.) — populated by loadData()
let settings = {};

// Apply the saved named theme to <html> (overrides the design tokens in
// common.css). 'auto'/empty follows the OS light/dark default.
function applyTheme(theme) {
  const t = theme && theme !== 'auto' ? theme : null;
  if (t) document.documentElement.setAttribute('data-theme', t);
  else document.documentElement.removeAttribute('data-theme');
}

// Apply the theme as early as possible (before first paint) to avoid a flash
// of the default palette, then loadData() re-applies once settings are read.
chrome.storage.local.get('settings', ({ settings: s }) => {
  if (window.ThemeEngine) ThemeEngine.injectCustomThemeStyles(s && s.customThemes);
  applyTheme(s && s.theme);
});

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
const dashTabs         = document.getElementById('dash-tabs');
const dashSidebar      = document.getElementById('dash-sidebar');
const searchInput      = document.getElementById('search-input');
const clockEl          = document.getElementById('clock');
const dateEl           = document.getElementById('date-display');
const rearrangeBtn     = document.getElementById('rearrange-btn');
const rearrangeSaveBtn = document.getElementById('rt-save');     // Save lives in the floating tools menu
const rearrangeCancel  = document.getElementById('rt-cancel');   // Cancel lives in the floating tools menu
const editModal        = document.getElementById('edit-modal');
const dashEditModal    = document.getElementById('dash-edit-modal');
const dashEditBtn      = document.getElementById('dash-edit-btn');

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadData();    // loads settings first so clock renders correctly

  // The launcher placeholder only applies to the new-tab OVERRIDE page
  // (newtab.html). dashboard.html is an explicit open and always shows the
  // dashboard. On the override page, a bare new tab (no ?dash=) shows the
  // launcher unless "Show dashboard on new tab" is enabled.
  const isOverridePage = /\/newtab\.html$/.test(window.location.pathname);
  const hasDashParam = !!new URLSearchParams(window.location.search).get('dash');
  if (isOverridePage && !hasDashParam && settings.newTabOverride !== true) {
    showNewTabDisabled(); return;
  }

  startClock();

  if (state.dashboards.length === 0) { showEmptyState(); return; }

  populateSwitcher();   // builds the tab/search bar (incl. search visibility)
  renderDashboard(state.activeDashboardId);
  setupSearch();
  setupRearrangeControls();
  setupEditModal();
  setupDashEditModal();
  // Weather is now provided by the three add-to-board weather widgets (no top
  // panel), so there's no global weather fetch here anymore.
}

async function loadData() {
  const stored = await chromeGet(['dashboards', 'defaultDashboardId', 'settings']);
  state.dashboards         = stored.dashboards         || [];
  state.defaultDashboardId = stored.defaultDashboardId || null;
  settings                 = stored.settings            || {};

  // Ensure multi-endpoint instances exist (in-memory) so widget placements can
  // resolve their endpoint even if this profile predates the migration.
  if (window.Endpoints) Endpoints.migrate(settings);

  if (window.ThemeEngine) ThemeEngine.injectCustomThemeStyles(settings.customThemes);
  applyTheme(settings.theme);

  // Allow ?dash=dash_xxx to preview a specific dashboard (honored even if hidden).
  const paramDashId = new URLSearchParams(window.location.search).get('dash');
  const paramDash   = paramDashId && state.dashboards.find((d) => d.id === paramDashId);
  if (paramDash) {
    state.activeDashboardId = paramDashId;
  } else {
    // Otherwise pick the default (if visible) or the first visible dashboard…
    const visible = state.dashboards.filter((d) => d.active !== false);
    const def = visible.find((d) => d.id === state.defaultDashboardId);
    let chosen = (def && def.id) || visible[0]?.id || state.dashboards[0]?.id || null;
    // …but keep the dashboard the user last selected across a page refresh.
    try {
      const last = sessionStorage.getItem('adai_active');
      if (last && visible.some((d) => d.id === last)) chosen = last;
    } catch (_) { /* sessionStorage unavailable */ }
    state.activeDashboardId = chosen;
  }
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

// Dashboards visible in the switcher (active flag defaults to true).
function visibleDashboards() {
  return state.dashboards.filter((d) => d.active !== false);
}

// Switch to a dashboard. Blocked while rearranging (can't change in edit mode).
function switchDashboard(id) {
  if (state.rearrangeMode) return;
  if (id === state.activeDashboardId) return;
  state.activeDashboardId = id;
  try { sessionStorage.setItem('adai_active', id); } catch (_) { /* ignore */ }
  renderDashboard(id);
  renderSwitcher();
}

// Render whichever switcher style the user picked (dropdown | tabs | sidebar),
// showing only active dashboards.
function renderSwitcher() {
  const style = (settings.dashboardSwitcher) || 'dropdown';
  const list = visibleDashboards();
  const searchOn = settings.searchEnabled !== false;
  const showTabs = style === 'tabs' && list.length > 1;
  const showDropdown = style === 'dropdown' && list.length > 1;

  // Hide all switcher UIs first.
  if (switcherWrapper) switcherWrapper.style.display = 'none';
  if (dashSidebar) dashSidebar.style.display = 'none';

  // The top tab/search bar shows when search is on OR there are tabs to show.
  // Search sits centered in it; tabs are left-justified and grow right.
  const listEl = document.getElementById('dash-tabs-list');
  if (listEl) {
    listEl.innerHTML = '';
    if (showTabs) {
      list.forEach((d) => {
        const t = document.createElement('button');
        t.className = 'dash-tab' + (d.id === state.activeDashboardId ? ' active' : '');
        t.textContent = d.name;
        t.addEventListener('click', () => switchDashboard(d.id));
        listEl.appendChild(t);
      });
    }
  }
  const sw = document.getElementById('search-wrapper');
  if (sw) sw.style.display = searchOn ? '' : 'none';
  if (dashTabs) dashTabs.style.display = (searchOn || showTabs || showDropdown) ? 'flex' : 'none';

  if (list.length <= 1) return;   // dropdown/sidebar only matter with >1

  if (style === 'sidebar' && dashSidebar) {
    dashSidebar.style.display = 'flex';
    dashSidebar.innerHTML = '';
    list.forEach((d) => {
      const it = document.createElement('div');
      it.className = 'dash-side-item' + (d.id === state.activeDashboardId ? ' active' : '');
      it.textContent = d.name;
      it.title = d.name;
      it.addEventListener('click', () => switchDashboard(d.id));
      dashSidebar.appendChild(it);
    });
  } else if (style === 'dropdown' && switcherWrapper) {   // dropdown only
    switcherWrapper.style.display = 'flex';
    dashboardSelect.innerHTML = '';
    list.forEach((d) => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.id === state.defaultDashboardId ? `${d.name} ★` : d.name;
      if (d.id === state.activeDashboardId) opt.selected = true;
      dashboardSelect.appendChild(opt);
    });
    if (!dashboardSelect.dataset.bound) {
      dashboardSelect.dataset.bound = '1';
      dashboardSelect.addEventListener('change', () => switchDashboard(dashboardSelect.value));
    }
  }
}

// Kept for the init call site.
function populateSwitcher() { renderSwitcher(); }

// ─── Render ───────────────────────────────────────────────────────────────────

function renderDashboard(dashId) {
  const dash = state.dashboards.find((d) => d.id === dashId);
  if (!dash) { showEmptyState(); return; }

  // Update dashboard name in topbar
  const nameEl = document.getElementById('dash-name-display');
  if (nameEl) nameEl.textContent = dash.name;

  // Label visibility/placement is now per-section (data-textpos); the old
  // dashboard-wide .text-hidden flag is no longer applied. Existing dashboards
  // migrate via storedTextPos(), which inherits the legacy dash.showText value.

  dashboardArea.innerHTML = '';
  const cmp = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  // Group bookmarks by folder/section, preserving the saved bookmark order.
  const groups = {};
  const seen = [];
  dash.bookmarks.forEach((bm) => {
    const key = bm.folder || 'General';
    if (!groups[key]) { groups[key] = []; seen.push(key); }
    groups[key].push(bm);
  });

  // Section order: honor the dashboard's saved sectionOrder (set by the creation
  // wizard) when present; otherwise fall back to alphabetical. Sections not in
  // the saved list are appended in first-seen order. Bookmark order within each
  // section is preserved as stored (no alphabetical re-sort).
  let folderNames;
  if (Array.isArray(dash.sectionOrder) && dash.sectionOrder.length) {
    const present = new Set(seen);
    folderNames = dash.sectionOrder.filter((s) => present.has(s));
    seen.forEach((s) => { if (!folderNames.includes(s)) folderNames.push(s); });
  } else {
    folderNames = seen.slice().sort((a, b) => cmp.compare(a, b));
  }

  // Grid layout when Gridstack is bundled; otherwise the classic stacked
  // sections (graceful fallback so the dashboard always renders).
  if (window.GridStack) {
    dashboardArea.classList.add('grid-mode');
    renderDashboardGrid(dash, folderNames, groups);
  } else {
    dashboardArea.classList.remove('grid-mode');
    folderNames.forEach((folderName) => {
      dashboardArea.appendChild(buildFolderSection(folderName, groups[folderName]));
    });
  }
}

// ─── Grid layout (Gridstack) ───────────────────────────────────────────────────
// Step 1: each section becomes a grid item on a 12-column canvas. The grid is
// locked here (staticGrid); drag, resize and collision land in later steps.

let gridInstance = null;
let mountedWidgets = [];   // live integration widget instances on the board
let widgetObserver = null; // resizes widget groupings to fit their content
let iconGrids = [];        // nested GridStacks (one per section) holding the bookmark icons
let gridInteracting = false; // true while the user is dragging/resizing an item
const GRID_COLS = 24;   // denser grid → finer snapping + sections can go small
const GRID_CELL = 8;    // px per grid row — fine vertical snapping for consistent
                        // section heights (old 32px snapping left an inconsistent
                        // bottom gap; legacy layouts auto-migrate via dash.gridCell)
const GRID_MIN_W = 2;   // minimum section width (cols)
const GRID_MIN_H = 12;  // minimum section height (rows) ≈ 96px

// Gridstack ships horizontal (left/width %) CSS only for a 12-column grid.
// For any other column count we generate the matching rules once.
function injectGridColumnCss(cols) {
  const id = 'gs-col-css';
  let el = document.getElementById(id);
  if (el && el.dataset.cols === String(cols)) return;
  if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
  el.dataset.cols = String(cols);
  let css = `.gs-${cols} > .grid-stack-item { width: ${100 / cols}%; }`;
  for (let i = 1; i <= cols; i++) css += `.gs-${cols} > .grid-stack-item[gs-w="${i}"]{width:${i * 100 / cols}%}`;
  for (let i = 1; i < cols; i++) css += `.gs-${cols} > .grid-stack-item[gs-x="${i}"]{left:${i * 100 / cols}%}`;
  el.textContent = css;
}

// Per-section icon size. Each size fixes the icon footprint; the grid simply
// fits more/fewer columns as the section is resized (icons no longer scale).
//   cellPx = min column width for one icon, rowPx = height of one icon row.
const ICON_SIZES = {
  small:  { cellPx: 56,  rowPx: 56,  colMin: 48,  gap: 8 },
  medium: { cellPx: 100, rowPx: 96,  colMin: 92,  gap: 12 },
  large:  { cellPx: 140, rowPx: 124, colMin: 124, gap: 14 },
};
const HEADER_PX = 46;
const DEFAULT_ICON_SIZE = 'medium';

function storedIconSize(name) {
  const dash = getActiveDash();
  return (dash && dash.layout && dash.layout[name] && dash.layout[name].iconSize) || DEFAULT_ICON_SIZE;
}

// Per-section label placement: 'above' | 'below' | 'none'. Stored in the
// section's layout entry. Sections without an explicit value inherit the
// dashboard's old global "show text" behaviour (migration default).
const TEXT_POSITIONS = ['above', 'below', 'none'];
// One control cycles through these in order: below → above → none → below.
const TEXTPOS_GLYPH = { below: '↓', above: '↑', none: '⊘' };
const TEXTPOS_NEXT = { below: 'above', above: 'none', none: 'below' };
function textPosTitle(pos, small) {
  if (small) return 'Small icons are always text-free';
  const where = pos === 'above' ? 'above icons' : pos === 'below' ? 'below icons' : 'hidden';
  return `Label: ${where} — click to cycle (↓ below → ↑ above → ⊘ none)`;
}
function storedTextPos(name) {
  const dash = getActiveDash();
  const lay = dash && dash.layout && dash.layout[name];
  if (lay && TEXT_POSITIONS.includes(lay.textPos)) return lay.textPos;
  return (dash && dash.showText === false) ? 'none' : 'below';
}
// Advance a section's label placement to the next state in the cycle.
function cycleSectionTextPos(name) {
  if (storedIconSize(name) === 'small') return;   // Small is icon-only
  setSectionTextPos(name, TEXTPOS_NEXT[storedTextPos(name)] || 'below');
}

// Reflect a section's icon size on its DOM + the selector's active button.
function applyIconSize(el, size) {
  const sec = el.querySelector('.folder-section');
  if (sec) sec.dataset.iconsize = size;
  el.querySelectorAll('.icon-size-btn').forEach((b) => b.classList.toggle('active', b.dataset.size === size));
}

function applyAllIconSizes() {
  document.querySelectorAll('.grid-stack > .grid-stack-item[data-folder]').forEach((el) => {
    applyIconSize(el, storedIconSize(el.dataset.folder));
  });
}

// Deterministic text width via canvas (avoids layout-timing flakiness of
// scrollWidth). Mirrors the title-bubble font (uppercase, 700, 11.5px) plus its
// letter-spacing, bubble padding and the section's content padding.
function measureTextPx(text, font) {
  const c = (measureTextPx._c || (measureTextPx._c = document.createElement('canvas')));
  const ctx = c.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}
function nameMinPx(name) {
  const txt = (name || '').toUpperCase();
  const base = measureTextPx(txt, '700 11.5px system-ui, -apple-system, sans-serif');
  const letterSpacing = 0.07 * 11.5 * Math.max(0, txt.length - 1);
  return base + letterSpacing + 24 /* bubble pad */ + 10 /* buffer */;
}

const CONTENT_PAD_X = 26;  // grid-stack-item-content left+right padding (+ hair)

// Minimum width (cols) so a section always fits the wider of: one icon, the
// full title bubble, or the S/M/L selector row — for a given cell width. The
// content's horizontal padding is added so a single icon column never overflows.
function sectionMinW(name, iconSize, cellW) {
  const spec = ICON_SIZES[iconSize] || ICON_SIZES.medium;
  const innerPx = Math.max(spec.cellPx, nameMinPx(name), 116); // 116 ≈ S/M/L + cycle-button selector row
  // Clamp to the column count — a min-w larger than max-w would wedge Gridstack
  // (sections become un-draggable / un-resizable).
  return Math.min(GRID_COLS, Math.max(GRID_MIN_W, Math.ceil((innerPx + CONTENT_PAD_X) / (cellW || 1))));
}

// Consistent breathing room between the last icon row and the section's bottom
// edge — the same at every icon size and row count.
const SECTION_BOTTOM_GAP = 16;

// Size a section so its icon grid is fully visible AND leaves a consistent gap
// below the last row. We measure the REAL gap (frame bottom − last card bottom)
// rather than relying on per-row estimates, which undershoot for medium cards
// and leave the bottom too tight. Grow-only, so a hand-dragged taller section is
// preserved and reloads stay stable (a section already at/above the target gap
// is left untouched).
function fitSectionToContent(el) {
  if (!gridInstance || !el) return;
  const node = el.gridstackNode;
  const content = el.querySelector('.grid-stack-item-content');
  const grid = el.querySelector('.bookmark-grid');
  const gridStackEl = el.closest('.grid-stack');
  if (!node || !content || !grid || !gridStackEl) return;
  const cellW = (gridStackEl.clientWidth / GRID_COLS) || 1;
  let w = node.w, h = node.h, changed = false;

  const cards = grid.querySelectorAll('.bookmark-card');
  if (cards.length) {
    // Measure the REAL gap below the last row and nudge the height so it lands on
    // the target — grow OR shrink. With the fine grid this snaps the bottom gap
    // to within a few px at every icon size and row count, and stays stable on
    // reload (a section already at the target is left untouched).
    const frameBottom = content.getBoundingClientRect().bottom;
    let lastBottom = 0;
    cards.forEach((c) => { lastBottom = Math.max(lastBottom, c.getBoundingClientRect().bottom); });
    const gapNow = frameBottom - lastBottom;
    const deltaCells = Math.round((SECTION_BOTTOM_GAP - gapNow) / GRID_CELL);
    if (deltaCells !== 0) { h = Math.max(GRID_MIN_H, node.h + deltaCells); changed = true; }
  } else {
    // No measurable cards yet — fall back to the overflow check.
    const overflowY = Math.max(grid.scrollHeight - grid.clientHeight, content.scrollHeight - content.clientHeight);
    if (overflowY > 12) { h += Math.ceil(overflowY / GRID_CELL); changed = true; }
  }

  const overflowX = content.scrollWidth - content.clientWidth;
  if (overflowX > 0.5) { w = Math.min(GRID_COLS, w + Math.ceil(overflowX / cellW)); changed = true; }
  if (changed) gridInstance.update(el, { w, h });
}

function fitAllSectionsToContent() {
  document.querySelectorAll('.grid-stack > .grid-stack-item[data-folder]').forEach(fitSectionToContent);
}

// Grow/shrink a widget grouping so the whole widget is visible (widgets render
// async, so this runs after mount + whenever the widget's content resizes).
function fitWidgetToContent(el) {
  if (!gridInstance || !el) return;
  if (gridInteracting) return;        // don't fight an in-progress drag/resize
  if (el.dataset.manualSize) return;  // respect a size the user set by hand
  if (el.dataset.lcNoFit === '1') return;  // carousel OFF — keep the size; the list scrolls
  const node = el.gridstackNode;
  const body = el.querySelector('.widget-body');
  if (!node || !body) return;
  // Measure the widget's NATURAL height. The body is flex:1 + overflow:auto, so a
  // self-filling widget would otherwise be measured at the (possibly too-short)
  // cell height and keep its scrollbar. Briefly drop the constraint so it reports
  // its true content height, then restore (no paint happens in between).
  const sFlex = body.style.flex, sOverflow = body.style.overflow, sHeight = body.style.height;
  body.style.flex = '0 0 auto'; body.style.overflow = 'visible'; body.style.height = 'auto';
  let contentH = body.scrollHeight;
  for (const child of body.children) contentH = Math.max(contentH, child.scrollHeight, child.offsetHeight);
  body.style.flex = sFlex; body.style.overflow = sOverflow; body.style.height = sHeight;
  if (!contentH) return;
  const HEADER = 16, PAD = 18;   // grip room + a little breathing space below
  const needH = Math.max(GRID_MIN_H, Math.ceil((HEADER + contentH + PAD) / GRID_CELL));
  if (needH === node.h) return;
  const wasStatic = !state.rearrangeMode;
  if (wasStatic) gridInstance.setStatic(false);
  gridInstance.update(el, { h: needH });
  if (wasStatic) gridInstance.setStatic(true);
  syncGridAttrs();
}

// A list widget (Stocks / Portainer / Tautulli list) fires this after Scroll is
// turned ON or its "Show count" changes. The carousel has already cleared the
// manual-size flag, so we snap the grouping to exactly the requested # of lines.
document.addEventListener('lc-relayout', (e) => {
  const item = e.target && e.target.closest && e.target.closest('.grid-stack-item[data-widget]');
  if (item) requestAnimationFrame(() => fitWidgetToContent(item));
});

// After the grid is built, auto-size every widget grouping to its content and
// keep watching for late/async content changes.
function setupWidgetAutoFit() {
  if (widgetObserver) { widgetObserver.disconnect(); widgetObserver = null; }
  const items = document.querySelectorAll('.grid-stack > .grid-stack-item[data-widget]');
  if (!items.length) return;
  widgetObserver = new ResizeObserver((entries) => {
    entries.forEach((e) => {
      const item = e.target.closest('.grid-stack-item');
      if (item) fitWidgetToContent(item);
    });
  });
  items.forEach((item) => {
    const root = item.querySelector('.widget-body')?.firstElementChild;
    if (root) widgetObserver.observe(root);
    // Catch the async data render with a few delayed passes.
    requestAnimationFrame(() => fitWidgetToContent(item));
    setTimeout(() => fitWidgetToContent(item), 500);
    setTimeout(() => fitWidgetToContent(item), 1400);
  });
}

// Minimum cells so a section can show ALL its icons at the chosen size, given
// its current width. Shrinking the width pushes the required height up, so a
// section can never be made too small to hold every icon — or to hide its name.
function sectionMinCells(el) {
  const node = el.gridstackNode;
  const gridStackEl = el.closest('.grid-stack');
  if (!node || !gridStackEl) return null;
  const cellW = gridStackEl.clientWidth / GRID_COLS || 1;
  const size = storedIconSize(el.dataset.folder);
  const spec = ICON_SIZES[size] || ICON_SIZES.medium;
  const minW = sectionMinW(el.dataset.folder, size, cellW);

  // Measure the ACTUAL icon content height at the current width (the bottom of
  // the last card), rather than estimating rows. This lets a section shrink to
  // exactly below its icons, regardless of icon size / column count. The grid is
  // flex:1 so its own height stretches — we measure the cards, not the box.
  const bmGrid = el.querySelector('.bookmark-grid');
  const cards = bmGrid ? bmGrid.querySelectorAll('.bookmark-card') : [];
  let contentH = spec.rowPx;  // fallback when nothing's laid out yet
  if (cards.length && bmGrid) {
    const gridTop = bmGrid.getBoundingClientRect().top;
    const last = cards[cards.length - 1];
    contentH = Math.max(0, last.getBoundingClientRect().bottom - gridTop) + 6; // + small bottom pad
  }
  const minH = Math.max(GRID_MIN_H, Math.ceil((HEADER_PX + contentH) / GRID_CELL));
  return { minW, minH };
}

// ─── Rearrange-mode auto-layout tools ─────────────────────────────────────────

let layoutUndo = null;   // snapshot of live geometry before the last auto action

function captureLiveLayout() {
  const map = {};
  if (gridInstance && gridInstance.engine) {
    gridInstance.engine.nodes.forEach((n) => {
      const name = n.el && n.el.dataset.folder;
      if (name) map[name] = { x: n.x, y: n.y, w: n.w, h: n.h };
    });
  }
  return map;
}

function pushLayoutUndo() {
  layoutUndo = captureLiveLayout();
  const btn = document.getElementById('rt-undo');
  if (btn) btn.disabled = false;
}

function undoAutoLayout() {
  if (!layoutUndo || !gridInstance) return;
  gridInstance.batchUpdate();
  Object.entries(layoutUndo).forEach(([name, p]) => {
    const el = document.querySelector(`.grid-stack > .grid-stack-item[data-folder="${CSS.escape(name)}"]`);
    if (el) gridInstance.update(el, { x: p.x, y: p.y, w: p.w, h: p.h });
  });
  gridInstance.commit();
  syncGridAttrs();
  layoutUndo = null;
  const btn = document.getElementById('rt-undo');
  if (btn) btn.disabled = true;
  markRearrangeChanged();
}

// Option 1: shrink each group tightly around its icons (remove internal
// whitespace) without reflowing items — keeps the same icons-per-row.
function tightenSection(el) {
  if (!gridInstance) return;
  const node = el.gridstackNode;
  const grid = el.querySelector('.bookmark-grid');
  const gridStackEl = el.closest('.grid-stack');
  const cards = grid ? [...grid.querySelectorAll('.bookmark-card')] : [];
  if (!node || !grid || !gridStackEl || !cards.length) return;
  const cellW = gridStackEl.clientWidth / GRID_COLS || 1;
  const size = storedIconSize(el.dataset.folder);
  const spec = ICON_SIZES[size] || ICON_SIZES.medium;

  // Icons currently per row = cards sharing the first card's top edge.
  const firstTop = cards[0].getBoundingClientRect().top;
  const perRow = Math.max(1, cards.filter((c) => Math.abs(c.getBoundingClientRect().top - firstTop) < 4).length);
  const rows = Math.ceil(cards.length / perRow);

  // Tight pixel size for that exact grid of icons.
  const contentW = perRow * spec.colMin + (perRow - 1) * spec.gap;
  const contentH = rows * spec.rowPx;
  const needW = Math.max(sectionMinW(el.dataset.folder, size, cellW),
                         Math.ceil((contentW + 26 + 12) / cellW)); // content pad + grid pad
  const needH = Math.max(GRID_MIN_H, Math.ceil((HEADER_PX + contentH + 8) / GRID_CELL));

  gridInstance.update(el, { w: Math.min(GRID_COLS, needW), h: needH });
}

function autoResizeGroupings() {
  if (!gridInstance) return;
  pushLayoutUndo();
  gridInstance.batchUpdate();
  document.querySelectorAll('.grid-stack > .grid-stack-item').forEach(tightenSection);
  gridInstance.commit();
  syncGridAttrs();
  // The tighten estimate can land short of the consistent bottom gap, so enforce
  // it once the new sizes are laid out.
  requestAnimationFrame(() => {
    document.querySelectorAll('.grid-stack > .grid-stack-item[data-folder]').forEach(fitSectionToContent);
    syncGridAttrs();
  });
  markRearrangeChanged();
  showToast('Groups auto-resized ✓');
}

// Option 2: pack the groups together, removing big gaps (no overlaps, order kept).
function snapGroupingsTogether() {
  if (!gridInstance) return;
  pushLayoutUndo();
  try { gridInstance.compact('compact', true); } catch (_) { try { gridInstance.compact(); } catch (_) {} }
  syncGridAttrs();
  markRearrangeChanged();
  showToast('Groups snapped together ✓');
}

// Push the live min-width/height onto a node so Gridstack resists shrinking a
// section below the space its icons need *during* a drag. minH depends on the
// current width (narrower → more rows → taller), so this is recomputed each
// resize frame. This guarantees icons are never clipped/hidden — they just flow
// onto more rows as the section narrows.
function setSectionLiveMin(el) {
  const node = el && el.gridstackNode;
  const m = sectionMinCells(el);
  if (!node || !m) return;
  node.minW = m.minW; node.minH = m.minH;
  el.setAttribute('gs-min-w', m.minW);
  el.setAttribute('gs-min-h', m.minH);
}

// Grow a section if it's smaller than the space its icons need (final safety
// net on release / size change / initial render).
function enforceSectionMin(el, grow = true) {
  if (!gridInstance || !el) return;
  const node = el.gridstackNode;
  const m = sectionMinCells(el);
  if (!node || !m) return;
  el.setAttribute('gs-min-w', m.minW);
  el.setAttribute('gs-min-h', m.minH);
  node.minW = m.minW; node.minH = m.minH;
  if (!grow) return;     // load path: set the floor, but never inflate a saved size
  let w = node.w, h = node.h, changed = false;
  if (w < m.minW) { w = m.minW; changed = true; }
  if (h < m.minH) { h = m.minH; changed = true; }
  if (changed) gridInstance.update(el, { w, h });
}

// On initial render the saved layout is authoritative — only set the min
// attributes (for later edit-mode resistance); don't grow sections, or a slightly
// taller re-measured minimum would inflate every group on each refresh.
function enforceAllSectionMins() {
  document.querySelectorAll('.grid-stack > .grid-stack-item[data-folder]').forEach((el) => enforceSectionMin(el, false));
}

// Edit-mode handler: change a section's icon size, re-fit, and flag unsaved.
function setSectionIconSize(name, size) {
  const dash = getActiveDash();
  if (!dash) return;
  if (!dash.layout[name]) dash.layout[name] = {};
  dash.layout[name].iconSize = size;
  const el = document.querySelector(`.grid-stack > .grid-stack-item[data-folder="${CSS.escape(name)}"]`);
  if (el) {
    applyIconSize(el, size);
    updateTextPosButtons(el, name);   // Small forces "No Text"; M/L restores the choice
    // New icon size → recompute the nested icon grid's columns/cell + section fit.
    requestAnimationFrame(() => requestAnimationFrame(() => { relayoutIconGrid(name); syncGridAttrs(); }));
  }
  markRearrangeChanged();
}

// Whether a section shows host-reachability indicators (default off — no checks
// run, no dots shown, until the user enables it).
function storedHostStatus(name) {
  const dash = getActiveDash();
  return !!(dash && dash.layout && dash.layout[name] && dash.layout[name].hostStatus);
}

// Edit-mode handler: toggle a section's host-reachability monitoring. Persists
// with the section layout and updates that section's cards live (no re-render).
function setSectionHostStatus(name, on) {
  const dash = getActiveDash();
  if (!dash) return;
  dash.layout = dash.layout || {};
  if (!dash.layout[name]) dash.layout[name] = {};
  dash.layout[name].hostStatus = !!on;
  chromeSet({ dashboards: state.dashboards });   // persist immediately
  const el = document.querySelector(`.grid-stack > .grid-stack-item[data-folder="${CSS.escape(name)}"]`);
  if (el) {
    el.querySelectorAll('.bookmark-card').forEach((card) => {
      if (on) attachHostDot(card, card.getAttribute('href'));
      else detachHostDot(card);
    });
    updateHostStatusToggle(el, name);
  }
  markRearrangeChanged();
}

// Reflect the section toolbar's host-status toggle (green = on, red = off).
function updateHostStatusToggle(el, name) {
  const btn = el.querySelector('.host-status-toggle');
  if (!btn) return;
  const on = storedHostStatus(name);
  btn.classList.toggle('on', on);
  btn.title = on ? 'Host Status Indicators On' : 'Host Status Indicators Off';
}

// Edit-mode handler: set a section's label placement (above / below / none).
// Stored as a preference; Small size always renders icon-only regardless.
function setSectionTextPos(name, pos) {
  const dash = getActiveDash();
  if (!dash || !TEXT_POSITIONS.includes(pos)) return;
  if (storedIconSize(name) === 'small') return;   // Small is icon-only; ignore
  if (!dash.layout[name]) dash.layout[name] = {};
  dash.layout[name].textPos = pos;
  const el = document.querySelector(`.grid-stack > .grid-stack-item[data-folder="${CSS.escape(name)}"]`);
  if (el) {
    const sec = el.querySelector('.folder-section');
    if (sec) sec.dataset.textpos = pos;
    updateTextPosButtons(el, name);
    requestAnimationFrame(() => { fitSectionToContent(el); syncGridAttrs(); });
  }
  markRearrangeChanged();
}

// Reflect the cycle button's glyph + state. Small icons are always text-free, so
// the control shows "no text" and is disabled.
function updateTextPosButtons(el, name) {
  const btn = el.querySelector('.text-pos-cycle');
  if (!btn) return;
  const small = storedIconSize(name) === 'small';
  const pos = small ? 'none' : storedTextPos(name);
  btn.dataset.pos = pos;
  btn.textContent = TEXTPOS_GLYPH[pos];
  btn.disabled = small;
  btn.title = textPosTitle(pos, small);
}

// Small S/M/L size selector + Above/Below/None text-placement controls, shown on
// each section while editing.
function buildIconSizeSelector(name, current) {
  const wrap = document.createElement('div');
  wrap.className = 'icon-size-sel';
  [['small', 'S'], ['medium', 'M'], ['large', 'L']].forEach(([sz, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'icon-size-btn' + (sz === current ? ' active' : '');
    b.dataset.size = sz;
    b.textContent = label;
    b.title = sz.charAt(0).toUpperCase() + sz.slice(1) + ' icons';
    b.addEventListener('pointerdown', (e) => e.stopPropagation()); // don't start a section drag
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); setSectionIconSize(name, sz); });
    wrap.appendChild(b);
  });

  const sep = document.createElement('span');
  sep.className = 'size-sep';
  wrap.appendChild(sep);

  // Single control that rotates through label placements on each click.
  const small = current === 'small';
  const pos = small ? 'none' : storedTextPos(name);
  const tp = document.createElement('button');
  tp.type = 'button';
  tp.className = 'text-pos-cycle';
  tp.dataset.pos = pos;
  tp.textContent = TEXTPOS_GLYPH[pos];
  tp.disabled = small;
  tp.title = textPosTitle(pos, small);
  tp.addEventListener('pointerdown', (e) => e.stopPropagation());
  tp.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cycleSectionTextPos(name); });
  wrap.appendChild(tp);

  const sep2 = document.createElement('span');
  sep2.className = 'size-sep';
  wrap.appendChild(sep2);

  // Host-reachability toggle — a single circular button (green = on, red = off).
  const hsOn = storedHostStatus(name);
  const hs = document.createElement('button');
  hs.type = 'button';
  hs.className = 'host-status-toggle' + (hsOn ? ' on' : '');
  hs.title = hsOn ? 'Host Status Indicators On' : 'Host Status Indicators Off';
  hs.addEventListener('pointerdown', (e) => e.stopPropagation());
  hs.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    setSectionHostStatus(name, !storedHostStatus(name));
  });
  wrap.appendChild(hs);
  return wrap;
}

// Force the gs-x/y/w/h DOM attributes to match the engine's node geometry.
// Our 24-column grid positions items via attribute-keyed CSS, so if an attribute
// lags behind the engine (can happen on resize/drag stop) the section visually
// snaps back to its old size. Re-syncing here keeps DOM and engine in lockstep.
function syncGridAttrs() {
  if (!gridInstance || !gridInstance.engine) return;
  gridInstance.engine.nodes.forEach((n) => {
    if (!n.el) return;
    n.el.setAttribute('gs-x', n.x);
    n.el.setAttribute('gs-y', n.y);
    n.el.setAttribute('gs-w', n.w);
    n.el.setAttribute('gs-h', n.h);
  });
}

// Rough pixel→row estimate for a section's default height, from its item count
// and column width. Refined once resizing exists; users can resize after.
function estimateSectionRows(count, w) {
  const iconsPerRow = Math.max(1, Math.floor(w / 2)); // ~2 grid cols per icon at default scale
  const rows = Math.ceil(count / iconsPerRow);
  const px = 52 + rows * 92;                            // header + icon rows
  return Math.max(GRID_MIN_H, Math.ceil(px / GRID_CELL));
}

// Ensure dash.layout has {x,y,w,h} for every current section, auto-placing any
// new ones into a tidy left-to-right flow. Returns the layout map.
function ensureDashLayout(dash, folderNames, groups) {
  const DEF_W = 8;   // ~1/3 width on the 24-col grid

  // Migrate a layout saved at a different grid density (e.g. the old 12-column
  // grid) so sections keep their proportions instead of rendering half-width.
  if (dash.layout && typeof dash.layout === 'object') {
    const oldCols = dash.gridCols || 12;
    const oldCell = dash.gridCell || 60;
    if (oldCols !== GRID_COLS || oldCell !== GRID_CELL) {
      const fx = GRID_COLS / oldCols;
      const fh = oldCell / GRID_CELL;
      Object.values(dash.layout).forEach((p) => {
        if (!p) return;
        p.x = Math.round((p.x || 0) * fx);
        p.w = Math.max(GRID_MIN_W, Math.round((p.w || DEF_W) * fx));
        p.y = Math.round((p.y || 0) * fh);
        p.h = Math.max(GRID_MIN_H, Math.round((p.h || GRID_MIN_H) * fh));
      });
    }
  }
  dash.gridCols = GRID_COLS;
  dash.gridCell = GRID_CELL;

  const layout = (dash.layout && typeof dash.layout === 'object') ? dash.layout : {};
  let cx = 0, cy = 0, rowH = 0;
  folderNames.forEach((name) => {
    if (!layout[name] || !Number.isFinite(layout[name].w)) {
      const prev = layout[name] || {};   // may carry iconSize set by the wizard
      const w = DEF_W;
      const h = estimateSectionRows(groups[name].length, w);
      if (cx + w > GRID_COLS) { cx = 0; cy += rowH; rowH = 0; }
      layout[name] = { x: cx, y: cy, w, h, iconSize: prev.iconSize || DEFAULT_ICON_SIZE };
      cx += w; rowH = Math.max(rowH, h);
    }
  });

  // Widget groupings get layout entries keyed "@w:<uid>" (auto-placed if new).
  const widgetKeys = new Set();
  (dash.widgets || []).forEach((wdef) => {
    const key = '@w:' + wdef.uid;
    widgetKeys.add(key);
    if (!layout[key] || !Number.isFinite(layout[key].w)) {
      const w = 8, h = 32;   // default widget size (~256px; auto-fit adjusts height after render)
      if (cx + w > GRID_COLS) { cx = 0; cy += rowH; rowH = 0; }
      layout[key] = { x: cx, y: cy, w, h };
      cx += w; rowH = Math.max(rowH, h);
    }
  });

  // Drop layout entries for sections/widgets that no longer exist.
  Object.keys(layout).forEach((k) => {
    if (k.startsWith('@w:')) { if (!widgetKeys.has(k)) delete layout[k]; }
    else if (!folderNames.includes(k)) delete layout[k];
  });
  dash.layout = layout;
  return layout;
}

function renderDashboardGrid(dash, folderNames, groups) {
  injectGridColumnCss(GRID_COLS);
  const layout = ensureDashLayout(dash, folderNames, groups);

  // Tear down any previous grid instance + live widgets before rebuilding
  // (stops their polling/timers).
  destroyIconGrids();
  if (window.HostStatus) window.HostStatus.reset();   // drop stale card watchers (keep cache)
  if (gridInstance) { try { gridInstance.destroy(false); } catch (_) {} gridInstance = null; }
  mountedWidgets.forEach((w) => { try { (w.destroy || w.stop || function () {}).call(w); } catch (_) {} });
  mountedWidgets = [];
  if (widgetObserver) { widgetObserver.disconnect(); widgetObserver = null; }

  const gridEl = document.createElement('div');
  gridEl.className = 'grid-stack';
  dashboardArea.appendChild(gridEl);

  // Approx cell width now (grid is full-width minus the dashboard padding) so we
  // can stamp a name-aware gs-min-w before init — Gridstack then clamps any
  // saved-too-small width on load and resists shrinking past the name on resize.
  const areaW = dashboardArea.clientWidth || 1200;   // fallback if not laid out yet
  const cellW0 = Math.max(1, (areaW - 32) / GRID_COLS);

  folderNames.forEach((name) => {
    const pos = layout[name] || {};
    const iconSize = pos.iconSize || DEFAULT_ICON_SIZE;
    const minW = sectionMinW(name, iconSize, cellW0);
    const w = Math.min(GRID_COLS, Math.max(Number.isFinite(pos.w) ? pos.w : minW, minW));
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.dataset.folder = name;
    if (Number.isFinite(pos.x)) item.setAttribute('gs-x', pos.x);
    if (Number.isFinite(pos.y)) item.setAttribute('gs-y', pos.y);
    item.setAttribute('gs-w', w);
    if (Number.isFinite(pos.h)) item.setAttribute('gs-h', pos.h);
    item.setAttribute('gs-min-w', minW);
    item.setAttribute('gs-min-h', GRID_MIN_H);
    item.setAttribute('gs-max-w', GRID_COLS);
    applyLockedAttrs(item, pos);

    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    content.appendChild(buildIconSizeSelector(name, iconSize)); // S/M/L pill straddling the box top
    const section = buildFolderSection(name, groups[name]);
    section.dataset.iconsize = iconSize;
    section.dataset.textpos = storedTextPos(name);
    content.appendChild(section);
    content.appendChild(buildGridLock(name));      // lock/unlock in the top-right corner
    item.appendChild(content);
    gridEl.appendChild(item);
  });

  // Widget groupings (no S/M/L pill; integration widget or a disabled notice).
  (dash.widgets || []).forEach((wdef) => {
    const pos = layout['@w:' + wdef.uid] || {};
    const item = document.createElement('div');
    item.className = 'grid-stack-item';
    item.dataset.widget = wdef.uid;
    // Restore the "hand-sized" flag so auto-fit leaves the saved size alone.
    if (pos.manual) item.dataset.manualSize = '1';
    if (Number.isFinite(pos.x)) item.setAttribute('gs-x', pos.x);
    if (Number.isFinite(pos.y)) item.setAttribute('gs-y', pos.y);
    item.setAttribute('gs-w', Math.min(GRID_COLS, Number.isFinite(pos.w) ? pos.w : 8));
    if (Number.isFinite(pos.h)) item.setAttribute('gs-h', pos.h);
    item.setAttribute('gs-min-w', 3);
    item.setAttribute('gs-min-h', 3);
    item.setAttribute('gs-max-w', GRID_COLS);
    applyLockedAttrs(item, pos);

    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    const wsec = buildWidgetSection(wdef);
    content.appendChild(wsec);
    attachWidgetToolsBubble(content, wsec, wdef);
    content.appendChild(buildGridLock('@w:' + wdef.uid));   // lock/unlock in the top-right corner
    item.appendChild(content);
    gridEl.appendChild(item);
  });

  gridInstance = GridStack.init({
    column: GRID_COLS,
    cellHeight: GRID_CELL,
    margin: 8,
    float: true,
    staticGrid: true,   // locked until Edit Mode unlocks it
    animate: true,
    handle: '.folder-header, .widget-drag',         // sections by header, widgets by grip
    draggable: { handle: '.folder-header, .widget-drag' },
    resizable: { handles: 'e, se, s' }, // right, corner, and bottom (height-only) handles
    alwaysShowResizeHandle: true,     // visible whenever resize is enabled (Edit Mode)
    // Keep the fixed multi-column grid at all window sizes. Without this,
    // Gridstack collapses to one full-width column on narrow windows, which
    // resets every section to full width and snaps the icons back to largest.
    disableOneColumnMode: true,
  }, gridEl);

  // Flag unsaved changes when a section is moved/resized in Edit Mode, and keep
  // DOM attributes synced with the engine so resized sizes hold.
  gridInstance.on('change', () => {
    if (state.rearrangeMode) markRearrangeChanged();
    syncGridAttrs();
  });
  // Keep the live min-size in sync so icons can never be squeezed out: as the
  // section narrows, its required height rises and Gridstack won't let it shrink
  // past the point where every icon fits.
  gridInstance.on('resizestart', (e, el) => { gridInteracting = true; setSectionLiveMin(el); });
  gridInstance.on('resize', (e, el) => setSectionLiveMin(el));
  gridInstance.on('resizestop', (e, el) => {
    gridInteracting = false;
    // A manually-resized widget keeps its size (auto-fit no longer touches it).
    if (el.dataset.widget) { el.dataset.manualSize = '1'; syncGridAttrs(); return; }
    // A resized section re-flows its nested icon grid (more/fewer columns).
    if (el.dataset.folder) { requestAnimationFrame(() => { relayoutIconGrid(el.dataset.folder); syncGridAttrs(); }); return; }
    enforceSectionMin(el);
    requestAnimationFrame(() => { fitSectionToContent(el); syncGridAttrs(); });
  });
  gridInstance.on('dragstart', () => { gridInteracting = true; });
  gridInstance.on('dragstop', () => { gridInteracting = false; });

  applyAllIconSizes();       // reflect each section's stored icon size (icon visuals)
  // Build the nested icon GridStacks once the outer grid has laid out (so each
  // section has a real width). Each grid then sizes its outer section to fit.
  requestAnimationFrame(() => {
    if (!gridInstance) return;
    initIconGrids();
    syncGridAttrs();
    // Freshly-created dashboard: section heights are now fit to their content,
    // so snap everything up to the top (removing the gaps left by the pre-render
    // height estimates), persist the compacted geometry, and clear the flag so
    // this only ever happens once.
    if (dash && dash.autoArrange) {
      requestAnimationFrame(() => autoArrangeFreshDashboard(dash));
    }
  });
  setupWidgetAutoFit();   // size widget groupings to show the whole widget

  // If we re-render while in Edit Mode (rare), keep the grid unlocked.
  if (state.rearrangeMode) {
    gridInstance.setStatic(false);
    gridInstance.enableMove(true);
    gridInstance.enableResize(true);
    reassertGridLocks();   // global enable must not override per-item locks
  }
}

// One-time, on first render of a freshly-created dashboard: compact every
// section/widget up to the top so there are no gaps between rows, then save the
// resulting positions onto dash.layout (so future loads keep the tidy layout)
// and clear the autoArrange flag.
function autoArrangeFreshDashboard(dash) {
  if (!dash || !dash.autoArrange || !gridInstance) return;
  delete dash.autoArrange;
  const wasStatic = !state.rearrangeMode;
  if (wasStatic) gridInstance.setStatic(false);
  try { gridInstance.compact('compact', true); } catch (_) { try { gridInstance.compact(); } catch (_) {} }
  if (wasStatic) gridInstance.setStatic(true);
  syncGridAttrs();
  // Persist the compacted geometry so the gaps don't return on the next load.
  if (gridInstance.engine && Array.isArray(gridInstance.engine.nodes)) {
    const layout = (dash.layout && typeof dash.layout === 'object') ? dash.layout : (dash.layout = {});
    gridInstance.engine.nodes.forEach((n) => {
      const el = n.el; if (!el) return;
      const key = el.dataset.folder ? el.dataset.folder
        : (el.dataset.widget ? '@w:' + el.dataset.widget : null);
      if (!key) return;
      layout[key] = Object.assign({}, layout[key], { x: n.x, y: n.y, w: n.w, h: n.h });
    });
  }
  chromeSet({ dashboards: state.dashboards });
}

// Re-apply per-item move/resize locks after a global enableMove/enableResize.
function reassertGridLocks() {
  document.querySelectorAll('.grid-stack > .grid-stack-item.locked').forEach((el) => applyGridLock(el, true));
}

// ─── Folder section ───────────────────────────────────────────────────────────

// ─── Icon grids — a nested GridStack per section (Homarr-style icon moving) ────
// Each bookmark is a 1×1 node; icons move within and across sections via native
// GridStack drag. Square cell px by icon size; the grid fits as many columns as
// the section's width allows.
// Cell footprint per icon size: width sets how many columns fit; height is taller
// than width to leave room for the label below the icon (a square cell clipped it).
const ICON_CELL = {
  small:  { w: 64,  h: 66 },
  medium: { w: 96,  h: 112 },
  large:  { w: 128, h: 146 },
};
const ICON_GRID_MARGIN = 6;

// The bundled gridstack.min.css ships width/left rules only for 12 columns; make
// sure the rules exist for any column count a nested grid needs.
function ensureGridColCss(cols) {
  const id = 'gs-col-' + cols;
  if (document.getElementById(id)) return;
  const el = document.createElement('style'); el.id = id;
  let css = `.gs-${cols}>.grid-stack-item{width:${100 / cols}%}`;
  for (let i = 1; i <= cols; i++) css += `.gs-${cols}>.grid-stack-item[gs-w="${i}"]{width:${(i * 100) / cols}%}`;
  for (let i = 1; i < cols; i++) css += `.gs-${cols}>.grid-stack-item[gs-x="${i}"]{left:${(i * 100) / cols}%}`;
  el.textContent = css;
  document.head.appendChild(el);
}

function destroyIconGrids() {
  iconGrids.forEach((g) => { try { g.destroy(false); } catch (_) {} });
  iconGrids = [];
}

// Columns + square cell for a section's icon grid, derived from its pixel width.
function iconGridMetrics(gridEl, folder) {
  const w = gridEl.clientWidth || 200;
  const spec = ICON_CELL[storedIconSize(folder)] || ICON_CELL.medium;
  const cols = Math.max(1, Math.floor((w + ICON_GRID_MARGIN) / (spec.w + ICON_GRID_MARGIN)));
  return { cols, cell: spec.h };   // row height = the taller dimension (icon + label)
}

// Build a nested GridStack for every section once the outer grid has laid out.
function initIconGrids() {
  destroyIconGrids();
  document.querySelectorAll('.folder-section .icon-grid').forEach((gridEl) => {
    const folder = gridEl.dataset.folder;
    const { cols, cell } = iconGridMetrics(gridEl, folder);
    ensureGridColCss(cols);
    let g;
    try {
      g = GridStack.init({
        column: cols, cellHeight: cell, margin: ICON_GRID_MARGIN,
        float: false, animate: false, acceptWidgets: '.icon-node',
        disableOneColumnMode: true, staticGrid: !state.rearrangeMode,
      }, gridEl);
    } catch (_) { return; }
    g._folder = folder;
    iconGrids.push(g);
    g.on('change', () => { persistIconPositions(g); fitSectionForIconGrid(gridEl); });
    g.on('added', (e, nodes) => onIconsAdded(g, nodes));
    fitSectionForIconGrid(gridEl);
  });
}

// Save x/y for every icon back onto its bookmark.
function persistIconPositions(g) {
  const dash = getActiveDash();
  if (!dash || !Array.isArray(dash.bookmarks)) return;
  let touched = false;
  (g.engine ? g.engine.nodes : []).forEach((n) => {
    const id = n.el && n.el.dataset.bmId;
    if (!id) return;
    const bm = dash.bookmarks.find((b) => b.id === id);
    if (bm && (bm.gx !== n.x || bm.gy !== n.y || bm.folder !== g._folder)) {
      bm.gx = n.x; bm.gy = n.y; bm.folder = g._folder; touched = true;
    }
  });
  if (touched) { chromeSet({ dashboards: state.dashboards }); markRearrangeChanged(); }
}

// An icon dragged in from another section — re-home its bookmark to this folder.
function onIconsAdded(g, nodes) {
  const dash = getActiveDash();
  if (!dash) return;
  nodes.forEach((n) => {
    const id = n.el && n.el.dataset.bmId;
    const bm = id && dash.bookmarks.find((b) => b.id === id);
    if (bm) { bm.folder = g._folder; bm.gx = n.x; bm.gy = n.y; }
  });
  chromeSet({ dashboards: state.dashboards });
  markRearrangeChanged();
}

// Size the OUTER section item so the nested icon grid (header + its rows) fits.
function fitSectionForIconGrid(gridEl) {
  if (!gridInstance || !gridEl) return;
  const item = gridEl.closest('.grid-stack-item[data-folder]');
  const g = gridEl.gridstack;
  if (!item || !g) return;
  const rows = Math.max(1, g.getRow());
  const cell = g.getCellHeight() || ICON_CELL.medium;
  const headerEl = item.querySelector('.folder-header');
  const headerPx = headerEl ? headerEl.getBoundingClientRect().height : HEADER_PX;
  const needPx = headerPx + rows * cell + ICON_GRID_MARGIN * (rows + 1) + 18;
  const needH = Math.max(GRID_MIN_H, Math.ceil(needPx / GRID_CELL));
  if (item.gridstackNode && item.gridstackNode.h === needH) return;
  const wasStatic = !state.rearrangeMode;
  if (wasStatic) gridInstance.setStatic(false);
  try { gridInstance.update(item, { h: needH }); } catch (_) {}
  if (wasStatic) gridInstance.setStatic(true);
}

// Enable/disable dragging for all icon grids (mirrors edit mode).
function setIconGridsStatic(staticOn) {
  iconGrids.forEach((g) => { try { g.setStatic(staticOn); } catch (_) {} });
}

// Recompute one section's icon-grid columns/cell after a width or icon-size change.
function relayoutIconGrid(folder) {
  const gridEl = document.querySelector(`.folder-section .icon-grid[data-folder="${CSS.escape(folder)}"]`);
  const g = gridEl && gridEl.gridstack;
  if (!gridEl || !g) return;
  const { cols, cell } = iconGridMetrics(gridEl, folder);
  ensureGridColCss(cols);
  try { g.cellHeight(cell); if (g.getColumn() !== cols) g.column(cols, 'list'); } catch (_) {}
  fitSectionForIconGrid(gridEl);
}

function buildFolderSection(folderName, bookmarks) {
  const section = document.createElement('div');
  section.className = 'folder-section fade-in';
  section.dataset.folder = folderName;

  const header = document.createElement('div');
  header.className = 'folder-header';
  header.innerHTML = `
    <span class="folder-icon">📁</span>
    <span class="folder-name">${escapeHtml(getFolderDisplayName(folderName))}</span>
  `;

  // Nested GridStack of icon nodes — each bookmark is its own 1×1 grid item, so
  // moving icons (within and across sections) uses GridStack's native drag,
  // exactly like Homarr. Saved positions come from bm.gx / bm.gy.
  const grid = document.createElement('div');
  grid.className = 'grid-stack icon-grid';
  grid.dataset.folder = folderName;
  bookmarks.forEach((bm) => {
    const item = document.createElement('div');
    item.className = 'grid-stack-item icon-node';
    item.dataset.bmId = bm.id;
    item.setAttribute('gs-w', '1');
    item.setAttribute('gs-h', '1');
    item.setAttribute('gs-no-resize', 'true');   // fixed size — set via S/M/L only, never by dragging
    if (Number.isFinite(bm.gx)) item.setAttribute('gs-x', bm.gx);
    if (Number.isFinite(bm.gy)) item.setAttribute('gs-y', bm.gy);
    const content = document.createElement('div');
    content.className = 'grid-stack-item-content';
    content.appendChild(buildBookmarkCard(bm));
    item.appendChild(content);
    grid.appendChild(item);
  });

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
  card.target = bm.newTab === false ? '_self' : '_blank';   // per-item "open in new tab"
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

  // Bottom-left hover info: short description + URL (skip during rearrange).
  card.addEventListener('mouseenter', () => { if (!state.rearrangeMode) showHoverInfo(bm); });
  card.addEventListener('mouseleave', hideHoverInfo);

  // ── Drag handle pip (shown only in rearrange mode via CSS) ──
  const dragHandle = document.createElement('span');
  dragHandle.className = 'drag-handle';
  dragHandle.textContent = '⠿';
  card.appendChild(dragHandle);

  // ── Action buttons (info + remove) ──
  const actions = document.createElement('div');
  actions.className = 'card-actions';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'card-action-btn card-remove-btn';
  removeBtn.title = 'Remove from dashboard';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  removeBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    removeBookmark(bm.id);
  });
  actions.appendChild(removeBtn);
  card.appendChild(actions);

  // Info / edit button — shown only in edit mode, bottom-right corner, no tooltip.
  const infoBtn = document.createElement('button');
  infoBtn.type = 'button';
  infoBtn.className = 'card-action-btn card-info-btn';
  infoBtn.textContent = 'ℹ';
  infoBtn.addEventListener('pointerdown', (e) => e.stopPropagation());   // don't start a drag
  infoBtn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    openEditModal(bm.id);
  });
  card.appendChild(infoBtn);

  // ── Icon ──
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'bm-icon-wrapper';

  // A user who explicitly picks a custom emoji in the edit modal (flagged
  // via emoji_is_custom) should still see it — that's a deliberate choice,
  // distinct from the AI's unused default guess stored on every bookmark.
  const hasCustomEmoji = !!bm.emoji_is_custom && !!bm.icon_emoji;

  // If the stored resolved_icon fails to load at render time (site changed,
  // transient network issue, etc.), re-walk the same priority order used at
  // generation time: real favicon → AI's best-guess brand icon → generic icon
  // (or the user's custom emoji, if they set one).
  const fallbackUrls = [
    (() => {
      try { return `https://www.google.com/s2/favicons?domain=${new URL(bm.url).hostname}&sz=64`; }
      catch { return null; }
    })(),
    bm.icon_slug
      ? `https://cdn.simpleicons.org/${encodeURIComponent(bm.icon_slug)}`
      : null,
  ].filter(Boolean);

  function showEmoji() {
    iconWrapper.innerHTML = '';
    const em = document.createElement('span');
    em.className = 'bm-emoji-fallback';
    em.textContent = bm.icon_emoji;
    iconWrapper.appendChild(em);
  }

  function showGenericIcon() {
    if (hasCustomEmoji) { showEmoji(); return; }
    iconWrapper.innerHTML = '';
    const img = document.createElement('img');
    img.className = 'bm-favicon';
    img.alt = '';
    img.src = GENERIC_ICON_URL;
    iconWrapper.appendChild(img);
  }

  function tryNextUrl(urls, idx = 0) {
    if (idx >= urls.length) { showGenericIcon(); return; }
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
  } else if (hasCustomEmoji) {
    // User cleared the icon URL and chose a custom emoji in the edit modal —
    // honor that directly rather than re-running favicon lookups.
    showEmoji();
  } else {
    tryNextUrl(fallbackUrls);
  }

  card.appendChild(iconWrapper);

  // ── Title ──
  const title = document.createElement('div');
  title.className = 'bm-title';
  title.textContent = bm.title || tryHostname(bm.url);
  card.appendChild(title);

  // ── Host reachability dot (only when the section has it enabled) ──
  if (bm.folder && storedHostStatus(bm.folder)) attachHostDot(card, bm.url);

  // ── Pointer drag (active only in rearrange mode) ──
  card.draggable = false;   // GridStack handles dragging now (no native <a> drag, no custom FLIP)

  return card;
}

// Add a small corner status dot to a card and subscribe it to HostStatus.
// Green = reachable, red = unreachable, muted = still checking. Multiple cards
// on the same URL share one underlying check (see widgets/host-status.js).
function attachHostDot(card, url) {
  if (!url || !window.HostStatus) return;
  if (card.querySelector('.host-status-corner')) return;   // already present
  const dot = document.createElement('span');
  dot.className = 'host-status-corner loading';
  dot.title = 'Checking…';
  card.appendChild(dot);
  card._hostUnwatch = window.HostStatus.watch(url, (r) => {
    dot.classList.remove('loading');
    const up = !!(r && r.ok);
    dot.classList.toggle('up', up);
    dot.classList.toggle('down', !up);
    dot.title = up
      ? ('Online' + (r && r.statusCode ? ' · ' + r.statusCode : ''))
      : ((r && r.error) || 'Unreachable');
  });
}

// Remove a card's status dot and stop its reachability watch.
function detachHostDot(card) {
  if (card._hostUnwatch) { card._hostUnwatch(); card._hostUnwatch = null; }
  const dot = card.querySelector('.host-status-corner');
  if (dot) dot.remove();
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

  // Floating auto-layout tools (shown only in rearrange mode via CSS).
  document.getElementById('rt-add-widget')?.addEventListener('click', openAddItemChooser);
  setupAddItemFlow();
  document.getElementById('rt-autoresize')?.addEventListener('click', autoResizeGroupings);
  document.getElementById('rt-snap')?.addEventListener('click', snapGroupingsTogether);
  document.getElementById('rt-undo')?.addEventListener('click', undoAutoLayout);
  setupRearrangeToolsMenu();
  setupWidgetModal();
}

// ─── Add-widgets picker ───────────────────────────────────────────────────────
// Every integration that has a widget. enabledKey matches its Settings toggle.
const WIDGET_CATALOG = [
  ['adguard', 'AdGuard Home', 'adguard-home.svg'],
  ['audiobookshelf', 'Audiobookshelf', 'audiobookshelf.svg'],
  ['beszel', 'Beszel', 'beszel.svg'],
  ['dashdot', 'Dash.', 'dashdot.png'],
  ['glances', 'Glances', 'glances.svg'],
  ['homeassistant', 'Home Assistant', 'home-assistant.svg'],
  ['ical', 'iCal', 'ical.svg'],
  ['jellyfin', 'Jellyfin', 'jellyfin.svg'],
  ['emby', 'Emby', 'emby.svg'],
  ['navidrome', 'Navidrome', 'navidrome.svg'],
  ['nextcloud', 'Nextcloud', 'nextcloud.svg'],
  ['ntfy', 'ntfy', 'ntfy.svg'],
  ['openmediavault', 'OpenMediaVault', 'openmediavault.svg'],
  ['opnsense', 'OPNsense', 'opnsense.svg'],
  ['pihole', 'Pi-hole', 'pi-hole.svg'],
  ['plex', 'Plex', 'plex.svg'],
  ['portainer', 'Portainer', 'portainer.svg'],
  ['proxmox', 'Proxmox VE', 'proxmox.svg'],
  ['pbs', 'Proxmox Backup Server', 'proxmox-backup-server.svg'],
  ['prowlarr', 'Prowlarr', 'prowlarr.svg'],
  ['peanut', 'PeaNUT', 'peanut.svg'],
  ['qbittorrent', 'qBittorrent', 'qbittorrent.svg'],
  ['radarr', 'Radarr', 'radarr.svg'],
  ['sabnzbd', 'SABnzbd', 'sabnzbd.svg'],
  ['seerr', 'Seerr', 'seerr.svg'],
  ['sonarr', 'Sonarr', 'sonarr.svg'],
  ['speedtest', 'Speedtest Tracker', 'speedtest-tracker.png'],
  ['stocks', 'Stocks', 'stocks.svg'],
  ['tautulli', 'Tautulli', 'tautulli.svg'],
  ['tracearr', 'Tracearr', 'tracearr.svg'],
  ['transmission', 'Transmission', 'transmission.svg'],
  ['truenas', 'TrueNAS', 'truenas.svg'],
  ['umami', 'Umami', 'umami.svg'],
  ['unifi', 'UniFi Controller', 'unifi.png'],
  ['unraid', 'Unraid', 'unraid.svg'],
  ['uptimekuma', 'Uptime Kuma', 'uptime-kuma.svg', 'uptimeKumaEnabled'],
].map(([intId, name, icon, enabledKey]) => ({
  wid: intId, intId, name, icon, enabledKey: enabledKey || (intId + 'Enabled'),
}));
WIDGET_CATALOG.push(
  { wid: 'tautulli-list', intId: 'tautulli-list', name: 'Tautulli Streams', icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
  { wid: 'tautulli-recent', intId: 'tautulli-recent', name: 'Tautulli Recently Added', icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
  { wid: 'tautulli-watch', intId: 'tautulli-watch', name: 'Tautulli Most Watched', icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
  { wid: 'tautulli-libraries', intId: 'tautulli-libraries', name: 'Tautulli Libraries', icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
  { wid: 'tautulli-top', intId: 'tautulli-top', name: 'Tautulli Top Users', icon: 'tautulli.svg', enabledKey: 'tautulliEnabled' },
  { wid: 'weather-combined', intId: 'weather-combined', name: 'Weather (Combined)', icon: '', enabledKey: 'weatherEnabled', emoji: '🌦️' },
  { wid: 'weather-current',  intId: 'weather-current',  name: 'Current Weather', icon: '', enabledKey: 'weatherEnabled', emoji: '🌤️' },
  { wid: 'weather-hourly',   intId: 'weather-hourly',   name: 'Hourly Forecast', icon: '', enabledKey: 'weatherEnabled', emoji: '🕐' },
  { wid: 'weather-forecast', intId: 'weather-forecast', name: '5-Day Forecast',  icon: '', enabledKey: 'weatherEnabled', emoji: '📅' },
);

function widgetDef(wid) { return WIDGET_CATALOG.find((w) => w.wid === wid); }
function widgetEnabled(wid) { const w = widgetDef(wid); return !!(w && settings[w.enabledKey] === true); }

// Selection holds composite keys ("live:<wid>" / "sample:<wid>") so a widget can
// be picked independently as Live or Sample.
let widgetSel = new Set();
let widgetTab = 'live';   // 'live' | 'sample'
// Live keys carry the endpoint id so the same widget can be added for several
// configured endpoints: "live:<wid>:<endpointId>". Sample keys stay "sample:<wid>".
const selKey = (wid, sample, endpointId) => sample ? `sample:${wid}` : `live:${wid}:${endpointId || ''}`;
const baseIntOf = (intId) => (typeof dashboardWidgetBaseInt === 'function' ? dashboardWidgetBaseInt(intId) : intId);
const hasSampleMount = (wid) => typeof mountSampleWidget === 'function' && window.SAMPLE_MOUNTS && SAMPLE_MOUNTS[wid];

function updateWidgetAddState() {
  const n = widgetSel.size;
  const cnt = document.getElementById('widget-sel-count');
  const add = document.getElementById('widget-add');
  if (cnt) cnt.textContent = n ? `${n} widget${n > 1 ? 's' : ''} selected` : 'No widgets selected';
  if (add) add.disabled = n === 0;
}

// Service grouping for the picker. Most integrations are a single service whose
// name = the widget name; multi-widget integrations get an explicit label/icon.
const SERVICE_META = {
  weather:  { name: 'Weather',  emoji: '🌤️' },
  tautulli: { name: 'Tautulli', icon: 'tautulli.svg' },
};
function widgetServiceKey(w) { return (w.enabledKey || '').replace(/Enabled$/, ''); }
function serviceMetaFor(key, widgets) {
  const o = SERVICE_META[key] || {};
  const first = widgets[0] || {};
  return {
    name: o.name || first.name || key,
    icon: o.icon || (first.emoji ? null : first.icon),
    emoji: o.emoji || first.emoji || null,
  };
}

// One selectable widget card. `sample` renders it as a greyed preview whose
// name carries a "(Sample)" tag.
function buildWidgetPick(w, sample, endpointId) {
  const key = selKey(w.wid, sample, endpointId);
  const card = document.createElement('div');
  card.className = 'widget-pick' + (sample ? ' is-sample' : '');
  card.dataset.selkey = key;
  if (widgetSel.has(key)) card.classList.add('selected');
  const check = document.createElement('span'); check.className = 'wp-check'; check.textContent = '✓';
  let iconEl;
  if (w.emoji) { iconEl = document.createElement('div'); iconEl.style.fontSize = '34px'; iconEl.style.lineHeight = '40px'; iconEl.textContent = w.emoji; }
  else { iconEl = document.createElement('img'); iconEl.alt = ''; iconEl.src = `../icons/integrations/${w.icon}`; iconEl.onerror = () => { iconEl.style.visibility = 'hidden'; }; }
  const nm = document.createElement('span'); nm.className = 'wp-name'; nm.textContent = w.name;
  card.append(check, iconEl, nm);
  if (sample) { const tag = document.createElement('span'); tag.className = 'wp-sample-tag'; tag.textContent = '(Sample)'; card.appendChild(tag); }
  card.addEventListener('click', () => {
    if (widgetSel.has(key)) { widgetSel.delete(key); card.classList.remove('selected'); }
    else { widgetSel.add(key); card.classList.add('selected'); }
    updateWidgetAddState();
  });
  return card;
}

function renderWidgetModalBody() {
  const body = document.getElementById('widget-modal-body');
  if (!body) return;
  body.innerHTML = '';
  const sample = widgetTab === 'sample';

  // Live = configured (enabled) integrations. Sample = every catalog widget
  // that has a demo mount, shown regardless of whether it's configured.
  const source = sample
    ? WIDGET_CATALOG.filter((w) => typeof mountSampleWidget === 'function' && window.SAMPLE_MOUNTS && SAMPLE_MOUNTS[w.wid])
    : WIDGET_CATALOG.filter((w) => settings[w.enabledKey] === true);

  if (!source.length) {
    body.innerHTML = sample
      ? '<div class="widget-empty">No sample widgets are available.</div>'
      : '<div class="widget-empty">No integrations are enabled yet.<br>Enable them in ' +
        '<a href="../config/config.html?tab=integrations">Setup → Integrations</a>, then come back, ' +
        'or use the <b>Sample</b> tab to preview widgets with demo data.</div>';
    updateWidgetAddState();
    return;
  }

  // Group by base integration → (multi-endpoint) one configuration block per
  // endpoint → widgets. Single-instance services (Weather/Stocks) and the
  // Sample tab render a single block as before.
  const descs = settings.integrationDescriptions || {};
  const groups = new Map();
  source.forEach((w) => {
    const key = baseIntOf(w.intId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  });

  // Helper: a labelled configuration block holding the widget picks.
  const buildInstance = (widgets, label, endpointId) => {
    const inst = document.createElement('div');
    inst.className = 'widget-instance';
    if (label) {
      const dlabel = document.createElement('div');
      dlabel.className = 'wg-i-desc';
      dlabel.textContent = label;
      inst.appendChild(dlabel);
    }
    const grid = document.createElement('div');
    grid.className = 'widget-grid';
    widgets.forEach((w) => grid.appendChild(buildWidgetPick(w, sample, endpointId)));
    inst.appendChild(grid);
    return inst;
  };

  const wrap = document.createElement('div');
  wrap.className = 'widget-groups';
  Array.from(groups.entries())
    .map(([key, widgets]) => [key, widgets, serviceMetaFor(key, widgets)])
    .sort((a, b) => a[2].name.localeCompare(b[2].name))
    .forEach(([key, widgets, meta]) => {
      const group = document.createElement('div');
      group.className = 'widget-group' + (sample ? ' is-sample' : '');

      // Service header (icon + name).
      const head = document.createElement('div');
      head.className = 'widget-group-head';
      if (meta.emoji) { const em = document.createElement('span'); em.className = 'wg-h-emoji'; em.textContent = meta.emoji; head.appendChild(em); }
      else if (meta.icon) { const img = document.createElement('img'); img.className = 'wg-h-ico'; img.alt = ''; img.src = `../icons/integrations/${meta.icon}`; img.onerror = () => { img.style.visibility = 'hidden'; }; head.appendChild(img); }
      const svc = document.createElement('span'); svc.className = 'wg-h-service'; svc.textContent = meta.name;
      head.appendChild(svc);
      group.appendChild(head);

      if (!sample && window.Endpoints && Endpoints.isMulti(key)) {
        // One configuration block per named endpoint.
        const eps = Endpoints.list(settings, key);
        eps.forEach((ep) => group.appendChild(buildInstance(widgets, ep.name || 'Endpoint', ep.id)));
        if (!eps.length) group.appendChild(buildInstance(widgets, 'No endpoints configured', null));
      } else {
        // Single configuration (Sample tab, or Weather/Stocks).
        const descText = sample ? 'Sample (demo data)' : (descs[key] || '');
        const label = (descText && (sample || descText !== meta.name)) ? descText : '';
        group.appendChild(buildInstance(widgets, label, null));
      }
      wrap.appendChild(group);
    });

  body.appendChild(wrap);
  updateWidgetAddState();
}

function setWidgetTab(tab) {
  widgetTab = tab === 'sample' ? 'sample' : 'live';
  const live = document.getElementById('widget-tab-live');
  const samp = document.getElementById('widget-tab-sample');
  if (live) live.classList.toggle('active', widgetTab === 'live');
  if (samp) samp.classList.toggle('active', widgetTab === 'sample');
  renderWidgetModalBody();
}

// ─── Unified "Add to dashboard" flow ─────────────────────────────────────────
// The toolbar button opens a chooser (Bookmark / Widget / Manual item); each
// path ends by placing items in a chosen section and re-rendering in place.

// Grey out + lower the floating tools menu while any add dialog is open, so it
// doesn't float over the popup. Re-activates once every add dialog is closed.
function refreshToolsDimmed() {
  const anyOpen = ['add-item-modal', 'add-bookmark-modal', 'manual-item-modal', 'widget-modal']
    .some((id) => document.getElementById(id)?.classList.contains('visible'));
  document.getElementById('rearrange-tools')?.classList.toggle('tools-dimmed', anyOpen);
}

function openAddItemChooser() { document.getElementById('add-item-modal')?.classList.add('visible'); refreshToolsDimmed(); }
function closeAddItemChooser() { document.getElementById('add-item-modal')?.classList.remove('visible'); refreshToolsDimmed(); }

// Sections (folders) present on the active dashboard, in display order.
function currentDashFolders() {
  const dash = getActiveDash();
  if (!dash) return [];
  const present = new Set((dash.bookmarks || []).map((b) => b.folder).filter(Boolean));
  const ordered = [];
  (dash.sectionOrder || []).forEach((s) => { if (present.has(s) && !ordered.includes(s)) ordered.push(s); });
  present.forEach((s) => { if (!ordered.includes(s)) ordered.push(s); });
  return ordered;
}
// Fill a <select> with the dashboard's sections + a "New section…" option.
function populateSectionSelect(sel, newInput) {
  if (!sel) return;
  const folders = currentDashFolders();
  sel.innerHTML = '';
  folders.forEach((f) => { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o); });
  const o = document.createElement('option'); o.value = '__new__'; o.textContent = '➕ New section…'; sel.appendChild(o);
  if (!folders.length) sel.value = '__new__';
  const toggle = () => { if (newInput) newInput.style.display = sel.value === '__new__' ? 'block' : 'none'; };
  toggle();
  sel.onchange = toggle;
}
function resolveSection(sel, newInput) {
  if (sel && sel.value === '__new__') return (newInput && newInput.value.trim()) || 'New Section';
  return sel ? sel.value : 'New Section';
}

function genBmId() { return 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Accept a bare host ("example.com") by assuming https; reject anything that
// isn't a valid http(s) URL. Returns the normalized href or null.
function normalizeUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); if (u.protocol === 'http:' || u.protocol === 'https:') return u.href; } catch (_) {}
  return null;
}

// Re-render the active dashboard while keeping the scroll position.
function rerenderPreserveScroll() {
  const y = dashboardArea ? dashboardArea.scrollTop : 0;
  renderDashboard(state.activeDashboardId);
  requestAnimationFrame(() => { if (dashboardArea) dashboardArea.scrollTop = y; });
}

// Place bookmark/manual items into a section and persist + re-render. New
// sections are appended to the order; the section auto-grows to fit (fit logic).
async function addItemsToDash(bms, folder) {
  const dash = getActiveDash();
  if (!dash || !bms.length) return 0;
  if (!Array.isArray(dash.bookmarks)) dash.bookmarks = [];
  if (!Array.isArray(dash.sectionOrder)) dash.sectionOrder = [];
  bms.forEach((bm) => { bm.folder = folder; dash.bookmarks.push(bm); });
  if (!dash.sectionOrder.includes(folder)) dash.sectionOrder.push(folder);
  await chromeSet({ dashboards: state.dashboards });
  rerenderPreserveScroll();
  return bms.length;
}

// ── Manual item ──
let miUploadData = null;
function showMiError(msg) { const e = document.getElementById('mi-error'); if (e) { e.textContent = msg; e.style.display = 'block'; } }
function hideMiError() { const e = document.getElementById('mi-error'); if (e) e.style.display = 'none'; }
function openManualItemModal() {
  ['mi-name', 'mi-url', 'mi-desc', 'mi-icon', 'mi-section-new'].forEach((id) => { const e = document.getElementById(id); if (e) { e.value = ''; e.classList.remove('invalid'); } });
  document.getElementById('mi-emoji').value = '🔗';
  document.getElementById('mi-newtab').checked = true;
  const up = document.getElementById('mi-upload'); if (up) up.value = '';
  miUploadData = null;
  hideMiError();
  populateSectionSelect(document.getElementById('mi-section'), document.getElementById('mi-section-new'));
  document.getElementById('manual-item-modal').classList.add('visible');
  refreshToolsDimmed();
  document.getElementById('mi-name').focus();
}
function closeManualItemModal() { document.getElementById('manual-item-modal').classList.remove('visible'); refreshToolsDimmed(); }
async function saveManualItem() {
  const nameEl = document.getElementById('mi-name'), urlEl = document.getElementById('mi-url');
  const sel = document.getElementById('mi-section'), newInput = document.getElementById('mi-section-new');
  nameEl.classList.remove('invalid'); urlEl.classList.remove('invalid');
  const name = nameEl.value.trim();
  if (!name) { nameEl.classList.add('invalid'); showMiError('Please enter a name.'); nameEl.focus(); return; }
  const url = normalizeUrl(urlEl.value);
  if (!url) { urlEl.classList.add('invalid'); showMiError('Please enter a valid URL, e.g. https://example.com'); urlEl.focus(); return; }
  if (sel.value === '__new__' && !newInput.value.trim()) { showMiError('Please name the new section.'); newInput.focus(); return; }
  const iconUrl = document.getElementById('mi-icon').value.trim();
  const emoji = document.getElementById('mi-emoji').value.trim() || '🔗';
  const bm = {
    id: genBmId(), title: name, url,
    description: document.getElementById('mi-desc').value.trim(),
    resolved_icon: miUploadData || iconUrl || null,
    icon_emoji: emoji,
    emoji_is_custom: !iconUrl && !miUploadData,
    newTab: document.getElementById('mi-newtab').checked,
    shape: (getActiveDash() && getActiveDash().defaultShape) || 'rounded',
  };
  await addItemsToDash([bm], resolveSection(sel, newInput));
  closeManualItemModal();
  showToast('Item added ✓');
}

// ── Browser-bookmark picker ──
let bmPickerAll = [];          // [{title,url}] or null if unavailable
let bmPickerSel = new Set();   // selected urls
async function loadBrowserBookmarks() {
  if (!(typeof chrome !== 'undefined' && chrome.bookmarks && chrome.bookmarks.getTree)) return null;
  try {
    const [root] = await chrome.bookmarks.getTree();
    const out = [];
    (function walk(n) { if (!n) return; if (n.url) out.push({ title: n.title || n.url, url: n.url }); (n.children || []).forEach(walk); })(root);
    const seen = new Set();
    return out.filter((b) => { if (seen.has(b.url)) return false; seen.add(b.url); return true; });
  } catch (_) { return null; }
}
function updateBmPickerCount() {
  const n = bmPickerSel.size;
  document.getElementById('add-bm-count').textContent = n ? `${n} selected` : 'None selected';
  document.getElementById('add-bm-add').disabled = n === 0;
}
function renderBmPicker(q) {
  const list = document.getElementById('add-bm-list');
  if (!list) return;
  if (bmPickerAll === null) { list.innerHTML = '<div class="add-bm-empty">Bookmark access isn’t available here.</div>'; return; }
  const items = bmPickerAll.filter((b) => !q || b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q)).slice(0, 500);
  list.innerHTML = '';
  if (!items.length) { list.innerHTML = '<div class="add-bm-empty">No bookmarks match.</div>'; return; }
  items.forEach((b) => {
    const row = document.createElement('label'); row.className = 'add-bm-row';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = bmPickerSel.has(b.url);
    cb.addEventListener('change', () => { if (cb.checked) bmPickerSel.add(b.url); else bmPickerSel.delete(b.url); updateBmPickerCount(); });
    const main = document.createElement('div'); main.className = 'abm-main';
    const t = document.createElement('div'); t.className = 'abm-title'; t.textContent = b.title;
    const u = document.createElement('div'); u.className = 'abm-url'; u.textContent = b.url;
    main.append(t, u); row.append(cb, main); list.appendChild(row);
  });
}
async function openAddBookmarkModal() {
  bmPickerSel = new Set();
  const search = document.getElementById('add-bm-search'); if (search) search.value = '';
  populateSectionSelect(document.getElementById('add-bm-section'), document.getElementById('add-bm-section-new'));
  document.getElementById('add-bm-list').innerHTML = '<div class="add-bm-empty">Loading bookmarks…</div>';
  updateBmPickerCount();
  document.getElementById('add-bookmark-modal').classList.add('visible');
  refreshToolsDimmed();
  bmPickerAll = await loadBrowserBookmarks();
  renderBmPicker('');
}
function closeAddBookmarkModal() { document.getElementById('add-bookmark-modal').classList.remove('visible'); refreshToolsDimmed(); }
async function addSelectedBrowserBookmarks() {
  if (!bmPickerSel.size) return;
  const sel = document.getElementById('add-bm-section'), newInput = document.getElementById('add-bm-section-new');
  if (sel.value === '__new__' && !newInput.value.trim()) { newInput.focus(); return; }
  const dash = getActiveDash();
  const byUrl = new Map((bmPickerAll || []).map((b) => [b.url, b]));
  const bms = [...bmPickerSel].map((url) => {
    const b = byUrl.get(url) || { url, title: url };
    return { id: genBmId(), title: b.title, url: b.url, description: '', resolved_icon: null, icon_emoji: '🔗', newTab: true, shape: (dash && dash.defaultShape) || 'rounded' };
  });
  const n = await addItemsToDash(bms, resolveSection(sel, newInput));
  closeAddBookmarkModal();
  showToast(`${n} bookmark${n === 1 ? '' : 's'} added ✓`);
}

function setupAddItemFlow() {
  const closeChooser = () => closeAddItemChooser();
  document.getElementById('add-item-close')?.addEventListener('click', closeChooser);
  document.getElementById('add-item-modal')?.addEventListener('click', (e) => { if (e.target.id === 'add-item-modal') closeChooser(); });
  document.getElementById('choice-bookmark')?.addEventListener('click', () => { closeChooser(); openAddBookmarkModal(); });
  document.getElementById('choice-widget')?.addEventListener('click', () => { closeChooser(); openWidgetModal(); });
  document.getElementById('choice-manual')?.addEventListener('click', () => { closeChooser(); openManualItemModal(); });

  // Browser-bookmark picker
  document.getElementById('add-bm-close')?.addEventListener('click', closeAddBookmarkModal);
  document.getElementById('add-bm-cancel')?.addEventListener('click', closeAddBookmarkModal);
  document.getElementById('add-bookmark-modal')?.addEventListener('click', (e) => { if (e.target.id === 'add-bookmark-modal') closeAddBookmarkModal(); });
  document.getElementById('add-bm-add')?.addEventListener('click', addSelectedBrowserBookmarks);
  document.getElementById('add-bm-search')?.addEventListener('input', (e) => renderBmPicker(e.target.value.toLowerCase().trim()));

  // Manual item
  document.getElementById('mi-close')?.addEventListener('click', closeManualItemModal);
  document.getElementById('mi-cancel')?.addEventListener('click', closeManualItemModal);
  document.getElementById('manual-item-modal')?.addEventListener('click', (e) => { if (e.target.id === 'manual-item-modal') closeManualItemModal(); });
  document.getElementById('mi-save')?.addEventListener('click', saveManualItem);
  document.getElementById('mi-upload')?.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) { miUploadData = null; return; }
    if (f.size > 512 * 1024) { showMiError('Icon image must be under 512 KB.'); e.target.value = ''; miUploadData = null; return; }
    const r = new FileReader();
    r.onload = () => { miUploadData = r.result; hideMiError(); };
    r.readAsDataURL(f);
  });

  // Esc closes whichever add-flow modal is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['add-item-modal', 'add-bookmark-modal', 'manual-item-modal'].forEach((id) => document.getElementById(id)?.classList.remove('visible'));
    refreshToolsDimmed();
  });
}

function openWidgetModal() {
  widgetSel = new Set();
  setWidgetTab('live');   // always start on Live, fresh selection
  document.getElementById('widget-modal')?.classList.add('visible');
  refreshToolsDimmed();
}
function closeWidgetModal() {
  document.getElementById('widget-modal')?.classList.remove('visible');
  refreshToolsDimmed();
}

async function addSelectedWidgets() {
  const dash = getActiveDash();
  if (!dash || !widgetSel.size) return;
  if (!Array.isArray(dash.widgets)) dash.widgets = [];
  const n = widgetSel.size;
  const newDefs = [];
  widgetSel.forEach((key) => {
    const parts = key.split(':');
    const sample = parts[0] === 'sample';
    const wid = parts[1];
    const endpointId = sample ? null : (parts[2] || null);
    const w = widgetDef(wid);
    if (!w) return;
    const uid = 'wg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = { uid, wid: w.wid, intId: w.intId, name: w.name };
    if (sample) entry.sample = true;
    if (endpointId) {
      entry.endpointId = endpointId;
      // Title the placement with the endpoint name when the service has >1 endpoint.
      const base = baseIntOf(w.intId);
      if (window.Endpoints) {
        const ep = Endpoints.get(settings, base, endpointId);
        if (ep && Endpoints.count(settings, base) > 1) { entry.endpointName = ep.name; entry.name = `${w.name} — ${ep.name}`; }
        else if (ep) { entry.endpointName = ep.name; }
      }
    }
    dash.widgets.push(entry);
    newDefs.push(entry);
  });
  closeWidgetModal();
  // Add each new widget to the grid IN PLACE so no other section/widget reflows
  // or re-fits (a full re-render was expanding everything else).
  newDefs.forEach((wdef) => addWidgetItemInPlace(wdef));
  setupWidgetAutoFit();   // observe the new widgets for async/late content
  await chromeSet({ dashboards: state.dashboards });
  showToast('Widget' + (n > 1 ? 's' : '') + ' added ✓');
}

// Persist a single widget's grid geometry (after placement / auto-fit) without
// touching anything else.
function persistWidgetPos(uid) {
  const dash = getActiveDash();
  const el = document.querySelector(`.grid-stack > .grid-stack-item[data-widget="${uid}"]`);
  if (!dash || !el || !el.gridstackNode) return;
  const n = el.gridstackNode;
  dash.layout = dash.layout || {};
  dash.layout['@w:' + uid] = Object.assign({}, dash.layout['@w:' + uid], { x: n.x, y: n.y, w: n.w, h: n.h });
  chromeSet({ dashboards: state.dashboards });
}

// Build one widget grid item and drop it into the live grid via Gridstack
// (auto-positioned into the first free spot), then size it to its content so it
// shows with no scrollbar. Leaves every existing item untouched.
function addWidgetItemInPlace(wdef) {
  const gridEl = gridInstance && gridInstance.el;
  if (!gridInstance || !gridEl) { renderDashboard(state.activeDashboardId); return; }
  const item = document.createElement('div');
  item.className = 'grid-stack-item';
  item.dataset.widget = wdef.uid;
  item.setAttribute('gs-w', 8);
  item.setAttribute('gs-h', 40);           // generous default; auto-fit trims to content
  item.setAttribute('gs-min-w', 3);
  item.setAttribute('gs-min-h', GRID_MIN_H);
  item.setAttribute('gs-max-w', GRID_COLS);
  item.setAttribute('gs-auto-position', 'true');
  const content = document.createElement('div');
  content.className = 'grid-stack-item-content';
  const wsec = buildWidgetSection(wdef);
  content.appendChild(wsec);
  attachWidgetToolsBubble(content, wsec, wdef);
  content.appendChild(buildGridLock('@w:' + wdef.uid));   // lock/unlock in the top-right corner
  item.appendChild(content);

  const wasStatic = !state.rearrangeMode;
  if (wasStatic) gridInstance.setStatic(false);
  gridEl.appendChild(item);
  gridInstance.makeWidget(item);
  if (wasStatic) gridInstance.setStatic(true);

  persistWidgetPos(wdef.uid);
  // Size to content once the widget has mounted (sample data is synchronous;
  // live widgets fill in later — the ResizeObserver from setupWidgetAutoFit
  // catches those).
  requestAnimationFrame(() => { fitWidgetToContent(item); persistWidgetPos(wdef.uid); });
  setTimeout(() => { fitWidgetToContent(item); persistWidgetPos(wdef.uid); }, 400);
}

// Remove a widget's placement from the active dashboard (edit-mode delete).
// Only the board placement + its saved layout entry are removed — the
// integration's configuration in Settings is untouched.
async function removeWidgetGrouping(uid) {
  const dash = getActiveDash();
  if (!dash || !Array.isArray(dash.widgets)) return;
  const before = dash.widgets.length;
  dash.widgets = dash.widgets.filter((x) => x.uid !== uid);
  if (dash.widgets.length === before) return;     // nothing removed
  if (dash.layout) delete dash.layout['@w:' + uid];

  // Remove ONLY this item from the grid — never re-render the whole board, so
  // every other section/widget stays exactly where and how it is (no re-fit).
  const el = document.querySelector(`.grid-stack > .grid-stack-item[data-widget="${uid}"]`);
  if (el) {
    const sec = el.querySelector('.widget-section');
    const inst = sec && sec._inst;
    if (inst) {
      try { (inst.destroy || inst.stop || function () {}).call(inst); } catch (_) {}
      mountedWidgets = mountedWidgets.filter((x) => x !== inst);
    }
    if (gridInstance) gridInstance.removeWidget(el, true);   // removes node + DOM, no reflow (float)
    else el.remove();
  }
  await chromeSet({ dashboards: state.dashboards });
  showToast('Widget removed ✓');
}

function setupWidgetModal() {
  const modal = document.getElementById('widget-modal');
  if (!modal) return;
  document.getElementById('widget-modal-close')?.addEventListener('click', closeWidgetModal);
  document.getElementById('widget-cancel')?.addEventListener('click', closeWidgetModal);
  document.getElementById('widget-add')?.addEventListener('click', addSelectedWidgets);
  document.getElementById('widget-tab-live')?.addEventListener('click', () => setWidgetTab('live'));
  document.getElementById('widget-tab-sample')?.addEventListener('click', () => setWidgetTab('sample'));
  modal.addEventListener('click', (e) => { if (e.target === modal) closeWidgetModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) closeWidgetModal();
  });
}

// Copy a widget's persisted ListCarousel settings (enabled / visible / speed)
// into the mount opts.
function applyCarouselOpts(wdef, opts) {
  if (!wdef.config) return;
  if (wdef.config.carousel != null) opts.carousel = wdef.config.carousel;
  if (wdef.config.visibleCount) opts.visibleCount = wdef.config.visibleCount;
  if (wdef.config.speed) opts.speed = wdef.config.speed;
}

// Build a widget grouping for the board (no S/M/L pill; shows a disabled notice
// when the service is turned off).
// Move a widget's config controls into a floating pill that straddles the top
// border (edit mode), matching the section S/M/L selector. Sample widgets are
// static, so they get no bubble (and their in-widget tools are hidden via CSS).
function attachWidgetToolsBubble(content, sec, wdef) {
  if (!content || !sec || (wdef && wdef.sample)) return;
  const tools = sec.querySelectorAll('.lc-tools, .pc-tools');
  if (!tools.length) return;
  const bubble = document.createElement('div');
  bubble.className = 'widget-tools-bubble';
  tools.forEach((t) => bubble.appendChild(t));   // relocate the controls into the overlay
  content.appendChild(bubble);
}

// ─── Lock / unlock a grid item (section or widget) ───────────────────────────
// A locked item can't be dragged or resized, AND other items can't push it out
// of the way — Gridstack's locked + noMove + noResize. Persisted per item in
// dash.layout[key].locked. `key` is the folder name, or "@w:<uid>" for widgets.

// Stamp the Gridstack lock attributes before init when an item is saved locked.
function applyLockedAttrs(item, pos) {
  if (!pos || !pos.locked) return;
  item.setAttribute('gs-locked', 'true');
  item.setAttribute('gs-no-move', 'true');
  item.setAttribute('gs-no-resize', 'true');
  item.classList.add('locked');
}

// The small lock toggle shown in each item's top-right corner (edit mode only).
function buildGridLock(key) {
  const dash = getActiveDash();
  const locked = !!(dash && dash.layout && dash.layout[key] && dash.layout[key].locked);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'grid-lock' + (locked ? ' is-locked' : '');
  btn.dataset.lockKey = key;
  btn.textContent = locked ? '🔒' : '🔓';
  btn.title = locked ? 'Locked — click to unlock' : 'Lock in place';
  btn.setAttribute('aria-label', btn.title);
  btn.addEventListener('pointerdown', (e) => e.stopPropagation());   // never start a drag
  btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleGridLock(btn); });
  return btn;
}

function toggleGridLock(btn) {
  const item = btn.closest('.grid-stack-item');
  const key = btn.dataset.lockKey;
  const dash = getActiveDash();
  if (!item || !key || !dash) return;
  if (!dash.layout[key]) dash.layout[key] = {};
  const locked = !dash.layout[key].locked;
  dash.layout[key].locked = locked;
  applyGridLock(item, locked);
  btn.classList.toggle('is-locked', locked);
  btn.textContent = locked ? '🔒' : '🔓';
  btn.title = locked ? 'Locked — click to unlock' : 'Lock in place';
  btn.setAttribute('aria-label', btn.title);
  markRearrangeChanged();
}

function applyGridLock(item, locked) {
  if (!gridInstance || !item) return;
  item.classList.toggle('locked', !!locked);
  const wasStatic = !state.rearrangeMode;
  if (wasStatic) gridInstance.setStatic(false);
  try { gridInstance.update(item, { locked: !!locked, noMove: !!locked, noResize: !!locked }); } catch (_) {}
  try { if (gridInstance.movable)   gridInstance.movable(item, !locked); }   catch (_) {}
  try { if (gridInstance.resizable) gridInstance.resizable(item, !locked); } catch (_) {}
  if (wasStatic) gridInstance.setStatic(true);
}

function buildWidgetSection(wdef) {
  const sec = document.createElement('div');
  sec.className = 'widget-section';
  // No section title — the widget renders its own icon + name. A slim drag grip
  // (the Gridstack handle for widgets) appears only in rearrange mode.
  const drag = document.createElement('div');
  drag.className = 'widget-drag';
  drag.title = 'Drag to move';
  drag.innerHTML = '<span class="wg-grip">⠿</span>';
  sec.appendChild(drag);

  // Delete control (edit-mode only) — removes this widget's board placement.
  // Does NOT touch the underlying integration configuration.
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'widget-del';
  del.title = 'Remove widget from board';
  del.setAttribute('aria-label', 'Remove widget');
  del.textContent = '✕';
  del.addEventListener('pointerdown', (e) => e.stopPropagation());  // don't start a drag
  del.addEventListener('click', (e) => { e.stopPropagation(); removeWidgetGrouping(wdef.uid); });
  sec.appendChild(del);

  const bodyEl = document.createElement('div');
  bodyEl.className = 'widget-body';
  const w = widgetDef(wdef.wid);

  if (wdef.sample) {
    // Sample widget: render static demo data, independent of any integration
    // config. A small badge marks it as a non-functional preview.
    sec.classList.add('widget-sample');
    const badge = document.createElement('span');
    badge.className = 'widget-sample-badge';
    badge.textContent = 'SAMPLE';
    sec.appendChild(badge);
    let inst = (typeof mountSampleWidget === 'function') ? mountSampleWidget(wdef.wid, bodyEl) : null;
    if (inst) {
      mountedWidgets.push(inst);
      sec._inst = inst;   // so a single delete can stop just this instance
    } else {
      bodyEl.innerHTML = '';
      const ph = document.createElement('div'); ph.className = 'widget-placeholder';
      if (w && w.emoji) { const em = document.createElement('div'); em.style.fontSize = '34px'; em.textContent = w.emoji; ph.appendChild(em); }
      else if (w) { const img = document.createElement('img'); img.alt = ''; img.src = `../icons/integrations/${w.icon}`; img.onerror = () => { img.style.display = 'none'; }; ph.appendChild(img); }
      const t = document.createElement('div'); t.textContent = `${wdef.name} (Sample)`;
      ph.appendChild(t);
      bodyEl.appendChild(ph);
    }
    sec.appendChild(bodyEl);
    return sec;
  }

  // An enabled multi-endpoint service whose specific endpoint was deleted still
  // passes this gate (enabledKey stays true) and reaches the live mount, which
  // resolves the missing endpoint to a "configuration removed" notice.
  if (!widgetEnabled(wdef.wid)) {
    bodyEl.innerHTML =
      '<div class="widget-disabled"><div style="font-size:24px;">⚠️</div>' +
      '<div style="font-weight:600;color:var(--text-secondary);">Service disabled</div>' +
      '<div>Enable it in <a href="../config/config.html?tab=integrations">Setup → Integrations</a></div></div>';
  } else {
    // Try to mount the real, live widget; fall back to a placeholder if there's
    // no live mount for this integration yet.
    let inst = null;
    if (typeof mountDashboardWidget === 'function') {
      // Per-widget options (e.g. the hourly-forecast count, persisted on the
      // widget entry).
      const opts = {};
      if (wdef.intId === 'weather-hourly') {
        opts.hours = (wdef.config && wdef.config.hours) || 5;
        opts.onHoursChange = (n) => {
          wdef.config = Object.assign({}, wdef.config, { hours: n });
          chromeSet({ dashboards: state.dashboards });
        };
      } else if (wdef.intId === 'weather-forecast') {
        opts.days = (wdef.config && wdef.config.days) || 5;
        opts.onDaysChange = (n) => {
          wdef.config = Object.assign({}, wdef.config, { days: n });
          chromeSet({ dashboards: state.dashboards });
        };
      } else if (wdef.intId === 'weather-combined') {
        opts.hours = (wdef.config && wdef.config.hours) || 12;
        opts.days = (wdef.config && wdef.config.days) || 5;
        opts.speedMs = (wdef.config && wdef.config.speedMs) || 2000;
        const persist = (patch) => { wdef.config = Object.assign({}, wdef.config, patch); chromeSet({ dashboards: state.dashboards }); };
        opts.onHoursChange = (n) => persist({ hours: n });
        opts.onDaysChange = (n) => persist({ days: n });
        opts.onSpeedChange = (n) => persist({ speedMs: n });
      } else if (wdef.intId === 'tautulli') {
        if (wdef.config && wdef.config.maxVisible) opts.maxVisible = wdef.config.maxVisible;
        if (wdef.config && wdef.config.dwellMs) opts.dwellMs = wdef.config.dwellMs;
        if (wdef.config && wdef.config.carousel != null) opts.carousel = wdef.config.carousel;
        opts.onConfigChange = (patch) => {
          wdef.config = Object.assign({}, wdef.config, patch);
          chromeSet({ dashboards: state.dashboards });
        };
      } else if (wdef.intId === 'portainer') {
        if (wdef.config) {
          if (wdef.config.statusFilter) opts.statusFilter = wdef.config.statusFilter;
          if (wdef.config.nodeFilter) opts.nodeFilter = wdef.config.nodeFilter;
          if (wdef.config.pollMs) opts.pollMs = wdef.config.pollMs;
        }
        applyCarouselOpts(wdef, opts);
        opts.onConfigChange = (patch) => {
          wdef.config = Object.assign({}, wdef.config, patch);
          chromeSet({ dashboards: state.dashboards });
        };
      } else if (wdef.intId === 'stocks' || wdef.intId === 'tautulli-list' || wdef.intId === 'tautulli-recent' || wdef.intId === 'tautulli-watch') {
        applyCarouselOpts(wdef, opts);
        opts.onConfigChange = (patch) => {
          wdef.config = Object.assign({}, wdef.config, patch);
          chromeSet({ dashboards: state.dashboards });
        };
      }
      if (wdef.endpointId) {
        opts.endpointId = wdef.endpointId;
        // Label used by the "configuration removed" notice if this endpoint is gone.
        const svcName = (w && w.name) || wdef.name;
        opts.removedLabel = wdef.endpointName ? `${svcName} — ${wdef.endpointName}` : wdef.name;
      }
      inst = mountDashboardWidget(wdef.intId, bodyEl, settings, opts);
    }
    if (inst) {
      mountedWidgets.push(inst);
      sec._inst = inst;   // so a single delete can stop just this instance
    } else {
      bodyEl.innerHTML = '';
      const ph = document.createElement('div'); ph.className = 'widget-placeholder';
      if (w && w.emoji) { const em = document.createElement('div'); em.style.fontSize = '34px'; em.textContent = w.emoji; ph.appendChild(em); }
      else if (w) { const img = document.createElement('img'); img.alt = ''; img.src = `../icons/integrations/${w.icon}`; img.onerror = () => { img.style.display = 'none'; }; ph.appendChild(img); }
      const t = document.createElement('div'); t.textContent = `${wdef.name} widget`;
      ph.appendChild(t);
      bodyEl.appendChild(ph);
    }
  }
  sec.appendChild(bodyEl);
  return sec;
}

// Make the floating tools menu draggable (via its grip) and show a description
// tooltip on hover over each option.
function setupRearrangeToolsMenu() {
  const menu = document.getElementById('rearrange-tools');
  if (!menu) return;
  const tip = document.getElementById('rt-tip');

  // The bar is fixed at top-center (CSS) and no longer draggable.
  // Hover description tooltips.
  menu.querySelectorAll('.rt-btn').forEach((b) => {
    b.addEventListener('mouseenter', () => {
      if (!tip || !b.dataset.tip) return;
      tip.textContent = b.dataset.tip;
      tip.classList.add('show');
    });
    b.addEventListener('mouseleave', () => { if (tip) tip.classList.remove('show'); });
  });
}


// Snapshot of dash.layout taken when entering edit mode, used to revert on Cancel.
let layoutSnapshot = null;

function enterRearrangeMode() {
  state.rearrangeMode     = true;
  state.rearrangeModified = false;
  document.body.classList.add('rearrange-mode');
  // The top button becomes a non-clickable "Editing Dashboard" label; Save and
  // Cancel now live in the floating tools menu.
  rearrangeBtn.textContent = '✎ Editing Dashboard';
  rearrangeBtn.classList.add('editing');
  rearrangeBtn.disabled = true;
  rearrangeSaveBtn.classList.remove('has-changes');
  searchInput.blur();

  // (No shake — the tools bar opens cleanly with no animation/layout shift.)

  // Fresh undo state for the floating auto-layout tools.
  layoutUndo = null;
  const undoBtn = document.getElementById('rt-undo');
  if (undoBtn) undoBtn.disabled = true;

  // Grid mode: unlock the grid so sections can be dragged (resize stays off
  // until Step 3). The grid overlay is shown via body.rearrange-mode CSS.
  if (gridInstance) {
    const dash = getActiveDash();
    layoutSnapshot = dash ? JSON.parse(JSON.stringify(dash.layout || {})) : null;
    gridInstance.setStatic(false);
    gridInstance.enableMove(true);
    gridInstance.enableResize(true);
    reassertGridLocks();   // global enable must not override per-item locks
  }
  setIconGridsStatic(false);   // enable icon dragging within/between sections
}

function exitRearrangeMode(discard = false) {
  if (!state.rearrangeMode) return;

  // End any in-progress drag
  if (pDrag.active) endPointerDrag();

  state.rearrangeMode     = false;
  state.rearrangeModified = false;
  document.body.classList.remove('rearrange-mode');
  // Restore the clickable "Rearrange" button.
  rearrangeBtn.textContent = '✎ Edit Dashboard';
  rearrangeBtn.classList.remove('editing');
  rearrangeBtn.disabled = false;
  rearrangeSaveBtn.classList.remove('has-changes');

  // Re-lock the grid (and the nested icon grids).
  setIconGridsStatic(true);
  if (gridInstance) {
    gridInstance.setStatic(true);
    if (discard && layoutSnapshot) {
      const dash = getActiveDash();
      if (dash) dash.layout = layoutSnapshot;
    }
    layoutSnapshot = null;
  }

  // Reset any FLIP translate on cards before re-rendering
  document.querySelectorAll('.bookmark-card').forEach((c) => {
    c.style.transition = '';
    c.style.translate  = '';
  });

  if (discard) renderDashboard(state.activeDashboardId);
}

// Read the current grid geometry back into dash.layout (per-section x/y/w/h).
function captureGridLayout(dash) {
  if (!gridInstance) return;
  const layout = dash.layout || (dash.layout = {});
  gridInstance.engine.nodes.forEach((n) => {
    if (!n.el) return;
    const name = n.el.dataset.folder;
    const widgetUid = n.el.dataset.widget;
    if (name) {
      // Merge so we keep the chosen iconSize, captured from the live data attr.
      const sec = n.el.querySelector('.folder-section');
      const iconSize = (sec && sec.dataset.iconsize) || (layout[name] && layout[name].iconSize) || DEFAULT_ICON_SIZE;
      const textPos = (sec && sec.dataset.textpos) || (layout[name] && layout[name].textPos);
      layout[name] = Object.assign({}, layout[name], { x: n.x, y: n.y, w: n.w, h: n.h, iconSize }, textPos ? { textPos } : {});
    } else if (widgetUid) {
      const k = '@w:' + widgetUid;
      // Remember whether the user hand-sized this widget, so auto-fit doesn't
      // revert it back to content height on the next load.
      const manual = n.el.dataset.manualSize === '1' || !!(layout[k] && layout[k].manual);
      layout[k] = Object.assign({}, layout[k], { x: n.x, y: n.y, w: n.w, h: n.h, manual });
    }
  });
  // Section order follows top-to-bottom, left-to-right grid position.
  dash.sectionOrder = gridInstance.engine.nodes
    .slice()
    .sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .map((n) => n.el && n.el.dataset.folder)
    .filter(Boolean);
}

async function saveRearrangement() {
  const dash = getActiveDash();
  if (!dash) return;

  if (gridInstance) {
    // Grid mode: first grow any section that would show scrollbars, then
    // persist section positions/sizes + derived order…
    fitAllSectionsToContent();
    captureGridLayout(dash);
    // …and the bookmark order within each section (and any cross-section moves).
    const newBookmarks = [];
    document.querySelectorAll('.grid-stack .folder-section').forEach((section) => {
      const folderName = section.dataset.folder;
      section.querySelectorAll('.bookmark-card').forEach((card) => {
        const bm = dash.bookmarks.find((b) => b.id === card.dataset.bmId);
        if (bm) newBookmarks.push({ ...bm, folder: folderName });
      });
    });
    if (newBookmarks.length) dash.bookmarks = newBookmarks;
  } else {
    // Classic mode: read DOM order (sections + bookmarks within them).
    const newBookmarks = [];
    const sectionOrder = [];
    document.querySelectorAll('.folder-section').forEach((section) => {
      const folderName = section.dataset.folder;
      sectionOrder.push(folderName);
      section.querySelectorAll('.bookmark-card').forEach((card) => {
        const bm = dash.bookmarks.find((b) => b.id === card.dataset.bmId);
        if (bm) newBookmarks.push({ ...bm, folder: folderName });
      });
    });
    dash.bookmarks = newBookmarks;
    dash.sectionOrder = sectionOrder;
  }

  await chromeSet({ dashboards: state.dashboards });

  exitRearrangeMode(false); // DOM is already correct; don't re-render
  showToast('Layout saved ✓');
}

function markRearrangeChanged() {
  state.rearrangeModified = true;
  rearrangeSaveBtn.classList.add('has-changes');  // highlight Save when there are unsaved edits
}

// ─── Pointer-events drag with FLIP animation ──────────────────────────────────

// ── Attach pointerdown; actual drag logic is in module-level handlers ─────────

function initCardPointerDrag(cardEl) {
  cardEl.addEventListener('pointerdown', (e) => {
    if (!state.rearrangeMode || e.button !== 0) return;
    // In grid mode, sections are dragged by their header; bookmark cards stay
    // reorderable within (and across) sections — so card drag stays enabled.
    if (e.target.closest('.card-actions')) return; // let the remove (✕) button receive the click
    e.preventDefault();
    dragStart(cardEl, e);
  });
}

function dragStart(cardEl, e) {
  clearTimeout(pDrag._cleanupT);   // don't let a prior drag's cleanup fire mid-drag
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
  pDrag.aborted     = false;
  pDrag.originGrid  = ph.parentNode;   // the card's starting slot (for abort / off-grid)
  pDrag.originNext  = ph.nextSibling;

  // Esc aborts the drag — placeholder + layout slide back to the original spots.
  pDrag._onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); abortDrag(); } };
  document.addEventListener('keydown', pDrag._onKey, true);

  // Document-level listeners — no pointer capture needed
  document.addEventListener('pointermove',   onDragMove,   { passive: false });
  document.addEventListener('pointerup',     onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);
}

// Send the placeholder (and the whole layout) back to the drag's starting slot,
// animated, without committing a reorder.
function abortDrag() {
  if (!pDrag.active) return;
  pDrag.aborted = true;
  if (pDrag.placeholder && pDrag.originGrid) {
    flipDo(() => pDrag.originGrid.insertBefore(pDrag.placeholder, pDrag.originNext));
  }
  onDragEnd();
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
  if (!grid) {
    // Dragged off every grid → send the placeholder home; the layout slides back
    // to its original arrangement until the cursor returns over a grid.
    if (pDrag.lastTarget !== 'origin' && pDrag.originGrid) {
      pDrag.lastTarget = 'origin';
      flipDo(() => pDrag.originGrid.insertBefore(pDrag.placeholder, pDrag.originNext));
    }
    return;
  }

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

  // Let any in-flight FLIP settle (no abrupt snap), THEN clear the inline
  // translate/transition so the cards' normal CSS transitions (hover, etc.)
  // resume. Cancelled if a new drag starts before it fires.
  clearTimeout(pDrag._cleanupT);
  pDrag._cleanupT = setTimeout(() => {
    document.querySelectorAll('.bookmark-card').forEach((c) => { c.style.transition = ''; c.style.translate = ''; });
  }, FLIP_MS + 40);

  document.removeEventListener('pointermove',   onDragMove);
  document.removeEventListener('pointerup',     onDragEnd);
  document.removeEventListener('pointercancel', onDragEnd);
  if (pDrag._onKey) { document.removeEventListener('keydown', pDrag._onKey, true); pDrag._onKey = null; }

  // No real change if the drag was aborted (Esc) or the card ended back at its
  // original slot (dropped off-grid).
  const changed = !pDrag.aborted && pDrag.lastTarget !== null && pDrag.lastTarget !== 'origin';

  pDrag.active      = false;
  pDrag.srcEl       = null;
  pDrag.ghost       = null;
  pDrag.placeholder = null;
  pDrag.lastTarget  = null;
  pDrag.aborted     = false;
  pDrag.originGrid  = null;
  pDrag.originNext  = null;

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
const FLIP_MS = 240;
const FLIP_EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function flipDo(fn) {
  const cards = [...document.querySelectorAll('.bookmark-card:not(.drag-ghost)')].filter((c) => c !== pDrag.srcEl);

  // FIRST — measure each card's CURRENT VISUAL position. getBoundingClientRect
  // includes any in-flight `translate`, so a card mid-animation continues
  // smoothly from where it is (this is what the old version got wrong: it reset
  // translates to baseline before measuring, which made interrupted cards snap
  // and "jump", badly on row-wraps and fast drags).
  const first = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));

  // Move the placeholder to its new slot.
  fn();

  // LAST — clear transforms so we read the new NATURAL layout in one pass.
  cards.forEach((c) => { c.style.transition = 'none'; c.style.translate = ''; });
  const last = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));

  // INVERT — offset each card back to where it visually was (still no transition).
  let any = false;
  cards.forEach((c) => {
    const f = first.get(c), l = last.get(c);
    const dx = f.left - l.left, dy = f.top - l.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { c.style.translate = ''; return; }
    c.style.translate = `${dx}px ${dy}px`;
    any = true;
  });
  if (!any) return;

  // PLAY — next frame, ease each card to its natural spot. Works identically for
  // horizontal moves and vertical row-wraps (dx AND dy are animated).
  requestAnimationFrame(() => {
    cards.forEach((c) => {
      if (!c.style.translate) return;
      c.style.transition = `translate ${FLIP_MS}ms ${FLIP_EASE}`;
      c.style.translate = '';
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
  // Mark this as a deliberate user choice so the render-time fallback chain
  // honors it ahead of the generic icon (rather than treating it as the
  // AI's unused default guess).
  bm.emoji_is_custom = true;

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
  selectShapeOption('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  dashEditModal.classList.add('visible');
  document.getElementById('dash-edit-name').focus();
}

async function saveDashEdit() {
  const dash = getActiveDash();
  if (!dash) { closeDashEditModal(); return; }

  const newName = document.getElementById('dash-edit-name').value.trim();
  dash.name        = newName || dash.name;
  dash.defaultShape = getSelectedShape('dash-edit-shape-picker', dash.defaultShape || 'rounded');

  await chromeSet({ dashboards: state.dashboards });
  closeDashEditModal();

  // Re-render so name, text visibility, and any un-customized icon shapes update
  renderDashboard(state.activeDashboardId);
  renderSwitcher();   // refresh the switcher label across all modes

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
    renderSearchResults(searchInput.value.trim().toLowerCase())
  );
  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) renderSearchResults(searchInput.value.trim().toLowerCase());
  });
  // Enter opens the top result.
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = document.querySelector('#search-results .search-result');
      if (first) { window.open(first.href, '_blank', 'noopener'); }
    }
  });
  // Click outside closes the dropdown.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) closeSearchResults();
  });

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
      closeSearchResults();
      searchInput.blur();
    }
  });
}

function closeSearchResults() {
  const box = document.getElementById('search-results');
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
}

function searchFaviconFor(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; }
  catch { return ''; }
}

// Show matching bookmarks from the ACTIVE dashboard in a dropdown below the
// search box. Does not filter/hide anything on the dashboard itself.
function renderSearchResults(query) {
  const box = document.getElementById('search-results');
  if (!box) return;
  if (!query) { closeSearchResults(); return; }

  const dash = getActiveDash();
  const bms = (dash && dash.bookmarks) || [];
  const matches = bms.filter((b) =>
    (b.title || '').toLowerCase().includes(query) ||
    (b.url || '').toLowerCase().includes(query) ||
    (b.description || '').toLowerCase().includes(query)
  ).slice(0, 12);

  box.innerHTML = '';
  if (!matches.length) {
    const m = document.createElement('div');
    m.className = 'search-empty-msg';
    m.textContent = 'No matches in this dashboard';
    box.appendChild(m);
  } else {
    matches.forEach((b, i) => {
      const a = document.createElement('a');
      a.className = 'search-result' + (i === 0 ? ' active' : '');
      a.href = b.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.alt = '';
      img.src = b.resolved_icon || searchFaviconFor(b.url);
      img.onerror = () => { img.style.visibility = 'hidden'; };
      const txt = document.createElement('span'); txt.className = 'sr-text';
      const t = document.createElement('span'); t.className = 'sr-title'; t.textContent = b.title || b.url;
      const u = document.createElement('span'); u.className = 'sr-url'; u.textContent = b.url;
      txt.append(t, u);
      a.append(img, txt);
      box.appendChild(a);
    });
  }
  box.classList.add('open');
}

// ─── Empty state ──────────────────────────────────────────────────────────────

// Shown on a bare new tab when "Show dashboard on new tab" is off. Keeps the
// new tab clean but one click away from the dashboard.
function showNewTabDisabled() {
  const def = state.defaultDashboardId || state.dashboards[0]?.id || '';
  const openHref = def ? `dashboard.html?dash=${def}` : '../config/config.html?tab=dashboards';
  document.body.innerHTML = `
    <div style="height:100vh;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:18px;text-align:center;color:var(--text-muted);padding:40px;background:var(--bg-primary);">
      <div style="font-size:44px;">🗂️</div>
      <div style="font-size:15px;color:var(--text-secondary);max-width:320px;">Your dashboard isn't set to take over new tabs.</div>
      <a href="${openHref}" style="display:inline-flex;align-items:center;gap:8px;background:var(--accent);color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:500;">Open Dashboard →</a>
      <a href="../config/config.html?tab=settings" style="font-size:12px;color:var(--text-muted);text-decoration:underline;">Settings</a>
    </div>`;
}

function showEmptyState() {
  dashboardArea.innerHTML = `
    <div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:20px;text-align:center;color:var(--text-muted);padding:40px;">
      <div><img src="../icons/logo.png" alt="" style="width:64px;height:64px;object-fit:contain;"></div>
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

// ─── Bottom-left hover info (description + URL) ───────────────────────────────
function hoverInfoEl() {
  let el = document.getElementById('hover-info');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hover-info';
    el.style.cssText =
      'position:fixed;left:50%;bottom:14px;z-index:2000;max-width:min(540px,62vw);' +
      'padding:8px 12px;background:var(--bg-card);border:1px solid var(--border);' +
      'border-radius:8px;box-shadow:0 6px 22px rgba(0,0,0,0.30);' +
      'font-size:12px;color:var(--text-primary);pointer-events:none;text-align:center;' +
      'opacity:0;transform:translate(-50%,4px);transition:opacity .12s,transform .12s;';
    document.body.appendChild(el);
  }
  return el;
}

function showHoverInfo(bm) {
  const el = hoverInfoEl();
  const desc = bm.description
    ? '<div style="font-weight:500;display:-webkit-box;-webkit-line-clamp:2;' +
      '-webkit-box-orient:vertical;overflow:hidden;">' + escapeHtml(bm.description) + '</div>'
    : '';
  el.innerHTML = desc +
    '<div style="color:var(--text-muted);font-size:11px;margin-top:' + (desc ? '3px' : '0') +
    ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(bm.url) + '</div>';
  el.style.opacity = '1';
  el.style.transform = 'translate(-50%, 0)';
}

function hideHoverInfo() {
  const el = document.getElementById('hover-info');
  if (el) { el.style.opacity = '0'; el.style.transform = 'translate(-50%, 4px)'; }
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
