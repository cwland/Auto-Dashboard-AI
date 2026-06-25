// Auto Dashboard AI — Seerr (Overseerr / Jellyseerr) Widget (reusable component)
// ---------------------------------------------------------------------------
// Overseerr, Jellyseerr and Seerr share one compatible API, so a single widget
// covers all three. It shows media requests two ways, switchable in-widget:
//
//   • "requests" — a list of recent requests (poster, title, status +
//                  availability badges, who requested it)
//   • "stats"    — a grid of request counts (approved / pending / processing /
//                  declined / available / tv / movie / total) + top requesters
//
// Framework-free and self-contained:
//   const w = new SeerrWidget(el, { baseUrl, apiKey, view: 'requests' });
//   w.start();  ...  w.destroy();
//
// Exposed on window as SeerrApi and SeerrWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The request/stats/users fetching, the request-status and media-availability
// mapping, the per-item TMDB info lookup, and the poster/avatar URL building
// are adapted from the Homarr project's Overseerr/Seerr integration and its
// media-requests widgets (used as the reference template). Homarr is licensed
// under the Apache License 2.0.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. This file is modified from the original
// (rewritten from TypeScript/React to framework-free JS).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  // Upstream numeric enums (Overseerr/Jellyseerr server constants).
  const REQUEST_STATUS = { 1: 'pending', 2: 'approved', 3: 'declined', 4: 'failed', 5: 'completed' };
  const AVAILABILITY = { 1: 'unknown', 2: 'pending', 3: 'processing', 4: 'partiallyAvailable', 5: 'available', 6: 'deleted', 7: 'deleted' };

  const STATUS_COLOR = {
    pending: 'blue', approved: 'green', declined: 'red', failed: 'red', completed: 'green',
  };
  const AVAILABILITY_COLOR = {
    available: 'green', partiallyAvailable: 'yellow', processing: 'blue', requested: 'violet',
    pending: 'violet', unknown: 'orange', deleted: 'red', blacklisted: 'gray',
  };
  const AVAILABILITY_LABEL = {
    available: 'Available', partiallyAvailable: 'Partial', processing: 'Processing', requested: 'Requested',
    pending: 'Pending', unknown: 'Unknown', deleted: 'Deleted', blacklisted: 'Blacklisted',
  };

  const STAT_TILES = [
    { key: 'approved', label: 'Approved', icon: '👍' },
    { key: 'pending', label: 'Pending', icon: '⏳' },
    { key: 'processing', label: 'Processing', icon: '⟳' },
    { key: 'declined', label: 'Declined', icon: '👎' },
    { key: 'available', label: 'Available', icon: '▶' },
    { key: 'tv', label: 'TV', icon: '📺' },
    { key: 'movie', label: 'Movies', icon: '🎬' },
    { key: 'total', label: 'Total', icon: '🧾' },
  ];

  // ─── API helper ───────────────────────────────────────────────────────────
  const SeerrApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    headers(apiKey) { return { 'X-Api-Key': apiKey || '' }; },

    buildPosterUrl(posterPath) {
      if (!posterPath) return null;
      return `https://image.tmdb.org/t/p/w600_and_h900_bestv2${posterPath}`;
    },

    constructAvatarUrl(base, avatar) {
      if (!avatar) return null;
      if (/^https?:\/\//i.test(avatar)) return avatar;
      const b = this.normalizeBase(base);
      return `${b}${avatar.startsWith('/') ? '' : '/'}${avatar}`;
    },

    mapRequestStatus(code) { return REQUEST_STATUS[code] || 'failed'; },

    // Mirrors Homarr's mapAvailability (status enum + in-progress download flag).
    mapAvailability(code, inProgress) {
      switch (code) {
        case 5: return inProgress ? 'processing' : 'available';        // Available
        case 4: return inProgress ? 'processing' : 'partiallyAvailable'; // PartiallyAvailable
        case 3: return inProgress ? 'processing' : 'requested';        // Processing
        case 2: return 'pending';                                      // Pending
        case 6: case 7: return 'deleted';                              // blacklisted / deleted
        case 1: default: return inProgress ? 'processing' : 'unknown'; // Unknown
      }
    },

    async fetchJson(url, apiKey, signal) {
      const res = await fetch(url, { cache: 'no-store', headers: this.headers(apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try { return await res.json(); }
      catch { throw new Error('Invalid response from server'); }
    },

    // TMDB title/poster for a request's media item.
    async fetchItemInfo(base, apiKey, type, tmdbId, signal) {
      const url = `${this.normalizeBase(base)}/api/v1/${type}/${tmdbId}`;
      const data = await this.fetchJson(url, apiKey, signal);
      if (type === 'tv') {
        return { name: data.name, posterPath: data.posterPath || data.backdropPath };
      }
      return { name: data.title, posterPath: data.posterPath || data.backdropPath };
    },

    // Normalize one raw request (+ fetched info) into the widget's shape.
    mapRequest(raw, info, base) {
      const status = this.mapRequestStatus(raw.status);
      const inProgress = Array.isArray(raw.media && raw.media.downloadStatus) && raw.media.downloadStatus.length >= 1;
      const availability = this.mapAvailability(raw.media ? raw.media.status : 1, inProgress);
      const by = raw.requestedBy;
      return {
        id: raw.id,
        type: raw.type,
        title: (info && info.name) || `#${raw.media ? raw.media.tmdbId : raw.id}`,
        posterUrl: info ? this.buildPosterUrl(info.posterPath) : null,
        href: raw.media ? `${this.normalizeBase(base)}/${raw.type}/${raw.media.tmdbId}` : null,
        status,
        statusColor: STATUS_COLOR[status] || 'gray',
        availability,
        availabilityColor: AVAILABILITY_COLOR[availability] || 'gray',
        availabilityLabel: AVAILABILITY_LABEL[availability] || availability,
        createdAt: raw.createdAt ? new Date(raw.createdAt) : null,
        requestedBy: by ? { name: by.displayName, avatarUrl: this.constructAvatarUrl(base, by.avatar) } : null,
      };
    },

    // Merge pending-first with the general list, dropping duplicate pendings.
    mergeRequests(pending, all) {
      const p = pending || [], a = all || [];
      if (p.length && a.length) return p.concat(a.filter((r) => r.status !== 1));
      if (p.length) return p;
      return a;
    },

    async getRequests(base, apiKey, opts, signal) {
      const o = opts || {};
      const take = Math.max(1, parseInt(o.requestCount, 10) || 8);
      const b = this.normalizeBase(base);
      const [pendingRes, allRes] = await Promise.all([
        this.fetchJson(`${b}/api/v1/request?take=${take}&filter=pending`, apiKey, signal),
        this.fetchJson(`${b}/api/v1/request?take=${take}`, apiKey, signal),
      ]);
      const merged = this.mergeRequests(
        (pendingRes && pendingRes.results) || [],
        (allRes && allRes.results) || [],
      ).slice(0, take);

      // Fetch TMDB info per request (capped by `take`).
      return Promise.all(merged.map(async (raw) => {
        let info = null;
        try {
          if (raw.media && raw.media.tmdbId) {
            info = await this.fetchItemInfo(base, apiKey, raw.type, raw.media.tmdbId, signal);
          }
        } catch { /* leave info null; row still renders with a fallback title */ }
        return this.mapRequest(raw, info, base);
      }));
    },

    async getStats(base, apiKey, signal) {
      const url = `${this.normalizeBase(base)}/api/v1/request/count`;
      const data = await this.fetchJson(url, apiKey, signal);
      const num = (v) => (typeof v === 'number' ? v : 0);
      return {
        total: num(data.total), movie: num(data.movie), tv: num(data.tv),
        pending: num(data.pending), approved: num(data.approved), declined: num(data.declined),
        processing: num(data.processing), available: num(data.available),
      };
    },

    async getUsers(base, apiKey, opts, signal) {
      const take = (opts && opts.take) || 5;
      const url = `${this.normalizeBase(base)}/api/v1/user?take=${take}&sort=requests`;
      const data = await this.fetchJson(url, apiKey, signal);
      const users = (data && data.results) || [];
      return users.map((u) => ({
        name: u.displayName,
        avatarUrl: this.constructAvatarUrl(base, u.avatar),
        requestCount: u.requestCount || 0,
      }));
    },

    async getData(base, apiKey, opts, signal) {
      const o = opts || {};
      const [stats, requests, users] = await Promise.all([
        this.getStats(base, apiKey, signal),
        this.getRequests(base, apiKey, o, signal),
        o.showUsers === false ? Promise.resolve([]) : this.getUsers(base, apiKey, { take: 5 }, signal),
      ]);
      return { stats, requests, users };
    },

    // Validate URL + key against /api/v1/auth/me (requires a valid key).
    async testConnection(base, apiKey, signal) {
      const url = `${this.normalizeBase(base)}/api/v1/auth/me`;
      const data = await this.fetchJson(url, apiKey, signal);
      if (!data || typeof data.id !== 'number') throw new Error('unexpected response');
      return data; // { id, displayName, ... }
    },
  };

  // ─── Widget ─────────────────────────────────────────────────────────────────
  class SeerrWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        {
          baseUrl: '', apiKey: '', pollMs: 60000,
          view: 'requests',
          requestCount: 8, showUsers: true,
          // Shared ListCarousel scroll settings (same as other list widgets).
          carousel: true, visibleCount: 5, speed: 18, mode: 'continuous', pauseMs: 2000,
          onConfigChange: null,
          dataProvider: null,
        },
        config || {}
      );
      this.view = this.cfg.view === 'stats' ? 'stats' : 'requests';
      this.data = null;
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this.carousel = null;
      this._buildSkeleton();
      this._initCarousel();
      this._render();
    }

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
      if (patch && patch.view) this.view = patch.view === 'stats' ? 'stats' : 'requests';
      if (this.carousel && patch) this.carousel.update(patch);   // live scroll changes
      if (patch && (patch.requestCount != null || patch.showUsers != null)) {
        if (this.pollTimer || this.cfg.dataProvider) this.poll();
        else this._render();
      } else {
        this._render();
      }
    }
    destroy() {
      this.destroyed = true;
      this.stop();
      if (this.carousel) { try { this.carousel.destroy(); } catch (_) {} this.carousel = null; }
      this.el.innerHTML = '';
    }

    setView(view) {
      this.view = view === 'stats' ? 'stats' : 'requests';
      this.cfg.view = this.view;
      this._render();
      if (this.cfg.onConfigChange) this.cfg.onConfigChange({ view: this.view });
    }

    _opts() { return { requestCount: this.cfg.requestCount, showUsers: this.cfg.showUsers }; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider
          ? await this.cfg.dataProvider(this._opts())
          : await SeerrApi.getData(this.cfg.baseUrl, this.cfg.apiKey, this._opts(), this.abort && this.abort.signal);
        this._clearError();
        this.data = data;
        this._render();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      this.el.classList.add('seerr-widget');
      this.el.innerHTML = `
        <div class="seerr-header">
          <div class="seerr-headline">
            <img class="wg-icon" src="../icons/integrations/seerr.svg" alt="">
            <div class="seerr-titles">
              <div class="seerr-title">Seerr</div>
              <div class="seerr-subtitle">Media Requests</div>
            </div>
          </div>
          <div class="seerr-tools">
            <div class="seerr-error" style="display:none"></div>
            <div class="lc-tools"></div>
          </div>
        </div>
        <div class="seerr-body">
          <div class="seerr-empty" style="display:none"></div>
          <div class="seerr-viewport"><div class="seerr-track"></div></div>
          <div class="seerr-stats-wrap" style="display:none"></div>
        </div>`;
      this.errorEl = this.el.querySelector('.seerr-error');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
      this.body = this.el.querySelector('.seerr-body');
      this.emptyEl = this.el.querySelector('.seerr-empty');
      this.viewport = this.el.querySelector('.seerr-viewport');
      this.track = this.el.querySelector('.seerr-track');
      this.statsWrap = this.el.querySelector('.seerr-stats-wrap');
    }

    // Wire the ListCarousel scroll behaviour and build the config-window controls
    // (a Requests/Stats switch above the shared scroll sliders).
    _initCarousel() {
      if (typeof ListCarousel === 'undefined' || !this.viewport || !this.track) return;
      this.carousel = new ListCarousel({
        root: this.el, viewport: this.viewport, track: this.track,
        enabled: this.cfg.carousel !== false && this.view === 'requests',
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
            [['requests', 'Requests'], ['stats', 'Stats']],
            (v) => this.setView(v),
            'Switch between the recent requests list and the request stats summary.');
          this.lcToolsEl.insertBefore(viewRow, this.lcToolsEl.firstChild);
        }
      }
    }

    _render() {
      if (!this.data) {
        this.emptyEl.style.display = '';
        this.emptyEl.textContent = 'Loading…';
        this.viewport.style.display = 'none';
        this.statsWrap.style.display = 'none';
        return;
      }
      if (this.view === 'stats') this._renderStats();
      else this._renderRequests();
    }

    _renderRequests() {
      this.statsWrap.style.display = 'none';
      this.statsWrap.innerHTML = '';
      if (this.carousel) this.carousel.update({ enabled: this.cfg.carousel !== false });
      const requests = (this.data.requests || []);
      if (!requests.length) {
        this.emptyEl.style.display = '';
        this.emptyEl.textContent = 'No recent media requests.';
        this.viewport.style.display = 'none';
        this.track.innerHTML = '';
        return;
      }
      const rows = requests.map((r) => {
        const poster = r.posterUrl
          ? `<div class="seerr-poster"><img alt="" loading="lazy" src="${escapeAttr(r.posterUrl)}"></div>`
          : `<div class="seerr-poster seerr-poster-empty">${r.type === 'tv' ? '📺' : '🎬'}</div>`;
        const who = r.requestedBy
          ? `<span class="seerr-req-user">${r.requestedBy.avatarUrl
                ? `<img class="seerr-avatar" alt="" src="${escapeAttr(r.requestedBy.avatarUrl)}">`
                : `<span class="seerr-avatar seerr-avatar-fallback">${escapeHtml((r.requestedBy.name || '?').charAt(0).toUpperCase())}</span>`
              }<span class="seerr-req-username">${escapeHtml(r.requestedBy.name || '')}</span></span>`
          : '';
        return `
          <div class="seerr-row">
            ${poster}
            <div class="seerr-row-main">
              <div class="seerr-row-title">${escapeHtml(r.title)}</div>
              <div class="seerr-row-badges">
                <span class="seerr-badge seerr-c-${r.statusColor}">${escapeHtml(cap(r.status))}</span>
                <span class="seerr-badge seerr-c-${r.availabilityColor}">${escapeHtml(r.availabilityLabel)}</span>
                <span class="seerr-type">${r.type === 'tv' ? 'TV' : 'Movie'}</span>
              </div>
            </div>
            ${who}
          </div>`;
      }).join('');
      this.emptyEl.style.display = 'none';
      this.viewport.style.display = '';
      this.track.innerHTML = rows;
      if (this.carousel) this.carousel.layout();
    }

    _renderStats() {
      this.viewport.style.display = 'none';
      if (this.carousel) this.carousel.update({ enabled: false });   // no scroll in stats view
      this.emptyEl.style.display = 'none';
      const stats = this.data.stats || {};
      const tiles = STAT_TILES.map((t) => `
        <div class="seerr-stat-tile seerr-stat-${t.key}">
          <span class="seerr-stat-icon">${t.icon}</span>
          <span class="seerr-stat-value">${Number(stats[t.key] || 0).toLocaleString()}</span>
          <span class="seerr-stat-label">${t.label}</span>
        </div>`).join('');

      let users = '';
      const userList = this.cfg.showUsers ? (this.data.users || []) : [];
      if (userList.length) {
        users = `
          <div class="seerr-users">
            <div class="seerr-users-head">Top requesters</div>
            ${userList.map((u) => `
              <div class="seerr-user-row">
                ${u.avatarUrl
                  ? `<img class="seerr-avatar" alt="" src="${escapeAttr(u.avatarUrl)}">`
                  : `<span class="seerr-avatar seerr-avatar-fallback">${escapeHtml((u.name || '?').charAt(0).toUpperCase())}</span>`}
                <span class="seerr-user-name">${escapeHtml(u.name || '')}</span>
                <span class="seerr-user-count">${Number(u.requestCount || 0).toLocaleString()}</span>
              </div>`).join('')}
          </div>`;
      }

      this.statsWrap.style.display = '';
      this.statsWrap.innerHTML = `<div class="seerr-stats"><div class="seerr-stat-grid">${tiles}</div>${users}</div>`;
    }

    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid API key|HTTP\s*40[13]/i.test(msg)
        ? 'Invalid API key' : 'Server unavailable';
      this.el.classList.add('seerr-has-error');
    }
    _clearError() {
      if (this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('seerr-has-error');
      }
    }
  }

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  global.SeerrApi = SeerrApi;
  global.SeerrWidget = SeerrWidget;
  // Exposed for unit testing.
  SeerrWidget._STATUS_COLOR = STATUS_COLOR;
  SeerrWidget._AVAILABILITY_COLOR = AVAILABILITY_COLOR;
})(typeof window !== 'undefined' ? window : this);
