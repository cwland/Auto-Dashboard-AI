// Auto Dashboard AI — Tautulli stats widgets
// ---------------------------------------------------------------------------
// Modular widgets mirroring sections of the Tautulli dashboard, built on the
// Tautulli HTTP API (uses TautulliApi from tautulli-widget.js):
//   • TautulliRecentWidget     — recently added library media
//   • TautulliWatchStatsWidget — most-watched movies & shows
//   • TautulliLibrariesWidget  — per-library item counts
//   • TautulliTopUsersWidget   — most active users & player platforms
//
// Each: new XWidget(el, { baseUrl, apiKey }).start(); ... .destroy();
//
// DESIGN NOTE: the visual style is inspired by Tautulli's dashboard but is a
// clean-room reimplementation — no Tautulli code (GPL-3.0) is copied. Only the
// documented public HTTP API is used.
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  const Api = () => global.TautulliApi;
  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(v) { return esc(v).replace(/"/g, '&quot;'); }
  const num = (v) => Number(v) || 0;

  function relTime(unixSec) {
    const s = Math.max(0, Math.floor(Date.now() / 1000) - num(unixSec));
    if (s < 90) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60); if (h < 48) return `${h}h ago`;
    const d = Math.round(h / 24); if (d < 14) return `${d}d ago`;
    return `${Math.round(d / 7)}w ago`;
  }
  const LIB_ICON = { movie: '🎬', show: '📺', artist: '🎵', photo: '🖼️', video: '🎞️' };

  // Shared lifecycle for a polling widget that renders rows into a carousel.
  class Base {
    constructor(container, config, cls) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', apiKey: '', pollMs: 5 * 60 * 1000, dataProvider: null,
        carousel: true, visibleCount: 5, speed: 18, onConfigChange: null }, config || {});
      this.cls = cls;
      this.pollTimer = null; this.abort = null; this.destroyed = false;
    }
    _initCarousel() {
      if (typeof ListCarousel === 'undefined' || !this.viewport || !this.track) return;
      this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track, enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed });
      if (this.lcToolsEl) ListCarousel.buildControls(this.lcToolsEl, this.cfg, (patch) => {
        this.carousel.update(patch);
        if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
      });
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(30000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); this.poll(); }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) this.carousel.destroy(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await this._fetch(this.abort && this.abort.signal);
        if (this.destroyed) return;
        this._clearError(); this._render(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }
    _header(icon, title) {
      return `<div class="ts-header"><img class="wg-icon" src="../icons/integrations/tautulli.svg" alt="">` +
        `<div class="ts-title">${esc(title)}</div><div class="ts-summary"></div><div class="lc-tools"></div>` +
        `<div class="ts-error" style="display:none"></div></div>`;
    }
    _grab() {
      this.summaryEl = this.el.querySelector('.ts-summary');
      this.errorEl = this.el.querySelector('.ts-error');
      this.body = this.el.querySelector('.ts-body');
      this.emptyEl = this.el.querySelector('.ts-empty');
      this.viewport = this.el.querySelector('.ts-viewport');
      this.track = this.el.querySelector('.ts-track');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
    }
    _setRows(html, count, summary) {
      if (this.summaryEl != null) this.summaryEl.textContent = summary || '';
      if (!html) { if (this.emptyEl) { this.emptyEl.style.display = ''; } if (this.viewport) this.viewport.style.display = 'none'; if (this.track) this.track.innerHTML = ''; return; }
      if (this.emptyEl) this.emptyEl.style.display = 'none';
      if (this.viewport) this.viewport.style.display = '';
      this.track.innerHTML = html;
      if (this.carousel) this.carousel.layout();
    }
    _showError(msg) { if (this.errorEl) { this.errorEl.style.display = 'block'; this.errorEl.textContent = 'Tautulli unavailable'; } }
    _clearError() { if (this.errorEl && this.errorEl.style.display !== 'none') this.errorEl.style.display = 'none'; }
  }

  // ── Recently Added ──────────────────────────────────────────────────────────
  class TautulliRecentWidget extends Base {
    constructor(c, cfg) { super(c, cfg, 'recent'); this._build(); }
    _build() {
      this.el.classList.add('tautulli-stats-widget', 'ts-recent');
      this.el.innerHTML = this._header('📺', 'Recently Added') +
        `<div class="ts-body"><div class="ts-empty" style="display:none">Nothing recently added</div>` +
        `<div class="ts-viewport"><div class="ts-track"></div></div></div>`;
      this._grab(); this._initCarousel();
    }
    async _fetch(signal) {
      const raw = await Api().getRecentlyAdded(this.cfg.baseUrl, this.cfg.apiKey, this.cfg.count || 12, signal);
      const b = this.cfg.baseUrl, k = this.cfg.apiKey;
      return raw.map((it) => {
        const ep = it.media_type === 'episode';
        const tr = it.media_type === 'track';
        return {
          title: ep || tr ? (it.grandparent_title || it.title) : (it.title || it.full_title),
          sub: ep ? `S${it.parent_media_index} · E${it.media_index} — ${it.title}` : (tr ? (it.parent_title || '') : (it.year || '')),
          poster: Api().posterUrl(b, k, it.grandparent_thumb || it.thumb || it.parent_thumb, 80, 120),
          added: relTime(it.added_at), library: it.library_name || '', icon: LIB_ICON[it.media_type] || '🎬',
        };
      });
    }
    _render(list) {
      const html = (list || []).map((r) => `<div class="ts-row ts-recent-row">
        <div class="ts-poster">${r.poster ? `<img alt="" data-pf src="${escAttr(r.poster)}">` : `<span class="ts-poster-ph">${r.icon}</span>`}</div>
        <div class="ts-rmain">
          <div class="ts-rtitle" title="${escAttr(r.title)}">${esc(r.title)}</div>
          <div class="ts-rsub" title="${escAttr(r.sub)}">${esc(r.sub)}</div>
          <div class="ts-rmeta">${esc(r.library)}${r.library ? ' · ' : ''}${esc(r.added)}</div>
        </div></div>`).join('');
      this._setRows(html, list.length, list.length ? `${list.length} items` : '');
      if (this.track) this.track.querySelectorAll('img[data-pf]').forEach((i) => { i.onerror = () => { i.style.visibility = 'hidden'; }; });
    }
  }

  // ── Watch Statistics (most-watched movies & shows) ──────────────────────────
  class TautulliWatchStatsWidget extends Base {
    constructor(c, cfg) { super(c, cfg, 'watch'); this._build(); }
    _build() {
      this.el.classList.add('tautulli-stats-widget', 'ts-watch');
      this.el.innerHTML = this._header('🏆', 'Most Watched') +
        `<div class="ts-body"><div class="ts-empty" style="display:none">No watch history</div>` +
        `<div class="ts-viewport"><div class="ts-track"></div></div></div>`;
      this._grab(); this._initCarousel();
    }
    async _fetch(signal) {
      const groups = await Api().getHomeStats(this.cfg.baseUrl, this.cfg.apiKey, { timeRange: this.cfg.timeRange || 30, count: 10 }, signal);
      const b = this.cfg.baseUrl, k = this.cfg.apiKey;
      const want = new Set(['top_movies', 'top_tv', 'top_music']);
      const rows = [];
      (groups || []).forEach((g) => {
        if (!want.has(g.stat_id)) return;
        (g.rows || []).forEach((r) => rows.push({
          title: r.title, plays: num(r.total_plays),
          poster: Api().posterUrl(b, k, r.grandparent_thumb || r.thumb, 80, 120),
          type: g.stat_id === 'top_tv' ? '📺' : g.stat_id === 'top_music' ? '🎵' : '🎬',
        }));
      });
      rows.sort((a, b2) => b2.plays - a.plays);
      return rows.slice(0, this.cfg.count || 12);
    }
    _render(list) {
      const html = (list || []).map((r, i) => `<div class="ts-row ts-watch-row">
        <span class="ts-rank">${i + 1}</span>
        <div class="ts-poster ts-poster-sm">${r.poster ? `<img alt="" data-pf src="${escAttr(r.poster)}">` : `<span class="ts-poster-ph">${r.type}</span>`}</div>
        <div class="ts-rmain"><div class="ts-rtitle" title="${escAttr(r.title)}">${esc(r.title)}</div></div>
        <span class="ts-plays">${r.plays} <small>plays</small></span></div>`).join('');
      this._setRows(html, list.length, '');
      if (this.track) this.track.querySelectorAll('img[data-pf]').forEach((i) => { i.onerror = () => { i.style.visibility = 'hidden'; }; });
    }
  }

  // ── Library Statistics ──────────────────────────────────────────────────────
  class TautulliLibrariesWidget extends Base {
    constructor(c, cfg) { super(c, cfg, 'libs'); this._build(); }
    _build() {
      this.el.classList.add('tautulli-stats-widget', 'ts-libs');
      this.el.innerHTML = this._header('📚', 'Libraries') +
        `<div class="ts-body"><div class="ts-empty" style="display:none">No libraries</div><div class="ts-grid"></div></div>`;
      this.summaryEl = this.el.querySelector('.ts-summary');
      this.errorEl = this.el.querySelector('.ts-error');
      this.emptyEl = this.el.querySelector('.ts-empty');
      this.gridEl = this.el.querySelector('.ts-grid');
    }
    async _fetch(signal) {
      const libs = await Api().getLibraries(this.cfg.baseUrl, this.cfg.apiKey, signal);
      return (libs || []).map((l) => this._mapLib(l));
    }
    _mapLib(l) {
      const t = (l.section_type || '').toLowerCase();
      const c = num(l.count), pc = num(l.parent_count), cc = num(l.child_count);
      let primary, secondary;
      if (t === 'show') { primary = `${c} shows`; secondary = `${pc} seasons · ${cc} episodes`; }
      else if (t === 'artist') { primary = `${c} artists`; secondary = `${pc} albums · ${cc} tracks`; }
      else if (t === 'movie') { primary = `${c} movies`; secondary = ''; }
      else if (t === 'photo') { primary = `${c} photos`; secondary = ''; }
      else { primary = `${c} items`; secondary = ''; }
      return { name: l.section_name, type: t, icon: LIB_ICON[t] || '📁', primary, secondary };
    }
    _render(list) {
      if (this.summaryEl) this.summaryEl.textContent = list.length ? `${list.length} libraries` : '';
      if (!list.length) { this.emptyEl.style.display = ''; this.gridEl.innerHTML = ''; return; }
      this.emptyEl.style.display = 'none';
      this.gridEl.innerHTML = list.map((l) => `<div class="ts-lib">
        <span class="ts-lib-ico">${l.icon}</span>
        <div class="ts-lib-main"><div class="ts-lib-name" title="${escAttr(l.name)}">${esc(l.name)}</div>
        <div class="ts-lib-c1">${esc(l.primary)}</div>${l.secondary ? `<div class="ts-lib-c2">${esc(l.secondary)}</div>` : ''}</div></div>`).join('');
    }
    _showError(msg) { if (this.errorEl) { this.errorEl.style.display = 'block'; this.errorEl.textContent = 'Tautulli unavailable'; } }
    _clearError() { if (this.errorEl && this.errorEl.style.display !== 'none') this.errorEl.style.display = 'none'; }
  }

  // ── Top Users & Platforms ───────────────────────────────────────────────────
  class TautulliTopUsersWidget extends Base {
    constructor(c, cfg) { super(c, cfg, 'top'); this._build(); }
    _build() {
      this.el.classList.add('tautulli-stats-widget', 'ts-top');
      this.el.innerHTML = this._header('👥', 'Top Users & Platforms') +
        `<div class="ts-body"><div class="ts-empty" style="display:none">No activity</div>` +
        `<div class="ts-cols"><div class="ts-col" data-col="users"><div class="ts-col-h">Users</div><div class="ts-col-list" data-list="users"></div></div>` +
        `<div class="ts-col" data-col="platforms"><div class="ts-col-h">Platforms</div><div class="ts-col-list" data-list="platforms"></div></div></div></div>`;
      this.summaryEl = this.el.querySelector('.ts-summary');
      this.errorEl = this.el.querySelector('.ts-error');
      this.emptyEl = this.el.querySelector('.ts-empty');
      this.colsEl = this.el.querySelector('.ts-cols');
      this.usersEl = this.el.querySelector('[data-list="users"]');
      this.platformsEl = this.el.querySelector('[data-list="platforms"]');
    }
    async _fetch(signal) {
      const groups = await Api().getHomeStats(this.cfg.baseUrl, this.cfg.apiKey, { timeRange: this.cfg.timeRange || 30, count: 6 }, signal);
      const b = this.cfg.baseUrl, k = this.cfg.apiKey;
      const find = (id) => (groups || []).find((g) => g.stat_id === id) || { rows: [] };
      const users = find('top_users').rows.map((r) => ({ name: r.friendly_name || r.user || 'Unknown', plays: num(r.total_plays), thumb: r.user_thumb && /^https?:|^\//.test(r.user_thumb) ? Api().posterUrl(b, k, r.user_thumb, 60, 60) : '' }));
      const platforms = find('top_platforms').rows.map((r) => ({ name: r.platform || 'Unknown', plays: num(r.total_plays) }));
      return { users, platforms };
    }
    _render(data) {
      const d = data || { users: [], platforms: [] };
      const empty = !(d.users && d.users.length) && !(d.platforms && d.platforms.length);
      if (this.emptyEl) this.emptyEl.style.display = empty ? '' : 'none';
      if (this.colsEl) this.colsEl.style.display = empty ? 'none' : '';
      const initial = (n) => esc((String(n).trim()[0] || '?').toUpperCase());
      this.usersEl.innerHTML = (d.users || []).map((u) => `<div class="ts-ur">
        <span class="ts-ur-av">${u.thumb ? `<img alt="" data-pf src="${escAttr(u.thumb)}">` : initial(u.name)}</span>
        <span class="ts-ur-n" title="${escAttr(u.name)}">${esc(u.name)}</span>
        <span class="ts-ur-p">${u.plays}</span></div>`).join('');
      this.platformsEl.innerHTML = (d.platforms || []).map((p) => `<div class="ts-ur">
        <span class="ts-ur-n" title="${escAttr(p.name)}">${esc(p.name)}</span>
        <span class="ts-ur-p">${p.plays}</span></div>`).join('');
      this.el.querySelectorAll('img[data-pf]').forEach((i) => { i.onerror = () => { i.style.visibility = 'hidden'; }; });
    }
    _showError(msg) { if (this.errorEl) { this.errorEl.style.display = 'block'; this.errorEl.textContent = 'Tautulli unavailable'; } }
    _clearError() { if (this.errorEl && this.errorEl.style.display !== 'none') this.errorEl.style.display = 'none'; }
  }

  global.TautulliRecentWidget = TautulliRecentWidget;
  global.TautulliWatchStatsWidget = TautulliWatchStatsWidget;
  global.TautulliLibrariesWidget = TautulliLibrariesWidget;
  global.TautulliTopUsersWidget = TautulliTopUsersWidget;
})(typeof window !== 'undefined' ? window : this);
