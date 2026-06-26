// Auto Dashboard AI — Plex Widget (reusable component)
// ---------------------------------------------------------------------------
// Shows what's currently playing on a Plex Media Server: a list of active
// sessions with media type, title, episode/album subtitle, the user, and the
// device they're playing on.
//
// Framework-free and self-contained:
//   const w = new PlexWidget(el, { baseUrl, token });
//   w.start();  ...  w.destroy();
//
// Exposed on window as PlexApi and PlexWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The /status/sessions fetching, the XML session parsing, and the
// currently-playing type mapping are adapted from the Homarr project's Plex
// integration (media-server interface). Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. Modified from the original (TS → JS; XML parsed
// with the browser DOMParser instead of xml2js).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  const TYPE_ICON = { movie: '🎬', video: '📺', tv: '📡', audio: '🎵' };

  const PlexApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // Plex media element "type" → our display category (Homarr's mapping).
    getCurrentlyPlayingType(type) {
      switch (type) {
        case 'movie': return 'movie';
        case 'episode': return 'video';
        case 'track': return 'audio';
        default: return 'video';
      }
    },

    // Pure: map raw session attribute objects → display sessions. `raw` items:
    //   { type, live, grandparentTitle, parentTitle, title, index,
    //     user:{id,title,thumb}, player:{product,title}, sessionId }
    mapSessions(raw) {
      return (raw || []).filter((m) => m.player).map((m) => {
        const type = m.live === '1' || m.live === true ? 'tv' : this.getCurrentlyPlayingType(m.type);
        const name = m.grandparentTitle || m.title || 'Unknown';
        let subtitle = null;
        if (m.type === 'episode') {
          const ep = m.index != null && m.index !== '' ? ` · E${m.index}` : '';
          subtitle = `${m.parentTitle || ''}${ep}`.trim() || (m.title || null);
        } else if (m.type === 'track') {
          subtitle = m.parentTitle || null; // album
        }
        const user = (m.user && m.user.title) || 'Anonymous';
        const device = m.player ? `${m.player.product || ''}${m.player.title ? ` (${m.player.title})` : ''}`.trim() : '';
        return {
          sessionId: (m.session && m.session.id) || m.sessionId || `${user}-${name}`,
          type,
          title: name,
          subtitle,
          user,
          userThumb: (m.user && m.user.thumb) || null,
          device,
        };
      });
    },

    // Browser-only: parse the /status/sessions XML into raw attribute objects.
    parseSessionsFromXml(xmlString) {
      if (typeof DOMParser === 'undefined') return [];
      const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid XML from Plex');
      const els = Array.from(doc.querySelectorAll('MediaContainer > Video, MediaContainer > Track'));
      return els.map((el) => {
        const userEl = el.querySelector('User');
        const playerEl = el.querySelector('Player');
        const sessEl = el.querySelector('Session');
        const attr = (node, name) => (node ? node.getAttribute(name) : null);
        return {
          type: el.getAttribute('type'),
          live: el.getAttribute('live'),
          grandparentTitle: el.getAttribute('grandparentTitle'),
          parentTitle: el.getAttribute('parentTitle'),
          title: el.getAttribute('title'),
          index: el.getAttribute('index'),
          user: userEl ? { id: attr(userEl, 'id'), title: attr(userEl, 'title'), thumb: attr(userEl, 'thumb') } : null,
          player: playerEl ? { product: attr(playerEl, 'product'), title: attr(playerEl, 'title') } : null,
          session: sessEl ? { id: attr(sessEl, 'id') } : null,
        };
      });
    },

    // Token is passed as a query param to avoid a CORS preflight on the header.
    sessionsUrl(base, token) {
      return `${this.normalizeBase(base)}/status/sessions?X-Plex-Token=${encodeURIComponent(token || '')}`;
    },

    async getSessions(base, token, signal) {
      const res = await fetch(this.sessionsUrl(base, token), { cache: 'no-store', signal });
      if (res.status === 401) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return this.mapSessions(this.parseSessionsFromXml(text));
    },

    // Aggregate "now playing" stats for the Quick View (mirrors Tautulli):
    // stream count, transcode count, direct-play count, and total bandwidth (kbps).
    parseActivityFromXml(xmlString) {
      const empty = { streams: 0, transcodes: 0, directPlay: 0, bandwidth: 0 };
      if (typeof DOMParser === 'undefined') return empty;
      const doc = new DOMParser().parseFromString(xmlString, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid XML from Plex');
      const els = Array.from(doc.querySelectorAll('MediaContainer > Video, MediaContainer > Track, MediaContainer > Photo'));
      let transcodes = 0, bandwidth = 0;
      for (const el of els) {
        const ts = el.querySelector('TranscodeSession');
        if (ts) {
          const vd = (ts.getAttribute('videoDecision') || '').toLowerCase();
          const ad = (ts.getAttribute('audioDecision') || '').toLowerCase();
          if (vd === 'transcode' || ad === 'transcode') transcodes++;
        }
        const sess = el.querySelector('Session');
        if (sess) bandwidth += Number(sess.getAttribute('bandwidth')) || 0;
      }
      const streams = els.length;
      return { streams, transcodes, directPlay: Math.max(0, streams - transcodes), bandwidth };
    },
    async getActivity(base, token, signal) {
      const res = await fetch(this.sessionsUrl(base, token), { cache: 'no-store', signal });
      if (res.status === 401) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return this.parseActivityFromXml(await res.text());
    },

    async testConnection(base, token, signal) {
      const url = `${this.normalizeBase(base)}/identity?X-Plex-Token=${encodeURIComponent(token || '')}`;
      const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
      if (res.status === 401) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      const id = data && data.MediaContainer && data.MediaContainer.machineIdentifier;
      if (!id) throw new Error('unexpected response');
      return { machineIdentifier: id };
    },
  };

  class PlexWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', token: '', pollMs: 15000, dataProvider: null }, config || {});
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
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render(); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const sessions = this.cfg.dataProvider
          ? await this.cfg.dataProvider()
          : await PlexApi.getSessions(this.cfg.baseUrl, this.cfg.token, this.abort && this.abort.signal);
        this._clearError();
        this.sessions = sessions || [];
        this._render();
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      this.el.classList.add('plex-widget');
      this.el.innerHTML = `
        <div class="plex-header">
          <img class="wg-icon" src="../icons/integrations/plex.svg" alt="">
          <div class="plex-title">Plex — Now Playing</div>
          <div class="plex-tools">
            <div class="plex-error" style="display:none"></div>
            <span class="plex-count" style="display:none"></span>
          </div>
        </div>
        <div class="plex-body"></div>`;
      this.errorEl = this.el.querySelector('.plex-error');
      this.countEl = this.el.querySelector('.plex-count');
      this.body = this.el.querySelector('.plex-body');
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
        this.body.innerHTML = `<div class="plex-empty">Nothing playing right now.</div>`;
        return;
      }
      const rows = sessions.map((s) => {
        const avatar = s.userThumb && /^https?:/i.test(s.userThumb)
          ? `<img class="plex-avatar" alt="" src="${escapeAttr(s.userThumb)}">`
          : `<span class="plex-avatar plex-avatar-fallback">${escapeHtml((s.user || '?').charAt(0).toUpperCase())}</span>`;
        const sub = s.subtitle ? `<div class="plex-row-sub">${escapeHtml(s.subtitle)}</div>` : '';
        return `
          <div class="plex-row">
            <span class="plex-type" title="${escapeAttr(s.type)}">${TYPE_ICON[s.type] || '📺'}</span>
            <div class="plex-row-main">
              <div class="plex-row-title">${escapeHtml(s.title)}</div>
              ${sub}
            </div>
            <div class="plex-row-user">
              ${avatar}
              <div class="plex-row-usermeta">
                <span class="plex-username">${escapeHtml(s.user)}</span>
                ${s.device ? `<span class="plex-device">${escapeHtml(s.device)}</span>` : ''}
              </div>
            </div>
          </div>`;
      }).join('');
      this.body.innerHTML = `<div class="plex-list">${rows}</div>`;
    }

    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid token|HTTP\s*401/i.test(msg) ? 'Invalid token' : 'Plex unavailable';
      this.el.classList.add('plex-has-error');
    }
    _clearError() {
      if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('plex-has-error'); }
    }
  }

  function escapeHtml(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  global.PlexApi = PlexApi;
  global.PlexWidget = PlexWidget;
})(typeof window !== 'undefined' ? window : this);
