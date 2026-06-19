// Auto Dashboard AI — PeaNUT (UPS) Widget
// ---------------------------------------------------------------------------
// Shows a UPS summary from a PeaNUT server (a web UI for NUT): per-device
// status, battery charge, load, runtime, voltages, power, and temperature.
//
//   const w = new PeanutWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed as PeanutApi and PeanutWidget.
//
// ATTRIBUTION: the /api/v1/devices fetching, NUT status-flag parsing, and the
// device → UPS summary mapping are adapted from the Homarr project's PeaNUT
// integration (ups-summary interface). Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  function b64(str) { return (typeof btoa === 'function') ? btoa(str) : Buffer.from(str, 'utf-8').toString('base64'); }

  const STATUS_META = {
    online: { label: 'Online', color: 'green' },
    charging: { label: 'Charging', color: 'blue' },
    onBattery: { label: 'On battery', color: 'yellow' },
    lowBattery: { label: 'Low battery', color: 'red' },
    unknown: { label: 'Unknown', color: 'gray' },
  };

  const PeanutApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(username, password) {
      return (username && password) ? { Authorization: `Basic ${b64(`${username}:${password}`)}` } : {};
    },
    readString(device, key) {
      const v = device ? device[key] : undefined;
      if (v === undefined || v === null) return null;
      const s = String(v).trim();
      return s.length ? s : null;
    },
    readNumber(device, key) {
      const v = device ? device[key] : undefined;
      if (v === undefined || v === null || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    },
    parseStatus(rawStatus) {
      const flags = String(rawStatus || '').toUpperCase().split(/\s+/).filter(Boolean);
      if (flags.indexOf('LB') !== -1) return 'lowBattery';
      if (flags.indexOf('OB') !== -1) return 'onBattery';
      if (flags.indexOf('OL') !== -1) return flags.indexOf('CHRG') !== -1 ? 'charging' : 'online';
      return 'unknown';
    },
    mapDevice(device, index) {
      const manufacturer = this.readString(device, 'device.mfr') || this.readString(device, 'ups.mfr');
      const model = this.readString(device, 'device.model') || this.readString(device, 'ups.model');
      const id = this.readString(device, 'peanut.device_id') || `ups-${index}`;
      const name = [manufacturer, model].filter(Boolean).join(' ') || id;
      return {
        id, name, manufacturer, model,
        serial: this.readString(device, 'device.serial'),
        status: this.parseStatus(this.readString(device, 'ups.status')),
        batteryCharge: this.readNumber(device, 'battery.charge'),
        batteryRuntime: this.readNumber(device, 'battery.runtime'),
        batteryVoltage: this.readNumber(device, 'battery.voltage'),
        load: this.readNumber(device, 'ups.load'),
        inputVoltage: this.readNumber(device, 'input.voltage'),
        outputVoltage: this.readNumber(device, 'output.voltage'),
        power: this.readNumber(device, 'ups.realpower') != null ? this.readNumber(device, 'ups.realpower') : this.readNumber(device, 'ups.power'),
        temperature: this.readNumber(device, 'ups.temperature'),
      };
    },
    mapDevices(arr) { return (Array.isArray(arr) ? arr : []).map((d, i) => this.mapDevice(d, i)); },
    async getData(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/v1/devices?meta=true`, {
        cache: 'no-store', headers: this.authHeaders(opts.username, opts.password), signal,
      });
      if (res.status === 401 || res.status === 403) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return this.mapDevices(data);
    },
    async testConnection(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/v1/devices`, {
        cache: 'no-store', headers: this.authHeaders(opts.username, opts.password), signal,
      });
      if (res.status === 401 || res.status === 403) throw new Error('invalid credentials');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json().catch(() => null);
      return { ok: true };
    },
  };

  function fmtRuntime(sec) {
    const s = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }
  function fmtNum(n, unit) { return n == null ? null : `${Math.round(n * 10) / 10}${unit}`; }

  class PeanutWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', username: '', password: '', pollMs: 30000, dataProvider: null }, config || {});
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
          : await PeanutApi.getData(this.cfg.baseUrl, { username: this.cfg.username, password: this.cfg.password }, this.abort && this.abort.signal);
        this._clearError(); this.data = data; this._render(data);
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('peanut-widget');
      this.el.innerHTML = `<div class="pn-header"><img class="wg-icon" src="../icons/integrations/peanut.svg" alt=""><div class="pn-title">UPS</div><div class="pn-error" style="display:none"></div></div><div class="pn-body"></div>`;
      this.errorEl = this.el.querySelector('.pn-error'); this.body = this.el.querySelector('.pn-body');
    }
    _render(devices) {
      const list = devices || [];
      if (!list.length) { this.body.innerHTML = `<div class="pn-empty">No UPS devices found.</div>`; return; }
      this.body.innerHTML = list.map((d) => {
        const meta = STATUS_META[d.status] || STATUS_META.unknown;
        const tiles = [
          ['Battery', fmtNum(d.batteryCharge, '%')],
          ['Load', fmtNum(d.load, '%')],
          ['Runtime', d.batteryRuntime != null ? fmtRuntime(d.batteryRuntime) : null],
          ['Input', fmtNum(d.inputVoltage, ' V')],
          ['Power', fmtNum(d.power, ' W')],
          ['Temp', fmtNum(d.temperature, ' °C')],
        ].filter((t) => t[1] != null);
        return `
          <div class="pn-device">
            <div class="pn-device-head">
              <span class="pn-name" title="${escapeAttr(d.name)}">${escapeHtml(d.name)}</span>
              <span class="pn-status pn-c-${meta.color}">${meta.label}</span>
            </div>
            ${d.batteryCharge != null ? `<div class="pn-bar"><div class="pn-bar-fill pn-c-bg-${meta.color}" style="width:${Math.max(0, Math.min(100, d.batteryCharge))}%"></div></div>` : ''}
            <div class="pn-grid">${tiles.map((t) => `<div class="pn-tile"><span class="pn-tile-val">${escapeHtml(t[1])}</span><span class="pn-tile-lbl">${t[0]}</span></div>`).join('')}</div>
          </div>`;
      }).join('');
    }
    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid credentials|HTTP\s*40[13]/i.test(msg) ? 'Check credentials' : 'PeaNUT unavailable';
      this.el.classList.add('pn-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('pn-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.PeanutApi = PeanutApi;
  global.PeanutWidget = PeanutWidget;
  PeanutWidget._fmtRuntime = fmtRuntime;
})(typeof window !== 'undefined' ? window : this);
