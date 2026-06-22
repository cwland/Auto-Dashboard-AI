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
  const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cap = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
  const hhmm = (unixSec) => new Date(unixSec * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const hourLabel = (unixSec) => new Date(unixSec * 1000).toLocaleTimeString([], { hour: 'numeric' });
  const weekday = (unixSec) => new Date(unixSec * 1000).toLocaleDateString(undefined, { weekday: 'short' });

  // ─── Open-Meteo WMO weather codes → emoji + text ───────────────────────────
  function wmoEmoji(code, isDay) {
    const c = +code;
    if (c === 0) return isDay ? '☀️' : '🌙';
    if (c === 1) return isDay ? '🌤️' : '🌙';
    if (c === 2) return '⛅';
    if (c === 3) return '☁️';
    if (c === 45 || c === 48) return '🌫️';
    if (c >= 51 && c <= 57) return '🌦️';
    if (c >= 61 && c <= 67) return '🌧️';
    if (c >= 71 && c <= 77) return '🌨️';
    if (c >= 80 && c <= 82) return '🌧️';
    if (c === 85 || c === 86) return '🌨️';
    if (c >= 95) return '⛈️';
    return '🌡️';
  }
  const WMO_TEXT = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle',
    56: 'Freezing drizzle', 57: 'Freezing drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
    66: 'Freezing rain', 67: 'Freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Violent showers',
    85: 'Snow showers', 86: 'Snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail',
  };
  const wmoText = (code) => WMO_TEXT[+code] || '';
  // Escape the one externally-sourced free-text string (OpenWeatherMap's
  // weather description) before it goes into innerHTML.
  const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Open-Meteo returns naive local-time ISO strings (timezone=auto); format the
  // clock parts directly so the displayed time matches the city, not the browser.
  const isoHM = (iso) => {
    const m = String(iso || '').match(/T(\d{1,2}):(\d{2})/);
    if (!m) return '--';
    let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${h}:${m[2]} ${ap}`;
  };
  const isoHourLabel = (iso) => {
    const m = String(iso || '').match(/T(\d{1,2}):/);
    if (!m) return '';
    let h = +m[1]; const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    return `${h} ${ap}`;
  };
  const isoWeekday = (d) => {
    const dt = new Date(String(d || '') + 'T12:00:00');
    return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { weekday: 'short' });
  };

  // ─── sunrise / sunset icons ─────────────────────────────────────────────────
  // Material Design Icons (webfont): sunset-up / sunset-down, both soft amber.
  // Dark themes dim them to 70% via the .wx-night class on the widget root.
  const sunriseIcon = () => '<i class="mdi mdi-weather-sunset-up ww-ico-sun" aria-hidden="true"></i>';
  const sunsetIcon = () => '<i class="mdi mdi-weather-sunset-down ww-ico-sun" aria-hidden="true"></i>';

  // Detect a dark theme from the live --bg-primary luminance.
  function isDarkTheme() {
    try {
      const bg = (getComputedStyle(document.documentElement).getPropertyValue('--bg-primary') || '').trim() || '#101014';
      let r, g, b;
      if (bg[0] === '#') {
        const h = bg.slice(1);
        const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
        r = parseInt(n.slice(0, 2), 16); g = parseInt(n.slice(2, 4), 16); b = parseInt(n.slice(4, 6), 16);
      } else {
        const m = (bg.match(/\d+/g) || ['16', '16', '20']).map(Number); r = m[0]; g = m[1]; b = m[2];
      }
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.4;
    } catch (_) { return true; }
  }

  // ─── data ─────────────────────────────────────────────────────────────────
  const WeatherApi = {
    _cache: {},   // key → { ts, data }  (shared so 3 widgets don't all re-fetch)
    units(units) { return { temp: units === 'metric' ? '°C' : '°F', speed: units === 'metric' ? 'km/h' : 'mph' }; },
    speed(raw, units) { return units === 'metric' ? Math.round((raw || 0) * 3.6) : Math.round(raw || 0); },

    // ── Provider-agnostic entry points ─────────────────────────────────────
    // cfg: { provider, apiKey, lat, lon, location, units }. Both providers
    // resolve to the SAME normalized shape so every widget is identical.
    async fetch(cfg) {
      cfg = cfg || {};
      const units = cfg.units || 'imperial';
      return (cfg.provider === 'openmeteo') ? this._om(cfg, units) : this._owm(cfg, units, false);
    },
    async fetchHourly(cfg) {
      cfg = cfg || {};
      const units = cfg.units || 'imperial';
      // Open-Meteo is already true-hourly; OWM needs the One Call path.
      return (cfg.provider === 'openmeteo') ? this._om(cfg, units) : this._owm(cfg, units, true);
    },

    // ── Open-Meteo (free, keyless; fetched by coordinates) ──────────────────
    async _om(cfg, units) {
      const { lat, lon } = cfg;
      if (lat == null || lon == null) throw new Error('No location coordinates');
      const ck = 'OM|' + lat + ',' + lon + '|' + units;
      const c = this._cache[ck];
      if (c && Date.now() - c.ts < 5 * 60 * 1000) return c.data;
      const tu = units === 'metric' ? 'celsius' : 'fahrenheit';
      const wu = units === 'metric' ? 'kmh' : 'mph';
      const url = 'https://api.open-meteo.com/v1/forecast' +
        `?latitude=${lat}&longitude=${lon}` +
        '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m' +
        '&hourly=temperature_2m,weather_code,wind_speed_10m' +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset' +
        `&temperature_unit=${tu}&wind_speed_unit=${wu}&timezone=auto&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = this.normalizeOpenMeteo(await res.json(), units, cfg.location || '');
      this._cache[ck] = { ts: Date.now(), data };
      return data;
    },

    normalizeOpenMeteo(j, units, place) {
      const cur = j.current || {};
      const dl = j.daily || {};
      const hr = j.hourly || {};
      const isDay = cur.is_day !== 0;
      const current = {
        condition: wmoText(cur.weather_code),
        emoji: wmoEmoji(cur.weather_code, isDay),
        temp: Math.round(cur.temperature_2m ?? 0),
        feels: Math.round(cur.apparent_temperature ?? cur.temperature_2m ?? 0),
        high: Math.round((dl.temperature_2m_max && dl.temperature_2m_max[0]) ?? cur.temperature_2m ?? 0),
        low: Math.round((dl.temperature_2m_min && dl.temperature_2m_min[0]) ?? cur.temperature_2m ?? 0),
        wind: Math.round(cur.wind_speed_10m ?? 0),   // already mph/kmh per request
        humidity: Math.round(cur.relative_humidity_2m ?? 0),
        sunrise: isoHM(dl.sunrise && dl.sunrise[0]),
        sunset: isoHM(dl.sunset && dl.sunset[0]),
        place: place || '',
      };
      // Hourly: start at the current hour and go forward.
      const times = hr.time || [];
      const nowIso = cur.time || '';
      let start = times.findIndex((t) => t >= nowIso);
      if (start < 0) start = 0;
      const hourly = [];
      for (let i = start; i < times.length && hourly.length < 24; i++) {
        hourly.push({
          time: isoHourLabel(times[i]),
          condition: wmoText(hr.weather_code && hr.weather_code[i]),
          emoji: wmoEmoji(hr.weather_code && hr.weather_code[i], true),
          temp: Math.round((hr.temperature_2m && hr.temperature_2m[i]) ?? 0),
          wind: Math.round((hr.wind_speed_10m && hr.wind_speed_10m[i]) ?? 0),
        });
      }
      const daily = (dl.time || []).map((d, i) => ({
        day: isoWeekday(d),
        emoji: wmoEmoji(dl.weather_code && dl.weather_code[i], true),
        condition: wmoText(dl.weather_code && dl.weather_code[i]),
        high: Math.round((dl.temperature_2m_max && dl.temperature_2m_max[i]) ?? 0),
        low: Math.round((dl.temperature_2m_min && dl.temperature_2m_min[i]) ?? 0),
        sunrise: isoHM(dl.sunrise && dl.sunrise[i]),
        sunset: isoHM(dl.sunset && dl.sunset[i]),
      }));
      return { current, hourly, daily, units, sym: this.units(units) };
    },

    // ── OpenWeatherMap (API key; fetched by coords when available, else q=) ──
    async _owm(cfg, units, trueHourly) {
      const apiKey = cfg.apiKey;
      const hasCoords = cfg.lat != null && cfg.lon != null;
      const where = hasCoords ? `lat=${cfg.lat}&lon=${cfg.lon}` : `q=${encodeURIComponent(cfg.location || '')}`;
      const ck = (trueHourly ? 'H|' : '') + 'OWM|' + where + '|' + units;
      const c = this._cache[ck];
      if (c && Date.now() - c.ts < 5 * 60 * 1000) return c.data;
      const root = 'https://api.openweathermap.org/data/';
      const q = `?${where}&appid=${apiKey}&units=${units}`;
      const curRes = await fetch(root + '2.5/weather' + q);
      if (!curRes.ok) throw new Error(curRes.status === 401 ? 'Invalid API key' : `HTTP ${curRes.status}`);
      const cur = await curRes.json();
      let data = null;
      if (trueHourly) {
        const lat = (cur.coord && cur.coord.lat) ?? cfg.lat;
        const lon = (cur.coord && cur.coord.lon) ?? cfg.lon;
        if (lat != null && lon != null) {
          try {
            const oc = await fetch(`${root}3.0/onecall?lat=${lat}&lon=${lon}&units=${units}&exclude=minutely,alerts&appid=${apiKey}`);
            if (oc.ok) data = this.normalizeOneCall(cur, await oc.json(), units);
          } catch (_) { /* fall back to 3-hour forecast */ }
        }
      }
      if (!data) {
        const fcRes = await fetch(root + '2.5/forecast' + q);
        data = this.normalize(cur, fcRes.ok ? await fcRes.json() : { list: [], city: {} }, units, cfg.location || '');
      }
      this._cache[ck] = { ts: Date.now(), data };
      return data;
    },

    normalize(cur, fc, units, place) {
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
        place: cur.name || place || '',
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

    normalizeOneCall(cur, oc, units) {
      const base = this.normalize(cur, { list: [], city: {} }, units);
      const hourly = (oc.hourly || []).map((it) => {
        const ww = (it.weather && it.weather[0]) || {};
        return { time: hourLabel(it.dt), condition: cap(ww.description || ''), emoji: weatherEmoji(ww.id, ww.icon), temp: Math.round(it.temp ?? 0), wind: this.speed(it.wind_speed, units) };
      });
      const daily = (oc.daily || []).map((it) => {
        const ww = (it.weather && it.weather[0]) || {};
        return { day: weekday(it.dt), emoji: weatherEmoji(ww.id, ww.icon), condition: cap(ww.description || ''), high: Math.round((it.temp && it.temp.max) ?? 0), low: Math.round((it.temp && it.temp.min) ?? 0), sunrise: it.sunrise ? hhmm(it.sunrise) : base.current.sunrise, sunset: it.sunset ? hhmm(it.sunset) : base.current.sunset };
      });
      return { current: base.current, hourly, daily, units, sym: this.units(units) };
    },
  };

  // ─── base widget ──────────────────────────────────────────────────────────
  class WeatherBase {
    constructor(container, config, title, icon) {
      this.el = container;
      this.cfg = Object.assign({ provider: 'openweathermap', apiKey: '', lat: null, lon: null, location: '', units: 'imperial', pollMs: 15 * 60 * 1000, dataProvider: null }, config || {});
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
          : await WeatherApi.fetch(this.cfg);
        if (!this.cfg.location && this.data && this.data.current && this.data.current.place) this._setLocation(this.data.current.place);
        this._clearError(); this._render(); this._applyNightDim();
      } catch (err) { this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('weather-widget');
      this.el.innerHTML =
        '<div class="ww-header"><span class="ww-hicon"></span><div class="ww-title"></div>' +
        '<div class="ww-loc"></div>' +
        '<div class="ww-tools"></div><div class="ww-error" style="display:none"></div></div>' +
        '<div class="ww-body"></div>';
      this.el.querySelector('.ww-hicon').textContent = this.icon;
      this.el.querySelector('.ww-title').textContent = this.title;
      this.locEl = this.el.querySelector('.ww-loc');
      this._setLocation(this.cfg.location);
      this.toolsEl = this.el.querySelector('.ww-tools');
      this.errorEl = this.el.querySelector('.ww-error');
      this.body = this.el.querySelector('.ww-body');
      this._buildTools();
    }
    // Show the configured location next to the title (same font/bold), kept in
    // sync with the resolved place name once data arrives.
    _setLocation(name) { if (this.locEl) this.locEl.textContent = name || ''; }
    // Dim the sunrise/sunset icons to 70% on dark themes (via .wx-night).
    _applyNightDim() { if (this.el) this.el.classList.toggle('wx-night', isDarkTheme()); }
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
           <div class="ww-cur-temp">${c.temp}${u.temp}</div>
           <div class="ww-cur-main">
             <div class="ww-cur-cond">${escHtml(c.condition)}</div>
             <div class="ww-cur-feels">Feels like ${c.feels}${u.temp}</div>
           </div>
         </div>
         <div class="ww-stats">
           ${stat('High', c.high + u.temp)}${stat('Low', c.low + u.temp)}
           ${stat('Wind', c.wind + ' ' + u.speed)}${stat('Humidity', c.humidity + '%')}
           ${stat('Sunrise', sunriseIcon() + ' ' + c.sunrise)}${stat('Sunset', sunsetIcon() + ' ' + c.sunset)}
         </div>`;
    }
  }

  // ─── Widget 2: hourly ───────────────────────────────────────────────────────
  // ─── Shared list base (Hourly + Forecast) ───────────────────────────────────
  // Renders ALL rows into a track and uses the standard ListCarousel for the
  // exact same Scroll-on/off + Show + Speed controls (straddling the top in edit
  // mode) and the same auto-fit/resize behavior as the Stocks widget.
  class WeatherListBase extends WeatherBase {
    constructor(c, cfg, title, icon, defCount) {
      super(c, cfg, title, icon);
      this.cfg.carousel = this.cfg.carousel !== false;
      // Seed the visible count from the legacy days/hours config if present.
      const legacy = parseInt(this.cfg.visibleCount, 10) || parseInt(this.cfg.hours, 10) || parseInt(this.cfg.days, 10);
      this.cfg.visibleCount = Math.max(1, Math.min(12, legacy || defCount));
      this.cfg.speed = Math.max(5, parseInt(this.cfg.speed, 10) || 30);
      this._buildList();
    }
    _buildTools() { /* controls are built by ListCarousel.buildControls in _buildList */ }
    _buildList() {
      this.body.innerHTML =
        '<div class="ww-empty">Loading…</div>' +
        '<div class="ww-viewport"><div class="ww-track"></div></div>';
      this.emptyEl = this.body.querySelector('.ww-empty');
      this.viewport = this.body.querySelector('.ww-viewport');
      this.track = this.body.querySelector('.ww-track');
      if (typeof ListCarousel !== 'undefined') {
        this.carousel = new ListCarousel({ root: this.el, viewport: this.viewport, track: this.track,
          enabled: this.cfg.carousel, visibleCount: this.cfg.visibleCount, speed: this.cfg.speed,
          mode: this.cfg.mode, pauseMs: this.cfg.pauseMs });
        ListCarousel.buildControls(this.toolsEl, this.cfg, (patch) => {
          this.carousel.update(patch);
          if (typeof this.cfg.onConfigChange === 'function') this.cfg.onConfigChange(patch);
        });
        // Weather: list Speed first. buildControls appends [Scroll, Show, Speed];
        // move the Speed group (last) to the front.
        const groups = this.toolsEl.children;
        if (groups.length > 1) this.toolsEl.insertBefore(groups[groups.length - 1], groups[0]);
      }
    }
    destroy() { if (this.carousel) this.carousel.destroy(); super.destroy(); }
    _rowsHTML() { return ''; /* override */ }
    _render() {
      if (!this.data) { if (this.emptyEl) { this.emptyEl.style.display = ''; this.emptyEl.textContent = 'Loading…'; } return; }
      const html = this._rowsHTML();
      if (this.track) this.track.innerHTML = html;
      if (this.emptyEl) { this.emptyEl.style.display = html ? 'none' : ''; if (!html) this.emptyEl.textContent = 'No forecast'; }
      if (this.carousel) this.carousel.layout();
    }
    _showError(msg) {
      if (this.errorEl) { this.errorEl.style.display = ''; this.errorEl.textContent = '⚠ ' + (msg || 'Unavailable'); }
      if (this.data == null && this.emptyEl) { this.emptyEl.style.display = ''; this.emptyEl.textContent = 'Weather unavailable'; }
    }
  }

  // ─── Widget 2: hourly ───────────────────────────────────────────────────────
  class WeatherHourlyWidget extends WeatherListBase {
    constructor(c, cfg) { super(c, cfg, 'Hourly Forecast', '🕐', 5); }
    _rowsHTML() {
      const u = this.data.sym;
      return (this.data.hourly || []).map((h) =>
        `<div class="ww-hour">
           <span class="ww-h-time">${h.time}</span>
           <span class="ww-h-emoji">${h.emoji}</span>
           <span class="ww-h-temp">${h.temp}${u.temp}</span>
           <span class="ww-h-wind">💨 ${h.wind} ${u.speed}</span>
         </div>`).join('');
    }
  }

  // ─── Widget 3: multi-day forecast ───────────────────────────────────────────
  class WeatherForecastWidget extends WeatherListBase {
    constructor(c, cfg) { super(c, cfg, 'Forecast', '📅', 5); }
    _rowsHTML() {
      const u = this.data.sym;
      return (this.data.daily || []).map((d) =>
        `<div class="ww-day">
           <span class="ww-d-name">${d.day}</span>
           <span class="ww-d-emoji">${d.emoji}</span>
           <span class="ww-d-sun">${sunriseIcon()} ${d.sunrise} · ${sunsetIcon()} ${d.sunset}</span>
           <span class="ww-d-temp"><b>${d.high}${u.temp}</b> / ${d.low}${u.temp}</span>
         </div>`).join('');
    }
  }

  // ─── Widget 4: combined (current + hourly carousel + multi-day) ─────────────
  class WeatherCombinedWidget extends WeatherBase {
    constructor(c, cfg) {
      super(c, cfg, 'Weather', '🌦️');
      this.el.classList.add('weather-combined');
      this.hours = clampN(parseInt(this.cfg.hours, 10) || 12, 5, 24);   // carousel depth (min 5)
      this.days = clampN(parseInt(this.cfg.days, 10) || 5, 1, 7);       // days shown (min 1)
      this.speedMs = clampN(parseInt(this.cfg.speedMs, 10) || 2000, 500, 4000);
      this.scroll = this.cfg.carousel !== false;   // hourly auto-scroll on/off
      this.dwellMs = 5000;        // 5-second pause before each carousel move
      this._carTimer = null;
      this._onCarEnd = (e) => {
        if (!this._track || e.target !== this._track || e.propertyName !== 'transform') return;
        this._track.appendChild(this._track.firstElementChild);   // ring rotate
        this._track.style.transition = 'none';
        this._track.style.transform = 'translateX(0)';
        void this._track.offsetWidth;                             // force reflow
        this._scheduleCar();
      };
      // Re-fit the hourly row whenever the widget is resized (dynamic count).
      this._ro = ('ResizeObserver' in global) ? new ResizeObserver(() => {
        if (this._roRaf) cancelAnimationFrame(this._roRaf);
        this._roRaf = requestAnimationFrame(() => this._layoutHourly());
      }) : null;
      if (this._ro) this._ro.observe(this.el);
    }
    destroy() { this._stopCarousel(); if (this._ro) this._ro.disconnect(); super.destroy(); }

    // Use the true-hourly fetch (One Call API, with 3-hour fallback).
    async poll() {
      if (this.destroyed) return;
      try {
        this.data = this.cfg.dataProvider ? await this.cfg.dataProvider()
          : await WeatherApi.fetchHourly(this.cfg);
        if (!this.cfg.location && this.data && this.data.current && this.data.current.place) this._setLocation(this.data.current.place);
        this._clearError(); this._render(); this._applyNightDim();
      } catch (err) { this._showError(err && err.message); }
    }

    _buildTools() {
      const tools = this.toolsEl;
      if (!tools) return;
      tools.classList.add('lc-tools');   // pick up the config-window row styling
      tools.innerHTML = '';
      if (typeof ListCarousel === 'undefined') return;
      // No carousel controls — the combined widget shows a static hourly strip.
      // Only the display-amount options (Hours, Days) are exposed.
      tools.appendChild(ListCarousel.sliderRow('Hours', () => this.hours, 5, 24, 1, (v) => {
        this.hours = v; if (this.cfg.onHoursChange) this.cfg.onHoursChange(v); this._render();
      }));
      tools.appendChild(ListCarousel.sliderRow('Days', () => this.days, 1, 7, 1, (v) => {
        this.days = v; if (this.cfg.onDaysChange) this.cfg.onDaysChange(v); this._render();
      }));
    }
    _drawCounts() { /* counts now live in the slider rows */ }

    _render() {
      this._stopCarousel();
      this._drawCounts();
      if (!this.data) { this.body.innerHTML = '<div class="ww-empty">Loading…</div>'; return; }
      const c = this.data.current, u = this.data.sym;
      const cur =
        `<div class="wwc-current">
           <div class="wwc-cur-emoji">${c.emoji}</div>
           <div class="wwc-cur-temp">${c.temp}${u.temp}</div>
           <div class="wwc-cur-main">
             <div class="wwc-cur-cond">${escHtml(c.condition)}</div>
             <div class="wwc-cur-feels">Feels like ${c.feels}${u.temp}</div>
           </div>
           <div class="wwc-cur-hl"><span><b>${c.high}${u.temp}</b> H</span><span>${c.low}${u.temp} L</span></div>
         </div>
         <div class="wwc-cur-stats">
           <span>💧 ${c.humidity}%</span>
           <span>${sunriseIcon()} ${c.sunrise}</span>
           <span>${sunsetIcon()} ${c.sunset}</span>
         </div>`;
      // Pool = `hours` cards; the width decides how many are visible at once and
      // the rest scroll in via the carousel.
      const hcards = this.data.hourly.slice(0, this.hours).map((h) =>
        `<div class="wwc-hour"><span class="wwc-h-time">${h.time}</span><span class="wwc-h-emoji">${h.emoji}</span><span class="wwc-h-temp">${h.temp}${u.temp}</span></div>`).join('');
      const hourly = `<div class="wwc-hourly"><div class="wwc-hclip"><div class="wwc-htrack">${hcards || ''}</div></div></div>`;
      const dhead = `<div class="wwc-dhead"><span></span><span></span><span>High</span><span>Low</span></div>`;
      const drows = this.data.daily.slice(0, this.days).map((d) =>
        `<div class="wwc-day"><span class="wwc-d-name">${d.day}</span><span class="wwc-d-mid"><span class="wwc-d-emoji">${d.emoji}</span><span class="wwc-d-cond">${d.condition || ''}</span></span><span class="wwc-d-hi">${d.high}${u.temp}</span><span class="wwc-d-lo">${d.low}${u.temp}</span></div>`).join('');
      const daily = `<div class="wwc-daily">${dhead}${drows}</div>`;
      this.body.innerHTML = cur + hourly + daily;
      this._clip = this.body.querySelector('.wwc-hclip');
      this._track = this.body.querySelector('.wwc-htrack');
      if (this._track) this._track.addEventListener('transitionend', this._onCarEnd);
      // Fit now, and again after the grid settles the widget's final width.
      requestAnimationFrame(() => this._layoutHourly());
      setTimeout(() => this._layoutHourly(), 250);
    }

    // Size the hourly window to a whole number of cards: only fully-visible
    // mini-cards are shown; any that wouldn't fit completely roll into the
    // carousel. Recomputed on every render and on widget resize.
    _layoutHourly() {
      this._stopCarousel();
      const clip = this._clip, track = this._track;
      if (!clip || !track || !track.children.length) return;
      const cardW = track.children[0].getBoundingClientRect().width;
      if (cardW < 8) { requestAnimationFrame(() => this._layoutHourly()); return; }  // not laid out yet
      track.style.transition = 'none';
      track.style.transform = 'translateX(0)';
      const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || '0') || 6;
      const total = track.children.length;
      // Available content width = the hourly section's own box. Its width is the
      // full widget width and is independent of the (narrower) clip child.
      const avail = (clip.parentElement && clip.parentElement.clientWidth) || this.body.clientWidth || 0;
      let visible = Math.max(1, Math.floor((avail + gap) / (cardW + gap)));
      visible = Math.min(visible, total);
      clip.style.width = (visible * cardW + (visible - 1) * gap) + 'px';
      this._step = cardW + gap;
      // Static hourly strip — no carousel auto-scroll (the only cards shown are
      // the ones that fully fit the width).
    }
    _scheduleCar() {
      if (this._carTimer) clearTimeout(this._carTimer);
      this._carTimer = setTimeout(() => {
        if (this.destroyed || !this._track) return;
        this._track.style.transition = `transform ${this.speedMs}ms cubic-bezier(0.37, 0, 0.63, 1)`;
        this._track.style.transform = `translateX(-${this._step}px)`;
      }, this.dwellMs);
    }
    _stopCarousel() { if (this._carTimer) { clearTimeout(this._carTimer); this._carTimer = null; } this._track = null; }
  }

  global.WeatherApi = WeatherApi;
  global.WeatherCurrentWidget = WeatherCurrentWidget;
  global.WeatherHourlyWidget = WeatherHourlyWidget;
  global.WeatherForecastWidget = WeatherForecastWidget;
  global.WeatherCombinedWidget = WeatherCombinedWidget;
})(typeof window !== 'undefined' ? window : this);
