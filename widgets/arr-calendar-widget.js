// Auto Dashboard AI — Sonarr / Radarr Calendar Widget (reusable component)
// ---------------------------------------------------------------------------
// Sonarr and Radarr expose nearly identical calendar APIs, so this file holds
// ONE engine (ArrCalendarApi + ArrCalendarWidget) plus two thin per-service
// wrappers (SonarrWidget / RadarrWidget). Each widget can show two views:
//
//   • "upcoming" — a compact list of the next releases (poster, title, badge)
//   • "calendar" — a month grid with per-day release dots; click a day to see
//                  that day's releases
//
// Like the other widgets it is framework-free and self-contained: instantiate
// with a container + config, call start(), and call destroy() when done.
//
//   const w = new SonarrWidget(el, { baseUrl, apiKey, view: 'upcoming' });
//   w.start();  ...  w.destroy();
//
// Exposed on window as ArrCalendarApi, ArrCalendarWidget, SonarrWidget, RadarrWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The calendar fetching, event mapping (episode → SxxExx event; movie → one
// event per release type), image-priority selection and IMDb/app links are
// adapted from the Homarr project's Sonarr and Radarr integrations, and the
// month-grid view follows Homarr's calendar widget as a reference template.
// Homarr is licensed under the Apache License 2.0.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. This file is modified from the original
// (rewritten from TypeScript/React to framework-free JS).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  // Image quality priority (Homarr's mediaOrganizerPriorities) — earlier = better.
  const MEDIA_PRIORITIES = [
    'cover', 'poster', 'banner', 'disc', 'logo',
    'fanart', 'screenshot', 'clearlogo', 'headshot', 'unknown',
  ];

  const RADARR_RELEASE_TYPES = ['inCinemas', 'digitalRelease', 'physicalRelease'];
  const RELEASE_LABEL = {
    inCinemas: 'In cinemas',
    digitalRelease: 'Digital',
    physicalRelease: 'Physical',
  };

  // ─── Date helpers ───────────────────────────────────────────────────────────
  const D = {
    startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; },
    startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); },
    endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); },
    addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); },
    sameDay(a, b) {
      return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
    },
    monthLabel(d) { return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); },
    dayLabel(d) { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); },
    shortDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); },
  };

  // ─── API helper (engine) ────────────────────────────────────────────────────
  const ArrCalendarApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // Sort a list of {coverType, remoteUrl} by quality and return the best URL.
    chooseBestImageUrl(images) {
      const list = (images || []).filter((i) => i && i.remoteUrl);
      if (!list.length) return null;
      const rank = (t) => {
        const i = MEDIA_PRIORITIES.indexOf(t);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      const sorted = list.slice().sort((a, b) => rank(a.coverType) - rank(b.coverType));
      return sorted[0].remoteUrl;
    },

    buildCalendarUrl(base, opts) {
      const o = opts || {};
      const params = new URLSearchParams();
      if (o.start) params.set('start', new Date(o.start).toISOString());
      if (o.end) params.set('end', new Date(o.end).toISOString());
      params.set('unmonitored', String(o.showUnmonitored !== false));
      if (o.service === 'sonarr') {
        params.set('includeSeries', 'true');
        params.set('includeEpisodeImages', 'true');
      }
      return `${this.normalizeBase(base)}/api/v3/calendar?${params.toString()}`;
    },

    // Map one Sonarr episode → one normalized event.
    mapSonarrEvent(ev) {
      const series = ev.series || {};
      const imageUrl = this.chooseBestImageUrl([...(ev.images || []), ...(series.images || [])]);
      const links = [];
      if (series.titleSlug) links.push({ name: 'Sonarr', href: `/series/${series.titleSlug}` });
      if (series.imdbId) links.push({ name: 'IMDb', href: `https://www.imdb.com/title/${series.imdbId}/` });
      return [{
        id: `sonarr-${series.titleSlug || ev.title}-${ev.seasonNumber}-${ev.episodeNumber}`,
        service: 'sonarr',
        title: ev.title,
        subTitle: series.title || null,
        description: series.overview || null,
        startDate: new Date(ev.airDateUtc),
        imageUrl,
        badge: { text: `S${ev.seasonNumber}·E${ev.episodeNumber}`, color: 'red' },
        indicatorColor: 'blue',
        releaseType: null,
        links,
      }];
    },

    // Map one Radarr movie → one event PER populated release type.
    mapRadarrEvent(ev, releaseTypes) {
      const types = (releaseTypes && releaseTypes.length) ? releaseTypes : RADARR_RELEASE_TYPES;
      const imageUrl = this.chooseBestImageUrl(ev.images);
      const links = [];
      if (ev.titleSlug) links.push({ name: 'Radarr', href: `/movie/${ev.titleSlug}` });
      if (ev.imdbId) links.push({ name: 'IMDb', href: `https://www.imdb.com/title/${ev.imdbId}/` });

      return types
        .map((type) => ({ type, date: ev[type] }))
        .filter((item) => item.date != null && item.date !== '')
        .map((item) => ({
          id: `radarr-${ev.titleSlug || ev.title}-${item.type}`,
          service: 'radarr',
          title: ev.title,
          subTitle: ev.originalTitle || null,
          description: ev.overview || null,
          startDate: new Date(item.date),
          imageUrl,
          badge: { text: RELEASE_LABEL[item.type] || item.type, color: 'yellow' },
          indicatorColor: 'yellow',
          releaseType: item.type,
          links,
        }));
    },

    // Map a raw calendar response array → normalized events (faithful to Homarr).
    mapEvents(rawArray, service, opts) {
      const arr = Array.isArray(rawArray) ? rawArray : [];
      const o = opts || {};
      const out = [];
      for (const ev of arr) {
        const mapped = service === 'radarr'
          ? this.mapRadarrEvent(ev, o.releaseTypes)
          : this.mapSonarrEvent(ev);
        for (const m of mapped) {
          if (m.startDate instanceof Date && !isNaN(m.startDate)) out.push(m);
        }
      }
      out.sort((a, b) => a.startDate - b.startDate);
      return out;
    },

    async fetchEvents(base, apiKey, range, service, opts, signal) {
      const url = this.buildCalendarUrl(base, {
        start: range.start, end: range.end, service,
        showUnmonitored: opts && opts.showUnmonitored,
      });
      const res = await fetch(url, {
        cache: 'no-store',
        headers: { 'X-Api-Key': apiKey || '' },
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let json;
      try { json = await res.json(); }
      catch { throw new Error(`Invalid response from ${service}`); }
      if (!Array.isArray(json)) throw new Error(`Invalid calendar response from ${service}`);
      return this.mapEvents(json, service, opts);
    },

    // Validate URL + key. Hits /api/v3/system/status, which requires the key.
    async testConnection(base, apiKey, service, signal) {
      const url = `${this.normalizeBase(base)}/api/v3/system/status`;
      const res = await fetch(url, { headers: { 'X-Api-Key': apiKey || '' }, signal });
      if (res.status === 401) throw new Error('invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let data;
      try { data = await res.json(); } catch { data = {}; }
      return data; // { version, appName, ... }
    },
  };

  // ─── Widget ─────────────────────────────────────────────────────────────────
  class ArrCalendarWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        {
          service: 'sonarr',
          baseUrl: '',
          apiKey: '',
          pollMs: 300000,
          view: 'upcoming',          // 'upcoming' | 'calendar'
          upcomingCount: 8,
          lookaheadDays: 90,
          showUnmonitored: true,
          releaseTypes: RADARR_RELEASE_TYPES.slice(), // radarr only
          // Shared ListCarousel scroll settings (same as the Seerr/list widgets).
          carousel: true, visibleCount: 5, speed: 18, mode: 'continuous', pauseMs: 2000,
          onConfigChange: null,
          dataProvider: null,        // optional offline override: (range, service, opts) => Promise<events>
        },
        config || {}
      );

      this.events = [];
      this.view = this.cfg.view === 'calendar' ? 'calendar' : 'upcoming';
      this.month = D.startOfMonth(new Date());
      this.selectedDay = null;
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this.carousel = null;

      this._buildSkeleton();
      this._initCarousel();
    }

    // ── lifecycle ──────────────────────────────────────────────────────────
    start() {
      this.stop();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), Math.max(15000, this.cfg.pollMs));
    }

    stop() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.abort) { this.abort.abort(); this.abort = null; }
    }

    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      if (patch && patch.view) this.view = patch.view === 'calendar' ? 'calendar' : 'upcoming';
      if (this.carousel && patch) this.carousel.update(patch);   // live scroll changes
      // A config change may alter the fetch range or mapping → refresh.
      if (this.pollTimer || this.cfg.dataProvider) this.poll();
      else this._render();
    }

    destroy() {
      this.destroyed = true;
      this.stop();
      if (this.carousel) { try { this.carousel.destroy(); } catch (_) {} this.carousel = null; }
      this.el.innerHTML = '';
    }

    // ── view controls ────────────────────────────────────────────────────────
    setView(view) {
      this.view = view === 'calendar' ? 'calendar' : 'upcoming';
      this.selectedDay = null;
      this.cfg.view = this.view;
      if (this.cfg.onConfigChange) this.cfg.onConfigChange({ view: this.view });
      this.poll();
    }

    prevMonth() { this.month = D.addMonths(this.month, -1); this.selectedDay = null; this.poll(); }
    nextMonth() { this.month = D.addMonths(this.month, 1); this.selectedDay = null; this.poll(); }

    _opts() {
      return { showUnmonitored: this.cfg.showUnmonitored, releaseTypes: this.cfg.releaseTypes };
    }

    _currentRange() {
      if (this.view === 'calendar') {
        return { start: D.startOfMonth(this.month), end: D.endOfMonth(this.month) };
      }
      const start = D.startOfDay(new Date());
      return { start, end: D.addDays(start, this.cfg.lookaheadDays) };
    }

    // ── data ─────────────────────────────────────────────────────────────────
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      const range = this._currentRange();
      try {
        const events = this.cfg.dataProvider
          ? await this.cfg.dataProvider(range, this.cfg.service, this._opts())
          : await ArrCalendarApi.fetchEvents(
              this.cfg.baseUrl, this.cfg.apiKey, range, this.cfg.service, this._opts(),
              this.abort && this.abort.signal
            );
        this._clearError();
        this.events = events || [];
        this._render();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    // ── DOM ────────────────────────────────────────────────────────────────────
    _buildSkeleton() {
      this.el.classList.add('arr-calendar-widget', `arr-${this.cfg.service}`);
      this.el.innerHTML = `
        <div class="arr-header">
          <img class="wg-icon" src="../icons/integrations/${this.cfg.service === 'radarr' ? 'radarr' : 'sonarr'}.svg" alt="">
          <div class="arr-title"></div>
          <div class="arr-tools">
            <div class="arr-error" style="display:none"></div>
            <div class="lc-tools"></div>
          </div>
        </div>
        <div class="arr-body">
          <div class="arr-empty" style="display:none"></div>
          <div class="arr-viewport"><div class="arr-track"></div></div>
          <div class="arr-cal-wrap" style="display:none"></div>
        </div>`;
      this.titleEl = this.el.querySelector('.arr-title');
      this.errorEl = this.el.querySelector('.arr-error');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
      this.body = this.el.querySelector('.arr-body');
      this.emptyEl = this.el.querySelector('.arr-empty');
      this.viewport = this.el.querySelector('.arr-viewport');
      this.track = this.el.querySelector('.arr-track');
      this.calWrap = this.el.querySelector('.arr-cal-wrap');

      this.titleEl.textContent = this.cfg.service === 'radarr' ? 'Radarr — Movies' : 'Sonarr — Episodes';
    }

    // Wire the ListCarousel scroll behaviour and build the config-window controls
    // (an Upcoming/Calendar switch above the shared scroll sliders).
    _initCarousel() {
      if (typeof ListCarousel === 'undefined' || !this.viewport || !this.track) return;
      this.carousel = new ListCarousel({
        root: this.el, viewport: this.viewport, track: this.track,
        enabled: this.cfg.carousel !== false && this.view === 'upcoming',
        visibleCount: this.cfg.visibleCount, speed: this.cfg.speed,
        mode: this.cfg.mode, pauseMs: this.cfg.pauseMs,
      });
      if (this.lcToolsEl && ListCarousel.buildControls) {
        ListCarousel.buildControls(this.lcToolsEl, this.cfg, (patch) => {
          if (this.carousel) this.carousel.update(patch);
          if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
        });
        if (ListCarousel.segmentRow) {
          const viewRow = ListCarousel.segmentRow('View',
            () => this.view,
            [['upcoming', 'Upcoming'], ['calendar', 'Calendar']],
            (v) => this.setView(v));
          this.lcToolsEl.insertBefore(viewRow, this.lcToolsEl.firstChild);
        }
      }
    }

    _render() {
      if (this.view === 'calendar') this._renderCalendar();
      else this._renderUpcoming();
    }

    _eventRowHtml(ev) {
      const poster = ev.imageUrl
        ? `<div class="arr-poster"><img alt="" loading="lazy" src="${escapeAttr(ev.imageUrl)}"></div>`
        : `<div class="arr-poster arr-poster-empty">${this.cfg.service === 'radarr' ? '🎬' : '📺'}</div>`;
      const badge = ev.badge
        ? `<span class="arr-badge arr-badge-${ev.badge.color}">${escapeHtml(ev.badge.text)}</span>`
        : '';
      const sub = ev.subTitle ? `<span class="arr-row-sub">${escapeHtml(ev.subTitle)}</span>` : '';
      return `
        <div class="arr-row">
          ${poster}
          <div class="arr-row-main">
            <div class="arr-row-titleline">
              <span class="arr-row-title">${escapeHtml(ev.title)}</span>
              ${badge}
            </div>
            ${sub}
          </div>
          <div class="arr-row-date">${escapeHtml(D.shortDate(ev.startDate))}</div>
        </div>`;
    }

    _renderUpcoming() {
      this.calWrap.style.display = 'none';
      this.calWrap.innerHTML = '';
      if (this.carousel) this.carousel.update({ enabled: this.cfg.carousel !== false });
      const today = D.startOfDay(new Date());
      // Render the full upcoming list (capped) into the carousel; the "Show"
      // slider controls how many are visible at once.
      const upcoming = this.events
        .filter((e) => e.startDate >= today)
        .slice(0, 40);

      if (!upcoming.length) {
        this.emptyEl.style.display = '';
        this.emptyEl.textContent = `No upcoming releases in the next ${this.cfg.lookaheadDays} days.`;
        this.viewport.style.display = 'none';
        this.track.innerHTML = '';
        return;
      }
      this.emptyEl.style.display = 'none';
      this.viewport.style.display = '';
      this.track.innerHTML = upcoming.map((e) => this._eventRowHtml(e)).join('');
      if (this.carousel) this.carousel.layout();
    }

    _renderCalendar() {
      this.viewport.style.display = 'none';
      if (this.carousel) this.carousel.update({ enabled: false });   // no scroll in calendar view
      this.emptyEl.style.display = 'none';
      this.calWrap.style.display = '';
      const month = this.month;
      const first = D.startOfMonth(month);
      const startWeekday = first.getDay(); // 0 = Sunday
      const daysInMonth = D.endOfMonth(month).getDate();
      const today = new Date();

      // Bucket events by day-of-month for the displayed month.
      const byDay = {};
      for (const ev of this.events) {
        if (ev.startDate.getFullYear() === month.getFullYear() && ev.startDate.getMonth() === month.getMonth()) {
          const day = ev.startDate.getDate();
          (byDay[day] = byDay[day] || []).push(ev);
        }
      }

      const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let cells = '';
      for (let i = 0; i < startWeekday; i++) cells += `<div class="arr-cell arr-cell-empty"></div>`;
      for (let day = 1; day <= daysInMonth; day++) {
        const evs = byDay[day] || [];
        const date = new Date(month.getFullYear(), month.getMonth(), day);
        const isToday = D.sameDay(date, today);
        const isSel = this.selectedDay === day;
        const dots = evs.length
          ? `<span class="arr-dot"></span>${evs.length > 1 ? `<span class="arr-count">${evs.length}</span>` : ''}`
          : '';
        cells += `
          <button type="button" class="arr-cell${evs.length ? ' arr-has' : ''}${isToday ? ' arr-today' : ''}${isSel ? ' arr-selected' : ''}"
            data-day="${day}" ${evs.length ? '' : 'tabindex="-1"'}>
            <span class="arr-cell-num">${day}</span>
            <span class="arr-cell-dots">${dots}</span>
          </button>`;
      }

      const selectedEvents = this.selectedDay ? (byDay[this.selectedDay] || []) : [];
      const detail = this.selectedDay
        ? `<div class="arr-day-detail">
             <div class="arr-day-detail-head">${escapeHtml(D.dayLabel(new Date(month.getFullYear(), month.getMonth(), this.selectedDay)))}</div>
             ${selectedEvents.length
               ? `<div class="arr-list">${selectedEvents.map((e) => this._eventRowHtml(e)).join('')}</div>`
               : `<div class="arr-empty">No releases this day.</div>`}
           </div>`
        : (Object.keys(byDay).length
            ? `<div class="arr-cal-hint">Click a highlighted day to see its releases.</div>`
            : `<div class="arr-cal-hint">No releases in ${escapeHtml(D.monthLabel(month))}.</div>`);

      this.calWrap.innerHTML = `
        <div class="arr-cal">
          <div class="arr-cal-nav">
            <button type="button" class="arr-nav-btn" data-nav="prev" aria-label="Previous month">‹</button>
            <span class="arr-cal-month">${escapeHtml(D.monthLabel(month))}</span>
            <button type="button" class="arr-nav-btn" data-nav="next" aria-label="Next month">›</button>
          </div>
          <div class="arr-cal-grid arr-cal-weekdays">
            ${weekdayNames.map((w) => `<div class="arr-weekday">${w}</div>`).join('')}
          </div>
          <div class="arr-cal-grid arr-cal-days">${cells}</div>
          ${detail}
        </div>`;

      this.calWrap.querySelector('[data-nav="prev"]').addEventListener('click', () => this.prevMonth());
      this.calWrap.querySelector('[data-nav="next"]').addEventListener('click', () => this.nextMonth());
      this.calWrap.querySelectorAll('.arr-cell.arr-has').forEach((cell) => {
        cell.addEventListener('click', () => {
          const day = parseInt(cell.dataset.day, 10);
          this.selectedDay = (this.selectedDay === day) ? null : day;
          this._render();
        });
      });
    }

    // ── error state ────────────────────────────────────────────────────────────
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid API key|HTTP\s*401/i.test(msg)
        ? 'Invalid API key'
        : `${this.cfg.service === 'radarr' ? 'Radarr' : 'Sonarr'} unavailable`;
      this.el.classList.add('arr-has-error');
    }

    _clearError() {
      if (this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('arr-has-error');
      }
    }
  }

  // ── per-service convenience wrappers ──────────────────────────────────────────
  function SonarrWidget(container, config) {
    return new ArrCalendarWidget(container, Object.assign({ service: 'sonarr' }, config || {}));
  }
  function RadarrWidget(container, config) {
    return new ArrCalendarWidget(container, Object.assign({ service: 'radarr' }, config || {}));
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  global.ArrCalendarApi = ArrCalendarApi;
  global.ArrCalendarWidget = ArrCalendarWidget;
  global.SonarrWidget = SonarrWidget;
  global.RadarrWidget = RadarrWidget;
  // Exposed for unit testing.
  ArrCalendarWidget._dateHelpers = D;
  ArrCalendarWidget._RADARR_RELEASE_TYPES = RADARR_RELEASE_TYPES;
})(typeof window !== 'undefined' ? window : this);
