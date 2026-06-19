// Auto Dashboard AI — Home Assistant Widget
// ---------------------------------------------------------------------------
// Shows the state of selected Home Assistant entities (lights, switches,
// sensors, …) with their friendly names and values, and a toggle button for
// toggleable entities.
//
//   const w = new HomeAssistantWidget(el, { baseUrl, apiKey, entities: ['light.kitchen', 'sensor.temp'] });
//   w.start();  ...  w.destroy();
//
// Exposed as HomeAssistantApi and HomeAssistantWidget.
//
// ATTRIBUTION: the /api/states fetching, the homeassistant.toggle service call,
// and the auth (Bearer token) are adapted from the Homarr project's Home
// Assistant integration. Homarr is Apache-2.0 licensed.
//   Copyright (c) 2024 Meier Lukas, Thomas Camlong and Homarr Labs
//   https://github.com/homarr-labs/homarr — see THIRD-PARTY-LICENSES.md.
'use strict';

(function (global) {
  // Domains whose entities can be meaningfully toggled.
  const TOGGLEABLE = ['light', 'switch', 'fan', 'input_boolean', 'cover', 'media_player', 'climate', 'automation', 'script'];
  const ON_STATES = ['on', 'open', 'home', 'playing', 'heat', 'cool', 'active'];

  const HomeAssistantApi = {
    normalizeBase(url) { return String(url || '').trim().replace(/\/+$/, ''); },
    authHeaders(apiKey) { return { Authorization: `Bearer ${apiKey || ''}`, 'Content-Type': 'application/json' }; },

    domainOf(entityId) { return String(entityId || '').split('.')[0]; },
    isToggleable(entityId) { return TOGGLEABLE.indexOf(this.domainOf(entityId)) !== -1; },

    // Pure: a raw HA state object → display row.
    mapState(raw) {
      const r = raw || {}, attrs = r.attributes || {};
      const domain = this.domainOf(r.entity_id);
      const unit = attrs.unit_of_measurement || '';
      const isOn = ON_STATES.indexOf(String(r.state).toLowerCase()) !== -1;
      return {
        entityId: r.entity_id,
        name: attrs.friendly_name || r.entity_id,
        state: r.state,
        unit,
        display: unit ? `${r.state} ${unit}` : r.state,
        domain,
        toggleable: this.isToggleable(r.entity_id),
        isOn,
        icon: attrs.icon || null,
      };
    },

    async getState(base, apiKey, entityId, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/states/${encodeURIComponent(entityId)}`, { cache: 'no-store', headers: this.authHeaders(apiKey), signal });
      if (res.status === 401) throw new Error('invalid token');
      if (res.status === 404) return { entity_id: entityId, state: 'unavailable', attributes: {} };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    async getStates(base, opts, session, signal) {
      const ids = (opts.entities || []).filter(Boolean);
      const raws = await Promise.all(ids.map((id) => this.getState(base, opts.apiKey, id, signal).catch(() => ({ entity_id: id, state: 'unavailable', attributes: {} }))));
      return raws.map((r) => this.mapState(r));
    },
    async toggle(base, apiKey, entityId, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/services/homeassistant/toggle`, { method: 'POST', cache: 'no-store', headers: this.authHeaders(apiKey), body: JSON.stringify({ entity_id: entityId }), signal });
      return res.ok;
    },
    async testConnection(base, opts, signal) {
      const res = await fetch(`${this.normalizeBase(base)}/api/config`, { cache: 'no-store', headers: this.authHeaders(opts.apiKey), signal });
      if (res.status === 401) throw new Error('invalid token');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json().catch(() => null);
      return { ok: true };
    },
  };

  class HomeAssistantWidget {
    constructor(container, config) {
      this.el = container;
      this.cfg = Object.assign({ baseUrl: '', apiKey: '', entities: [], allowToggle: true, pollMs: 15000, dataProvider: null }, config || {});
      this.states = null; this.pollTimer = null; this.abort = null; this.destroyed = false;
      this._buildSkeleton();
    }
    start() { this.stop(); this.poll(); this.pollTimer = setInterval(() => this.poll(), Math.max(5000, this.cfg.pollMs)); }
    stop() { if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; } if (this.abort) { this.abort.abort(); this.abort = null; } }
    setConfig(patch) { Object.assign(this.cfg, patch || {}); if (this.pollTimer || this.cfg.dataProvider) this.poll(); else this._render(); }
    destroy() { this.destroyed = true; this.stop(); this.el.innerHTML = ''; }
    async poll() {
      if (this.destroyed) return;
      if (this.abort) this.abort.abort();
      this.abort = ('AbortController' in global) ? new AbortController() : null;
      try {
        const states = this.cfg.dataProvider ? await this.cfg.dataProvider() : await HomeAssistantApi.getStates(this.cfg.baseUrl, { apiKey: this.cfg.apiKey, entities: this.cfg.entities }, null, this.abort && this.abort.signal);
        this._clearError(); this.states = states || []; this._render();
      } catch (err) { if (err && err.name === 'AbortError') return; this._showError(err && err.message); }
    }
    _buildSkeleton() {
      this.el.classList.add('ha-widget');
      this.el.innerHTML = `<div class="ha-header"><img class="wg-icon" src="../icons/integrations/home-assistant.svg" alt=""><div class="ha-title">Home Assistant</div><div class="ha-error" style="display:none"></div></div><div class="ha-body"></div>`;
      this.errorEl = this.el.querySelector('.ha-error'); this.body = this.el.querySelector('.ha-body');
      this.body.addEventListener('click', (e) => {
        const btn = e.target.closest && e.target.closest('[data-toggle]');
        if (btn) this._onToggle(btn.getAttribute('data-toggle'));
      });
    }
    async _onToggle(entityId) {
      if (!this.cfg.allowToggle || this.cfg.dataProvider) return;
      try { await HomeAssistantApi.toggle(this.cfg.baseUrl, this.cfg.apiKey, entityId, null); setTimeout(() => this.poll(), 400); } catch { /* ignore */ }
    }
    _render() {
      const states = this.states || [];
      if (!states.length) { this.body.innerHTML = `<div class="ha-empty">No entities configured.</div>`; return; }
      this.body.innerHTML = `<div class="ha-list">${states.map((s) => {
        const unavailable = String(s.state).toLowerCase() === 'unavailable';
        const control = (this.cfg.allowToggle && s.toggleable && !unavailable && !this.cfg.dataProvider)
          ? `<button type="button" class="ha-toggle ${s.isOn ? 'ha-on' : 'ha-off'}" data-toggle="${escapeAttr(s.entityId)}" title="Toggle"><span class="ha-toggle-knob"></span></button>`
          : `<span class="ha-state ${s.isOn ? 'ha-state-on' : ''}">${escapeHtml(s.display)}</span>`;
        return `<div class="ha-row"><div class="ha-row-main"><span class="ha-name" title="${escapeAttr(s.entityId)}">${escapeHtml(s.name)}</span><span class="ha-domain">${escapeHtml(s.domain)}</span></div>${control}</div>`;
      }).join('')}</div>`;
    }
    _showError(msg) { this.errorEl.style.display = 'block'; this.errorEl.textContent = msg && /invalid token|HTTP\s*401/i.test(msg) ? 'Invalid token' : 'Home Assistant unavailable'; this.el.classList.add('ha-has-error'); }
    _clearError() { if (this.errorEl.style.display !== 'none') { this.errorEl.style.display = 'none'; this.el.classList.remove('ha-has-error'); } }
  }

  function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  global.HomeAssistantApi = HomeAssistantApi;
  global.HomeAssistantWidget = HomeAssistantWidget;
})(typeof window !== 'undefined' ? window : this);
