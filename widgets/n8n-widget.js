// Auto Dashboard AI — n8n API helper.
// ---------------------------------------------------------------------------
// Talks to the n8n public REST API (base + /api/v1, auth via the
// `X-N8N-API-KEY` header) to monitor workflow executions. Currently powers the
// n8n Quick View widget (Running / Failed today / Successful today).
//
// Notes on the n8n API (verified against the public OpenAPI / community reports):
//   • GET /executions accepts status = success | error | waiting | canceled.
//     "running" is NOT an accepted status filter, so running executions are
//     detected client-side from an unfiltered, newest-first page.
//   • There is no server-side date filter, so "today" is computed locally from
//     each execution's startedAt timestamp.
//
// Exposed as N8nApi.
'use strict';

(function (global) {
  const N8nApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    headers(apiKey) { return { 'X-N8N-API-KEY': apiKey || '', Accept: 'application/json' }; },

    async _get(base, path, apiKey, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/v1${path}`, {
        cache: 'no-store', headers: this.headers(apiKey), signal,
      });
      if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },

    // Local midnight (start of "today") in ms.
    startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); },

    // An execution is "today" if it started on or after local midnight.
    isToday(e, since) {
      const ts = Date.parse((e && (e.startedAt || e.stoppedAt || e.createdAt)) || '');
      return Number.isFinite(ts) && ts >= since;
    },

    // n8n returns "running"/"new" for active executions (status field is present
    // on modern n8n; older versions only set finished:false with no stoppedAt).
    isRunning(e) {
      const s = String((e && e.status) || '').toLowerCase();
      if (s) return s === 'running' || s === 'new';
      return e && e.finished === false && !e.stoppedAt;
    },

    async executions(base, apiKey, params, signal) {
      const qs = new URLSearchParams(params || {}).toString();
      const data = await this._get(base, `/executions${qs ? '?' + qs : ''}`, apiKey, signal);
      return (data && data.data) || [];
    },

    // Count today's executions of a given status (newest-first; capped at 250,
    // the API's max page — plenty for a dashboard's "today" view).
    async todayCount(base, apiKey, status, signal) {
      const list = await this.executions(base, apiKey, { status, limit: 250 }, signal);
      const since = this.startOfToday();
      return list.filter((e) => this.isToday(e, since)).length;
    },

    // Currently-running executions (status filter "running" is rejected by the
    // API, so pull the newest page and count the running ones — they're recent).
    async runningCount(base, apiKey, signal) {
      const list = await this.executions(base, apiKey, { limit: 100 }, signal);
      return list.filter((e) => this.isRunning(e)).length;
    },

    // Combined snapshot for the Quick View widget.
    async getData(base, apiKey, signal) {
      const [running, successToday, failedToday] = await Promise.all([
        this.runningCount(base, apiKey, signal),
        this.todayCount(base, apiKey, 'success', signal),
        this.todayCount(base, apiKey, 'error', signal),
      ]);
      return { running, successToday, failedToday };
    },

    async testConnection(base, apiKey, signal) {
      const data = await this._get(base, '/workflows?limit=1', apiKey, signal);
      if (!data || !Array.isArray(data.data)) throw new Error('unexpected response');
      return { ok: true };
    },

    // ── Upcoming schedule ─────────────────────────────────────────────────────
    // n8n's API exposes no "next run" time, so we compute it from each active
    // workflow's Schedule Trigger config. Time-anchored rules (cron, or daily/
    // hourly/weekly/monthly with a trigger time) are computed from the clock;
    // plain interval rules ("every N minutes") are anchored on the workflow's
    // most recent execution.

    // Standard 5-field cron → the next Date at or after `from` (searches up to a
    // 31-day horizon; returns null if nothing matches).
    cronNext(expr, from) {
      const f = String(expr || '').trim().split(/\s+/);
      if (f.length < 5) return null;
      const sets = [
        this._cronField(f[0], 0, 59), this._cronField(f[1], 0, 23),
        this._cronField(f[2], 1, 31), this._cronField(f[3], 1, 12), this._cronField(f[4], 0, 6),
      ];
      const d = new Date(from.getTime()); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
      const limit = from.getTime() + 31 * 86400000;
      while (d.getTime() <= limit) {
        const [mn, hr, dom, mon, dow] = sets;
        if ((mon == null || mon.has(d.getMonth() + 1)) && (hr == null || hr.has(d.getHours())) && (mn == null || mn.has(d.getMinutes()))) {
          const domOk = dom == null || dom.has(d.getDate());
          const dowOk = dow == null || dow.has(d.getDay());
          const dayOk = (dom == null && dow == null) ? true : (dom != null && dow != null) ? (domOk || dowOk) : (domOk && dowOk);
          if (dayOk) return new Date(d.getTime());
        }
        d.setMinutes(d.getMinutes() + 1);
      }
      return null;
    },
    _cronField(spec, min, max) {
      if (spec == null || spec === '*' || spec === '?') return null;
      const set = new Set();
      for (const part of String(spec).split(',')) {
        let m;
        if ((m = /^(\d+)-(\d+)(?:\/(\d+))?$/.exec(part))) { for (let v = +m[1]; v <= +m[2]; v += (+m[3] || 1)) set.add(v); }
        else if ((m = /^\*\/(\d+)$/.exec(part))) { for (let v = min; v <= max; v += +m[1]) set.add(v); }
        else if ((m = /^(\d+)\/(\d+)$/.exec(part))) { for (let v = +m[1]; v <= max; v += +m[2]) set.add(v); }
        else if (/^\d+$/.test(part)) set.add(+part);
      }
      return set.size ? set : null;
    },
    _num(v, d) { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; },
    _intervalMs(rule) {
      const f = rule.field;
      const units = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
      return units[f] ? this._num(rule[f + 'Interval'], 1) * units[f] : 0;
    },
    nextRunForRule(rule, lastExecTs, now) {
      if (!rule) return null;
      const f = rule.field || (rule.expression ? 'cronExpression' : 'minutes');
      if (f === 'cronExpression' || rule.expression) return rule.expression ? this.cronNext(rule.expression, now) : null;
      const atM = this._num(rule.triggerAtMinute, 0), atH = this._num(rule.triggerAtHour, 0);
      if (f === 'days' && this._num(rule.daysInterval, 1) === 1) return this.cronNext(`${atM} ${atH} * * *`, now);
      if (f === 'hours' && this._num(rule.hoursInterval, 1) === 1) return this.cronNext(`${atM} * * * *`, now);
      if (f === 'weeks' && this._num(rule.weeksInterval, 1) === 1) {
        const days = Array.isArray(rule.triggerAtDay) ? rule.triggerAtDay : (rule.triggerAtDay != null ? [rule.triggerAtDay] : []);
        return this.cronNext(`${atM} ${atH} * * ${days.length ? days.join(',') : '*'}`, now);
      }
      if (f === 'months' && this._num(rule.monthsInterval, 1) === 1) return this.cronNext(`${atM} ${atH} ${this._num(rule.triggerAtDayOfMonth, 1)} * *`, now);
      const ms = this._intervalMs(rule);
      if (!ms) return null;
      const base = Number.isFinite(lastExecTs) ? lastExecTs : now.getTime();
      let next = base + ms;
      if (next <= now.getTime()) next = base + Math.ceil((now.getTime() - base) / ms + 1e-9) * ms;
      if (next <= now.getTime()) next += ms;
      return new Date(next);
    },
    _scheduleRules(node) {
      const type = String((node && node.type) || '');
      const p = (node && node.parameters) || {};
      if (/scheduletrigger$/i.test(type)) {
        const iv = p.rule && p.rule.interval;
        return Array.isArray(iv) ? iv : (iv ? [iv] : [{ field: 'minutes', minutesInterval: 1 }]);
      }
      if (/\.cron$/i.test(type) && p.cronExpression) return [{ field: 'cronExpression', expression: p.cronExpression }];
      if (/\.interval$/i.test(type)) { const u = p.unit || 'seconds'; return [{ field: u, [u + 'Interval']: this._num(p.interval, 1) }]; }
      return [];
    },
    async _lastExecByWorkflow(base, apiKey, signal) {
      const map = {};
      try {
        const res = await this._get(base, '/executions?limit=250', apiKey, signal);
        for (const e of ((res && res.data) || [])) {
          const wid = String(e.workflowId != null ? e.workflowId : ((e.workflowData && e.workflowData.id) || ''));
          if (!wid) continue;
          const ts = Date.parse(e.startedAt || e.stoppedAt || e.createdAt || '');
          if (Number.isFinite(ts) && (!map[wid] || ts > map[wid])) map[wid] = ts;
        }
      } catch (_) { /* executions optional */ }
      return map;
    },
    // The next scheduled runs across all active workflows, soonest first.
    async getSchedules(base, apiKey, count, signal) {
      const want = Math.max(1, parseInt(count, 10) || 12);
      const [wfRes, lastMap] = await Promise.all([
        this._get(base, '/workflows?active=true&limit=250', apiKey, signal),
        this._lastExecByWorkflow(base, apiKey, signal),
      ]);
      const wfs = (wfRes && wfRes.data) || [];
      const now = new Date();
      const out = [];
      for (const wf of wfs) {
        let soonest = null;
        for (const node of (wf.nodes || [])) {
          for (const rule of this._scheduleRules(node)) {
            const next = this.nextRunForRule(rule, lastMap[String(wf.id)], now);
            if (next && (!soonest || next < soonest)) soonest = next;
          }
        }
        if (soonest) out.push({ name: wf.name || `#${wf.id}`, nextRun: soonest.getTime(), id: wf.id });
      }
      out.sort((a, b) => a.nextRun - b.nextRun);
      return out.slice(0, want);
    },
  };

  // ── Upcoming-schedule list widget ────────────────────────────────────────────
  function fmtUntil(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return 'now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), rm = m % 60;
    if (h < 24) return rm ? `${h}h ${rm}m` : `${h} hr`;
    const d = Math.floor(h / 24), rh = h % 24;
    return rh ? `${d}d ${rh}h` : `${d} day${d === 1 ? '' : 's'}`;
  }
  function fmtWhen(ms) {
    const t = new Date(ms);
    let clock = '';
    try { clock = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (_) {}
    if (t.toDateString() === new Date().toDateString()) return clock;
    let day = '';
    try { day = t.toLocaleDateString([], { weekday: 'short' }); } catch (_) {}
    return `${day} ${clock}`.trim();
  }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

  class N8nScheduleWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        baseUrl: '', apiKey: '', count: 12, pollMs: 60000, dataProvider: null,
        carousel: true, visibleCount: 5, speed: 18, mode: undefined, pauseMs: undefined, onConfigChange: null,
      }, config || {});
      this.pollTimer = null; this.abort = null; this.destroyed = false; this.carousel = null;
      this._build();
    }
    _build() {
      this.el.classList.add('n8n-schedule-widget');
      this.el.innerHTML =
        '<div class="ns-header"><img class="wg-icon" src="../icons/integrations/n8n.svg" alt="">' +
          '<div class="ns-title">Next Scheduled</div><span class="ns-summary"></span>' +
          '<div class="lc-tools"></div><div class="ns-error" style="display:none"></div></div>' +
        '<div class="ns-body"><div class="ns-empty" style="display:none">No upcoming scheduled workflows.</div>' +
          '<div class="ns-viewport"><div class="ns-track"></div></div></div>';
      this.summaryEl = this.el.querySelector('.ns-summary');
      this.errorEl = this.el.querySelector('.ns-error');
      this.emptyEl = this.el.querySelector('.ns-empty');
      this.viewport = this.el.querySelector('.ns-viewport');
      this.track = this.el.querySelector('.ns-track');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
      this._initCarousel();
    }
    _initCarousel() {
      if (typeof ListCarousel === 'undefined' || !this.viewport || !this.track) return;
      this.carousel = new ListCarousel({
        root: this.el, viewport: this.viewport, track: this.track,
        enabled: this.cfg.carousel !== false, visibleCount: this.cfg.visibleCount,
        speed: this.cfg.speed, mode: this.cfg.mode, pauseMs: this.cfg.pauseMs,
      });
      if (this.lcToolsEl && ListCarousel.buildControls) {
        ListCarousel.buildControls(this.lcToolsEl, this.cfg, (patch) => {
          if (this.carousel) this.carousel.update(patch);
          if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
        });
      }
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(30000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.carousel && patch) this.carousel.update(patch); this.poll(); }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) { try { this.carousel.destroy(); } catch (_) {} this.carousel = null; } this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const list = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await N8nApi.getSchedules(this.cfg.baseUrl, this.cfg.apiKey, this.cfg.count, this.abort && this.abort.signal);
        if (this.destroyed) return;
        this._clearError(); this._render(list || []);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _render(list) {
      this.summaryEl.textContent = list.length ? `${list.length} upcoming` : '';
      if (!list.length) { this.emptyEl.style.display = ''; this.viewport.style.display = 'none'; this.track.innerHTML = ''; return; }
      this.emptyEl.style.display = 'none'; this.viewport.style.display = '';
      const now = Date.now();
      this.track.innerHTML = list.map((s) => {
        const until = fmtUntil((s.nextRun || 0) - now);
        return '<div class="ns-row">' +
          `<div class="ns-when"><span class="ns-rel">${esc(until)}</span><span class="ns-abs">${esc(fmtWhen(s.nextRun))}</span></div>` +
          `<div class="ns-name" title="${escAttr(s.name)}">${esc(s.name)}</div>` +
        '</div>';
      }).join('');
      if (this.carousel) this.carousel.layout();
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid API key|HTTP\s*40[13]/i.test(msg) ? 'Invalid API key' : 'n8n unavailable';
    }
    _clearError() { if (this.errorEl.style.display !== 'none') this.errorEl.style.display = 'none'; }
  }

  global.N8nApi = N8nApi;
  global.N8nScheduleWidget = N8nScheduleWidget;
})(typeof window !== 'undefined' ? window : this);
