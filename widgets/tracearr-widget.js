// Auto Dashboard AI — Tracearr Widget
// ---------------------------------------------------------------------------
// Shows a Tracearr media-stream monitor summary: active streams, users,
// sessions, and recent violations, plus a list of the active streams (title,
// user, server, play state, and a transcode badge).
//
//   const w = new TracearrWidget(el, { baseUrl, apiKey });
//   w.start();  ...  w.destroy();
//
// Exposed as TracearrApi and TracearrWidget.
//
// ATTRIBUTION: the /api/v1/public/* fetching (stats / streams / violations /
// history) and the dashboard mapping are adapted from the Homarr project's
// Tracearr integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  const TracearrApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(apiKey) { return { Authorization: `Bearer ${apiKey || ''}` }; },

    // Pure: one stream → compact display row.
    mapStream(s) {
      const isEpisode = s.mediaType === 'episode';
      const title = isEpisode && s.showTitle ? s.showTitle : s.mediaTitle;
      let subtitle = null;
      if (isEpisode) {
        const se = (s.seasonNumber != null && s.episodeNumber != null) ? `S${s.seasonNumber}·E${s.episodeNumber}` : '';
        subtitle = [se, s.mediaTitle].filter(Boolean).join(' · ') || null;
      } else if (s.year) subtitle = String(s.year);
      return {
        id: s.id,
        title: title || 'Unknown',
        subtitle,
        user: s.username || '',
        server: s.serverName || '',
        state: s.state || 'playing',
        isTranscode: s.isTranscode === true || s.videoDecision === 'transcode' || s.audioDecision === 'transcode',
        resolution: s.resolution || null,
      };
    },

    // Pure: assemble the dashboard view-model from the four payloads.
    buildDashboard(stats, streams, violations, history) {
      const summary = (streams && streams.summary) || {};
      return {
        activeStreams: (stats && stats.activeStreams) != null ? stats.activeStreams : (summary.total || 0),
        totalUsers: (stats && stats.totalUsers) || 0,
        totalSessions: (stats && stats.totalSessions) || 0,
        recentViolations: (stats && stats.recentViolations) != null ? stats.recentViolations : ((violations && violations.meta && violations.meta.total) || 0),
        transcodes: summary.transcodes || 0,
        directStreams: (summary.directStreams || 0) + (summary.directPlays || 0),
        totalBitrate: summary.totalBitrate || null,
        streams: ((streams && streams.data) || []).map((s) => this.mapStream(s)),
      };
    },

    async _get(base, path, apiKey, params, signal) {
      const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
      const res = await fetch(`${this.normalizeBase(base)}${path}${qs}`, { cache: 'no-store', headers: this.authHeaders(apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async getData(base, opts, session, signal) {
      const apiKey = opts.apiKey;
      const [stats, streams] = await Promise.all([
        this._get(base, '/api/v1/public/stats', apiKey, null, signal),
        this._get(base, '/api/v1/public/streams', apiKey, null, signal),
      ]);
      // Optional endpoints — don't fail the dashboard if they error.
      const [violations, history] = await Promise.all([
        this._get(base, '/api/v1/public/violations', apiKey, { page: '1', pageSize: '5' }, signal).catch(() => null),
        this._get(base, '/api/v1/public/history', apiKey, { page: '1', pageSize: '10' }, signal).catch(() => null),
      ]);
      return this.buildDashboard(stats, streams, violations, history);
    },
    async testConnection(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/v1/public/health`, { cache: 'no-store', headers: this.authHeaders(opts.apiKey), signal });
      if (res.status === 401 || res.status === 403) throw new Error('invalid API key');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json().catch(() => null);
      return { ok: true };
    },
  };

  function fmtNum(n) { return Number(n || 0).toLocaleString(); }
  const STATE_ICON = { playing: '▶', paused: '❚❚', stopped: '■' };

  class TracearrWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', apiKey: '', pollMs: 15000, dataProvider: null }, config || {});
      this.data = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(10000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else if (this.data) this._render(this.data); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await TracearrApi.getData(this.cfg.baseUrl, { apiKey: this.cfg.apiKey }, null, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('tracearr-widget');
      this.el.innerHTML = `<div class="tc-header"><div class="tc-title">Tracearr</div><div class="tc-error" style="display:none"></div></div><div class="tc-body"></div>`;
      this.errorEl = this.el.querySelector('.tc-error'); this.body = this.el.querySelector('.tc-body');
    }
    _render(d) {
      const data = d || {};
      const tiles = [
        ['Active', fmtNum(data.activeStreams), 'tc-active'],
        ['Users', fmtNum(data.totalUsers), ''],
        ['Sessions', fmtNum(data.totalSessions), ''],
        ['Violations', fmtNum(data.recentViolations), data.recentViolations > 0 ? 'tc-warn' : ''],
      ];
      const streams = data.streams || [];
      const list = streams.length
        ? `<div class="tc-streams">${streams.map((s) => `
            <div class="tc-row">
              <span class="tc-state">${STATE_ICON[s.state] || '▶'}</span>
              <div class="tc-main"><span class="tc-stitle" title="${escapeAttr(s.title)}">${escapeHtml(s.title)}</span><span class="tc-ssub">${escapeHtml([s.subtitle, s.server].filter(Boolean).join(' · '))}</span></div>
              <div class="tc-right">${s.isTranscode ? `<span class="tc-badge tc-transcode">Transcode</span>` : `<span class="tc-badge tc-direct">Direct</span>`}<span class="tc-user">${escapeHtml(s.user)}</span></div>
            </div>`).join('')}</div>`
        : `<div class="tc-empty">No active streams.</div>`;
      this.body.innerHTML = `<div class="tc-grid">${tiles.map((t) => `<div class="tc-tile ${t[2]}"><span class="tc-val">${escapeHtml(t[1])}</span><span class="tc-lbl">${t[0]}</span></div>`).join('')}</div>${list}`;
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid API key|HTTP\s*40[13]/i.test(msg) ? 'Invalid API key' : 'Tracearr unavailable';
      this.el.classList.add('tc-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('tc-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.TracearrApi = TracearrApi;
  global.TracearrWidget = TracearrWidget;
})(typeof window !== 'undefined' ? window : this);
