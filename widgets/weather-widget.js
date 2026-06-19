// Auto Dashboard AI — Weather widgets
// ---------------------------------------------------------------------------
// Three independent widgets backed by OpenWeatherMap (free endpoints):
//   • WeatherCurrentWidget  — current conditions + key metrics
//   • WeatherHourlyWidget   — upcoming forecast steps (configurable count)
//   • WeatherForecastWidget — 5-day outlook
//
//   const w = new WeatherCurrentWidget(el, { apiKey, location, units });
//   w.start();  ...  w.destroy();
//
// Note: OWM's free tier provides 3-hourly forecast steps (not true 1-hour) and
// a single sunrise/sunset for the city, so the hourly widget shows 3-hour steps
// and the 5-day widget reuses the city sunrise/sunset for each day.
'use strict';

(function (global) {
  // ─── condition → emoji ────────────────────────────────────────────────────
  function weatherEmoji(id, icon) {
    const night = typeof icon === 'string' && icon.endsWith('n');
    if (id == null) return '🌡️';
    if (id >= 200 && id < 300) return '⛈️';
    if (id >= 300 && id < 400) return '🌦️';
    if (id >= 500 && id < 600) return id >= 502 ? '🌧️' : '🌦️';
    if (id >= 600 && id < 700) return '🌨️';
    if (id >= 700 && id < 800) return '🌫️';
    if (id === 800) return night ? '🌙' : '☀️';
    if (id === 801) return night ? '☁️' : '🌤️';
    if (id === 802) return '⛅';
    if (id >= 803) return '☁️';
    return '🌡️';
  }
  const cap = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
  const hhmm = (unixSec) => new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const hourLabel = (unixSec) => new Date(unixSec * 1000).toLocaleTimeString([], { hour: 'numeric' });
  const weekday = (unixSec) => new Date(unixSec * 1000).toLocaleDateString(undefined, { weekday: 'short' });

  // ─── data ─────────────────────────────────────────────────────────────────
  const WeatherApi = {
    _cache: {},   // key → { ts, data }  (shared so 3 widgets don't all re-fetch)
    units(units) { return { temp: units === 'metric' ? '°C' : '°F', speed: units === 'metric' ? 'km/h' : 'mph' }; },
    speed(raw, units) { return units === 'metric' ? Math.round((raw || 0) * 3.6) : Math.round(raw || 0); },

    async fetch(apiKey, location, units) {
      const key = location + '|' + units;
      const c = this._cache[key];
      if (c && Date.now() - c.ts < 5 * 60 * 1000) return c.data;
      const base = 'https://api.openweathermap.org/data/2.5/';
      const q = `?q=${encodeURIComponent(location)}&appid=${apiKey}&units=${units}`;
      const [curRes, fcRes] = await Promise.all([fetch(base + 'weather' + q), fetch(base + 'forecast' + q)]);
      if (!curRes.ok) throw new Error(curRes.status === 401 ? 'Invalid API key' : `HTTP ${curRes.status}`);
      const current = await curRes.json();
      const forecast = fcRes.ok ? await fcRes.json() : { list: [], city: {} };
      const data = this.normalize(current, forecast, units);
      this._cache[key] = { ts: Date.now(), data };
      return data;
    },

    normalize(cur, fc, units) {
      const w = (cur.weather && cur.weather[0]) || {};
      const sys = cur.sys || {};
      const city = fc.city || {};
      const current = {
        condition: cap(w.description || w.main || ''),
        emoji: weatherEmoji(w.id, w.icon),
        temp: Math.round(cur.main?.temp ?? 0),
        feels: Math.round(cur.main?.feels_like ?? 0),
        high: Math.round(cur.main?.temp_max ?? 0),
        low: Math.round(cur.main?.temp_min ?? 0),
        wind: this.speed(cur.wind?.speed, units),
        humidity: Math.round(cur.main?.humidity ?? 0),
        sunrise: sys.sunrise ? hhmm(sys.sunrise) : '--',
        sunset: sys.sunset ? hhmm(sys.sunset) : '--',
        place: cur.name || location || '',
      };
      const list = Array.isArray(fc.list) ? fc.list : [];
      const hourly = list.map((it) => {
        const ww = (it.weather && it.weather[0]) || {};
        return {
          time: hourLabel(it.dt),
          condition: cap(ww.description || ''),
          emoji: weatherEmoji(ww.id, ww.icon),
          temp: Math.round(it.main?.temp ?? 0),
          wind: this.speed(it.wind?.speed, units),
        };
      });
      // Group by local date → daily high/low + midday icon.
      const byDay = new Map();
      list.forEach((it) => {
        const d = new Date(it.dt * 1000); const k = d.toDateString();
        if (!byDay.has(k)) byDay.set(k, { dt: it.dt, hi: -Infinity, lo: Infinity, noon: null });
        const e = byDay.get(k);
        e.hi = Math.max(e.hi, it.main?.temp_max ?? it.main?.temp ?? e.hi);
        e.lo = Math.min(e.lo, it.main?.temp_min ?? it.main?.temp ?? e.lo);
        if (d.getHours() >= 12 && d.getHours() <= 14 && !e.noon) e.noon = it;
        if (!e.noon) e.noon = it;
      });
      const sunrise = city.sunrise ? hhmm(city.sunrise) : current.sunrise;
      const sunset = city.sunset ? hhmm(city.sunset) : current.sunset;
      const daily = [...byDay.values()].map((e) => {
        const ww = (e.noon && e.noon.weather && e.noon.weather[0]) || {};
        return {
          day: weekday(e.dt), emoji: weatherEmoji(ww.id, ww.icon), condition: cap(ww.description || ''),
          high: Math.round(e.hi), low: Math.round(e.lo), sunrise, sunset,
        };
      });
      return { current, hourly, daily, units, sym: this.units(units) };
    },
  };

  // ─── base widget ──────────────────────────────────────────────────────────
  class WeatherBase {
    constructor(container, config, title, icon) {
      this.el = container;
      this.cfg = Object.assign({ apiKey: '', location: '', units: 'imperial', pollMs: 15 * 60 * 1000, dataProvider: null }, config || {});
      this.title = title; this.icon = icon;
      this.data = null; this.pollTimer = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(5 * 60 * 1000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); this._render(); }
    async poll() {
      if (this.destroyed) return;
      try {
        this.data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await WeatherApi.fetch(this.cfg.apiKey, this.cfg.location, this.cfg.units || 'imperial');
        this._clearError(); this._render();
      } catch (err) { this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('weather-widget');
      this.el.innerHTML =
        '<div class="ww-header"><span class="ww-hicon"></span><div class="ww-title"></div>' +
        '<div class="ww-tools"></div><div class="ww-error" style="display:none"></div></div>' +
        '<div class="ww-body"></div>';
      this.el.querySelector('.ww-hicon').textContent = this.icon;
      this.el.querySelector('.ww-title').textContent = this.title;
      this.toolsEl = this.el.querySelector('.ww-tools');
      this.errorEl = this.el.querySelector('.ww-error');
      this.body = this.el.querySelector('.ww-body');
      this._buildTools();
    }
    _buildTools() { /* override */ }
    _clearError() { if (this.errorEl) this.errorEl.style.display = 'none'; }
    _showError(msg) {
      if (this.errorEl) { this.errorEl.style.display = ''; this.errorEl.textContent = '⚠ ' + (msg || 'Unavailable'); }
      if (this.data == null && this.body) this.body.innerHTML = '<div class="ww-empty">Weather unavailable</div>';
    }
    _render() { /* override */ if (this.data == null && this.body) this.body.innerHTML = '<div class="ww-empty">Loading…</div>'; }
  }

  // ─── Widget 1: current ──────────────────────────────────────────────────────
  class WeatherCurrentWidget extends WeatherBase {
    constructor(c, cfg) { super(c, cfg, 'Current Weather', '🌤️'); }
    _render() {
      if (!this.data) { this.body.innerHTML = '<div class="ww-empty">Loading…</div>'; return; }
      const c = this.data.current, u = this.data.sym;
      const stat = (label, val) => `<div class="ww-stat"><span class="ww-stat-l">${label}</span><span class="ww-stat-v">${val}</span></div>`;
      this.body.innerHTML =
        `<div class="ww-cur-top">
           <div class="ww-cur-emoji">${c.emoji}</div>
           <div class="ww-cur-main">
             <div class="ww-cur-temp">${c.temp}${u.temp}</div>
             <div class="ww-cur-cond">${c.condition}</div>
             <div class="ww-cur-feels">Feels like ${c.feels}${u.temp}</div>
           </div>
         </div>
         <div class="ww-stats">
           ${stat('High', c.high + u.temp)}${stat('Low', c.low + u.temp)}
           ${stat('Wind', c.wind + ' ' + u.speed)}${stat('Humidity', c.humidity + '%')}
           ${stat('Sunrise', '🌅 ' + c.sunrise)}${stat('Sunset', '🌇 ' + c.sunset)}
         </div>`;
    }
  }

  // ─── Widget 2: hourly ───────────────────────────────────────────────────────
  class WeatherHourlyWidget extends WeatherBase {
    constructor(c, cfg) {
      super(c, cfg, 'Hourly Forecast', '🕐');
      this.hours = Math.max(1, Math.min(12, parseInt(this.cfg.hours, 10) || 5));
    }
    _buildTools() {
      this.toolsEl.innerHTML =
        '<button class="ww-step" data-d="-1" title="Fewer hours">−</button>' +
        '<span class="ww-count"></span>' +
        '<button class="ww-step" data-d="1" title="More hours">+</button>';
      this.toolsEl.querySelectorAll('.ww-step').forEach((b) => b.addEventListener('click', () => {
        this.hours = Math.max(1, Math.min(12, this.hours + Number(b.dataset.d)));
        if (typeof this.cfg.onHoursChange === 'function') this.cfg.onHoursChange(this.hours);
        this._render();
      }));
    }
    _render() {
      const cnt = this.toolsEl.querySelector('.ww-count'); if (cnt) cnt.textContent = this.hours + 'h';
      if (!this.data) { this.body.innerHTML = '<div class="ww-empty">Loading…</div>'; return; }
      const u = this.data.sym;
      const rows = this.data.hourly.slice(0, this.hours).map((h) =>
        `<div class="ww-hour">
           <span class="ww-h-time">${h.time}</span>
           <span class="ww-h-emoji">${h.emoji}</span>
           <span class="ww-h-temp">${h.temp}${u.temp}</span>
           <span class="ww-h-wind">💨 ${h.wind} ${u.speed}</span>
         </div>`).join('');
      this.body.innerHTML = rows || '<div class="ww-empty">No forecast</div>';
    }
  }

  // ─── Widget 3: multi-day forecast ───────────────────────────────────────────
  class WeatherForecastWidget extends WeatherBase {
    constructor(c, cfg) {
      super(c, cfg, 'Forecast', '📅');
      this.days = Math.max(1, Math.min(7, parseInt(this.cfg.days, 10) || 5));
    }
    _buildTools() {
      this.toolsEl.innerHTML =
        '<button class="ww-step" data-d="-1" title="Fewer days">−</button>' +
        '<span class="ww-count"></span>' +
        '<button class="ww-step" data-d="1" title="More days">+</button>';
      this.toolsEl.querySelectorAll('.ww-step').forEach((b) => b.addEventListener('click', () => {
        this.days = Math.max(1, Math.min(7, this.days + Number(b.dataset.d)));
        if (typeof this.cfg.onDaysChange === 'function') this.cfg.onDaysChange(this.days);
        this._render();
      }));
    }
    _render() {
      const cnt = this.toolsEl.querySelector('.ww-count'); if (cnt) cnt.textContent = this.days + 'd';
      if (!this.data) { this.body.innerHTML = '<div class="ww-empty">Loading…</div>'; return; }
      const u = this.data.sym;
      const rows = this.data.daily.slice(0, this.days).map((d) =>
        `<div class="ww-day">
           <span class="ww-d-name">${d.day}</span>
           <span class="ww-d-emoji">${d.emoji}</span>
           <span class="ww-d-sun">🌅 ${d.sunrise} · 🌇 ${d.sunset}</span>
           <span class="ww-d-temp"><b>${d.high}${u.temp}</b> / ${d.low}${u.temp}</span>
         </div>`).join('');
      this.body.innerHTML = rows || '<div class="ww-empty">No forecast</div>';
    }
  }

  global.WeatherApi = WeatherApi;
  global.WeatherCurrentWidget = WeatherCurrentWidget;
  global.WeatherHourlyWidget = WeatherHourlyWidget;
  global.WeatherForecastWidget = WeatherForecastWidget;
})(typeof window !== 'undefined' ? window : this);
