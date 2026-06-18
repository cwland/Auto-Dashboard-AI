// Auto Dashboard AI — Prowlarr Widget
// ---------------------------------------------------------------------------
// Shows your Prowlarr indexers and their health: how many are healthy, and a
// per-indexer list with an enabled/online status indicator.
//
//   const w = new ProwlarrWidget(el, { baseUrl, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as ProwlarrApi and ProwlarrWidget.
//
// ATTRIBUTION: the /api/v1/indexer + /api/v1/indexerstatus fetching and the
// indexer health mapping (enabled vs. errored) are adapted from the Homarr
// project's Prowlarr integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const ProwlarrApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(apiKey) { return { 'X-Api-Key': apiKey || '' }; },

    // Pure: combine the indexer list with the indexer-status (errored) list.
    // `status: true` means the indexer site is reachable (not in the error set).
    buildIndexers(indexers, statuses) {
      const errored = new Set((statuses || []).map((s) => s.indexerId));
      return (indexers || []).map((ix) => ({
        id: ix.id,
        name: ix.name,
        url: (ix.indexerUrls && ix.indexerUrls[0]) || '',
        enabled: !!ix.enable,
        status: !errored.has(ix.id),
      }));
    },
    // healthy = enabled AND reachable
    isHealthy(ix) { return ix.enabled && ix.status; },

    async _get(base, path, apiKey, signal) {
      const res = await fetch(`${this.normalizeBase(base)}${path}`, { cache: 'no-store', headers: this.authHeaders(apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async getData(base, opts, session, signal) {
      const [indexers, statuses] = await Promise.all([
        this._get(base, '/api/v1/indexer', opts.apiKey, signal),
        this._get(base, '/api/v1/indexerstatus', opts.apiKey, signal),
      ]);
      return this.buildIndexers(Array.isArray(indexers) ? indexers : [], Array.isArray(statuses) ? statuses : []);
    },
    async testConnection(base, opts, signal) {
      const data = await this._get(base, '/api/v1/indexer', opts.apiKey, signal);
      if (!Array.isArray(data)) throw new Error('unexpected response');
      return { ok: true };
    },
  };

  function hostOf(url) { try { return new URL(url).host; } catch { return url || ''; } }

  class ProwlarrWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', apiKey: '', pollMs: 60000, dataProvider: null }, config || {});
      this.data = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(15000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await ProwlarrApi.getData(this.cfg.baseUrl, { apiKey: this.cfg.apiKey }, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('prowlarr-widget');
      this.el.innerHTML = `<div class="pr-header"><div class="pr-title">Prowlarr</div><div class="pr-tools"><div class="pr-error" style="display:none"></div><span class="pr-count"></span></div></div><div class="pr-body"></div>`;
      this.errorEl = this.el.querySelector('.pr-error'); this.countEl = this.el.querySelector('.pr-count'); this.body = this.el.querySelector('.pr-body');
    }
    _render(indexers) {
      const list = indexers || [];
      const healthy = list.filter((ix) => ProwlarrApi.isHealthy(ix)).length;
      this.countEl.textContent = list.length ? `${healthy}/${list.length} healthy` : '';
      this.countEl.classList.toggle('pr-count-warn', list.length > 0 && healthy < list.length);
      if (!list.length) { this.body.innerHTML = `<div class="pr-empty">No indexers configured.</div>`; return; }
      this.body.innerHTML = `<div class="pr-list">${list.map((ix) => {
        const state = !ix.enabled ? 'disabled' : (ix.status ? 'ok' : 'error');
        const label = !ix.enabled ? 'Disabled' : (ix.status ? 'OK' : 'Error');
        return `
          <div class="pr-row">
            <span class="pr-dot pr-${state}"></span>
            <div class="pr-main"><span class="pr-name" title="${escapeAttr(ix.name)}">${escapeHtml(ix.name)}</span>${ix.url ? `<span class="pr-host">${escapeHtml(hostOf(ix.url))}</span>` : ''}</div>
            <span class="pr-state pr-${state}">${label}</span>
          </div>`;
      }).join('')}</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid API key|HTTP\s*40[13]/i.test(msg) ? 'Invalid API key' : 'Prowlarr unavailable';
      this.el.classList.add('pr-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pr-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.ProwlarrApi = ProwlarrApi;
  global.ProwlarrWidget = ProwlarrWidget;
})(typeof window !== 'undefined' ? window : this);
