// Auto Dashboard AI — iCal (calendar feed) Widget
// ---------------------------------------------------------------------------
// Shows events from any iCalendar (.ics) feed — Google Calendar, Nextcloud
// calendar exports, Outlook, etc. — two ways (toggle in the widget header):
//   • "upcoming" — a list of the next events
//   • "calendar" — a month grid; click a day to see its events
//
//   const w = new IcalWidget(el, { url });
//   w.start();  ...  w.destroy();
//
// Exposed as IcalApi and IcalWidget.
//
// ATTRIBUTION: the idea of mapping iCal VEVENTs to calendar events is adapted
// from the Homarr project's iCal integration (which uses the ical.js library
// server-side). Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
// The ICS parser and the RRULE expansion here are an original, dependency-free
// implementation (Homarr relies on ical.js).
'use strict';

(function (global) {
  // ─── date helpers ─────────────────────────────────────────────────────────
  const D = {
    startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; },
    startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); },
    endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999); },
    addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); },
    sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); },
    monthLabel(d) { return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); },
    dayLabel(d) { return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); },
    shortDate(d) { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); },
    time(d) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); },
  };

  const IcalApi = {
    // Unescape ICS TEXT values.
    unescape(v) { return String(v || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\'); },

    // Parse an ICS date/datetime value (+ its params) → { date, allDay }.
    parseDate(value, params) {
      const isDateOnly = /VALUE=DATE(?!-TIME)/i.test(params || '') || /^\d{8}$/.test(value);
      if (isDateOnly) {
        const m = /^(\d{4})(\d{2})(\d{2})/.exec(value);
        if (!m) return { date: null, allDay: true };
        return { date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), allDay: true };
      }
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/.exec(value);
      if (!m) return { date: null, allDay: false };
      const [, y, mo, d, h, mi, s, z] = m;
      if (z) return { date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))), allDay: false };
      return { date: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)), allDay: false };
    },

    // Pure: parse ICS text → array of raw VEVENTs.
    parse(text) {
      // Unfold lines (continuation lines start with space or tab).
      const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = [];
      for (const line of raw.split('\n')) {
        if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length) lines[lines.length - 1] += line.slice(1);
        else lines.push(line);
      }
      const events = [];
      let cur = null;
      for (const line of lines) {
        if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
        if (line === 'END:VEVENT') { if (cur && cur.start) events.push(cur); cur = null; continue; }
        if (!cur) continue;
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        const left = line.slice(0, idx), value = line.slice(idx + 1);
        const semi = left.indexOf(';');
        const name = (semi === -1 ? left : left.slice(0, semi)).toUpperCase();
        const params = semi === -1 ? '' : left.slice(semi + 1);
        switch (name) {
          case 'SUMMARY': cur.summary = this.unescape(value); break;
          case 'DESCRIPTION': cur.description = this.unescape(value); break;
          case 'LOCATION': cur.location = this.unescape(value); break;
          case 'UID': cur.uid = value; break;
          case 'RRULE': cur.rrule = value; break;
          case 'DTSTART': { const p = this.parseDate(value, params); cur.start = p.date; cur.allDay = p.allDay; break; }
          case 'DTEND': { const p = this.parseDate(value, params); cur.end = p.date; break; }
          default: break;
        }
      }
      return events.filter((e) => e.start instanceof Date && !isNaN(e.start));
    },

    // Parse an RRULE string into a small descriptor.
    parseRrule(rrule) {
      const out = {};
      for (const part of String(rrule || '').split(';')) {
        const [k, v] = part.split('=');
        if (k) out[k.toUpperCase()] = v;
      }
      return out;
    },

    // Expand one raw event into occurrences within [start, end] (RRULE support
    // for FREQ DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL).
    expandEvent(ev, start, end) {
      const durationMs = (ev.end instanceof Date && !isNaN(ev.end)) ? (ev.end - ev.start) : (ev.allDay ? 86400000 : 3600000);
      const make = (s) => ({
        id: `${ev.uid || ev.summary || 'event'}-${s.getTime()}`,
        title: ev.summary || '(no title)',
        description: ev.description || null,
        location: ev.location || null,
        allDay: !!ev.allDay,
        startDate: new Date(s),
        endDate: new Date(s.getTime() + durationMs),
      });
      if (!ev.rrule) {
        if (ev.start > end || (new Date(ev.start.getTime() + durationMs)) < start) return [];
        return [make(ev.start)];
      }
      const r = this.parseRrule(ev.rrule);
      const freq = (r.FREQ || '').toUpperCase();
      const interval = Math.max(1, parseInt(r.INTERVAL, 10) || 1);
      const count = r.COUNT ? parseInt(r.COUNT, 10) : null;
      const until = r.UNTIL ? this.parseDate(r.UNTIL, '').date : null;
      const stepFns = {
        DAILY: (d, i) => D.addDays(d, i),
        WEEKLY: (d, i) => D.addDays(d, i * 7),
        MONTHLY: (d, i) => new Date(d.getFullYear(), d.getMonth() + i, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()),
        YEARLY: (d, i) => new Date(d.getFullYear() + i, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()),
      };
      const step = stepFns[freq];
      if (!step) { if (ev.start <= end && ev.start >= D.addDays(start, -1)) return [make(ev.start)]; return []; }
      const out = [];
      for (let i = 0, n = 0; i < 1000; i++) {
        const occ = step(ev.start, i * interval);
        if (count && n >= count) break;
        if (until && occ > until) break;
        if (occ > end) break;
        n++;
        if (occ.getTime() + durationMs >= start.getTime()) out.push(make(occ));
        if (out.length > 300) break;
      }
      return out;
    },

    eventsInWindow(rawEvents, start, end) {
      const out = [];
      for (const ev of rawEvents) out.push.apply(out, this.expandEvent(ev, start, end));
      out.sort((a, b) => a.startDate - b.startDate);
      return out;
    },

    async getRawEvents(url, signal) {
      const res = await fetch(url, { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const events = this.parse(text);
      if (!events.length && !/BEGIN:VCALENDAR/i.test(text)) throw new Error('not an iCalendar feed');
      return events;
    },
    async testConnection(url, signal) { await this.getRawEvents(url, signal); return { ok: true }; },
  };

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  class IcalWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ url: '', title: 'Calendar', view: 'upcoming', showViewToggle: true, upcomingCount: 8, lookaheadDays: 60, pollMs: 600000, dataProvider: null }, config || {});
      this.view = this.cfg.view === 'calendar' ? 'calendar' : 'upcoming';
      this.month = D.startOfMonth(new Date());
      this.selectedDay = null;
      this.rawEvents = null;
      this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(60000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render(); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    setView(v) { this.view = v === 'calendar' ? 'calendar' : 'upcoming'; this.selectedDay = null; this._render(); }
    prevMonth() { this.month = D.addMonths(this.month, -1); this.selectedDay = null; this._render(); }
    nextMonth() { this.month = D.addMonths(this.month, 1); this.selectedDay = null; this._render(); }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        this.rawEvents = this.cfg.dataProvider ? await this.cfg.dataProvider() : await IcalApi.getRawEvents(this.cfg.url, this.abort && this.abort.signal);
        this._clearError(); this._render();
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('ical-widget');
      this.el.innerHTML = `<div class="ic-header"><div class="ic-title"></div><div class="ic-tools"><div class="ic-error" style="display:none"></div><div class="ic-view-toggle"><button class="ic-tab" data-view="upcoming" type="button">Upcoming</button><button class="ic-tab" data-view="calendar" type="button">Calendar</button></div></div></div><div class="ic-body"></div>`;
      this.titleEl = this.el.querySelector('.ic-title'); this.errorEl = this.el.querySelector('.ic-error'); this.toggleEl = this.el.querySelector('.ic-view-toggle'); this.body = this.el.querySelector('.ic-body');
      this.titleEl.textContent = this.cfg.title || 'Calendar';
      this.toggleEl.style.display = this.cfg.showViewToggle ? '' : 'none';
      this.toggleEl.querySelectorAll('.ic-tab').forEach((b) => b.addEventListener('click', () => this.setView(b.dataset.view)));
    }
    _syncTabs() { this.toggleEl.querySelectorAll('.ic-tab').forEach((b) => b.classList.toggle('ic-tab-active', b.dataset.view === this.view)); }
    _render() {
      this._syncTabs();
      if (this.rawEvents == null) { this.body.innerHTML = `<div class="ic-empty">Loading…</div>`; return; }
      if (this.view === 'calendar') this._renderCalendar(); else this._renderUpcoming();
    }
    _eventRow(e) {
      const when = e.allDay ? 'All day' : D.time(e.startDate);
      const sub = [when, e.location].filter(Boolean).join(' · ');
      return `<div class="ic-row"><span class="ic-dot"></span><div class="ic-row-main"><span class="ic-row-title" title="${escapeAttr(e.title)}">${escapeHtml(e.title)}</span><span class="ic-row-sub">${escapeHtml(sub)}</span></div><span class="ic-row-date">${escapeHtml(D.shortDate(e.startDate))}</span></div>`;
    }
    _renderUpcoming() {
      const start = D.startOfDay(new Date()), end = D.addDays(start, this.cfg.lookaheadDays);
      const events = IcalApi.eventsInWindow(this.rawEvents, start, end).filter((e) => e.startDate >= start).slice(0, Math.max(1, this.cfg.upcomingCount));
      this.body.innerHTML = events.length ? `<div class="ic-list">${events.map((e) => this._eventRow(e)).join('')}</div>` : `<div class="ic-empty">No upcoming events in the next ${this.cfg.lookaheadDays} days.</div>`;
    }
    _renderCalendar() {
      const month = this.month, first = D.startOfMonth(month), startWeekday = first.getDay(), days = D.endOfMonth(month).getDate(), today = new Date();
      const events = IcalApi.eventsInWindow(this.rawEvents, first, D.endOfMonth(month));
      const byDay = {};
      for (const e of events) { if (e.startDate.getFullYear() === month.getFullYear() && e.startDate.getMonth() === month.getMonth()) (byDay[e.startDate.getDate()] = byDay[e.startDate.getDate()] || []).push(e); }
      const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      let cells = '';
      for (let i = 0; i < startWeekday; i++) cells += `<div class="ic-cell ic-cell-empty"></div>`;
      for (let day = 1; day <= days; day++) {
        const evs = byDay[day] || [], date = new Date(month.getFullYear(), month.getMonth(), day);
        const isToday = D.sameDay(date, today), isSel = this.selectedDay === day;
        cells += `<button type="button" class="ic-cell${evs.length ? ' ic-has' : ''}${isToday ? ' ic-today' : ''}${isSel ? ' ic-selected' : ''}" data-day="${day}" ${evs.length ? '' : 'tabindex="-1"'}><span class="ic-cell-num">${day}</span><span class="ic-cell-dots">${evs.length ? `<span class="ic-dot2"></span>${evs.length > 1 ? `<span class="ic-count">${evs.length}</span>` : ''}` : ''}</span></button>`;
      }
      const sel = this.selectedDay ? (byDay[this.selectedDay] || []) : [];
      const detail = this.selectedDay
        ? `<div class="ic-day-detail"><div class="ic-day-head">${escapeHtml(D.dayLabel(new Date(month.getFullYear(), month.getMonth(), this.selectedDay)))}</div>${sel.length ? `<div class="ic-list">${sel.map((e) => this._eventRow(e)).join('')}</div>` : `<div class="ic-empty">No events this day.</div>`}</div>`
        : (Object.keys(byDay).length ? `<div class="ic-hint">Click a highlighted day to see its events.</div>` : `<div class="ic-hint">No events in ${escapeHtml(D.monthLabel(month))}.</div>`);
      this.body.innerHTML = `<div class="ic-cal"><div class="ic-cal-nav"><button type="button" class="ic-nav-btn" data-nav="prev" aria-label="Previous month">‹</button><span class="ic-cal-month">${escapeHtml(D.monthLabel(month))}</span><button type="button" class="ic-nav-btn" data-nav="next" aria-label="Next month">›</button></div><div class="ic-cal-grid ic-weekdays">${wd.map((w) => `<div class="ic-weekday">${w}</div>`).join('')}</div><div class="ic-cal-grid ic-days">${cells}</div>${detail}</div>`;
      this.body.querySelector('[data-nav="prev"]').addEventListener('click', () => this.prevMonth());
      this.body.querySelector('[data-nav="next"]').addEventListener('click', () => this.nextMonth());
      this.body.querySelectorAll('.ic-cell.ic-has').forEach((c) => c.addEventListener('click', () => { const day = parseInt(c.dataset.day, 10); this.selectedDay = (this.selectedDay === day) ? null : day; this._render(); }));
    }
    _showError(msg) { this.errorEl.style.display = 'block'; this.errorEl.textContent = msg && /not an iCalendar|HTTP\s*40/i.test(msg) ? 'Invalid feed' : 'Calendar unavailable'; this.el.classList.add('ic-has-error'); }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('ic-has-error'); } }
  }

  global.IcalApi = IcalApi;
  global.IcalWidget = IcalWidget;
  IcalApi._D = D;
})(typeof window !== 'undefined' ? window : this);
