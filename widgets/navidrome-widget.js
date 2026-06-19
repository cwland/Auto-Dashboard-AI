// Auto Dashboard AI — Navidrome Widget
// ---------------------------------------------------------------------------
// Shows a music-library summary from Navidrome (via the Subsonic API): artist,
// album, and song counts, plus what's currently playing.
//
//   const w = new NavidromeWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed as NavidromeApi and NavidromeWidget.
//
// ATTRIBUTION: the Subsonic auth params, the artist/album/song counting (paged
// getAlbumList2), and the now-playing mapping are adapted from the Homarr
// project's Navidrome integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const SUBSONIC_VERSION = '1.16.1';
  const SUBSONIC_CLIENT = 'auto-dashboard-ai';
  const PAGE_SIZE = 500;
  const MAX_PAGES = 20;
  const EMPTY_LIBRARY = 'Library not found or empty';

  // Subsonic JSON returns single objects OR arrays interchangeably.
  function asArray(value) {
    if (value === undefined || value === null) return [];
    return Array.isArray(value) ? value : [value];
  }

  const NavidromeApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authParams(username, password) {
      return { u: username || '', p: password || '', v: SUBSONIC_VERSION, c: SUBSONIC_CLIENT, f: 'json' };
    },
    url(base, path, username, password, extra) {
      const qs = new URLSearchParams(Object.assign(this.authParams(username, password), extra || {}));
      return `${this.normalizeBase(base)}${path}?${qs.toString()}`;
    },

    // Pure: count artists from a getArtists response body.
    countArtists(body) {
      return asArray(body && body.artists && body.artists.index)
        .reduce((count, index) => count + asArray(index.artist).length, 0);
    },
    // Pure: count albums + songs from an array of getAlbumList2 album arrays (one per page).
    countAlbumsSongs(pages) {
      let albumCount = 0, songCount = 0;
      for (const albums of pages || []) {
        albumCount += albums.length;
        for (const album of albums) songCount += album.songCount || 0;
      }
      return { albumCount, songCount };
    },
    mapNowPlaying(body) {
      return asArray(body && body.nowPlaying && body.nowPlaying.entry).map((e) => ({
        title: e.title || '', artist: e.artist || '', album: e.album || '',
        username: e.username || '', playerName: e.playerName || '',
      }));
    },

    async _request(base, path, opts, params, tolerateEmpty, signal) {
      const res = await fetch(this.url(base, path, opts.username, opts.password, params), { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json().catch(() => null);
      const body = json && json['subsonic-response'];
      if (!body) throw new Error('invalid Subsonic response');
      if (body.status === 'failed') {
        const code = body.error && body.error.code;
        if (code === 40 || code === 41) throw new Error('invalid credentials');
        const message = (body.error && body.error.message) || 'Subsonic request failed';
        if (tolerateEmpty && message === EMPTY_LIBRARY) return body;
        throw new Error(message);
      }
      return body;
    },

    async getData(base, opts, session, signal) {
      const [artistsBody, nowPlayingBody, albumPages] = await Promise.all([
        this._request(base, '/rest/getArtists.view', opts, {}, true, signal),
        this._request(base, '/rest/getNowPlaying.view', opts, {}, true, signal),
        this._collectAlbumPages(base, opts, signal),
      ]);
      const { albumCount, songCount } = this.countAlbumsSongs(albumPages);
      return {
        artistCount: this.countArtists(artistsBody),
        albumCount, songCount,
        nowPlaying: this.mapNowPlaying(nowPlayingBody),
      };
    },
    async _collectAlbumPages(base, opts, signal) {
      const pages = [];
      let offset = 0;
      for (let page = 0; page < MAX_PAGES; page++) {
        const body = await this._request(base, '/rest/getAlbumList2.view', opts, { type: 'alphabeticalByName', size: PAGE_SIZE, offset }, true, signal);
        const albums = asArray(body.albumList2 && body.albumList2.album);
        if (!albums.length) break;
        pages.push(albums);
        if (albums.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      return pages;
    },
    async testConnection(base, opts, signal) {
      await this._request(base, '/rest/ping.view', opts, {}, false, signal);
      return { ok: true };
    },
  };

  function fmtNum(n) { return Number(n || 0).toLocaleString(); }

  class NavidromeWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', username: '', password: '', pollMs: 60000, dataProvider: null }, config || {});
      this.data = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(20000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await NavidromeApi.getData(this.cfg.baseUrl, { username: this.cfg.username, password: this.cfg.password }, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('navidrome-widget');
      this.el.innerHTML = `<div class="nv-header"><img class="wg-icon" src="../icons/integrations/navidrome.svg" alt=""><div class="nv-title">Navidrome</div><div class="nv-error" style="display:none"></div></div><div class="nv-body"></div>`;
      this.errorEl = this.el.querySelector('.nv-error'); this.body = this.el.querySelector('.nv-body');
    }
    _render(d) {
      const data = d || {};
      const tiles = [
        ['🎤', 'Artists', fmtNum(data.artistCount)],
        ['💿', 'Albums', fmtNum(data.albumCount)],
        ['🎵', 'Songs', fmtNum(data.songCount)],
      ];
      const np = data.nowPlaying || [];
      const list = np.length
        ? `<div class="nv-np"><div class="nv-np-head">Now playing</div>${np.map((e) => `
            <div class="nv-np-row">
              <span class="nv-np-icon">▶</span>
              <div class="nv-np-main"><span class="nv-np-title">${escapeHtml(e.title)}</span><span class="nv-np-sub">${escapeHtml([e.artist, e.album].filter(Boolean).join(' — '))}</span></div>
              <span class="nv-np-user">${escapeHtml(e.username || e.playerName || '')}</span>
            </div>`).join('')}</div>`
        : `<div class="nv-np-empty">Nothing playing right now.</div>`;
      this.body.innerHTML = `<div class="nv-grid">${tiles.map((t) => `<div class="nv-tile"><span class="nv-icon">${t[0]}</span><span class="nv-val">${escapeHtml(t[2])}</span><span class="nv-lbl">${t[1]}</span></div>`).join('')}</div>${list}`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*40[13]/i.test(msg) ? 'Check credentials' : 'Navidrome unavailable';
      this.el.classList.add('nv-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('nv-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  global.NavidromeApi = NavidromeApi;
  global.NavidromeWidget = NavidromeWidget;
  NavidromeApi._asArray = asArray;
})(typeof window !== 'undefined' ? window : this);
