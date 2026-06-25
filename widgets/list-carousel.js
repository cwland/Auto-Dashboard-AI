// Auto Dashboard AI — ListCarousel
// ---------------------------------------------------------------------------
// A standardized, reusable auto-scroller for long vertical lists inside a
// fixed-size widget. Used across widgets so the behavior is consistent.
//
// Behavior:
//   • Sizes the viewport to exactly `visibleCount` items.
//   • If there are more items than fit, scrolls continuously bottom→top with a
//     seamless loop (a clone of the items follows the originals).
//   • Pauses immediately on hover; resumes when the cursor leaves.
//   • pauseForAction()/resumeAfterAction() hold scrolling during an interactive
//     action, then resume only after a 5s delay AND once the cursor has left.
//
// Usage (widget renders its rows into a stable `track` element):
//   this.carousel = new ListCarousel({ root: this.el, viewport, track,
//                                      enabled, visibleCount, speed });
//   ... after (re)rendering rows: this.carousel.layout();
//   ... on config change:        this.carousel.update({ visibleCount, speed, enabled });
//   ... on destroy:              this.carousel.destroy();
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  function ListCarousel(opts) {
    opts = opts || {};
    this.root = opts.root || opts.viewport;
    this.viewport = opts.viewport;
    this.track = opts.track;
    this.enabled = opts.enabled !== false;
    this.visibleCount = Math.max(1, parseInt(opts.visibleCount, 10) || 5);
    this.speed = Math.max(5, parseInt(opts.speed, 10) || 25);   // px / second
    this.resumeDelayMs = opts.resumeDelayMs != null ? opts.resumeDelayMs : 8000;
    // Scroll mode: 'continuous' (steady) or 'pause' (advance one record, then
    // hold at the lock point for pauseMs before advancing to the next).
    this.mode = opts.mode === 'pause' ? 'pause' : 'continuous';
    this.pauseMs = Math.max(500, Math.min(10000, parseInt(opts.pauseMs, 10) || 1000));

    this.offset = 0;           // current scroll offset (px), preserved across re-renders
    this._loopDist = 0;
    this._bounds = null;       // per-record cumulative lock positions (pause mode)
    this._bIdx = 1;            // index of the boundary currently being approached
    this._pausing = false; this._pauseUntil = 0;
    this._raf = null; this._last = 0;
    this.hovering = false; this.actionHold = false; this._holdTimer = null;
    this.destroyed = false;

    this._tick = this._tick.bind(this);
    this._onEnter = () => { this.hovering = true; };
    this._onLeave = () => { this.hovering = false; };
    if (this.root) {
      this.root.addEventListener('mouseenter', this._onEnter);
      this.root.addEventListener('mouseleave', this._onLeave);
    }
    this._bindDrag();
  }

  ListCarousel.prototype._paused = function () { return this.hovering || this.actionHold; };
  ListCarousel.prototype._wrap = function (v) { const d = this._loopDist; return d > 0 ? (((v % d) + d) % d) : 0; };

  // Click-and-drag to manually scroll through the records (works even while the
  // auto-scroll is paused on hover). A real drag suppresses the trailing click
  // so it never triggers an action button it happened to start/end on.
  ListCarousel.prototype._bindDrag = function () {
    if (!this.viewport) return;
    this._dragPid = null; this._didDrag = false; this._suppressClick = false;
    this._onDown = (e) => {
      if (this._loopDist <= 0) return;
      // A scrollable list handles its own drag — stop it bubbling so the grid's
      // whole-widget drag (edit mode) doesn't also fire on the list area.
      e.stopPropagation();
      this._dragPid = e.pointerId; this._dragY = e.clientY; this._dragOff = this.offset; this._didDrag = false;
      this.viewport.style.cursor = 'grabbing';
    };
    this._onMove = (e) => {
      if (this._dragPid == null) return;
      const dy = e.clientY - this._dragY;
      if (!this._didDrag && Math.abs(dy) < 4) return;
      this._didDrag = true;
      if (e.cancelable) e.preventDefault();
      this.offset = this._wrap(this._dragOff - dy);
      if (this.track) this.track.style.transform = `translateY(${-this.offset}px)`;
    };
    this._onUp = () => {
      if (this._dragPid == null) return;
      this._dragPid = null;
      this.viewport.style.cursor = this._loopDist > 0 ? 'grab' : '';
      if (this._didDrag) { this._suppressClick = true; setTimeout(() => { this._suppressClick = false; }, 60); }
    };
    this._onClickCapture = (e) => { if (this._suppressClick) { e.stopPropagation(); e.preventDefault(); } };
    this.viewport.addEventListener('pointerdown', this._onDown);
    this.viewport.addEventListener('pointermove', this._onMove);
    global.addEventListener('pointerup', this._onUp);
    this.viewport.addEventListener('click', this._onClickCapture, true);
  };

  // Measure items, size the viewport to `visibleCount`, clone for a seamless
  // loop, and (re)start. Safe to call on every render — scroll offset persists.
  ListCarousel.prototype.layout = function () {
    if (this.destroyed || !this.track || !this.viewport) return;
    this._stop();
    // Drop any clones from a previous layout.
    Array.from(this.track.querySelectorAll('[data-cc]')).forEach((n) => n.remove());

    const items = Array.from(this.track.children).filter((n) => !n.hasAttribute('data-cc'));
    if (!items.length) { this.viewport.style.height = ''; this.track.style.transform = ''; return; }

    const firstH = items[0].getBoundingClientRect().height;
    if (firstH < 4) { requestAnimationFrame(() => this.layout()); return; }   // not laid out yet

    const cs = getComputedStyle(this.track);
    const gap = parseFloat(cs.rowGap || cs.gap || '0') || 0;
    const n = items.length;
    const sumH = items.reduce((s, el) => s + el.getBoundingClientRect().height, 0);
    this._loopDist = 0;

    // Carousel OFF → ignore the visible-item limit ENTIRELY. Every row stays
    // rendered (no slicing/window); the widget's own scrollable body (flex:1 +
    // overflow:auto) provides a native scrollbar. Auto-fit is suppressed so the
    // widget container does NOT grow to fit them all.
    if (!this.enabled) {
      this.viewport.style.height = '';
      this.viewport.style.overflow = 'visible';
      this.viewport.style.cursor = '';
      this.viewport.style.touchAction = '';
      this.track.style.transform = '';
      this.offset = 0;
      this._setAutoFitSuppressed(true);
      return;
    }
    this._setAutoFitSuppressed(false);

    const overflowing = n > this.visibleCount;

    // Carousel ON + everything fits — no scroll needed, but still RESERVE space
    // for the full `visibleCount` rows. This keeps the widget a stable size: it
    // won't auto-shrink below the configured row count when fewer items are
    // present (e.g. a Tautulli streams list with only 1 of 2 streams playing).
    if (!overflowing) {
      const vis = this.visibleCount;
      this.viewport.style.height = (vis * firstH + gap * (vis - 1)) + 'px';
      this.viewport.style.overflow = 'hidden';
      this.viewport.style.cursor = '';
      this.viewport.style.touchAction = '';
      this.track.style.transform = '';
      this.offset = 0;
      return;
    }

    // Carousel ON + overflowing → fixed window of exactly `visibleCount` items,
    // no scrollbar; drag + continuous auto-scroll with a seamless clone.
    const vis = Math.min(this.visibleCount, n);
    this.viewport.style.height = (vis * firstH + gap * (vis - 1)) + 'px';
    this.viewport.style.overflow = 'hidden';
    this.viewport.style.cursor = 'grab';
    this.viewport.style.touchAction = 'pan-x';
    items.forEach((el) => { const c = el.cloneNode(true); c.setAttribute('data-cc', ''); this.track.appendChild(c); });
    this._loopDist = sumH + gap * n;
    if (this._loopDist <= 0) return;
    this.offset = ((this.offset % this._loopDist) + this._loopDist) % this._loopDist;
    this.track.style.transform = `translateY(${-this.offset}px)`;

    // Pause mode: cumulative lock positions (one per record top). _bounds[i] is
    // the offset at which record i sits at the top of the viewport; _bounds[n]
    // equals _loopDist (the seamless wrap point).
    this._bounds = [0];
    let acc = 0;
    items.forEach((el) => { acc += el.getBoundingClientRect().height + gap; this._bounds.push(acc); });
    let idx = this._bounds.findIndex((b) => b > this.offset + 0.5);
    this._bIdx = (idx < 0) ? 1 : idx;
    this._pausing = true; this._pauseUntil = 0;   // settle at the current lock, then advance

    this._last = 0;
    this._raf = requestAnimationFrame(this._tick);
  };

  ListCarousel.prototype._tick = function (ts) {
    if (this.destroyed) return;
    if (!this._last) this._last = ts;
    const dt = ts - this._last; this._last = ts;
    if (!this._paused() && this._loopDist > 0) {
      if (this.mode === 'pause' && this._bounds && this._bounds.length > 1) {
        this._tickPause(ts, dt);
      } else {
        this.offset += this.speed * dt / 1000;
        if (this.offset >= this._loopDist) this.offset -= this._loopDist;
        this.track.style.transform = `translateY(${-this.offset}px)`;
      }
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  // Pause mode: glide to the next record's lock point, hold for pauseMs, repeat.
  ListCarousel.prototype._tickPause = function (ts, dt) {
    if (this._pausing) {
      if (!this._pauseUntil) this._pauseUntil = ts + this.pauseMs;
      if (ts >= this._pauseUntil) { this._pausing = false; this._pauseUntil = 0; }
      return;   // perfectly stationary during the pause
    }
    const target = this._bounds[this._bIdx];
    this.offset += this.speed * dt / 1000;
    if (this.offset >= target) {
      this.offset = target;            // exact, consistent stop at the lock point
      this._pausing = true; this._pauseUntil = 0;
      this._bIdx++;
      if (this.offset >= this._loopDist - 0.5) {  // reached the wrap point → seamless reset
        this.offset -= this._loopDist;
        this._bIdx = 1;
      }
    }
    this.track.style.transform = `translateY(${-this.offset}px)`;
  };

  ListCarousel.prototype._stop = function () { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } this._last = 0; };

  // Flag the host grid item so the dashboard's widget auto-fit leaves it alone
  // (used in OFF mode so the container doesn't grow to fit the full row list).
  ListCarousel.prototype._setAutoFitSuppressed = function (on) {
    const gi = (this.root && this.root.closest) ? this.root.closest('.grid-stack-item') : null;
    if (!gi) return;
    if (on) {
      gi.dataset.lcNoFit = '1';                 // OFF: keep size, manual scrollbar
    } else {
      delete gi.dataset.lcNoFit;
      delete gi.dataset.manualSize;             // ON: always auto-sized to the visible-count
      // Ask the dashboard to snap this widget to exactly (header + visibleCount lines).
      try { gi.dispatchEvent(new CustomEvent('lc-relayout', { bubbles: true })); } catch (_) {}
    }
  };

  // Apply config changes (enabled / visibleCount / speed) and re-layout.
  ListCarousel.prototype.update = function (patch) {
    if (!patch) return;
    // `carousel` is the key buildControls/widgets persist; treat it as `enabled`
    // so the Scroll on/off toggle actually starts/stops the auto-scroll.
    if (patch.enabled != null) this.enabled = !!patch.enabled;
    if (patch.carousel != null) this.enabled = !!patch.carousel;
    if (patch.visibleCount != null) this.visibleCount = Math.max(1, parseInt(patch.visibleCount, 10) || this.visibleCount);
    if (patch.speed != null) this.speed = Math.max(5, parseInt(patch.speed, 10) || this.speed);
    if (patch.mode != null) this.mode = patch.mode === 'pause' ? 'pause' : 'continuous';
    if (patch.pauseMs != null) this.pauseMs = Math.max(500, Math.min(10000, parseInt(patch.pauseMs, 10) || this.pauseMs));
    this.layout();
  };

  // Interactive-action protection: pause now, resume only after a delay AND
  // once the cursor has left the widget.
  ListCarousel.prototype.pauseForAction = function () {
    this.actionHold = true;
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
  };
  ListCarousel.prototype.resumeAfterAction = function () {
    if (this._holdTimer) clearTimeout(this._holdTimer);
    // After the delay, drop the action hold. Hover (if still present) keeps it
    // paused via _paused(), so scrolling only resumes once both are clear.
    this._holdTimer = setTimeout(() => { this.actionHold = false; this._holdTimer = null; }, this.resumeDelayMs);
  };

  ListCarousel.prototype.destroy = function () {
    this.destroyed = true;
    this._setAutoFitSuppressed(false);   // never leave the grid item flagged
    this._stop();
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    if (this.root) {
      this.root.removeEventListener('mouseenter', this._onEnter);
      this.root.removeEventListener('mouseleave', this._onLeave);
    }
    if (this.viewport) {
      this.viewport.removeEventListener('pointerdown', this._onDown);
      this.viewport.removeEventListener('pointermove', this._onMove);
      this.viewport.removeEventListener('click', this._onClickCapture, true);
    }
    global.removeEventListener('pointerup', this._onUp);
  };

  // A small "ⓘ" help icon with a custom hover tooltip (the native `title` was
  // slow/unreliable and clipped). The tooltip is appended to <body> so the
  // config window's overflow can't hide it. Returns null when no help text.
  ListCarousel.helpIcon = function (text) {
    if (!text) return null;
    const i = document.createElement('span');
    i.className = 'cfg-info';
    i.textContent = 'i';
    i.setAttribute('aria-label', text);
    let tip = null;
    const hide = () => { if (tip) { tip.remove(); tip = null; } };
    const show = () => {
      hide();
      tip = document.createElement('div');
      tip.className = 'cfg-tip';
      tip.textContent = text;
      document.body.appendChild(tip);
      const r = i.getBoundingClientRect(), t = tip.getBoundingClientRect();
      let left = r.left + r.width / 2 - t.width / 2;
      left = Math.max(8, Math.min(left, (global.innerWidth || 1024) - t.width - 8));
      let top = r.top - t.height - 8;
      if (top < 8) top = r.bottom + 8;               // flip below if no room above
      tip.style.left = left + 'px';
      tip.style.top = top + 'px';
    };
    i.addEventListener('mouseenter', show);
    i.addEventListener('mouseleave', hide);
    i.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
    return i;
  };
  function labelEl(label, help) {
    const lab = document.createElement('span'); lab.className = 'cfg-label'; lab.textContent = label;
    const info = ListCarousel.helpIcon(help);
    if (info) lab.appendChild(info);
    return lab;
  }

  // A labelled slider row for the config window. get()/set(v) read+write the
  // value; fmt(v) optionally formats the readout; help shows a tooltip icon.
  // Returns a .cfg-row element.
  ListCarousel.sliderRow = function (label, get, min, max, step, set, fmt, help) {
    const row = document.createElement('div'); row.className = 'cfg-row';
    const top = document.createElement('div'); top.className = 'cfg-row-top';
    const lab = labelEl(label, help);
    const val = document.createElement('span'); val.className = 'cfg-value';
    const rng = document.createElement('input'); rng.type = 'range';
    rng.min = min; rng.max = max; rng.step = step; rng.value = get();
    const draw = () => { val.textContent = fmt ? fmt(Number(rng.value)) : String(rng.value); };
    rng.addEventListener('input', () => { set(Number(rng.value)); draw(); });
    top.append(lab, val); row.append(top, rng); draw();
    return row;
  };

  // An on/off toggle-switch row. Returns a .cfg-row element.
  ListCarousel.toggleRow = function (label, get, set, help) {
    const row = document.createElement('div'); row.className = 'cfg-row cfg-row-inline';
    const lab = labelEl(label, help);
    const sw = document.createElement('button'); sw.type = 'button'; sw.className = 'cfg-switch';
    const knob = document.createElement('span'); knob.className = 'cfg-knob'; sw.appendChild(knob);
    const draw = () => { sw.classList.toggle('on', !!get()); sw.setAttribute('aria-pressed', String(!!get())); };
    sw.addEventListener('click', (e) => { e.preventDefault(); set(!get()); draw(); });
    row.append(lab, sw); draw();
    return row;
  };

  // A segmented control row (mutually-exclusive options). Returns a .cfg-row.
  ListCarousel.segmentRow = function (label, get, options, set, help) {
    const row = document.createElement('div'); row.className = 'cfg-row cfg-row-inline';
    const lab = labelEl(label, help);
    const seg = document.createElement('div'); seg.className = 'cfg-seg';
    const draw = () => { seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(get()))); };
    options.forEach(([v, t]) => {
      const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.textContent = t;
      b.addEventListener('click', (e) => { e.preventDefault(); set(v); draw(); });
      seg.appendChild(b);
    });
    row.append(lab, seg); draw();
    return row;
  };

  // Build the standard carousel controls (Auto-scroll, Scroll mode, Pause, Show,
  // Speed) into `toolsEl`. `cfg` is mutated in place; `onChange(patch)` fires on
  // each change. Rendered as slider/toggle/segment rows for the config window.
  ListCarousel.buildControls = function (toolsEl, cfg, onChange) {
    if (!toolsEl) return;
    toolsEl.classList.add('lc-tools');
    toolsEl.innerHTML = '';
    toolsEl.appendChild(ListCarousel.toggleRow('Auto-scroll', () => !!cfg.carousel, (on) => { cfg.carousel = on; onChange({ carousel: on }); },
      'Automatically scroll the list when there are more items than fit. Off = a normal scrollbar.'));

    // Scroll mode + (conditional) pause duration.
    let pauseRow;
    toolsEl.appendChild(ListCarousel.segmentRow('Scroll mode',
      () => (cfg.mode === 'pause' ? 'pause' : 'continuous'),
      [['continuous', 'Continuous'], ['pause', 'Pause']],
      (v) => { cfg.mode = v; onChange({ mode: v }); if (pauseRow) pauseRow.style.display = v === 'pause' ? '' : 'none'; },
      'Continuous = smooth constant glide. Pause = step to each item and pause on it.'));
    pauseRow = ListCarousel.sliderRow('Pause', () => (cfg.pauseMs || 1000) / 1000, 0.5, 10, 0.5,
      (v) => { cfg.pauseMs = Math.round(v * 1000); onChange({ pauseMs: cfg.pauseMs }); }, (v) => v.toFixed(1) + 's',
      'How long to pause on each item (Pause mode only).');
    pauseRow.style.display = cfg.mode === 'pause' ? '' : 'none';
    toolsEl.appendChild(pauseRow);

    toolsEl.appendChild(ListCarousel.sliderRow('Show', () => cfg.visibleCount, 1, 12, 1, (v) => { cfg.visibleCount = v; onChange({ visibleCount: v }); }, null,
      'How many rows are visible at once.'));
    toolsEl.appendChild(ListCarousel.sliderRow('Speed', () => cfg.speed, 5, 100, 5, (v) => { cfg.speed = v; onChange({ speed: v }); }, null,
      'Scrolling speed — higher is faster.'));
  };

  global.ListCarousel = ListCarousel;
})(typeof window !== 'undefined' ? window : this);
