// Auto Dashboard AI — Tautulli Widget (reusable component)
// ---------------------------------------------------------------------------
// A self-contained, framework-free widget that renders Tautulli activity.
//
// It is intentionally decoupled from the config page so the SAME class can be
// reused later for dashboard deployment: instantiate with a container element
// and a config object, call start(), and call destroy() when the host element
// goes away. The widget owns its own polling, error handling, DOM reconciliation
// and carousel animation — callers never have to re-render it.
//
//   const w = new TautulliWidget(el, { baseUrl, apiKey, maxVisible: 3 });
//   w.start();
//   ...
//   w.destroy();
//
// Exposed on window as TautulliWidget and TautulliApi.
'use strict';

(function (global) {
  // ─── API helper ───────────────────────────────────────────────────────────
  const TautulliApi = {
    normalizeBase(url) {
      return String(url || '').trim().replace(/\/+$/, '');
    },

    buildUrl(base, apiKey, cmd, params) {
      const qs = new URLSearchParams(Object.assign(
        { apikey: apiKey, cmd, out_type: 'json' },
        params || {}
      ));
      return `${this.normalizeBase(base)}/api/v2?${qs.toString()}`;
    },

    // Fetches current activity. Throws on transport error OR on a Tautulli
    // error result (e.g. invalid apikey), so callers get one clear failure path.
    async getActivity(base, apiKey, signal) {
      const res = await fetch(
        this.buildUrl(base, apiKey, 'get_activity'),
        { cache: 'no-store', signal }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let json;
      try {
        json = await res.json();
      } catch {
        throw new Error('Invalid response from Tautulli');
      }
      const r = json && json.response;
      if (!r || r.result !== 'success') {
        throw new Error((r && r.message) || 'Tautulli returned an error');
      }
      return r.data || {};
    },

    // Image proxied through Tautulli (so it works regardless of Plex auth).
    posterUrl(base, apiKey, img, w, h) {
      if (!img) return null;
      return this.buildUrl(base, apiKey, 'pms_image_proxy', {
        img, width: w || 300, height: h || 450, fallback: 'poster',
      });
    },

    // Generic JSON API call → returns response.data (throws on error).
    async _call(base, apiKey, cmd, params, signal) {
      const res = await fetch(this.buildUrl(base, apiKey, cmd, params || {}), { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let json;
      try { json = await res.json(); } catch { throw new Error('Invalid response from Tautulli'); }
      const r = json && json.response;
      if (!r || r.result !== 'success') throw new Error((r && r.message) || 'Tautulli returned an error');
      return r.data;
    },
    async getRecentlyAdded(base, apiKey, count, signal) {
      const d = await this._call(base, apiKey, 'get_recently_added', { count: count || 12 }, signal);
      return (d && d.recently_added) || [];
    },
    async getHomeStats(base, apiKey, opts, signal) {
      return (await this._call(base, apiKey, 'get_home_stats', {
        time_range: (opts && opts.timeRange) || 30, stats_count: (opts && opts.count) || 10,
      }, signal)) || [];
    },
    async getLibraries(base, apiKey, signal) {
      return (await this._call(base, apiKey, 'get_libraries', {}, signal)) || [];
    },
  };

  // ─── Small formatting helpers ─────────────────────────────────────────────
  const fmt = {
    mbps(kbps) {
      const n = Number(kbps);
      if (!isFinite(n) || n <= 0) return '0.0 Mbps';
      return `${(n / 1000).toFixed(1)} Mbps`;
    },

    // ms → M:SS or H:MM:SS
    clock(ms) {
      let s = Math.max(0, Math.round(Number(ms) / 1000));
      const h = Math.floor(s / 3600); s -= h * 3600;
      const m = Math.floor(s / 60);   s -= m * 60;
      const pad = (x) => String(x).padStart(2, '0');
      return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
    },

    // wall-clock finish time (assumes ~1x playback)
    eta(viewOffsetMs, durationMs) {
      const remaining = Number(durationMs) - Number(viewOffsetMs);
      if (!isFinite(remaining) || remaining <= 0) return '--:--';
      const d = new Date(Date.now() + remaining);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    },

    cap(str) {
      return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    },
  };

  // Turn a raw Tautulli session object into the display fields the card needs.
  function describeSession(s, base, apiKey) {
    const decision = (s.transcode_decision || s.stream_video_decision || '').toLowerCase();
    const throttled = String(s.transcode_throttled) === '1' || String(s.throttled) === '1';

    const streamLabel = (() => {
      if (decision === 'transcode') return throttled ? 'Transcode (Throttled)' : 'Transcode';
      if (decision === 'copy')      return 'Direct Stream';
      if (decision === 'direct play') return 'Direct Play';
      return fmt.cap(decision) || '—';
    })();

    // Quality + bitrate, e.g. "Original (4.2 Mbps)"
    const quality = (() => {
      const q = s.quality_profile || 'Original';
      const br = Number(s.stream_bitrate);
      return br > 0 ? `${q} (${(br / 1000).toFixed(1)} Mbps)` : q;
    })();

    // Container: "Converting (MKV → MP4)" or "Direct (MKV)"
    const container = (() => {
      const src = (s.container || '').toUpperCase();
      const out = (s.stream_container || '').toUpperCase();
      const converting = String(s.stream_container_decision).toLowerCase() === 'transcode'
        || (src && out && src !== out);
      if (!src && !out) return '—';
      return converting ? `Converting (${src} → ${out})` : `Direct (${src || out})`;
    })();

    const videoDecision = (s.stream_video_decision || s.video_decision || '').toLowerCase();
    const video = (() => {
      const label = videoDecision === 'transcode' ? 'Transcode'
        : videoDecision === 'copy' ? 'Direct Stream'
        : videoDecision === 'direct play' ? 'Direct Play' : fmt.cap(videoDecision) || '—';
      const codec = (s.stream_video_codec || s.video_codec || '').toUpperCase();
      const res = s.stream_video_resolution || s.video_resolution || '';
      const detail = [codec, res ? `${res}p`.replace(/p+p$/, 'p') : ''].filter(Boolean).join(' ');
      return detail ? `${label} (${detail})` : label;
    })();

    const audioDecision = (s.stream_audio_decision || s.audio_decision || '').toLowerCase();
    const audio = (() => {
      const label = audioDecision === 'transcode' ? 'Transcode'
        : audioDecision === 'copy' ? 'Direct Stream'
        : audioDecision === 'direct play' ? 'Direct Play' : fmt.cap(audioDecision) || '—';
      const lang = s.audio_language || '';
      const srcCodec = (s.audio_codec || '').toUpperCase();
      const srcLayout = s.audio_channel_layout || '';
      const outCodec = (s.stream_audio_codec || '').toUpperCase();
      const outLayout = s.stream_audio_channel_layout || '';
      let detail;
      if (audioDecision === 'transcode' && outCodec) {
        const from = [srcCodec, srcLayout].filter(Boolean).join(' ');
        const to = [outCodec, fmt.cap(outLayout)].filter(Boolean).join(' ');
        detail = [lang, [from, to].filter(Boolean).join(' → ')].filter(Boolean).join(' - ');
      } else {
        detail = [lang, [srcCodec, srcLayout].filter(Boolean).join(' ')].filter(Boolean).join(' - ');
      }
      return detail ? `${label} (${detail})` : label;
    })();

    const subtitle = (() => {
      const on = String(s.subtitles) === '1';
      if (!on) return 'None';
      const dec = (s.stream_subtitle_decision || s.subtitle_decision || '').toLowerCase();
      const codec = (s.stream_subtitle_codec || s.subtitle_codec || '').toUpperCase();
      const lang = s.subtitle_language || '';
      const label = dec === 'transcode' ? 'Transcode' : dec === 'burn' ? 'Burn' : dec === 'copy' ? 'Direct' : fmt.cap(dec) || 'On';
      const detail = [lang, codec].filter(Boolean).join(' ');
      return detail ? `${label} (${detail})` : label;
    })();

    const location = (() => {
      const loc = (s.location || s.ip_address_public ? s.location : '') || '';
      const tag = (loc || (s.local === '1' ? 'lan' : 'wan')).toUpperCase();
      const ip = s.ip_address || s.ip_address_public || '';
      return ip ? `${tag}: ${ip}` : tag || '—';
    })();

    const viewOffset = Number(s.view_offset) || 0;
    const duration = Number(s.duration) || 0;
    const pct = duration > 0
      ? Math.min(100, Math.max(0, (viewOffset / duration) * 100))
      : Number(s.progress_percent) || 0;

    // Footer title + index line (matches Tautulli's card footer)
    const footTitle = (() => {
      if (s.media_type === 'episode') {
        return [s.grandparent_title, s.title].filter(Boolean).join(' - ');
      }
      if (s.media_type === 'track') {
        return [s.grandparent_title || s.original_title, s.title].filter(Boolean).join(' - ');
      }
      return s.full_title || s.title || '';
    })();

    const footSub = (() => {
      if (s.media_type === 'episode') {
        const season = s.parent_media_index;
        const ep = s.media_index;
        if (season != null && ep != null) return `S${season} · E${ep}`;
        return s.year ? String(s.year) : '';
      }
      if (s.media_type === 'track') return s.parent_title || '';
      return s.year ? String(s.year) : '';
    })();

    const state = (s.state || '').toLowerCase(); // playing | paused | buffering
    const stateIcon = state === 'paused' ? '❚❚'
      : state === 'buffering' ? '◍'
      : '▶';

    // Media-type glyph next to the index line
    const mediaIcon = s.media_type === 'movie' ? '🎬'
      : s.media_type === 'track' ? '🎵' : '🖥';

    // Platform icon — Tautulli serves these as static SVGs at the web root.
    const platformSlug = String(s.platform_name || s.platform || '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '');
    const platformIcon = platformSlug
      ? `${TautulliApi.normalizeBase(base)}/images/platforms/${platformSlug}.svg`
      : '';

    // Avatar: real Plex thumb if present, else a colored initial.
    const avatarName = s.friendly_name || s.user || 'Unknown';
    const avatarInitial = (avatarName.trim()[0] || '?').toUpperCase();
    const AV_COLORS = ['#e07a7a', '#e0a36a', '#d9c45a', '#7ec07e', '#5fb6c4', '#6f8fe0', '#a07fe0', '#d27ab8'];
    let hash = 0;
    for (let i = 0; i < avatarName.length; i++) hash = (hash * 31 + avatarName.charCodeAt(i)) >>> 0;
    const avatarColor = AV_COLORS[hash % AV_COLORS.length];
    const avatarImg = s.user_thumb && /^https?:|^\//.test(s.user_thumb)
      ? TautulliApi.posterUrl(base, apiKey, s.user_thumb, 80, 80)
      : '';

    const secure = String(s.secure) === '1' || s.secure === true;

    return {
      key: String(s.session_key || s.session_id || `${s.user}-${s.title}`),
      poster: TautulliApi.posterUrl(base, apiKey, s.grandparent_thumb || s.thumb || s.parent_thumb),
      backdrop: TautulliApi.posterUrl(base, apiKey, s.art || s.grandparent_art, 600, 340),
      username: s.friendly_name || s.user || 'Unknown',
      product: s.product || '—',
      player: s.player || '—',
      quality,
      qualityWarn: (s.transcode_decision || '').toLowerCase() === 'transcode',
      stream: streamLabel,
      container,
      video,
      audio,
      subtitle,
      location,
      secure,
      bandwidth: fmt.mbps(s.bandwidth),
      eta: fmt.eta(viewOffset, duration),
      progressText: `${fmt.clock(viewOffset)} / ${fmt.clock(duration)}`,
      progressPct: pct,
      state,
      stateIcon,
      mediaIcon,
      footTitle,
      footSub,
      platformIcon,
      avatarInitial,
      avatarColor,
      avatarImg,
    };
  }

  // ─── Widget ────────────────────────────────────────────────────────────────
  // Fields grouped exactly like Tautulli's card, with blank rows between groups.
  const FIELD_GROUPS = [
    [['Product', 'product'], ['Player', 'player'], ['Quality', 'quality']],
    [['Stream', 'stream'], ['Container', 'container'], ['Video', 'video'],
     ['Audio', 'audio'], ['Subtitle', 'subtitle']],
    [['Location', 'location'], ['Bandwidth', 'bandwidth']],
  ];
  const CARD_FIELDS = FIELD_GROUPS.flat();

  class TautulliWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        { baseUrl: '', apiKey: '', maxVisible: 3, pollMs: 5000, dwellMs: 4000, carousel: true },
        config || {}
      );

      this.cards = new Map();     // key -> { el, fields:Map, data }
      this.order = [];            // ring order of keys
      this.mode = null;           // 'empty' | 'static' | 'carousel'
      this.animating = false;     // a rotation transition is in flight
      this.pending = null;        // data deferred because we were mid-animation
      this.rotateTimer = null;
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this.gap = 14;
      this.stepMs = 1400;         // duration of one rotation slide (slow, smooth glide)

      this._buildSkeleton();

      this._onResize = () => this._layout();
      this.ro = ('ResizeObserver' in global)
        ? new ResizeObserver(this._onResize)
        : null;
      if (this.ro) this.ro.observe(this.el);
      else global.addEventListener('resize', this._onResize);
    }

    // ── lifecycle ─────────────────────────────────────────────────────────
    start() {
      this.stop();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), this.cfg.pollMs);
    }

    stop() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.abort) { this.abort.abort(); this.abort = null; }
      this._stopRotation();
    }

    setConfig(patch) {
      const prevDwell = this.cfg.dwellMs;
      Object.assign(this.cfg, patch || {});
      this._layout();
      // If the speed changed while idling between slides, apply it immediately.
      if (this.mode === 'carousel' && !this.animating && this.cfg.dwellMs !== prevDwell) {
        this._scheduleStep();
      }
    }

    destroy() {
      this.destroyed = true;
      this.stop();
      if (this.ro) this.ro.disconnect();
      else global.removeEventListener('resize', this._onResize);
      this.el.innerHTML = '';
    }

    // ── data ──────────────────────────────────────────────────────────────
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = await TautulliApi.getActivity(
          this.cfg.baseUrl, this.cfg.apiKey, this.abort && this.abort.signal
        );
        this._clearError();
        this._apply(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _apply(data) {
      // Header summary
      const count = Number(data.stream_count) || 0;
      const transcodes = Number(data.stream_count_transcode) || 0;
      const total = fmt.mbps(data.total_bandwidth);
      const lan = fmt.mbps(data.lan_bandwidth);

      if (count <= 0) {
        this.headerTitle.textContent = 'Tautulli';
        this.headerSummary.textContent = '';
        this.noStreams.style.display = 'flex';
      } else {
        this.headerTitle.textContent = 'Tautulli';
        const sLabel = `${count} stream${count === 1 ? '' : 's'}`;
        const tLabel = `${transcodes} transcode${transcodes === 1 ? '' : 's'}`;
        this.headerSummary.textContent =
          `Sessions: ${sLabel} (${tLabel}) | Bandwidth: ${total} (LAN: ${lan})`;
        this.noStreams.style.display = 'none';
      }

      const sessions = (data.sessions || []).map((s) =>
        describeSession(s, this.cfg.baseUrl, this.cfg.apiKey));

      // Don't restructure the DOM in the middle of a rotation slide — defer.
      if (this.animating) { this.pending = sessions; return; }
      this._reconcile(sessions);
    }

    // Add new cards / drop gone cards / update changed fields in place.
    _reconcile(sessions) {
      const incoming = new Map(sessions.map((s) => [s.key, s]));

      // Remove cards whose session ended.
      for (const key of Array.from(this.cards.keys())) {
        if (!incoming.has(key)) {
          const entry = this.cards.get(key);
          if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
          this.cards.delete(key);
        }
      }

      // Add new sessions to the end of the ring (appear "naturally" next cycle).
      for (const s of sessions) {
        if (!this.cards.has(s.key)) {
          this.cards.set(s.key, this._createCard(s));
          this.track.appendChild(this.cards.get(s.key).el);
        } else {
          this._updateCard(this.cards.get(s.key), s);
        }
      }

      // Rebuild ring order: keep existing order, append newcomers, drop missing.
      const next = this.order.filter((k) => incoming.has(k));
      for (const s of sessions) if (!next.includes(s.key)) next.push(s.key);
      this.order = next;

      this._reorderDom();
      this._layout();
    }

    // ── DOM construction ────────────────────────────────────────────────────
    _buildSkeleton() {
      this.el.classList.add('tautulli-widget');
      this.el.innerHTML = `
        <div class="tw-header">
          <img class="wg-icon" src="../icons/integrations/tautulli.svg" alt="">
          <div class="tw-header-title"></div>
          <div class="tw-header-summary"></div>
          <div class="tw-tools"></div>
          <div class="tw-error" style="display:none"></div>
        </div>
        <div class="tw-body">
          <div class="tw-empty" style="display:none">No Streams</div>
          <div class="tw-viewport"><div class="tw-track"></div></div>
        </div>`;
      this.headerTitle   = this.el.querySelector('.tw-header-title');
      this.headerSummary = this.el.querySelector('.tw-header-summary');
      this.errorEl       = this.el.querySelector('.tw-error');
      this.noStreams     = this.el.querySelector('.tw-empty');
      this.viewport      = this.el.querySelector('.tw-viewport');
      this.track         = this.el.querySelector('.tw-track');
      this.track.addEventListener('transitionend', (e) => {
        if (e.target === this.track && e.propertyName === 'transform') this._onStepDone();
      });
      this._buildTools();
    }

    // Rearrange-mode config controls: # streams (maxVisible) and transition
    // speed (dwell seconds between rotations). Hidden in normal view via CSS.
    _buildTools() {
      const tools = this.el.querySelector('.tw-tools');
      if (!tools) return;
      // Compact value + stacked ▲/▼ spinner.
      const stepper = (label, get, set, min, max, fmtVal) => {
        const grp = document.createElement('div'); grp.className = 'tw-toolgrp';
        const lab = document.createElement('span'); lab.className = 'tw-tlabel'; lab.textContent = label;
        const cnt = document.createElement('span'); cnt.className = 'tw-tcount';
        const spin = document.createElement('span'); spin.className = 'tw-spin';
        const inc = document.createElement('button'); inc.className = 'tw-step'; inc.type = 'button'; inc.textContent = '▲'; inc.title = 'Increase ' + label;
        const dec = document.createElement('button'); dec.className = 'tw-step'; dec.type = 'button'; dec.textContent = '▼'; dec.title = 'Decrease ' + label;
        const draw = () => { cnt.textContent = fmtVal(get()); };
        dec.addEventListener('click', () => { set(Math.max(min, get() - 1)); draw(); });
        inc.addEventListener('click', () => { set(Math.min(max, get() + 1)); draw(); });
        spin.append(inc, dec); grp.append(lab, cnt, spin); tools.appendChild(grp); draw();
      };
      // Carousel enable/disable toggle.
      const tgrp = document.createElement('div'); tgrp.className = 'tw-toolgrp';
      const tbtn = document.createElement('button'); tbtn.type = 'button'; tbtn.className = 'tw-toggle';
      const drawTog = () => { tbtn.textContent = 'Scroll ' + (this.cfg.carousel === false ? 'Off' : 'On'); };
      tbtn.addEventListener('click', () => {
        this.cfg.carousel = (this.cfg.carousel === false);
        this.setConfig({ carousel: this.cfg.carousel });
        if (this.onConfigChange) this.onConfigChange({ carousel: this.cfg.carousel });
        drawTog();
      });
      tgrp.appendChild(tbtn); tools.appendChild(tgrp); drawTog();
      stepper('Streams',
        () => this.cfg.maxVisible,
        (v) => { this.setConfig({ maxVisible: v }); if (this.onConfigChange) this.onConfigChange({ maxVisible: v }); },
        1, 6, (v) => String(v));
      stepper('Speed',
        () => Math.round(this.cfg.dwellMs / 1000),
        (v) => { const ms = v * 1000; this.setConfig({ dwellMs: ms }); if (this.onConfigChange) this.onConfigChange({ dwellMs: ms }); },
        2, 12, (v) => v + 's');
    }

    _createCard(s) {
      const el = document.createElement('div');
      el.className = 'tw-card';
      el.dataset.key = s.key;

      // Build the grouped two-column field grid (gray label / white value).
      const groupsHtml = FIELD_GROUPS.map((group) =>
        `<div class="tw-fgroup">` +
        group.map(([label, k]) =>
          `<div class="tw-row">` +
          `<span class="tw-k">${label}</span>` +
          `<span class="tw-v">` +
          (k === 'location' ? `<span class="tw-lock" data-f="lock"></span>` : '') +
          `<span data-f="${k}"></span>` +
          (k === 'quality' ? `<span class="tw-info" data-f="qinfo">i</span>` : '') +
          (k === 'bandwidth' ? `<span class="tw-info">i</span>` : '') +
          `</span></div>`).join('') +
        `</div>`).join('');

      el.innerHTML = `
        <div class="tw-bg" data-f="bg"></div>
        <div class="tw-platform"><img class="tw-platform-img" alt="" data-f="platform"></div>
        <div class="tw-main">
          <div class="tw-poster"><img alt="" loading="lazy" data-f="posterImg"></div>
          <div class="tw-detail">
            <div class="tw-grid">${groupsHtml}</div>
            <div class="tw-detail-bottom">
              <div class="tw-pbmeta">
                <div class="tw-eta">ETA: <span data-f="eta"></span></div>
                <div class="tw-ptext" data-f="progressText"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="tw-progress"><div class="tw-progress-bar" data-f="bar"></div></div>
        <div class="tw-footer">
          <span class="tw-state" data-f="stateIcon"></span>
          <div class="tw-foot-titles">
            <div class="tw-foot-title" data-f="footTitle"></div>
            <div class="tw-foot-sub"><span class="tw-foot-mediaicon" data-f="mediaIcon"></span><span data-f="footSub"></span></div>
          </div>
          <div class="tw-foot-spacer"></div>
          <div class="tw-foot-userblock">
            <span class="tw-avatar" data-f="avatar"><img alt="" data-f="avatarImg"></span>
            <span class="tw-foot-user" data-f="username"></span>
          </div>
        </div>`;

      const fields = new Map();
      el.querySelectorAll('[data-f]').forEach((node) => {
        if (!fields.has(node.dataset.f)) fields.set(node.dataset.f, node);
      });
      const entry = {
        el, fields, data: {},
        img: fields.get('posterImg'),
        bg: fields.get('bg'),
        platformImg: fields.get('platform'),
        avatarEl: fields.get('avatar'),
        avatarImg: fields.get('avatarImg'),
      };
      this._updateCard(entry, s);
      return entry;
    }

    // Only writes to the DOM where a value actually changed (cheap diff).
    _updateCard(entry, s) {
      const prev = entry.data || {};
      const setText = (f, val) => {
        if (prev[f] === val) return;
        const node = entry.fields.get(f);
        if (node) node.textContent = val;
      };

      setText('username', s.username);
      setText('eta', s.eta);
      setText('progressText', s.progressText);
      setText('stateIcon', s.stateIcon);
      setText('mediaIcon', s.mediaIcon);
      setText('footTitle', s.footTitle);
      setText('footSub', s.footSub);
      for (const [, k] of CARD_FIELDS) setText(k, s[k]);

      // Quality transcode warning icon
      if (prev.qualityWarn !== s.qualityWarn) {
        const qi = entry.fields.get('qinfo');
        if (qi) qi.style.display = s.qualityWarn ? '' : 'none';
      }
      // Secure lock before the location value
      if (prev.secure !== s.secure) {
        const lock = entry.fields.get('lock');
        if (lock) lock.textContent = s.secure ? '🔒 ' : '';
      }

      if (prev.progressPct !== s.progressPct) {
        const bar = entry.fields.get('bar');
        if (bar) bar.style.width = `${s.progressPct.toFixed(1)}%`;
      }

      // Poster — swap src only on change to avoid reload flicker.
      if (prev.poster !== s.poster) {
        if (s.poster) { entry.img.src = s.poster; entry.img.style.display = ''; }
        else { entry.img.removeAttribute('src'); entry.img.style.display = 'none'; }
      }

      // Blurred backdrop art behind the card.
      if (prev.backdrop !== s.backdrop && entry.bg) {
        entry.bg.style.backgroundImage = s.backdrop ? `url("${s.backdrop}")` : '';
      }

      // Platform icon (hide if it fails to load).
      if (prev.platformIcon !== s.platformIcon && entry.platformImg) {
        if (s.platformIcon) {
          entry.platformImg.style.display = '';
          entry.platformImg.onerror = () => { entry.platformImg.style.display = 'none'; };
          entry.platformImg.src = s.platformIcon;
        } else {
          entry.platformImg.style.display = 'none';
        }
      }

      // Avatar: image if available, else colored initial.
      if (prev.avatarImg !== s.avatarImg || prev.avatarInitial !== s.avatarInitial
          || prev.avatarColor !== s.avatarColor) {
        if (entry.avatarEl) {
          entry.avatarEl.style.background = s.avatarColor;
          entry.avatarEl.setAttribute('data-initial', s.avatarInitial);
        }
        if (entry.avatarImg) {
          if (s.avatarImg) {
            entry.avatarImg.style.display = '';
            entry.avatarImg.onerror = () => { entry.avatarImg.style.display = 'none'; };
            entry.avatarImg.src = s.avatarImg;
          } else {
            entry.avatarImg.removeAttribute('src');
            entry.avatarImg.style.display = 'none';
          }
        }
      }

      entry.el.classList.toggle('tw-paused', s.state === 'paused');
      entry.el.classList.toggle('tw-buffering', s.state === 'buffering');
      entry.data = s;
    }

    _reorderDom() {
      // Re-append in ring order so DOM matches this.order.
      for (const key of this.order) {
        const entry = this.cards.get(key);
        if (entry) this.track.appendChild(entry.el);
      }
    }

    // ── layout & carousel ────────────────────────────────────────────────────
    _layout() {
      const count = this.order.length;
      const max = Math.max(1, parseInt(this.cfg.maxVisible, 10) || 1);
      const vw = this.viewport.clientWidth || this.el.clientWidth || 0;

      let mode;
      if (count === 0) mode = 'empty';
      else if (count <= max) mode = 'static';
      else mode = 'carousel';
      // Carousel disabled by config → never rotate (show up to `max` statically).
      if (this.cfg.carousel === false && mode === 'carousel') mode = 'static';

      // slots determine card width: fill the row in static mode, exactly max in carousel
      const slots = mode === 'carousel' ? max : Math.max(1, Math.min(count, max));
      const cardW = vw > 0 ? Math.floor((vw - this.gap * (slots - 1)) / slots) : 240;
      this.cardW = cardW;
      this.track.style.setProperty('--tw-card-w', `${cardW}px`);
      this.track.style.setProperty('--tw-gap', `${this.gap}px`);

      // Narrow cards switch to a tighter type scale.
      this.el.classList.toggle('tw-compact', cardW < 300);

      this.viewport.style.display = count === 0 ? 'none' : 'block';

      if (mode !== 'carousel') {
        this._stopRotation();
        this.track.style.transition = 'none';
        this.track.style.transform = 'translateX(0)';
      }

      const wasCarousel = this.mode === 'carousel';
      this.mode = mode;

      if (mode === 'carousel' && !wasCarousel) {
        this._startRotation();
      } else if (mode === 'carousel' && wasCarousel && !this.rotateTimer && !this.animating) {
        // still in carousel (e.g. after a reconcile) — make sure the loop is alive
        this._scheduleStep();
      }
    }

    _startRotation() {
      this._stopRotation();
      this.track.style.transition = 'none';
      this.track.style.transform = 'translateX(0)';
      this._scheduleStep();
    }

    _scheduleStep() {
      if (this.rotateTimer) clearTimeout(this.rotateTimer);
      const dwell = Math.max(400, parseInt(this.cfg.dwellMs, 10) || 4000);
      this.rotateTimer = setTimeout(() => this._step(), dwell);
    }

    // Slide left by exactly one card, then move the first card to the back and
    // snap back to 0. The content under the viewport is identical before and
    // after the snap, so the loop is seamless and never "resets to the start".
    _step() {
      if (this.mode !== 'carousel' || this.order.length === 0) return;
      this.animating = true;
      const dist = this.cardW + this.gap;
      this.track.style.transition = `transform ${this.stepMs}ms cubic-bezier(0.65, 0, 0.35, 1)`;
      this.track.style.transform = `translateX(-${dist}px)`;
    }

    _onStepDone() {
      if (!this.animating) return;
      this.animating = false;

      // rotate ring: first → last
      const first = this.order.shift();
      if (first != null) this.order.push(first);
      this._reorderDom();

      // snap back without animating
      this.track.style.transition = 'none';
      this.track.style.transform = 'translateX(0)';
      // force reflow so the next transition starts cleanly
      void this.track.offsetWidth;

      // apply any data update that arrived mid-slide
      if (this.pending) {
        const p = this.pending; this.pending = null;
        this._reconcile(p);
      }

      if (this.mode === 'carousel') this._scheduleStep();
    }

    _stopRotation() {
      if (this.rotateTimer) { clearTimeout(this.rotateTimer); this.rotateTimer = null; }
      this.animating = false;
    }

    // ── error state ───────────────────────────────────────────────────────
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /apikey/i.test(msg)
        ? 'Unable to retrieve activity'
        : 'Tautulli unavailable';
      this.el.classList.add('tw-has-error');
      // keep existing cards on screen; we just retry on the next poll tick
    }

    _clearError() {
      if (this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('tw-has-error');
      }
    }
  }

  // ─── List widget (Plex-style: one row per active stream) ──────────────────
  // Compact tabular view — title, episode, product, player, bandwidth,
  // location, ETA, current/total time and user, one line per stream.
  function escHtml(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escAttr(v) { return escHtml(v).replace(/"/g, '&quot;'); }

  class TautulliListWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        { baseUrl: '', apiKey: '', pollMs: 5000, dataProvider: null,
          carousel: true, visibleCount: 4, speed: 20, onConfigChange: null },
        config || {}
      );
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this._buildSkeleton();
      if (typeof ListCarousel !== 'undefined') {
        this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track, enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed, mode: this.cfg.mode, pauseMs: this.cfg.pauseMs });
        ListCarousel.buildControls(this.lcToolsEl, this.cfg, (patch) => {
          this.carousel.update(patch);
          if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
        });
      }
    }

    start() {
      this.stop();
      this.poll();
      this.pollTimer = setInterval(() => this.poll(), Math.max(2000, this.cfg.pollMs));
    }
    stop() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
      if (this.abort) { this.abort.abort(); this.abort = null; }
    }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) this.carousel.destroy(); this.el.innerHTML = ''; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider
          ? await this.cfg.dataProvider()
          : await TautulliApi.getActivity(this.cfg.baseUrl, this.cfg.apiKey, this.abort && this.abort.signal);
        this._clearError();
        this._apply(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _apply(data) {
      const count = Number(data.stream_count) || 0;
      const total = fmt.mbps(data.total_bandwidth);
      const sessions = (data.sessions || []).map((s) =>
        describeSession(s, this.cfg.baseUrl, this.cfg.apiKey));
      this._renderSessions(sessions, { count: count || sessions.length, total });
    }

    _buildSkeleton() {
      this.el.classList.add('tautulli-list-widget');
      this.el.innerHTML = `
        <div class="tlw-header">
          <img class="wg-icon" src="../icons/integrations/tautulli.svg" alt="">
          <div class="tlw-title">Tautulli</div>
          <div class="tlw-summary"></div>
          <div class="lc-tools"></div>
          <div class="tlw-error" style="display:none"></div>
        </div>
        <div class="tlw-body">
          <div class="tlw-empty">No active streams</div>
          <div class="tlw-viewport"><div class="tlw-track"></div></div>
        </div>`;
      this.summaryEl = this.el.querySelector('.tlw-summary');
      this.errorEl = this.el.querySelector('.tlw-error');
      this.body = this.el.querySelector('.tlw-body');
      this.emptyEl = this.el.querySelector('.tlw-empty');
      this.viewport = this.el.querySelector('.tlw-viewport');
      this.track = this.el.querySelector('.tlw-track');
      this.lcToolsEl = this.el.querySelector('.lc-tools');
    }

    // `cards` are described-session objects (same shape as describeSession()).
    _renderSessions(cards, summary) {
      if (this.summaryEl) {
        const n = summary && summary.count;
        this.summaryEl.textContent = n
          ? `${n} stream${n === 1 ? '' : 's'} · ${(summary && summary.total) || ''}`.replace(/ · $/, '')
          : '';
      }
      if (!cards.length) {
        this.emptyEl.style.display = '';
        this.viewport.style.display = 'none';
        this.track.innerHTML = '';
        return;
      }
      this.emptyEl.style.display = 'none';
      this.viewport.style.display = '';
      const kv = (k, v) =>
        `<span class="tlw-kv"><span class="tlw-k">${escHtml(k)}</span>` +
        `<span class="tlw-v" title="${escAttr(v)}">${escHtml(v || '—')}</span></span>`;
      this.track.innerHTML = cards.map((s) => {
        const sub = [s.mediaIcon, s.footSub].filter(Boolean).map(escHtml).join(' ');
        const avatar = s.avatarImg
          ? `<span class="tlw-avatar" style="background:${escAttr(s.avatarColor || '#555')}"><img alt="" src="${escAttr(s.avatarImg)}"></span>`
          : `<span class="tlw-avatar" style="background:${escAttr(s.avatarColor || '#555')}">${escHtml(s.avatarInitial || '?')}</span>`;
        const pct = Math.max(0, Math.min(100, Number(s.progressPct) || 0));
        const platform = s.platformIcon ? `<img class="tlw-platform" data-pf alt="" src="${escAttr(s.platformIcon)}">` : '';
        return `<div class="tlw-row">
          <div class="tlw-head">
            <span class="tlw-state" title="${escAttr(s.state || '')}">${escHtml(s.stateIcon || '▶')}</span>
            <span class="tlw-rtitle" title="${escAttr(s.footTitle)}">${escHtml(s.footTitle)}</span>
            <div class="tlw-user">${avatar}<span class="tlw-uname" title="${escAttr(s.username)}">${escHtml(s.username)}</span></div>
          </div>
          <div class="tlw-meta">${platform}${sub ? `<span class="tlw-sub">${sub}</span>` : ''}${kv('Player', s.player)}${kv('Bandwidth', s.bandwidth)}</div>
          <div class="tlw-prog-wrap"><div class="tlw-prog" style="width:${pct}%"></div></div>
          <div class="tlw-foot">${kv('ETA', s.eta)}${kv('Time', s.progressText)}</div>
        </div>`;
      }).join('');
      // Hide platform icons that fail to load (CSP-safe; can't use inline onerror).
      this.track.querySelectorAll('img[data-pf]').forEach((img) => { img.onerror = () => { img.style.display = 'none'; }; });
      if (this.carousel) this.carousel.layout();
    }

    _showError(msg) {
      if (!this.errorEl) return;
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /apikey/i.test(msg) ? 'Unable to retrieve activity' : 'Tautulli unavailable';
      this.el.classList.add('tlw-has-error');
    }
    _clearError() {
      if (this.errorEl && this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('tlw-has-error');
      }
    }
  }

  global.TautulliApi = TautulliApi;
  global.TautulliWidget = TautulliWidget;
  global.TautulliListWidget = TautulliListWidget;
  // Exposed for unit testing — internal helpers, not part of the public API.
  TautulliWidget._describeSession = describeSession;
  TautulliWidget._fmt = fmt;
})(typeof window !== 'undefined' ? window : this);
