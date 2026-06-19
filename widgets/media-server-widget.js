// Auto Dashboard AI — Jellyfin / Emby Widget (reusable component)
// ---------------------------------------------------------------------------
// Shows what's currently playing on a Jellyfin or Emby media server: active
// sessions with media type, title, episode/album subtitle, the user, the
// device, a play/pause state and a progress bar.
//
// Jellyfin and Emby expose the same REST surface, so one component covers both
// via cfg.service ('jellyfin' | 'emby'):
//   const w = new MediaServerWidget(el, { service:'jellyfin', baseUrl, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed on window as MediaServerApi and MediaServerWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The /Sessions fetching, the now-playing session mapping, and the media-type
// mapping are adapted from the Homarr project's Jellyfin / Emby integrations
// (media-server interface). Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. Modified from the original (TypeScript + the
// Jellyfin SDK → framework-free JS using the documented REST API directly).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  const TYPE_ICON = { movie: '🎬', video: '📺', tv: '📡', audio: '🎵' };
  const LABEL = { jellyfin: 'Jellyfin', emby: 'Emby' };

  const MediaServerApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // Jellyfin/Emby BaseItemKind → our display category (Homarr's mapping).
    getCurrentlyPlayingType(kind) {
      switch (kind) {
        case 'Movie': return 'movie';
        case 'Audio':
        case 'MusicVideo': return 'audio';
        case 'TvChannel':
        case 'TvProgram':
        case 'LiveTvChannel':
        case 'LiveTvProgram': return 'tv';
        case 'Episode':
        case 'Video':
        default: return 'video';
      }
    },

    // Pure: map raw /Sessions objects → display sessions. Only sessions with a
    // NowPlayingItem are kept (Homarr's showOnlyPlaying behaviour).
    mapSessions(raw) {
      return (raw || [])
        .filter((s) => s && s.NowPlayingItem)
        .map((s) => {
          const item = s.NowPlayingItem || {};
          const type = this.getCurrentlyPlayingType(item.Type);
          let title = item.Name || 'Unknown';
          let subtitle = null;

          if (item.Type === 'Episode') {
            title = item.SeriesName || item.Name || 'Unknown';
            const season = item.SeasonName ||
              (item.ParentIndexNumber != null ? `Season ${item.ParentIndexNumber}` : '');
            const ep = item.IndexNumber != null ? ` · E${item.IndexNumber}` : '';
            subtitle = `${season}${ep}`.trim() || item.EpisodeTitle || item.Name || null;
          } else if (type === 'audio') {
            title = item.AlbumArtist || (Array.isArray(item.Artists) && item.Artists[0]) || item.Name || 'Unknown';
            subtitle = item.Album || item.Name || null;
          } else if (item.ProductionYear) {
            subtitle = String(item.ProductionYear);
          }

          const ps = s.PlayState || {};
          const total = Number(item.RunTimeTicks) || 0;
          const pos = Number(ps.PositionTicks) || 0;
          const progress = total > 0 ? Math.max(0, Math.min(100, Math.round((pos / total) * 100))) : null;

          return {
            sessionId: s.Id || `${s.UserName || '?'}-${title}`,
            type,
            title,
            subtitle,
            user: s.UserName || 'Anonymous',
            device: `${s.Client || ''}${s.DeviceName ? ` (${s.DeviceName})` : ''}`.trim(),
            paused: !!ps.IsPaused,
            progress,
          };
        });
    },

    // api_key is passed as a query param to avoid a CORS preflight on a header.
    sessionsUrl(base, apiKey) {
      return `${this.normalizeBase(base)}/Sessions?api_key=${encodeURIComponent(apiKey || '')}`;
    },
    infoUrl(base, apiKey) {
      return `${this.normalizeBase(base)}/System/Info?api_key=${encodeURIComponent(apiKey || '')}`;
    },

    async getSessions(base, apiKey, signal) {
      const res = await fetch(this.sessionsUrl(base, apiKey), {
        cache: 'no-store', headers: { Accept: 'application/json' }, signal,
      });
      if (res.status === 401) throw new Error('invalid key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => { throw new Error('unexpected response'); });
      return this.mapSessions(Array.isArray(data) ? data : []);
    },

    async testConnection(base, apiKey, signal) {
      const res = await fetch(this.infoUrl(base, apiKey), {
        cache: 'no-store', headers: { Accept: 'application/json' }, signal,
      });
      if (res.status === 401) throw new Error('invalid key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      if (!data || (!data.Version && !data.ServerName && !data.Id)) throw new Error('unexpected response');
      return { serverName: data.ServerName || '', version: data.Version || '' };
    },
  };

  class MediaServerWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        { service: 'jellyfin', baseUrl: '', apiKey: '', pollMs: 15000, dataProvider: null },
        config || {}
      );
      this.sessions = null;
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this._buildSkeleton();
    }

    start() {
      this.stop();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), Math.max(5000, this.cfg.pollMs));
    }
    stop() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.abort) { this.abort.abort(); this.abort = null; }
    }
    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render();
    }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const sessions = this.cfg.dataProvider
          ? await this.cfg.dataProvider()
          : await MediaServerApi.getSessions(this.cfg.baseUrl, this.cfg.apiKey, this.abort && this.abort.signal);
        this._clearError();
        this.sessions = sessions || [];
        this._render();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      const svc = this.cfg.service === 'emby' ? 'emby' : 'jellyfin';
      this.el.classList.add('ms-widget', `ms-${svc}`);
      this.el.innerHTML = `
        <div class="ms-header">
          <img class="wg-icon" src="../icons/integrations/${svc}.svg" alt="">
          <div class="ms-title">${LABEL[svc]} — Now Playing</div>
          <div class="ms-tools">
            <div class="ms-error" style="display:none"></div>
            <span class="ms-count" style="display:none"></span>
          </div>
        </div>
        <div class="ms-body"></div>`;
      this.errorEl = this.el.querySelector('.ms-error');
      this.countEl = this.el.querySelector('.ms-count');
      this.body = this.el.querySelector('.ms-body');
    }

    _render() {
      const sessions = this.sessions || [];
      if (sessions.length) {
        this.countEl.style.display = '';
        this.countEl.textContent = `${sessions.length} stream${sessions.length === 1 ? '' : 's'}`;
      } else {
        this.countEl.style.display = 'none';
      }
      if (!sessions.length) {
        this.body.innerHTML = `<div class="ms-empty">Nothing playing right now.</div>`;
        return;
      }
      const rows = sessions.map((s) => {
        const avatar = `<span class="ms-avatar ms-avatar-fallback">${escapeHtml((s.user || '?').charAt(0).toUpperCase())}</span>`;
        const sub = s.subtitle ? `<div class="ms-row-sub">${escapeHtml(s.subtitle)}</div>` : '';
        const bar = s.progress != null
          ? `<div class="ms-progress"><span style="width:${s.progress}%"></span></div>` : '';
        const state = s.paused ? '⏸' : (TYPE_ICON[s.type] || '📺');
        return `
          <div class="ms-row${s.paused ? ' ms-paused' : ''}">
            <span class="ms-type" title="${escapeAttr(s.paused ? 'paused' : s.type)}">${state}</span>
            <div class="ms-row-main">
              <div class="ms-row-title">${escapeHtml(s.title)}</div>
              ${sub}
              ${bar}
            </div>
            <div class="ms-row-user">
              ${avatar}
              <div class="ms-row-usermeta">
                <span class="ms-username">${escapeHtml(s.user)}</span>
                ${s.device ? `<span class="ms-device">${escapeHtml(s.device)}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
      this.body.innerHTML = `<div class="ms-list">${rows}</div>`;
    }

    _showError(msg) {
      const label = LABEL[this.cfg.service === 'emby' ? 'emby' : 'jellyfin'];
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid key|HTTP\s*401/i.test(msg) ? 'Invalid API key' : `${label} unavailable`;
      this.el.classList.add('ms-has-error');
    }
    _clearError() {
      if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('ms-has-error'); }
    }
  }

  function escapeHtml(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  global.MediaServerApi = MediaServerApi;
  global.MediaServerWidget = MediaServerWidget;
})(typeof window !== 'undefined' ? window : this);
