// Auto Dashboard AI — Uptime Kuma Widget (reusable component)
// ---------------------------------------------------------------------------
// A self-contained, framework-free widget that renders an Uptime Kuma status
// summary: an average-uptime hero (with progress ring) plus stat tiles for
// total / up / down / paused monitors, and an optional per-monitor list.
//
// It is decoupled from the config page so the SAME class can be reused for
// dashboard deployment: instantiate with a container element and a config
// object, call start(), and call destroy() when the host element goes away.
// The widget owns its own polling, error handling and DOM updates.
//
//   const w = new UptimeKumaWidget(el, { baseUrl, slug: 'default', showMonitorList: true });
//   w.start();
//   ...
//   w.destroy();
//
// Exposed on window as UptimeKumaWidget and UptimeKumaApi.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The status-page/heartbeat fetching, heartbeat-status mapping and dashboard
// aggregation (UptimeKumaApi) are adapted from the Homarr project's Uptime Kuma
// integration, and the visual layout follows Homarr's Uptime Kuma widget as a
// reference template. Homarr is licensed under the Apache License 2.0.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md at the project root. This file has been modified
// from the original (rewritten from TypeScript/React to framework-free JS).
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  // ─── API helper ───────────────────────────────────────────────────────────
  // Mirrors Homarr's UptimeKumaIntegration: it reads the public status-page and
  // heartbeat endpoints (no auth required) and aggregates them into a compact
  // dashboard-data object.
  const UptimeKumaApi = {
    // Uptime Kuma heartbeat status codes → our three display categories.
    // 0 = down, 1 = up, 2 = pending, 3 = maintenance.
    HEARTBEAT_CATEGORY: { 0: 'down', 1: 'up', 2: 'paused', 3: 'paused' },

    normalizeBase(url) {
      return String(url || '').trim().replace(/\/+$/, '');
    },

    normalizeSlug(slug) {
      const s = String(slug || '').trim().toLowerCase();
      return s || 'default';
    },

    statusPageUrl(base, slug) {
      return `${this.normalizeBase(base)}/api/status-page/${this.normalizeSlug(slug)}`;
    },

    heartbeatUrl(base, slug) {
      return `${this.normalizeBase(base)}/api/status-page/heartbeat/${this.normalizeSlug(slug)}`;
    },

    async fetchJson(url, signal) {
      const res = await fetch(url, { cache: 'no-store', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      try {
        return await res.json();
      } catch {
        throw new Error('Invalid response from Uptime Kuma');
      }
    },

    // Map one status-page monitor + the heartbeat payload to a display monitor.
    mapMonitor(monitor, heartbeat) {
      const heartbeats = (heartbeat.heartbeatList && heartbeat.heartbeatList[String(monitor.id)]) || [];
      const latest = heartbeats.length ? heartbeats[heartbeats.length - 1] : null;
      const uptimeRaw = heartbeat.uptimeList ? heartbeat.uptimeList[`${monitor.id}_24`] : undefined;
      const uptimePercent24h = typeof uptimeRaw === 'number' ? uptimeRaw * 100 : null;

      // Match Homarr's resolution: no heartbeat → paused; heartbeat present but
      // an unknown status code → down; otherwise the mapped category.
      const status = latest
        ? (this.HEARTBEAT_CATEGORY[latest.status] || 'down')
        : 'paused';

      return {
        id: monitor.id,
        name: String(monitor.name == null ? '' : monitor.name),
        status,
        uptimePercent24h,
      };
    },

    buildDashboardData(monitors) {
      const counts = { up: 0, down: 0, paused: 0 };
      for (const m of monitors) counts[m.status] += 1;

      const uptimes = monitors
        .map((m) => m.uptimePercent24h)
        .filter((v) => typeof v === 'number');
      const averageUptimePercent = uptimes.length
        ? uptimes.reduce((sum, v) => sum + v, 0) / uptimes.length
        : 0;

      return {
        totalMonitors: monitors.length,
        upCount: counts.up,
        downCount: counts.down,
        pausedCount: counts.paused,
        averageUptimePercent,
        monitors,
      };
    },

    // Turn the two raw API payloads into dashboard data. Exposed separately so
    // it can be unit-tested without a network.
    aggregate(statusPage, heartbeat) {
      const groups = (statusPage && statusPage.publicGroupList) || [];
      const monitors = [];
      for (const group of groups) {
        for (const monitor of (group.monitorList || [])) {
          monitors.push(this.mapMonitor(monitor, heartbeat || {}));
        }
      }
      return this.buildDashboardData(monitors);
    },

    // Fetch + aggregate. Throws one clear error on any transport/parse failure.
    async getDashboard(base, slug, signal) {
      const [statusPage, heartbeat] = await Promise.all([
        this.fetchJson(this.statusPageUrl(base, slug), signal),
        this.fetchJson(this.heartbeatUrl(base, slug), signal),
      ]);
      if (!statusPage || !Array.isArray(statusPage.publicGroupList)) {
        throw new Error('Invalid Uptime Kuma status page response');
      }
      return this.aggregate(statusPage, heartbeat);
    },
  };

  // ─── Display helpers ───────────────────────────────────────────────────────
  const STAT_KEYS = ['totalMonitors', 'upCount', 'downCount', 'pausedCount'];

  const STAT_META = {
    totalMonitors: { label: 'Total', icon: '▦', cls: 'uk-stat-total' },
    upCount:       { label: 'Up',    icon: '▲', cls: 'uk-stat-up' },
    downCount:     { label: 'Down',  icon: '▼', cls: 'uk-stat-down' },
    pausedCount:   { label: 'Paused', icon: '❚❚', cls: 'uk-stat-paused' },
  };

  function clampPercent(value) {
    return Math.min(100, Math.max(0, Number(value) || 0));
  }

  // Same tiers as Homarr: ≥99 green, ≥95 yellow, else red.
  function uptimeTier(uptime) {
    if (uptime >= 99) return 'excellent';
    if (uptime >= 95) return 'good';
    return 'poor';
  }

  function fmtPercent(value, decimals) {
    const n = clampPercent(value);
    return `${n.toFixed(decimals == null ? 1 : decimals)}%`;
  }

  // ─── Widget ─────────────────────────────────────────────────────────────────
  class UptimeKumaWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        {
          baseUrl: '',
          slug: 'default',
          pollMs: 30000,
          showAverageUptime: true,
          showUptimeRing: true,
          showTotalMonitors: true,
          showUpCount: true,
          showDownCount: true,
          showPausedCount: true,
          showMonitorList: false,
        },
        config || {}
      );

      this.data = null;
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;

      this._buildSkeleton();
    }

    // ── lifecycle ──────────────────────────────────────────────────────────
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
      if (this.data) this._render(this.data);
    }

    destroy() {
      this.destroyed = true;
      this.stop();
      this.el.innerHTML = '';
    }

    // ── data ─────────────────────────────────────────────────────────────────
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = await UptimeKumaApi.getDashboard(
          this.cfg.baseUrl, this.cfg.slug, this.abort && this.abort.signal
        );
        this._clearError();
        this.data = data;
        this._render(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    // ── DOM construction ──────────────────────────────────────────────────────
    _buildSkeleton() {
      this.el.classList.add('uptime-kuma-widget');
      this.el.innerHTML = `
        <div class="uk-error" style="display:none"></div>
        <div class="uk-body"></div>`;
      this.errorEl = this.el.querySelector('.uk-error');
      this.body = this.el.querySelector('.uk-body');
    }

    // Build an SVG ring (replaces Mantine's RingProgress used by Homarr).
    _ringSvg(percent, tier) {
      const p = clampPercent(percent);
      const size = 96, stroke = 9, r = (size - stroke) / 2;
      const c = 2 * Math.PI * r;
      const off = c * (1 - p / 100);
      return `
        <svg class="uk-ring uk-tier-${tier}" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
          <circle class="uk-ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"></circle>
          <circle class="uk-ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
            stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"
            transform="rotate(-90 ${size / 2} ${size / 2})"></circle>
          <text class="uk-ring-text" x="50%" y="50%" text-anchor="middle" dominant-baseline="central">${fmtPercent(p, 0)}</text>
        </svg>`;
    }

    _render(data) {
      const avg = clampPercent((data && data.averageUptimePercent) || 0);
      const tier = uptimeTier(avg);
      const showHero = !!this.cfg.showAverageUptime;
      const visibleStats = STAT_KEYS.filter((k) => {
        const optKey = 'show' + k.charAt(0).toUpperCase() + k.slice(1);
        return !!this.cfg[optKey];
      });

      let html = '';

      if (showHero) {
        const ring = this.cfg.showUptimeRing ? this._ringSvg(avg, tier) : '';
        const heroMod = visibleStats.length ? '' : ' uk-hero-expanded';
        const textMod = this.cfg.showUptimeRing ? '' : ' uk-hero-textonly';
        html += `
          <div class="uk-hero uk-tier-${tier}${heroMod}${textMod}">
            <div class="uk-hero-text">
              <span class="uk-hero-label">Average uptime (24h)</span>
              <span class="uk-hero-value">${fmtPercent(avg, 1)}</span>
            </div>
            ${ring}
          </div>`;
      }

      if (visibleStats.length) {
        const cols = Math.min(visibleStats.length, 4);
        html += `<div class="uk-stat-grid" style="--uk-cols:${cols}">`;
        for (const key of visibleStats) {
          const meta = STAT_META[key];
          const value = (data && data[key]) || 0;
          html += `
            <div class="uk-stat-tile ${meta.cls}">
              <span class="uk-stat-icon">${meta.icon}</span>
              <span class="uk-stat-value">${Number(value).toLocaleString()}</span>
              <span class="uk-stat-label">${meta.label}</span>
            </div>`;
        }
        html += `</div>`;
      }

      if (this.cfg.showMonitorList) {
        const monitors = (data && data.monitors) || [];
        html += `<div class="uk-monitor-list">`;
        if (!monitors.length) {
          html += `<div class="uk-monitor-empty">No monitors found on this status page.</div>`;
        } else {
          for (const m of monitors) {
            const up = m.uptimePercent24h == null ? '—' : fmtPercent(m.uptimePercent24h, 2);
            html += `
              <div class="uk-monitor-row uk-mon-${m.status}">
                <span class="uk-monitor-dot"></span>
                <span class="uk-monitor-name" title="${escapeAttr(m.name)}">${escapeHtml(m.name)}</span>
                <span class="uk-monitor-status">${m.status}</span>
                <span class="uk-monitor-uptime">${up}</span>
              </div>`;
          }
        }
        html += `</div>`;
      }

      if (!showHero && !visibleStats.length && !this.cfg.showMonitorList) {
        html = `<div class="uk-empty">Nothing selected to display.</div>`;
      }

      this.body.innerHTML = html;
    }

    // ── error state ───────────────────────────────────────────────────────────
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /HTTP\s*404/i.test(msg)
        ? 'Status page not found — check the slug'
        : 'Uptime Kuma unavailable';
      this.el.classList.add('uk-has-error');
      // keep any previously-rendered data on screen; we retry next poll tick
    }

    _clearError() {
      if (this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('uk-has-error');
      }
    }
  }

  // Minimal escaping for monitor names (names come from a remote server).
  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  global.UptimeKumaApi = UptimeKumaApi;
  global.UptimeKumaWidget = UptimeKumaWidget;
  // Exposed for unit testing — internal helpers, not part of the public API.
  UptimeKumaWidget._uptimeTier = uptimeTier;
  UptimeKumaWidget._clampPercent = clampPercent;
})(typeof window !== 'undefined' ? window : this);
