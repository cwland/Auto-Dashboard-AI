// Auto Dashboard AI — Countdown Widget (single + list)
// ---------------------------------------------------------------------------
// Client-side countdown timers to future dates/times. Two widgets share one
// implementation file:
//   • CountdownWidget      — one big DAYS / HOURS / MIN / SEC display.
//   • CountdownListWidget  — a vertical list of compact countdowns, with the
//                            shared ListCarousel (scroll on/off, visible count,
//                            speed, continuous/pause modes).
// Both read the same configured items (CountdownApi.parseItems) and update once
// per second from ONE shared ticker (so many widgets cost a single interval).
// Times use the local browser timezone (DST handled by the Date constructor).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  // One interval drives every countdown on the page.
  const Ticker = {
    subs: new Set(),
    timer: null,
    add(fn) {
      this.subs.add(fn);
      if (!this.timer) this.timer = setInterval(() => { this.subs.forEach((f) => { try { f(); } catch (_) {} }); }, 1000);
    },
    remove(fn) {
      this.subs.delete(fn);
      if (!this.subs.size && this.timer) { clearInterval(this.timer); this.timer = null; }
    },
  };

  // The six display units, largest → smallest. This order defines the
  // "hierarchy" used when hidden units are rolled into the next visible one.
  const UNIT_ORDER = ['years', 'months', 'days', 'hours', 'minutes', 'seconds'];
  const UNIT_LABELS = { years: 'Years', months: 'Months', days: 'Days', hours: 'Hours', minutes: 'Min', seconds: 'Sec' };
  const UNIT_SUFFIX = { years: 'y', months: 'mo', days: 'd', hours: 'h', minutes: 'm', seconds: 's' };
  const DEFAULT_UNITS = UNIT_ORDER.slice();   // all six visible by default

  // Normalize a units config (array of keys, or {key:bool} map, or undefined)
  // into an ordered array of enabled unit keys. Falls back to all six.
  function normalizeUnits(units) {
    let enabled;
    if (Array.isArray(units)) {
      enabled = new Set(units.filter((u) => UNIT_ORDER.includes(u)));
    } else if (units && typeof units === 'object') {
      enabled = new Set(UNIT_ORDER.filter((u) => units[u]));
    } else {
      enabled = new Set(DEFAULT_UNITS);
    }
    const out = UNIT_ORDER.filter((u) => enabled.has(u));
    return out.length ? out : DEFAULT_UNITS.slice();
  }

  // Parse stored items (array or JSON string) → clean [{id,name,target,hasTime}].
  // Legacy items carried `title`/`desc`; both now collapse to a single `name`.
  function parseItems(items) {
    let arr = items;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (_) { arr = []; } }
    if (!Array.isArray(arr)) arr = [];
    return arr.map((it) => {
      if (!it || typeof it !== 'object') return null;
      const date = String(it.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      const time = String(it.time || '').trim();
      const hasTime = /^\d{2}:\d{2}$/.test(time);
      const target = new Date(`${date}T${hasTime ? time : '00:00'}:00`);   // local time
      const ms = target.getTime();
      if (!Number.isFinite(ms)) return null;
      const name = String(it.name != null ? it.name : (it.title || it.desc || '')).slice(0, 25) || 'Countdown';
      return {
        id: it.id || ('cd' + Math.random().toString(36).slice(2, 9)),
        name,
        hasTime, target: ms,
      };
    }).filter(Boolean);
  }

  // Add `n` whole months to a date, clamping the day to the target month's
  // length (Jan 31 + 1mo → Feb 28/29). Time-of-day is preserved.
  function addMonths(date, n) {
    const r = new Date(date.getTime());
    const day = r.getDate();
    r.setDate(1);
    r.setMonth(r.getMonth() + n);
    const dim = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
    r.setDate(Math.min(day, dim));
    return r;
  }

  // Calendar-aware breakdown of (toMs - fromMs) into whole y/mo/d/h/mi/s.
  // Uses a month "anchor" (the largest whole-month step that doesn't overshoot
  // `to`) so uneven month lengths are handled unambiguously and never produce
  // negative parts; the sub-month remainder is fixed time arithmetic.
  function calDiff(fromMs, toMs) {
    const from = new Date(Math.min(fromMs, toMs));
    const to = new Date(Math.max(fromMs, toMs));
    let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
    if (addMonths(from, months).getTime() > to.getTime()) months -= 1;
    if (months < 0) months = 0;
    const anchor = addMonths(from, months);
    const years = Math.floor(months / 12);
    const remMonths = months - years * 12;
    let rem = to.getTime() - anchor.getTime();
    const days = Math.floor(rem / 86400000); rem -= days * 86400000;
    const hours = Math.floor(rem / 3600000); rem -= hours * 3600000;
    const minutes = Math.floor(rem / 60000); rem -= minutes * 60000;
    const seconds = Math.floor(rem / 1000);
    return { years, months: remMonths, days, hours, minutes, seconds };
  }

  // Build the displayed values for the enabled units. The largest VISIBLE unit
  // (the "top") absorbs all time from the larger hidden units above it; units
  // hidden below the top are computed but simply not shown (so a smaller visible
  // unit keeps its normal modular value — e.g. Years visible + Months hidden
  // leaves Days unchanged). Years/Months use calendar math; once the top unit is
  // Days or smaller the breakdown is pure fixed arithmetic (no calendar
  // boundaries), so hidden years/days fully roll into the top unit.
  // Returns an ordered array of { unit, value } for the enabled units only.
  function computeUnits(remainingMs, unitsCfg, targetMs, nowMs) {
    const enabled = normalizeUnits(unitsCfg);
    const enabledSet = new Set(enabled);
    const total = Math.max(0, remainingMs);
    const top = enabled[0];                       // largest enabled unit
    const val = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

    if (top === 'years' || top === 'months') {
      const tMs = (typeof targetMs === 'number') ? targetMs : Date.now() + total;
      const nMs = (typeof nowMs === 'number') ? nowMs : tMs - total;
      const d = (tMs > nMs) ? calDiff(nMs, tMs) : { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
      if (top === 'years') { val.years = d.years; val.months = d.months; }
      else { val.months = d.years * 12 + d.months; }     // months absorbs years
      val.days = d.days; val.hours = d.hours; val.minutes = d.minutes; val.seconds = d.seconds;
    } else {
      let rem = Math.floor(total / 1000);                // whole seconds
      if (top === 'days') { val.days = Math.floor(rem / 86400); rem %= 86400; }
      if (top === 'days' || top === 'hours') { val.hours = Math.floor(rem / 3600); rem %= 3600; }
      if (top === 'days' || top === 'hours' || top === 'minutes') { val.minutes = Math.floor(rem / 60); rem %= 60; }
      val.seconds = rem;
    }
    return UNIT_ORDER.filter((u) => enabledSet.has(u)).map((u) => ({ unit: u, value: val[u] }));
  }

  // Break a millisecond span into whole d/h/m/s (clamped at zero). Retained for
  // back-compat with any external callers of CountdownApi.parts.
  function parts(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
  }
  const pad2 = (n) => String(n).padStart(2, '0');

  // Human-readable target line, e.g. "December 25, 2026" or "Dec 25, 2026, 2:30 PM".
  function formatTarget(item) {
    try {
      const d = new Date(item.target);
      const dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
      if (!item.hasTime) return dateStr;
      const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${dateStr} · ${timeStr}`;
    } catch (_) { return ''; }
  }

  // Auto-hide leading zero units: drop the largest units while they're 0 so a
  // short countdown (e.g. 1d 8h 3m 24s) doesn't show "0y 0mo …". Stops at the
  // first non-zero unit (internal/trailing zeros are kept) and always leaves at
  // least one unit. Respects manual toggles, since it only trims the units the
  // caller already enabled.
  function trimLeadingZeros(list) {
    if (!Array.isArray(list) || list.length <= 1) return list;
    let i = 0;
    while (i < list.length - 1 && Number(list[i].value) === 0) i++;
    return list.slice(i);
  }

  // Compact remaining string from a {unit,value}[] list: "1y 2mo 5d 03h 22m 18s".
  // Larger units (y/mo/d) are unpadded; h/m/s pad to two digits.
  function compactUnits(list) {
    return list.map(({ unit, value }) => {
      const v = (unit === 'hours' || unit === 'minutes' || unit === 'seconds') ? pad2(value) : String(value);
      return v + UNIT_SUFFIX[unit];
    }).join(' ');
  }

  // Decide how to present an item given the remaining ms, the expired mode, and
  // the enabled units. Returns { state, hide, label, units:[{unit,value}], zero:bool }.
  // Modes: 'started'(default, zeros + "Event Started"), 'stop'(freeze at zero),
  // 'elapsed'(count up), 'hide'/'remove'(omit from view).
  function present(remaining, mode, unitsCfg, targetMs, nowMs) {
    const now = (typeof nowMs === 'number') ? nowMs : Date.now();
    const target = (typeof targetMs === 'number') ? targetMs : now + remaining;
    const live = (r) => computeUnits(r, unitsCfg, target, target - r);
    if (remaining > 0) return { state: 'live', hide: false, label: null, units: live(remaining), zero: false };
    if (mode === 'hide' || mode === 'remove') return { state: 'expired', hide: true, label: null, units: computeUnits(0, unitsCfg, now, now), zero: true };
    if (mode === 'elapsed') return { state: 'expired', hide: false, label: 'Started', units: computeUnits(-remaining, unitsCfg, now, now + remaining), zero: false };
    if (mode === 'stop') return { state: 'expired', hide: false, label: null, units: computeUnits(0, unitsCfg, now, now), zero: true };
    return { state: 'expired', hide: false, label: 'Event Started', units: computeUnits(0, unitsCfg, now, now), zero: true };   // 'started'
  }

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(v) { return esc(v).replace(/"/g, '&quot;'); }

  // ── Per-widget display-unit controls ──────────────────────────────────────
  // Each of the six engine units has its own independent toggle.
  const UNIT_GROUPS = [
    ['years', 'Years', ['years']],
    ['months', 'Months', ['months']],
    ['days', 'Days', ['days']],
    ['hours', 'Hours', ['hours']],
    ['minutes', 'Minutes', ['minutes']],
    ['seconds', 'Seconds', ['seconds']],
  ];
  function groupEnabled(unitsArr, groupUnits) { return groupUnits.some((u) => unitsArr.includes(u)); }
  // Apply a group toggle to a units array and return a fresh, canonically-ordered
  // array. At least one unit always remains visible.
  function toggleGroup(unitsArr, groupUnits, on) {
    const set = new Set(unitsArr);
    groupUnits.forEach((u) => (on ? set.add(u) : set.delete(u)));
    let out = UNIT_ORDER.filter((u) => set.has(u));
    if (!out.length) out = groupUnits.slice();
    return out;
  }
  // Build the four unit toggles into `toolsEl`. `getUnits` returns the current
  // engine units array; `setUnits(newArr)` is called on each change. Uses the
  // shared ListCarousel.toggleRow styling when available, else a checkbox row.
  function buildUnitTools(toolsEl, getUnits, setUnits) {
    toolsEl.classList.add('cd-tools', 'cd-unit-tools');
    const mkToggle = (label, get, set) => {
      if (typeof ListCarousel !== 'undefined' && ListCarousel.toggleRow) return ListCarousel.toggleRow(label, get, set);
      const row = document.createElement('label');
      row.className = 'cfg-row cfg-row-inline';
      row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;cursor:pointer;';
      const span = document.createElement('span'); span.className = 'cfg-label'; span.textContent = label;
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!get();
      cb.addEventListener('change', () => set(cb.checked));
      row.append(span, cb);
      return row;
    };
    UNIT_GROUPS.forEach(([, label, gunits]) => {
      toolsEl.appendChild(mkToggle(label,
        () => groupEnabled(getUnits(), gunits),
        (on) => { setUnits(toggleGroup(getUnits(), gunits, on)); }));
    });
  }

  // ── Single big countdown ──────────────────────────────────────────────────
  class CountdownWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ items: [], itemId: null, expired: 'started', units: DEFAULT_UNITS.slice(), onConfigChange: null }, config || {});
      this.items = parseItems(this.cfg.items);
      this._tick = this._tick.bind(this);
      this._build();
    }
    start() { this.stop(); Ticker.add(this._tick); this._running = true; this._tick(); }
    stop() { Ticker.remove(this._tick); this._running = false; }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); this.items = parseItems(this.cfg.items); this._build(); this._tick(); }
    destroy() { this.stop(); if (this.el) this.el.innerHTML = ''; }

    // The configured item this widget shows: the one matching cfg.itemId (set when
    // a specific countdown was added from the picker), else the first item.
    _item() {
      if (this.cfg.itemId) { const m = this.items.find((it) => it.id === this.cfg.itemId); if (m) return m; }
      return this.items[0];
    }

    _build() {
      this.el.classList.add('countdown-widget', 'cd-single');
      const item = this._item();
      // The widget's title is the configured event name (the "Description"
      // entered for the countdown), not the generic widget name.
      this.el.innerHTML = `
        <div class="cd-header">
          <div class="cd-title">${esc(item ? item.name : 'Countdown')}</div>
          <div class="cd-sub">${item ? esc(formatTarget(item)) : ''}</div>
        </div>
        <div class="cd-body">
          <div class="cd-boxes"></div>
          <div class="cd-status" style="display:none"></div>
          <div class="cd-empty"${item ? ' style="display:none"' : ''}>No countdown configured — add one in the widget settings.</div>
        </div>`;
      this.boxesEl = this.el.querySelector('.cd-boxes');
      this.statusEl = this.el.querySelector('.cd-status');
      this.emptyEl = this.el.querySelector('.cd-empty');
      this._renderBoxes();
      if (!item) { this.boxesEl.style.display = 'none'; }
      this._buildTools();
    }
    // Render just the unit boxes (called on build and whenever units change, so
    // the control bar — which may have been moved into a Configure window — is
    // left untouched).
    _renderBoxes(unitsToShow) {
      this.units = normalizeUnits(this.cfg.units);   // the enabled set (manual toggles)
      const list = (Array.isArray(unitsToShow) && unitsToShow.length) ? unitsToShow : this.units;
      this._shownUnitKeys = list.join('|');
      this.boxesEl.style.gridTemplateColumns = `repeat(${list.length},1fr)`;
      this.boxesEl.innerHTML = list.map((u) =>
        `<div class="cd-box"><div class="cd-num" data-u="${u}">--</div><div class="cd-unit">${UNIT_LABELS[u]}</div></div>`).join('');
      this.numEls = {};
      list.forEach((u) => { this.numEls[u] = this.boxesEl.querySelector(`[data-u="${u}"]`); });
    }
    // Build the per-widget unit toggles — only when a config-change handler is
    // wired (i.e. a live dashboard widget). Samples/previews pass none, so they
    // render without controls and stay exactly as before.
    _buildTools() {
      if (typeof this.cfg.onConfigChange !== 'function') return;
      const tools = document.createElement('div');
      buildUnitTools(tools, () => this.units, (arr) => {
        this.cfg.units = arr;
        this._shownUnitKeys = '';   // force a box rebuild on the next tick
        this._renderBoxes(arr);
        this._tick();
        this.cfg.onConfigChange({ units: arr });
      });
      this.el.appendChild(tools);
      this.toolsEl = tools;
    }
    _tick() {
      const item = this._item();
      if (!item) return;
      const view = present(item.target - Date.now(), this.cfg.expired, this.units, item.target);
      if (view.hide) {
        this.boxesEl.style.display = 'none';
        this.statusEl.style.display = '';
        this.statusEl.textContent = 'Hidden (event passed)';
        return;
      }
      this.boxesEl.style.display = '';
      // Auto-hide leading zero units while counting down (e.g. hide Y/M for a
      // sub-month countdown). Rebuild the boxes only when the visible set changes.
      const showList = (view.state === 'live') ? trimLeadingZeros(view.units) : view.units;
      const keys = showList.map((x) => x.unit).join('|');
      if (keys !== this._shownUnitKeys) this._renderBoxes(showList.map((x) => x.unit));
      showList.forEach(({ unit, value }) => {
        const el = this.numEls[unit];
        if (!el) return;
        el.textContent = (unit === 'hours' || unit === 'minutes' || unit === 'seconds') ? pad2(value) : String(value);
      });
      this.el.classList.toggle('cd-expired', view.state === 'expired');
      if (view.label) { this.statusEl.style.display = ''; this.statusEl.textContent = view.label; }
      else { this.statusEl.style.display = 'none'; }
    }
  }

  // ── List of countdowns ────────────────────────────────────────────────────
  class CountdownListWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        items: [], expired: 'started', units: DEFAULT_UNITS.slice(),
        carousel: true, visibleCount: 5, speed: 24, mode: 'continuous', pauseMs: 1000,
        onConfigChange: null,
      }, config || {});
      this.items = parseItems(this.cfg.items);
      this.units = normalizeUnits(this.cfg.units);
      this._rows = new Map();      // id → { time, el }
      this._shownIds = '';         // signature of currently rendered items (for hide/remove)
      this._tick = this._tick.bind(this);
      this._build();
      if (typeof ListCarousel !== 'undefined') {
        this.carousel = new ListCarousel({
          root: this.el, viewport: this.viewport, track: this.track,
          enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount,
          speed: this.cfg.speed, mode: this.cfg.mode, pauseMs: this.cfg.pauseMs,
        });
        ListCarousel.buildControls(this.toolsEl, this.cfg, (patch) => {
          this.carousel.update(patch);
          if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
        });
      }
      // Per-widget display-unit toggles (live dashboard widgets only — samples
      // and previews pass no onConfigChange, so their look is unchanged).
      if (typeof this.cfg.onConfigChange === 'function' && this.toolsEl) {
        buildUnitTools(this.toolsEl, () => this.units, (arr) => {
          this.cfg.units = arr;
          this.units = normalizeUnits(arr);
          this._render(true);
          this._tick();
          this.cfg.onConfigChange({ units: arr });
        });
      }
    }
    start() { this.stop(); Ticker.add(this._tick); this._running = true; this._render(true); this._tick(); }
    stop() { Ticker.remove(this._tick); this._running = false; }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); this.items = parseItems(this.cfg.items); this.units = normalizeUnits(this.cfg.units); this._render(true); this._tick(); }
    destroy() { this.stop(); if (this.carousel) this.carousel.destroy(); if (this.el) this.el.innerHTML = ''; }

    _build() {
      this.el.classList.add('countdown-widget', 'cd-list');
      this.el.innerHTML = `
        <div class="cd-header">
          <div class="cd-l-title">Countdowns</div>
          <div class="cd-tools"></div>
        </div>
        <div class="cd-body">
          <div class="cd-empty" style="display:none">No countdowns configured — add some in the widget settings.</div>
          <div class="cd-viewport"><div class="cd-track"></div></div>
        </div>`;
      this.toolsEl = this.el.querySelector('.cd-tools');
      this.viewport = this.el.querySelector('.cd-viewport');
      this.track = this.el.querySelector('.cd-track');
      this.emptyEl = this.el.querySelector('.cd-empty');
    }
    // Which items are visible right now (drops hidden/expired-removed ones).
    _visible() {
      return this.items.filter((it) => !present(it.target - Date.now(), this.cfg.expired, this.units, it.target).hide);
    }
    // (Re)build the rows. `force` rebuilds regardless; otherwise only when the
    // visible set changed (so per-second ticks just update text, not the DOM).
    _render(force) {
      const vis = this._visible();
      const sig = vis.map((it) => it.id).join('|');
      if (!force && sig === this._shownIds) return;
      this._shownIds = sig;
      this._rows.clear();
      if (!vis.length) {
        this.emptyEl.style.display = '';
        this.viewport.style.display = 'none';
        this.track.innerHTML = '';
        return;
      }
      this.emptyEl.style.display = 'none';
      this.viewport.style.display = '';
      this.track.innerHTML = vis.map((it) => `
        <div class="cd-li" data-id="${escAttr(it.id)}">
          <div class="cd-li-main">
            <div class="cd-li-title" title="${escAttr(it.name)}">${esc(it.name)}</div>
          </div>
          <div class="cd-li-time">--</div>
        </div>`).join('');
      this.track.querySelectorAll('.cd-li').forEach((row) => {
        this._rows.set(row.dataset.id, { time: row.querySelector('.cd-li-time') });
      });
      if (this.carousel) this.carousel.layout();
    }
    _tick() {
      this._render(false);   // re-render only if the visible set changed
      this.items.forEach((it) => {
        const row = this._rows.get(it.id);
        if (!row) return;
        const view = present(it.target - Date.now(), this.cfg.expired, this.units, it.target);
        if (view.label && view.zero) {
          row.time.textContent = view.label;
          row.time.classList.add('cd-li-done');
        } else {
          // Auto-hide leading zero units (e.g. show "1d 8h 3m 24s", not "0y 0mo …").
          const list = (view.state === 'live') ? trimLeadingZeros(view.units) : view.units;
          row.time.textContent = (view.state === 'expired' && view.label ? '+' : '') + compactUnits(list);
          row.time.classList.toggle('cd-li-done', view.state === 'expired');
        }
      });
    }
  }

  global.CountdownApi = { parseItems, parts, present, formatTarget, calDiff, computeUnits, compactUnits, trimLeadingZeros, normalizeUnits, UNIT_ORDER, UNIT_LABELS, DEFAULT_UNITS };
  global.CountdownWidget = CountdownWidget;
  global.CountdownListWidget = CountdownListWidget;
})(typeof window !== 'undefined' ? window : this);
