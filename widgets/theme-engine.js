// Auto Dashboard AI — custom theme engine (shared by config + dashboard).
// Turns a custom theme's core colors into the full design-token set and injects
// them as html[data-theme="custom-xxx"] rules. Loaded on both pages so a custom
// theme renders identically in the settings preview and on the dashboard.
'use strict';

(function (global) {
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function toHex(n) { return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'); }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return '#' + toHex(A.r + (B.r - A.r) * t) + toHex(A.g + (B.g - A.g) * t) + toHex(A.b + (B.b - A.b) * t);
  }
  function lum(hex) {
    const c = hexToRgb(hex);
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  function validHex(v) { return /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(v || '').trim()); }
  function normHex(v) {
    let h = String(v || '').trim(); if (h[0] !== '#') h = '#' + h;
    if (h.length === 4) h = '#' + h.slice(1).split('').map((c) => c + c).join('');
    return h.toLowerCase();
  }

  // Core colors → full token set. The few remaining tokens are derived.
  function deriveThemeVars(c) {
    c = c || {};
    const dark = lum(c.bgPrimary || '#101014') < 0.4;
    const ar = hexToRgb(c.accent || '#6366f1');
    return {
      '--bg-primary': c.bgPrimary,
      '--bg-secondary': c.bgSecondary,
      '--bg-card': dark ? mix(c.bgSecondary, '#ffffff', 0.04) : '#ffffff',
      '--bg-hover': mix(c.bgSecondary, c.textPrimary, 0.07),
      '--border': c.border,
      '--border-focus': c.accent,
      '--text-primary': c.textPrimary,
      '--text-secondary': c.textSecondary || mix(c.textPrimary, c.textMuted, 0.5),
      '--text-muted': c.textMuted,
      '--accent': c.accent,
      '--accent-hover': mix(c.accent, dark ? '#ffffff' : '#000000', 0.14),
      '--accent-light': `rgba(${ar.r}, ${ar.g}, ${ar.b}, 0.13)`,
      '--success-light': 'rgba(34,197,94,0.13)',
      '--warning-light': 'rgba(245,158,11,0.13)',
      '--danger-light': 'rgba(239,68,68,0.13)',
    };
  }
  function customThemeCss(themes) {
    return (themes || []).map((t) => {
      const body = Object.entries(deriveThemeVars(t.colors || {})).map(([k, v]) => `${k}:${v};`).join('');
      return `html[data-theme="${t.id}"]{${body}}`;
    }).join('\n');
  }
  function injectCustomThemeStyles(themes) {
    let el = document.getElementById('custom-theme-styles');
    if (!el) { el = document.createElement('style'); el.id = 'custom-theme-styles'; document.head.appendChild(el); }
    el.textContent = customThemeCss(themes || []);
  }

  global.ThemeEngine = { hexToRgb, mix, lum, contrast, validHex, normHex, deriveThemeVars, customThemeCss, injectCustomThemeStyles };
})(typeof window !== 'undefined' ? window : this);
