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
    this.speed = Math.max(2, parseInt(opts.speed, 10) || 24);   // px / second
    this.resumeDelayMs = opts.resumeDelayMs != null ? opts.resumeDelayMs : 8000;

    this.offset = 0;           // current scroll offset (px), preserved across re-renders
    this._loopDist = 0;
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

    // Carousel ON + everything fits — no window, no scroll mechanism needed.
    if (!overflowing) {
      this.viewport.style.height = '';
      this.viewport.style.overflow = '';
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
    this._last = 0;
    this._raf = requestAnimationFrame(this._tick);
  };

  ListCarousel.prototype._tick = function (ts) {
    if (this.destroyed) return;
    if (!this._last) this._last = ts;
    const dt = ts - this._last; this._last = ts;
    if (!this._paused() && this._loopDist > 0) {
      this.offset += this.speed * dt / 1000;
      if (this.offset >= this._loopDist) this.offset -= this._loopDist;
      this.track.style.transform = `translateY(${-this.offset}px)`;
    }
    this._raf = requestAnimationFrame(this._tick);
  };

  ListCarousel.prototype._stop = function () { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } this._last = 0; };

  // Flag the host grid item so the dashboard's widget auto-fit leaves it alone
  // (used in OFF mode so the container doesn't grow to fit the full row list).
  ListCarousel.prototype._setAutoFitSuppressed = function (on) {
    const gi = (this.root && this.root.closest) ? this.root.closest('.grid-stack-item') : null;
    if (!gi) return;
    if (on) gi.dataset.lcNoFit = '1'; else delete gi.dataset.lcNoFit;
  };

  // Apply config changes (enabled / visibleCount / speed) and re-layout.
  ListCarousel.prototype.update = function (patch) {
    if (!patch) return;
    // `carousel` is the key buildControls/widgets persist; treat it as `enabled`
    // so the Scroll on/off toggle actually starts/stops the auto-scroll.
    if (patch.enabled != null) this.enabled = !!patch.enabled;
    if (patch.carousel != null) this.enabled = !!patch.carousel;
    if (patch.visibleCount != null) this.visibleCount = Math.max(1, parseInt(patch.visibleCount, 10) || this.visibleCount);
    if (patch.speed != null) this.speed = Math.max(2, parseInt(patch.speed, 10) || this.speed);
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

  // Build the standard carousel controls (Scroll on/off, Show count, Speed) into
  // `toolsEl`. `cfg` is mutated in place; `onChange(patch)` fires on each change.
  // Styling is inline + theme-aware; visibility is gated by `.lc-tools` CSS.
  ListCarousel.buildControls = function (toolsEl, cfg, onChange) {
    if (!toolsEl) return;
    toolsEl.classList.add('lc-tools');
    toolsEl.innerHTML = '';
    const S = {
      grp: 'display:inline-flex;align-items:center;gap:3px;',
      lbl: 'font-size:8.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);',
      btn: 'width:18px;height:18px;border-radius:5px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;font:700 12px/1 sans-serif;padding:0;',
      cnt: 'font-size:10px;color:var(--text-muted);min-width:26px;text-align:center;',
      tog: 'font-size:9.5px;font-weight:700;border-radius:5px;border:1px solid var(--border);background:var(--bg-secondary);color:var(--text-secondary);cursor:pointer;padding:3px 8px;',
    };
    const label = (t) => { const s = document.createElement('span'); s.style.cssText = S.lbl; s.textContent = t; return s; };

    // Scroll on/off — a non-interactive "Scroll" label + a clickable ON/OFF
    // action button. Only the button toggles; the label and anything else around
    // it do nothing. The button shows the ACTION: while scrolling it reads OFF
    // (click to stop); while stopped it reads ON (click to start).
    const g0 = document.createElement('span'); g0.style.cssText = S.grp;
    g0.appendChild(label('Scroll'));
    const tog = document.createElement('button'); tog.type = 'button'; tog.style.cssText = S.tog;
    const drawTog = () => {
      tog.textContent = cfg.carousel ? 'OFF' : 'ON';
      tog.title = cfg.carousel ? 'Turn auto-scroll off' : 'Turn auto-scroll on';
    };
    tog.addEventListener('click', (e) => {
      e.stopPropagation();                  // only this button changes state
      cfg.carousel = !cfg.carousel;
      drawTog();
      onChange({ carousel: cfg.carousel });
    });
    g0.appendChild(tog); drawTog(); toolsEl.appendChild(g0);

    const stepper = (lbl, key, min, max, step, suffix) => {
      const g = document.createElement('span'); g.style.cssText = S.grp;
      const dec = document.createElement('button'); dec.type = 'button'; dec.style.cssText = S.btn; dec.textContent = '−';
      const cnt = document.createElement('span'); cnt.style.cssText = S.cnt;
      const inc = document.createElement('button'); inc.type = 'button'; inc.style.cssText = S.btn; inc.textContent = '+';
      const draw = () => { cnt.textContent = cfg[key] + (suffix || ''); };
      const set = (v) => { cfg[key] = Math.max(min, Math.min(max, v)); draw(); const p = {}; p[key] = cfg[key]; onChange(p); };
      dec.addEventListener('click', () => set(cfg[key] - step));
      inc.addEventListener('click', () => set(cfg[key] + step));
      g.append(label(lbl), dec, cnt, inc); draw(); toolsEl.appendChild(g);
    };
    stepper('Show', 'visibleCount', 2, 12, 1, '');
    stepper('Speed', 'speed', 8, 96, 8, '');
  };

  global.ListCarousel = ListCarousel;
})(typeof window !== 'undefined' ? window : this);
