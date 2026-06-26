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
  };

  global.N8nApi = N8nApi;
})(typeof window !== 'undefined' ? window : this);
