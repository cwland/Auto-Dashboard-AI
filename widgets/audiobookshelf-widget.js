// Auto Dashboard AI — Audiobookshelf Widget
// ---------------------------------------------------------------------------
// Shows a library summary from an Audiobookshelf server: number of audiobooks,
// podcasts, libraries, total listening time, and active listening sessions.
//
//   const w = new AudiobookshelfWidget(el, { baseUrl, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as AudiobookshelfApi and AudiobookshelfWidget.
//
// ATTRIBUTION: the libraries / library-stats / listening-stats / online-users
// fetching and the dashboard aggregation are adapted from the Homarr project's
// Audiobookshelf integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const AudiobookshelfApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(apiKey) { return { Authorization: `Bearer ${apiKey || ''}`, Accept: 'application/json' }; },

    // Pure: aggregate per-library stats into the dashboard summary.
    buildDashboard(libraries, statsByLibrary, listeningTotalTime, onlineCount) {
      let totalAudiobooks = 0, totalPodcasts = 0;
      for (const item of statsByLibrary || []) {
        if (item.mediaType === 'podcast') totalPodcasts += item.totalItems || 0;
        else totalAudiobooks += item.totalItems || 0;
      }
      return {
        libraryCount: (libraries || []).length,
        totalAudiobooks,
        totalPodcasts,
        totalListeningTimeSeconds: listeningTotalTime || 0,
        activeSessions: onlineCount || 0,
      };
    },

    async _get(base, path, apiKey, signal) {
      const res = await fetch(`${this.normalizeBase(base)}${path}`, { cache: 'no-store', headers: this.authHeaders(apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async getData(base, opts, session, signal) {
      const apiKey = opts.apiKey;
      const libsResp = await this._get(base, '/api/libraries', apiKey, signal);
      const libraries = (libsResp && libsResp.libraries) || [];
      const [listening, online, statsByLibrary] = await Promise.all([
        this._get(base, '/api/me/listening-stats', apiKey, signal).catch(() => ({ totalTime: 0 })),
        this._get(base, '/api/users/online', apiKey, signal).catch(() => ({ openSessions: [] })),
        Promise.all(libraries.map(async (lib) => {
          const stats = await this._get(base, `/api/libraries/${lib.id}/stats`, apiKey, signal).catch(() => ({ totalItems: 0 }));
          return { mediaType: lib.mediaType, totalItems: stats.totalItems || 0 };
        })),
      ]);
      return this.buildDashboard(libraries, statsByLibrary, listening.totalTime || 0, ((online && online.openSessions) || []).length);
    },
    async testConnection(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/libraries`, { cache: 'no-store', headers: this.authHeaders(opts.apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json().catch(() => null);
      return { ok: true };
    },
  };

  function fmtListening(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = s / 3600;
    if (h >= 24) return `${Math.round(h / 24 * 10) / 10}d`;
    if (h >= 1) return `${Math.round(h * 10) / 10}h`;
    return `${Math.floor(s / 60)}m`;
  }
  function fmtNum(n) { return Number(n || 0).toLocaleString(); }

  class AudiobookshelfWidget {
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
          : await AudiobookshelfApi.getData(this.cfg.baseUrl, { apiKey: this.cfg.apiKey }, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('abs-widget');
      this.el.innerHTML = `<div class="abs-header"><img class="wg-icon" src="../icons/integrations/audiobookshelf.svg" alt=""><div class="abs-title">Audiobookshelf</div><div class="abs-error" style="display:none"></div></div><div class="abs-body"></div>`;
      this.errorEl = this.el.querySelector('.abs-error'); this.body = this.el.querySelector('.abs-body');
    }
    _render(d) {
      const data = d || {};
      const tiles = [
        ['📚', 'Audiobooks', fmtNum(data.totalAudiobooks), 'abs-books'],
        ['🎙', 'Podcasts', fmtNum(data.totalPodcasts), 'abs-pods'],
        ['🗂', 'Libraries', fmtNum(data.libraryCount), ''],
        ['⏱', 'Listening', fmtListening(data.totalListeningTimeSeconds), ''],
        ['🎧', 'Active', fmtNum(data.activeSessions), 'abs-active'],
      ];
      this.body.innerHTML = `<div class="abs-grid">${tiles.map((t) => `<div class="abs-tile ${t[3]}"><span class="abs-icon">${t[0]}</span><span class="abs-val">${escapeHtml(t[2])}</span><span class="abs-lbl">${t[1]}</span></div>`).join('')}</div>`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid token|HTTP\s*40[13]/i.test(msg) ? 'Invalid token' : 'Audiobookshelf unavailable';
      this.el.classList.add('abs-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('abs-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  global.AudiobookshelfApi = AudiobookshelfApi;
  global.AudiobookshelfWidget = AudiobookshelfWidget;
  AudiobookshelfWidget._fmtListening = fmtListening;
})(typeof window !== 'undefined' ? window : this);
