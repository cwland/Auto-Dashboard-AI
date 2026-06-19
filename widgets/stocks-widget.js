// Auto Dashboard AI — Stocks Widget
// ---------------------------------------------------------------------------
// Shows live quotes for one or more ticker symbols: symbol, name, a sparkline
// of recent closes, the latest price and the day's change (£/$/€-aware).
//
//   const w = new StocksWidget(el, { symbols: ['AAPL', 'MSFT'] });
//   w.start();  ...  w.destroy();
//
// Exposed as StocksApi and StocksWidget.
//
// DATA SOURCE: the unofficial Yahoo Finance "chart" endpoint
// (query1/query2.finance.yahoo.com/v8/finance/chart/<symbol>) — no API key.
// Approach adapted from the Homarr project's stock-price widget (Apache-2.0).
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs.
// Note: it's an undocumented endpoint and can change without notice; results
// are cached 5 minutes and failures degrade gracefully per symbol.
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  const HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  const CUR = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'C$', AUD: 'A$', CHF: 'CHF ', CNY: '¥', INR: '₹' };

  // Split a free-text field into a clean list of upper-case symbols.
  function parseSymbols(str) {
    if (Array.isArray(str)) str = str.join(',');
    return Array.from(new Set(String(str || '')
      .split(/[\s,;\n]+/).map((s) => s.trim().toUpperCase()).filter(Boolean)));
  }

  const StocksApi = {
    _cache: {},
    parseSymbols,

    async _fetch(symbol, signal) {
      const path = `/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
      let lastErr;
      for (const host of HOSTS) {
        try {
          const res = await fetch(host + path, { cache: 'no-store', signal });
          if (!res.ok) { lastErr = new Error(`HTTP ${res.status}`); continue; }
          return this._map(await res.json(), symbol);
        } catch (e) { if (e && e.name === 'AbortError') throw e; lastErr = e; }
      }
      throw lastErr || new Error('Unavailable');
    },

    _map(json, symbol) {
      const chart = json && json.chart;
      const r = chart && chart.result && chart.result[0];
      if (!r) throw new Error((chart && chart.error && chart.error.description) || 'Unknown symbol');
      const meta = r.meta || {};
      const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
      const history = (q.close || []).filter((v) => v != null && isFinite(v));
      const price = Number(meta.regularMarketPrice ?? history[history.length - 1] ?? 0);
      const prev = Number(meta.previousClose ?? meta.chartPreviousClose ?? history[0] ?? price);
      const change = price - prev;
      return {
        symbol: meta.symbol || symbol,
        name: meta.shortName || meta.longName || meta.symbol || symbol,
        price, prevClose: prev, change,
        changePct: prev ? (change / prev) * 100 : 0,
        currency: meta.currency || 'USD',
        marketState: meta.marketState || '',
        history,
      };
    },

    // Cached single-symbol quote (5-minute TTL, shared across widgets).
    async quote(symbol, signal) {
      const key = String(symbol || '').toUpperCase();
      const c = this._cache[key];
      if (c && Date.now() - c.ts < 5 * 60 * 1000) return c.data;
      const data = await this._fetch(key, signal);
      this._cache[key] = { ts: Date.now(), data };
      return data;
    },

    // Validate a list of symbols — returns { valid:[], invalid:[] }.
    async validateMany(symbols, signal) {
      const list = parseSymbols(symbols);
      const valid = [], invalid = [];
      await Promise.all(list.map(async (s) => {
        try { await this._fetch(s, signal); valid.push(s); }
        catch (_) { invalid.push(s); }
      }));
      return { valid, invalid, total: list.length };
    },
  };

  function fmtNum(n, dp) {
    const v = Number(n) || 0;
    return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function curSymbol(code) { return CUR[code] || (code ? code + ' ' : '$'); }

  function sparkline(history, dir) {
    const W = 88, H = 30, pad = 3;
    const h = (history || []).filter((v) => v != null && isFinite(v));
    if (h.length < 2) return `<svg class="st-spark" viewBox="0 0 ${W} ${H}"></svg>`;
    const min = Math.min(...h), max = Math.max(...h), range = (max - min) || 1, n = h.length;
    const pts = h.map((v, i) => {
      const x = pad + (i / (n - 1)) * (W - 2 * pad);
      const y = H - pad - ((v - min) / range) * (H - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = dir > 0 ? '#22c55e' : dir < 0 ? '#ef4444' : '#9ca3af';
    return `<svg class="st-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">` +
      `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(v) { return esc(v).replace(/"/g, '&quot;'); }

  class StocksWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({
        symbols: [], pollMs: 5 * 60 * 1000, dataProvider: null,
        carousel: true, visibleCount: 6, speed: 24, onConfigChange: null,
      }, config || {});
      if (!Array.isArray(this.cfg.symbols)) this.cfg.symbols = parseSymbols(this.cfg.symbols);
      this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
      if (typeof ListCarousel !== 'undefined') {
        this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track, enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed });
        ListCarousel.buildControls(this.toolsEl, this.cfg, (patch) => {
          this.carousel.update(patch);
          if (this.cfg.onConfigChange) this.cfg.onConfigChange(patch);
        });
      }
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(30000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      if (!Array.isArray(this.cfg.symbols)) this.cfg.symbols = parseSymbols(this.cfg.symbols);
      this.poll();
    }
    destroy() { this.destroyed = true; this.stop(); if (this.carousel) this.carousel.destroy(); this.el.innerHTML = ''; }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      const signal = this.abort && this.abort.signal;
      try {
        let list;
        if (this.cfg.dataProvider) {
          list = await this.cfg.dataProvider();
        } else {
          list = await Promise.all((this.cfg.symbols || []).map((s) =>
            StocksApi.quote(s, signal).catch(() => ({ symbol: s, error: true }))));
        }
        if (this.destroyed) return;
        this._clearError();
        this._render(Array.isArray(list) ? list : []);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      this.el.classList.add('stocks-widget');
      this.el.innerHTML = `
        <div class="st-header">
          <img class="wg-icon" src="../icons/integrations/stocks.svg" alt="">
          <div class="st-title">Stocks</div>
          <div class="st-tools"></div>
          <div class="st-error" style="display:none"></div>
        </div>
        <div class="st-body">
          <div class="st-empty" style="display:none">Loading…</div>
          <div class="st-viewport"><div class="st-track"></div></div>
        </div>`;
      this.errorEl = this.el.querySelector('.st-error');
      this.body = this.el.querySelector('.st-body');
      this.toolsEl = this.el.querySelector('.st-tools');
      this.viewport = this.el.querySelector('.st-viewport');
      this.track = this.el.querySelector('.st-track');
      this.emptyEl = this.el.querySelector('.st-empty');
    }

    _render(list) {
      if (!list.length) {
        this.emptyEl.textContent = 'No symbols configured';
        this.emptyEl.style.display = '';
        this.viewport.style.display = 'none';
        this.track.innerHTML = '';
        return;
      }
      this.emptyEl.style.display = 'none';
      this.viewport.style.display = '';
      this.track.innerHTML = list.map((s) => {
        if (s.error) {
          return `<div class="st-row st-row-err"><div class="st-main"><span class="st-sym">${esc(s.symbol)}</span><span class="st-name">Unavailable</span></div></div>`;
        }
        const dir = s.change > 0 ? 1 : s.change < 0 ? -1 : 0;
        const cls = dir > 0 ? 'st-up' : dir < 0 ? 'st-down' : 'st-flat';
        const arrow = dir > 0 ? '▲' : dir < 0 ? '▼' : '•';
        const cur = curSymbol(s.currency);
        const sign = s.change > 0 ? '+' : '';
        return `<div class="st-row">
          <div class="st-main">
            <span class="st-sym">${esc(s.symbol)}</span>
            <span class="st-name" title="${escAttr(s.name)}">${esc(s.name)}</span>
          </div>
          ${sparkline(s.history, dir)}
          <div class="st-quote">
            <span class="st-price">${cur}${fmtNum(s.price, 2)}</span>
            <span class="st-chg ${cls}">${arrow} ${sign}${fmtNum(s.change, 2)} (${sign}${fmtNum(s.changePct, 2)}%)</span>
          </div>
        </div>`;
      }).join('');
      if (this.carousel) this.carousel.layout();
    }

    _showError(msg) {
      if (!this.errorEl) return;
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = 'Quotes unavailable';
      this.el.classList.add('st-has-error');
    }
    _clearError() {
      if (this.errorEl && this.errorEl.style.display !== 'none') {
        this.errorEl.style.display = 'none';
        this.el.classList.remove('st-has-error');
      }
    }
  }

  global.StocksApi = StocksApi;
  global.StocksWidget = StocksWidget;
})(typeof window !== 'undefined' ? window : this);
