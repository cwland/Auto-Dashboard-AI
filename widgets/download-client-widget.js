// Auto Dashboard AI — Download Client Widget (SABnzbd / qBittorrent / Transmission)
// ---------------------------------------------------------------------------
// These three clients normalize to the same "downloads" shape (a list of items
// plus an aggregate status), so one engine (DownloadsApi + DownloadClientWidget)
// with three adapters covers all of them, surfaced as three integrations. The
// widget shows aggregate down/up rates and a list of items with a progress bar,
// state badge, size, and speeds.
//
// Framework-free and self-contained:
//   const w = new SabnzbdWidget(el, { baseUrl, apiKey });
//   const w = new QbittorrentWidget(el, { baseUrl, username, password });
//   const w = new TransmissionWidget(el, { baseUrl, username, password });
//   w.start();  ...  w.destroy();
//
// Exposed as DownloadsApi, DownloadClientWidget, SabnzbdWidget,
// QbittorrentWidget, TransmissionWidget.
//
// ---------------------------------------------------------------------------
// ATTRIBUTION
// The normalized DownloadClientItem/Status shape and the per-client mapping
// (SABnzbd queue/history, qBittorrent + Transmission torrent state mapping,
// rates/paused aggregation, ETA handling) are adapted from the Homarr project's
// download-client integrations and the downloads interface. The download-list
// layout follows Homarr's downloads widget as a reference template. Homarr is
// Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr
// See THIRD-PARTY-LICENSES.md. Modified from the original: Homarr drives
// qBittorrent/Transmission via the @ctrl/* libraries server-side; here the
// requests are made directly with fetch, which is best-effort in a browser.
// ---------------------------------------------------------------------------
'use strict';

(function (global) {
  function b64(str) { return (typeof btoa === 'function') ? btoa(str) : Buffer.from(str, 'utf-8').toString('base64'); }
  const now = () => Date.now();

  const DownloadsApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },

    // ── SABnzbd (usenet) ────────────────────────────────────────────────────
    sabnzbd: {
      getQueueState(status) {
        if (status === 'Queued') return 'queued';
        if (status === 'Paused') return 'paused';
        return 'downloading';
      },
      getHistoryState(status) {
        if (status === 'Completed') return 'completed';
        if (status === 'Failed') return 'failed';
        return 'processing';
      },
      // "ss" / "mm:ss" / "hh:mm:ss" / "d:hh:mm:ss" → milliseconds
      parseTimeleft(str) {
        const parts = String(str || '0').split(':').reverse().map((n) => Number(n) || 0);
        const [s = 0, m = 0, h = 0, d = 0] = parts;
        return ((d * 24 + h) * 3600 + m * 60 + s) * 1000;
      },
      // Pure: combine queue + history payloads into {status, items}.
      build(queueResp, historyResp, limit) {
        const queue = (queueResp && queueResp.queue) || { paused: false, kbpersec: '0', slots: [] };
        const history = (historyResp && historyResp.history) || { slots: [] };
        const down = Math.floor(Number(queue.kbpersec) * 1024);
        const status = { paused: !!queue.paused, rates: { down }, types: ['usenet'] };

        const queueItems = (queue.slots || []).map((slot) => ({
          type: 'usenet',
          id: slot.nzo_id,
          index: slot.index,
          name: slot.filename,
          size: Math.ceil(parseFloat(slot.mb) * 1024 * 1024),
          downSpeed: slot.index > 0 ? 0 : down,
          time: this.parseTimeleft(slot.timeleft),
          state: this.getQueueState(slot.status),
          progress: (parseFloat(slot.percentage) || 0) / 100,
          category: slot.cat,
        }));
        const historyItems = (history.slots || []).map((slot, index) => ({
          type: 'usenet',
          id: slot.nzo_id,
          index,
          name: slot.name,
          size: slot.bytes,
          time: slot.completed * 1000 - now(),
          added: (slot.completed - slot.download_time - slot.postproc_time) * 1000,
          state: this.getHistoryState(slot.status),
          progress: 1,
          category: slot.category,
        }));
        const items = queueItems.concat(historyItems).slice(0, limit || 50);
        return { status, items };
      },
      apiUrl(base, apiKey, mode, params) {
        const qs = new URLSearchParams(Object.assign({ output: 'json', apikey: apiKey || '', mode }, params || {}));
        return `${DownloadsApi.normalizeBase(base)}/api?${qs.toString()}`;
      },
      async _call(base, apiKey, mode, params, signal) {
        const res = await fetch(this.apiUrl(base, apiKey, mode, params), { cache: 'no-store', signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json().catch(() => null);
        if (!data || data.status === false) throw new Error('invalid API key');
        return data;
      },
      async getData(base, opts, session, signal) {
        const limit = (opts && opts.limit) || 10;
        const [queue, history] = await Promise.all([
          this._call(base, opts.apiKey, 'queue', { limit: String(limit) }, signal),
          this._call(base, opts.apiKey, 'history', { limit: String(limit) }, signal),
        ]);
        return this.build(queue, history, limit);
      },
      async testConnection(base, opts, signal) {
        const data = await this._call(base, opts.apiKey, 'queue', { limit: '1' }, signal);
        if (!data.queue) throw new Error('unexpected response');
        return { ok: true };
      },
    },

    // ── qBittorrent (torrent) ─────────────────────────────────────────────────
    qbittorrent: {
      getState(state) {
        switch (state) {
          case 'allocating': case 'checkingDL': case 'downloading': case 'forcedDL':
          case 'forcedMetaDL': case 'metaDL': case 'queuedDL': case 'queuedForChecking':
            return 'leeching';
          case 'checkingUP': case 'forcedUP': case 'queuedUP': case 'uploading': case 'stalledUP':
            return 'seeding';
          case 'pausedDL': case 'pausedUP': return 'paused';
          case 'stalledDL': return 'stalled';
          default: return 'unknown';
        }
      },
      mapTorrent(t) {
        const state = this.getState(t.state);
        const time = t.progress === 1
          ? Math.min(t.completion_on * 1000 - now(), -1)
          : (t.eta === 8640000 ? 0 : Math.max(t.eta * 1000, 0));
        return {
          type: 'torrent', id: t.hash, index: t.priority, name: t.name, size: t.size,
          sent: t.uploaded, downSpeed: t.progress !== 1 ? t.dlspeed : undefined, upSpeed: t.upspeed,
          time, added: t.added_on * 1000, state, progress: t.progress, category: t.category,
        };
      },
      build(torrents) {
        const list = torrents || [];
        const rates = list.reduce((acc, t) => ({ down: acc.down + (t.dlspeed || 0), up: acc.up + (t.upspeed || 0) }), { down: 0, up: 0 });
        const paused = list.length > 0 && !list.some((t) => this.getState(t.state) !== 'paused');
        return { status: { paused, rates, types: ['torrent'] }, items: list.map((t) => this.mapTorrent(t)) };
      },
      async login(base, username, password, signal) {
        const res = await fetch(`${DownloadsApi.normalizeBase(base)}/api/v2/auth/login`, {
          method: 'POST', credentials: 'include', cache: 'no-store',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ username: username || '', password: password || '' }).toString(),
          signal,
        });
        // 401 here is NOT a bad password (that returns 200 "Fails." below) — it's
        // qBittorrent's CSRF / Host-header protection rejecting the cross-origin
        // request. 403 means the IP was banned after repeated failed logins.
        if (res.status === 401) throw new Error("rejected (401) — turn off “Enable Host header validation” and CSRF protection in qBittorrent → Options → Web UI");
        if (res.status === 403) throw new Error('IP banned after failed logins — wait a few minutes or restart qBittorrent');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.text()).trim();
        if (text && text.toLowerCase() !== 'ok.') throw new Error('invalid credentials');
        return true;
      },
      async _list(base, limit, signal) {
        return fetch(`${DownloadsApi.normalizeBase(base)}/api/v2/torrents/info?limit=${encodeURIComponent(limit)}`, {
          credentials: 'include', cache: 'no-store', signal,
        });
      },
      async getData(base, opts, session, signal) {
        const limit = (opts && opts.limit) || 10;
        session = session || {};
        if (!session.loggedIn) { await this.login(base, opts.username, opts.password, signal); session.loggedIn = true; }
        let res = await this._list(base, limit, signal);
        if (res.status === 401 || res.status === 403) {
          await this.login(base, opts.username, opts.password, signal); session.loggedIn = true;
          res = await this._list(base, limit, signal);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const torrents = await res.json();
        return this.build(Array.isArray(torrents) ? torrents : []);
      },
      async testConnection(base, opts, signal) {
        await this.login(base, opts.username, opts.password, signal);
        return { ok: true };
      },
    },

    // ── Transmission (torrent) ─────────────────────────────────────────────────
    transmission: {
      FIELDS: ['hashString', 'name', 'totalSize', 'percentDone', 'rateDownload', 'rateUpload',
        'uploadedEver', 'downloadedEver', 'eta', 'status', 'queuePosition', 'addedDate', 'doneDate', 'labels'],
      getState(status) {
        switch (status) {
          case 0: return 'paused';
          case 1: case 3: return 'stalled';
          case 2: case 4: return 'leeching';
          case 5: case 6: return 'seeding';
          default: return 'unknown';
        }
      },
      mapTorrent(t) {
        const state = this.getState(t.status);
        const time = t.percentDone === 1
          ? Math.min(t.doneDate * 1000 - now(), -1)
          : Math.max(t.eta * 1000, 0);
        return {
          type: 'torrent', id: t.hashString, index: t.queuePosition, name: t.name, size: t.totalSize,
          sent: t.uploadedEver, received: t.downloadedEver,
          downSpeed: t.percentDone !== 1 ? t.rateDownload : undefined, upSpeed: t.rateUpload,
          time, added: t.addedDate * 1000, state, progress: t.percentDone, category: t.labels,
        };
      },
      build(torrents, limit) {
        const list = torrents || [];
        const rates = list.reduce((acc, t) => ({ down: acc.down + (t.rateDownload || 0), up: acc.up + (t.rateUpload || 0) }), { down: 0, up: 0 });
        const paused = list.length > 0 && !list.some((t) => this.getState(t.status) !== 'paused');
        return { status: { paused, rates, types: ['torrent'] }, items: list.map((t) => this.mapTorrent(t)).slice(0, limit || 50) };
      },
      async _rpc(base, method, args, opts, session, signal) {
        const url = `${DownloadsApi.normalizeBase(base)}/transmission/rpc`;
        session = session || {};
        const headers = { 'Content-Type': 'application/json' };
        if (opts.username || opts.password) headers.Authorization = `Basic ${b64(`${opts.username || ''}:${opts.password || ''}`)}`;
        const doFetch = () => {
          const h = Object.assign({}, headers);
          if (session.sid) h['X-Transmission-Session-Id'] = session.sid;
          return fetch(url, { method: 'POST', credentials: 'include', cache: 'no-store', headers: h, body: JSON.stringify({ method, arguments: args || {} }), signal });
        };
        let res = await doFetch();
        if (res.status === 409) { // session id handshake
          session.sid = res.headers.get('X-Transmission-Session-Id') || res.headers.get('x-transmission-session-id');
          res = await doFetch();
        }
        if (res.status === 401) throw new Error('invalid credentials');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.result && data.result !== 'success') throw new Error(data.result);
        return data;
      },
      async getData(base, opts, session, signal) {
        const limit = (opts && opts.limit) || 10;
        const data = await this._rpc(base, 'torrent-get', { fields: this.FIELDS }, opts, session, signal);
        const torrents = (data && data.arguments && data.arguments.torrents) || [];
        return this.build(torrents, limit);
      },
      async testConnection(base, opts, signal) {
        await this._rpc(base, 'session-get', {}, opts, {}, signal);
        return { ok: true };
      },
    },

    // ── dispatch ────────────────────────────────────────────────────────────
    getData(service, base, opts, session, signal) { return this[service].getData(base, opts, session, signal); },
    testConnection(service, base, opts, signal) { return this[service].testConnection(base, opts, signal); },
  };

  // ─── display helpers ────────────────────────────────────────────────────────
  const STATE_COLOR = {
    leeching: 'blue', seeding: 'green', stalled: 'orange', paused: 'gray',
    downloading: 'blue', queued: 'violet', completed: 'green', failed: 'red',
    processing: 'yellow', unknown: 'gray',
  };
  function fmtBytes(n) {
    let v = Number(n) || 0;
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let i = 0;
    while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
  }
  function fmtSpeed(n) { return `${fmtBytes(n)}/s`; }
  function fmtEta(ms) {
    const v = Number(ms) || 0;
    if (v <= 0) return '—';
    let s = Math.floor(v / 1000);
    const d = Math.floor(s / 86400); s -= d * 86400;
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const TITLE = { sabnzbd: 'SABnzbd', qbittorrent: 'qBittorrent', transmission: 'Transmission' };

  class DownloadClientWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign(
        { service: 'sabnzbd', baseUrl: '', apiKey: '', username: '', password: '', limit: 10, pollMs: 10000, dataProvider: null },
        config || {}
      );
      this.data = null;
      this.session = {};
      this.pollTimer = null;
      this.abort = null;
      this.destroyed = false;
      this._buildSkeleton();
    }

    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(5000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) {
      Object.assign(this.cfg, patch || {});
      if (patch && (patch.baseUrl || patch.apiKey || patch.username || patch.password)) this.session = {};
      if (this.pollTimer || this.cfg.dataProvider) this.poll();
      else if (this.data) this._render(this.data);
    }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }

    _opts() {
      return this.cfg.service === 'sabnzbd'
        ? { apiKey: this.cfg.apiKey, limit: this.cfg.limit }
        : { username: this.cfg.username, password: this.cfg.password, limit: this.cfg.limit };
    }

    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const data = this.cfg.dataProvider
          ? await this.cfg.dataProvider(this._opts())
          : await DownloadsApi.getData(this.cfg.service, this.cfg.baseUrl, this._opts(), this.session, this.abort && this.abort.signal);
        this._clearError();
        this.data = data;
        this._render(data);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        this._showError(err && err.message);
      }
    }

    _buildSkeleton() {
      this.el.classList.add('download-widget', `dl-${this.cfg.service}`);
      this.el.innerHTML = `
        <div class="dl-header">
          <img class="wg-icon" src="../icons/integrations/${this.cfg.service}.svg" alt="">
          <div class="dl-title"></div>
          <div class="dl-tools">
            <div class="dl-error" style="display:none"></div>
            <span class="dl-rates"></span>
          </div>
        </div>
        <div class="dl-body"></div>`;
      this.titleEl = this.el.querySelector('.dl-title');
      this.errorEl = this.el.querySelector('.dl-error');
      this.ratesEl = this.el.querySelector('.dl-rates');
      this.body = this.el.querySelector('.dl-body');
      this.titleEl.textContent = TITLE[this.cfg.service] || 'Downloads';
    }

    _render(data) {
      const d = data || {};
      const status = d.status || { rates: { down: 0 } };
      const down = (status.rates && status.rates.down) || 0;
      const up = (status.rates && status.rates.up) || 0;
      const ratesParts = [`↓ ${fmtSpeed(down)}`];
      if (status.types && status.types.indexOf('torrent') !== -1) ratesParts.push(`↑ ${fmtSpeed(up)}`);
      this.ratesEl.textContent = ratesParts.join('  ');
      this.ratesEl.classList.toggle('dl-paused', !!status.paused);

      const items = d.items || [];
      if (!items.length) { this.body.innerHTML = `<div class="dl-empty">No active downloads.</div>`; return; }

      const rows = items.map((it) => {
        const pct = Math.round(Math.max(0, Math.min(1, it.progress || 0)) * 100);
        const color = STATE_COLOR[it.state] || 'gray';
        const meta = [];
        meta.push(`<span class="dl-badge dl-c-${color}">${escapeHtml(it.state)}</span>`);
        meta.push(`<span class="dl-meta-item">${escapeHtml(fmtBytes(it.size))}</span>`);
        if (it.progress !== 1 && it.downSpeed != null && it.downSpeed > 0) meta.push(`<span class="dl-meta-item">↓ ${escapeHtml(fmtSpeed(it.downSpeed))}</span>`);
        if (it.type === 'torrent' && it.upSpeed) meta.push(`<span class="dl-meta-item">↑ ${escapeHtml(fmtSpeed(it.upSpeed))}</span>`);
        if (it.progress !== 1 && it.time > 0) meta.push(`<span class="dl-meta-item">ETA ${escapeHtml(fmtEta(it.time))}</span>`);
        return `
          <div class="dl-row">
            <div class="dl-row-top">
              <span class="dl-name" title="${escapeAttr(it.name)}">${escapeHtml(it.name)}</span>
              <span class="dl-pct">${pct}%</span>
            </div>
            <div class="dl-bar"><div class="dl-bar-fill dl-c-bg-${color}" style="width:${pct}%"></div></div>
            <div class="dl-meta">${meta.join('')}</div>
          </div>`;
      }).join('');
      this.body.innerHTML = `<div class="dl-list">${rows}</div>`;
    }

    _showError(msg) {
      this.errorEl.style.display = 'block';
      this.errorEl.textContent = msg && /invalid (API key|credentials)|HTTP\s*40[13]/i.test(msg) ? 'Check credentials' : `${TITLE[this.cfg.service] || 'Client'} unavailable`;
      this.el.classList.add('dl-has-error');
    }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('dl-has-error'); } }
  }

  function SabnzbdWidget(el, cfg) { return new DownloadClientWidget(el, Object.assign({ service: 'sabnzbd' }, cfg || {})); }
  function QbittorrentWidget(el, cfg) { return new DownloadClientWidget(el, Object.assign({ service: 'qbittorrent' }, cfg || {})); }
  function TransmissionWidget(el, cfg) { return new DownloadClientWidget(el, Object.assign({ service: 'transmission' }, cfg || {})); }

  function escapeHtml(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(str) { return escapeHtml(str).replace(/"/g, '&quot;'); }

  global.DownloadsApi = DownloadsApi;
  global.DownloadClientWidget = DownloadClientWidget;
  global.SabnzbdWidget = SabnzbdWidget;
  global.QbittorrentWidget = QbittorrentWidget;
  global.TransmissionWidget = TransmissionWidget;
  DownloadClientWidget._fmtBytes = fmtBytes;
  DownloadClientWidget._fmtSpeed = fmtSpeed;
  DownloadClientWidget._fmtEta = fmtEta;
})(typeof window !== 'undefined' ? window : this);
