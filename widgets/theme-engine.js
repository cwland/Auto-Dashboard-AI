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

  // Core colors → full token set. The remaining tokens are derived so every
  // role gets its own, theme-tinted value with a proper light/dark contrast
  // ladder — bg-primary → bg-secondary → bg-card → bg-hover are all distinct
  // and carry the theme hue (no role ever falls back to a flat #ffffff / grey).
  function deriveThemeVars(c) {
    c = c || {};
    const bgP = c.bgPrimary || '#101014';
    const bgS = c.bgSecondary || bgP;
    const txt = c.textPrimary || '#e8e8ee';
    const accent = c.accent || '#6366f1';
    const dark = lum(bgP) < 0.4;
    const ar = hexToRgb(accent);
    // Any token the caller supplies is used as-is; the rest are derived. This
    // lets an AI-generated theme specify the whole palette, while standard /
    // manual themes (core colours only) still get a derived contrast ladder.
    const hasCard = validHex(c.bgCard);
    // Muted/secondary text run a touch darker on light themes for legibility.
    const txtMuted = c.textMuted || mix(txt, bgP, dark ? 0.45 : 0.40);
    // Page background: light themes are deepened toward the text so near-white
    // cards clearly stand out (a flat near-white page reads as low-contrast).
    // A full palette (bgCard given) is trusted verbatim.
    const page = (dark || hasCard) ? bgP : mix(bgP, txt, 0.13);
    // Card: near-white on light themes for a strong, crisp lift off the page.
    const card = hasCard ? normHex(c.bgCard) : (dark ? mix(bgS, '#ffffff', 0.07) : mix(bgS, '#ffffff', 0.82));
    const hover = validHex(c.bgHover) ? normHex(c.bgHover) : (dark ? mix(bgS, txt, 0.11) : mix(bgS, txt, 0.11));
    // Border: full palettes keep their value; otherwise derive a clearly visible
    // edge — light themes get a noticeably stronger border so card edges read.
    const border = (hasCard && validHex(c.border)) ? normHex(c.border)
                 : (dark ? (c.border || mix(bgS, txt, 0.18)) : mix(bgS, txt, 0.30));
    const textSecondary = validHex(c.textSecondary) ? normHex(c.textSecondary) : mix(txt, txtMuted, dark ? 0.45 : 0.28);
    const accentHover = validHex(c.accentHover) ? normHex(c.accentHover) : mix(accent, dark ? '#ffffff' : '#000000', 0.14);
    return {
      '--bg-primary': page,
      '--bg-secondary': bgS,
      '--bg-card': card,
      '--bg-hover': hover,
      '--border': border,
      '--border-focus': accent,
      '--text-primary': txt,
      '--text-secondary': textSecondary,
      '--text-muted': txtMuted,
      '--accent': accent,
      '--accent-hover': accentHover,
      '--accent-light': `rgba(${ar.r}, ${ar.g}, ${ar.b}, 0.13)`,
      '--success-light': 'rgba(34,197,94,0.13)',
      '--warning-light': 'rgba(245,158,11,0.13)',
      '--danger-light': 'rgba(239,68,68,0.13)',
    };
  }

  // ── Standard (built-in) themes — single source of truth ─────────────────────
  // Each is just its core colors; the full palette is derived by deriveThemeVars
  // (same path custom themes use). The derived CSS is baked into common.css for
  // both pages (no FOUC); this table also feeds the full-palette swatches.
  const STANDARD_THEMES = [
    { id: 'default',     name: 'Violet',          bgPrimary: '#f0edf8', bgSecondary: '#f8f6fc', border: '#dfdee1', textPrimary: '#1a1226', textMuted: '#746e7e', accent: '#6d28d9' },
    { id: 'lavender',    name: 'Lavender',        bgPrimary: '#faf5ff', bgSecondary: '#fdfaff', border: '#e4dce9', textPrimary: '#3b0764', textMuted: '#8b6ba5', accent: '#8b5cf6' },
    { id: 'rose',        name: 'Rose',            bgPrimary: '#fdf2f8', bgSecondary: '#fef9fc', border: '#e7dce0', textPrimary: '#500724', textMuted: '#996a7d', accent: '#be185d' },
    { id: 'sakura',      name: 'Sakura',          bgPrimary: '#fff1f2', bgSecondary: '#fff8f9', border: '#e6dcdf', textPrimary: '#4c0519', textMuted: '#976874', accent: '#e11d48' },
    { id: 'crimson',     name: 'Crimson',         bgPrimary: '#fff8f6', bgSecondary: '#fffcfb', border: '#e2dddd', textPrimary: '#2d0e0e', textMuted: '#85706f', accent: '#7f1d1d' },
    { id: 'copper',      name: 'Copper',          bgPrimary: '#fffbeb', bgSecondary: '#fffdf5', border: '#e5dfdc', textPrimary: '#451a03', textMuted: '#937964', accent: '#b45309' },
    { id: 'stone',       name: 'Stone',           bgPrimary: '#f5f1ea', bgSecondary: '#fbf9f4', border: '#e4dccf', textPrimary: '#2b2723', textMuted: '#8c8174', accent: '#7c6f64' },
    { id: 'slate',       name: 'Slate',           bgPrimary: '#eaeef4', bgSecondary: '#f6f9fc', border: '#d6dde7', textPrimary: '#0f1729', textMuted: '#697587', accent: '#334a63' },
    { id: 'forest',      name: 'Forest',          bgPrimary: '#f0fdf4', bgSecondary: '#f8fefa', border: '#dce2de', textPrimary: '#052e16', textMuted: '#688573', accent: '#14532d' },
    { id: 'sage',        name: 'Sage',            bgPrimary: '#f7fee7', bgSecondary: '#fbfff3', border: '#dfe2dc', textPrimary: '#1a2e05', textMuted: '#778564', accent: '#4d7c0f' },
    { id: 'ocean',       name: 'Ocean',           bgPrimary: '#ecfeff', bgSecondary: '#f6ffff', border: '#dde1e3', textPrimary: '#0c2a3a', textMuted: '#6a838d', accent: '#0e7490' },
    { id: 'arctic',      name: 'Arctic',          bgPrimary: '#f0f9ff', bgSecondary: '#f8fcff', border: '#dde6eb', textPrimary: '#0c4a6e', textMuted: '#6c94ab', accent: '#0284c7' },
    { id: 'cobalt',      name: 'Cobalt',          bgPrimary: '#eff6ff', bgSecondary: '#f7fbff', border: '#e0e3ef', textPrimary: '#1e3a8a', textMuted: '#7689bb', accent: '#1d4ed8' },
    { id: 'navy',        name: 'Executive Navy',  bgPrimary: '#eef2f7', bgSecondary: '#f7f9fb', border: '#dde1e5', textPrimary: '#0f2744', textMuted: '#6d7c8f', accent: '#1e3a5f' },
    { id: 'mint',        name: 'Mint',            bgPrimary: '#ecfdf5', bgSecondary: '#f6fffb', border: '#dbe6e1', textPrimary: '#022c22', textMuted: '#5f897b', accent: '#059669' },
    { id: 'marigold',    name: 'Marigold',        bgPrimary: '#fefce8', bgSecondary: '#fffef6', border: '#e4e2d4', textPrimary: '#422006', textMuted: '#8a7d52', accent: '#ca8a04' },
    { id: 'midnight',    name: 'Midnight',        bgPrimary: '#0f0e1a', bgSecondary: '#171524', border: '#393747', textPrimary: '#e8e6f0', textMuted: '#8d8b96', accent: '#6366f1' },
    { id: 'aubergine',   name: 'Aubergine',       bgPrimary: '#1a0533', bgSecondary: '#240944', border: '#462a69', textPrimary: '#e9d5ff', textMuted: '#927ea9', accent: '#a855f7' },
    { id: 'matrix',      name: 'Matrix',          bgPrimary: '#020c06', bgSecondary: '#06160a', border: '#273a2b', textPrimary: '#4ade80', textMuted: '#2c864d', accent: '#22c55e' },
    { id: 'deepsea',     name: 'Deep Sea',        bgPrimary: '#042f2e', bgSecondary: '#0c3f3c', border: '#2f6360', textPrimary: '#99f6e4', textMuted: '#5aa298', accent: '#14b8a6' },
    { id: 'indigonight', name: 'Indigo Night',    bgPrimary: '#18181b', bgSecondary: '#202023', border: '#414144', textPrimary: '#e4e4e7', textMuted: '#8e8e91', accent: '#6366f1' },
    { id: 'eclipse',     name: 'Eclipse',         bgPrimary: '#111827', bgSecondary: '#18212f', border: '#3a434f', textPrimary: '#f9fafb', textMuted: '#989ba2', accent: '#64748b' },
    { id: 'obsidian',    name: 'Obsidian',        bgPrimary: '#09090b', bgSecondary: '#111113', border: '#343436', textPrimary: '#e4e4e7', textMuted: '#88888b', accent: '#71717a' },
    { id: 'espresso',    name: 'Espresso',        bgPrimary: '#1f140d', bgSecondary: '#2a1c12', border: '#4a3829', textPrimary: '#f3e7d6', textMuted: '#b29a83', accent: '#b07d4f' },
    { id: 'bronze',      name: 'Bronze',          bgPrimary: '#0a0700', bgSecondary: '#120c00', border: '#352e1f', textPrimary: '#fef9c3', textMuted: '#989371', accent: '#d97706' },
    { id: 'volcanic',    name: 'Volcanic',        bgPrimary: '#0c0500', bgSecondary: '#140902', border: '#372922', textPrimary: '#fed7aa', textMuted: '#987f63', accent: '#ea580c' },
    { id: 'ruby',        name: 'Ruby',            bgPrimary: '#1a0a10', bgSecondary: '#240d16', border: '#46202f', textPrimary: '#fbd5e0', textMuted: '#9c7280', accent: '#e11d48' },
    { id: 'nightsky',    name: 'Night Sky',       bgPrimary: '#0a1322', bgSecondary: '#0f1b30', border: '#2b3b53', textPrimary: '#dbeafe', textMuted: '#7d93b3', accent: '#38bdf8' },
  ];
  const STANDARD_BY_ID = {};
  STANDARD_THEMES.forEach((t) => { STANDARD_BY_ID[t.id] = t; });

  // The full derived palette (token → value) for a theme id or a core-colors obj.
  function paletteFor(idOrColors) {
    const core = typeof idOrColors === 'string' ? STANDARD_BY_ID[idOrColors] : idOrColors;
    return deriveThemeVars(core || {});
  }
  // The CSS for all standard themes (used to bake them into common.css).
  function standardThemeCss() {
    return STANDARD_THEMES.map((t) => {
      const body = Object.entries(deriveThemeVars(t)).map(([k, v]) => `  ${k}: ${v};`).join('\n');
      return `/* ${t.name} */\nhtml[data-theme="${t.id}"] {\n${body}\n}`;
    }).join('\n');
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

  global.ThemeEngine = { hexToRgb, mix, lum, contrast, validHex, normHex, deriveThemeVars, customThemeCss, injectCustomThemeStyles, STANDARD_THEMES, paletteFor, standardThemeCss };
})(typeof window !== 'undefined' ? window : this);
