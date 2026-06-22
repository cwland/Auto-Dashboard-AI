// Auto Dashboard AI — minimal AI theme generator (used by the dashboard's theme
// picker). Self-contained so it can run on the new-tab page without the full
// Settings code. Mirrors config.js's provider resolution + chat call, and asks
// the model for ONE accessible full palette that the theme engine can render.
'use strict';

(function (global) {
  const PROVIDER_ENDPOINTS = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    openai:     'https://api.openai.com/v1/chat/completions',
    anthropic:  'https://api.anthropic.com/v1/messages',
    google:     'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    mistral:    'https://api.mistral.ai/v1/chat/completions',
    meta:       'https://openrouter.ai/api/v1/chat/completions',
    groq:       'https://api.groq.com/openai/v1/chat/completions',
    cohere:     'https://api.cohere.ai/v2/chat',
    together:   'https://api.together.xyz/v1/chat/completions',
    fireworks:  'https://api.fireworks.ai/inference/v1/chat/completions',
    deepseek:   'https://api.deepseek.com/v1/chat/completions',
    xai:        'https://api.x.ai/v1/chat/completions',
  };
  // First-choice model per provider (fallback when settings don't carry one).
  const DEFAULT_MODEL = {
    openrouter: 'openrouter/auto', openai: 'gpt-4.1-mini', anthropic: 'claude-haiku-4-5',
    google: 'gemini-2.5-flash', mistral: 'mistral-small-latest', meta: 'meta-llama/llama-3.3-70b-instruct',
    groq: 'llama-3.3-70b-versatile', cohere: 'command-r-plus', together: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    fireworks: 'accounts/fireworks/models/llama-v3p3-70b-instruct', deepseek: 'deepseek-chat', xai: 'grok-2-latest',
  };
  const fmtFor = (p) => (p === 'anthropic' || p === 'cohere') ? p : 'openai';

  function active(s) {
    s = s || {};
    const provider = s.aiProvider || 'openrouter';
    const apiKey = (s.aiApiKeys && s.aiApiKeys[provider]) || s.apiKey || '';
    const model = (s.aiModels && s.aiModels[provider]) || s.model || DEFAULT_MODEL[provider] || '';
    const endpoint = (s.aiEndpoints && s.aiEndpoints[provider]) || PROVIDER_ENDPOINTS[provider] || PROVIDER_ENDPOINTS.openrouter;
    return { provider, apiKey, model, endpoint, format: fmtFor(provider) };
  }
  function configured(s) { return !!active(s).apiKey; }

  async function chat(messages, opts) {
    opts = opts || {};
    const { provider, apiKey, model, endpoint, format } = active(opts.settings);
    if (!apiKey) throw new Error('No AI API key configured.');
    const headers = { 'Content-Type': 'application/json' };
    if (format === 'anthropic') { headers['anthropic-version'] = '2023-06-01'; headers['x-api-key'] = apiKey; }
    else headers['Authorization'] = `Bearer ${apiKey}`;
    if (provider === 'openrouter' || provider === 'meta') {
      headers['HTTP-Referer'] = 'https://github.com/auto-dashboard-ai';
      headers['X-Title'] = 'Auto Dashboard AI';
    }
    let body;
    if (format === 'anthropic') {
      const sys = messages.find((m) => m.role === 'system');
      const rest = messages.filter((m) => m.role !== 'system');
      body = { model, max_tokens: opts.maxTokens || 900, messages: rest };
      if (sys) body.system = sys.content;
    } else if (format === 'cohere') {
      body = { model, messages };
    } else {
      body = { model, messages, temperature: opts.temperature != null ? opts.temperature : 0.8, max_tokens: opts.maxTokens || 900 };
    }
    const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let p = null; try { p = raw ? JSON.parse(raw) : null; } catch (_) {}
      throw new Error(p?.error?.message || p?.message || `HTTP ${res.status} ${res.statusText || ''}`.trim());
    }
    const data = await res.json();
    if (format === 'anthropic') return data.content?.[0]?.text || '';
    if (format === 'cohere') return (data.message?.content || []).map((c) => c.text).join('') || data.choices?.[0]?.message?.content || '';
    return data.choices?.[0]?.message?.content || '';
  }

  const validHex = (v) => /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(v || '').trim());
  const normHex = (v) => { let h = String(v || '').trim(); if (h[0] !== '#') h = '#' + h; return h.toLowerCase(); };
  const REQ = ['bgPrimary', 'bgSecondary', 'textPrimary', 'textMuted', 'accent'];
  const OPT = ['bgCard', 'bgHover', 'border', 'textSecondary', 'accentHover'];

  function parseOne(raw) {
    let s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    // Accept either a single object or an array — take the first usable one.
    let obj = null;
    const a = s.indexOf('['), z = s.lastIndexOf(']');
    if (a !== -1 && z !== -1) { try { const arr = JSON.parse(s.slice(a, z + 1)); if (Array.isArray(arr)) obj = arr[0]; } catch (_) {} }
    if (!obj) { const o = s.indexOf('{'), c = s.lastIndexOf('}'); if (o !== -1 && c !== -1) { try { obj = JSON.parse(s.slice(o, c + 1)); } catch (_) {} } }
    if (!obj || typeof obj !== 'object') return null;
    const colors = {};
    REQ.concat(OPT).forEach((k) => { if (validHex(obj[k])) colors[k] = normHex(obj[k]); });
    if (!REQ.every((k) => colors[k])) return null;
    return { name: String(obj.name || 'Custom').slice(0, 24), colors };
  }

  // Generate one accessible full palette. `description` is optional — when empty
  // the model invents a surprising, cohesive theme.
  async function generate(settings, description) {
    const sys = 'You are a UI color designer. Return ONLY valid JSON: a SINGLE object, no prose, no markdown fences. ' +
      'Keys (every value a hex color, except name): ' +
      '{"name":string,"bgPrimary":hex,"bgSecondary":hex,"bgCard":hex,"bgHover":hex,"border":hex,"textPrimary":hex,"textSecondary":hex,"textMuted":hex,"accent":hex,"accentHover":hex}. ' +
      'bgPrimary=page; bgSecondary=panel surface; bgCard=raised card (clearly distinct from bgPrimary); bgHover=hover; border=separators; ' +
      'textPrimary=body; textSecondary=secondary; textMuted=least prominent; accent=primary action; accentHover=accent hover. ' +
      'Build a clear elevation ladder (page, secondary, card all visibly different). DARK theme: page darkest, cards lighter. LIGHT theme: page a soft tint, cards near-white. ' +
      'Accessibility: textPrimary >= 4.7:1 contrast vs bgPrimary, bgSecondary and bgCard; textMuted >= 3:1 vs bgCard. Give it a short evocative name.';
    const user = description && description.trim()
      ? `Theme description: "${description.trim()}". Generate one cohesive, accessible palette.`
      : 'Invent one surprising, cohesive, accessible palette with an unexpected but tasteful mood. Pick the light/dark direction yourself.';
    const raw = await chat(
      [{ role: 'system', content: sys }, { role: 'user', content: user }],
      { settings, maxTokens: 700, temperature: description ? 0.7 : 0.95 }
    );
    const theme = parseOne(raw);
    if (!theme) throw new Error('The model did not return a usable palette. Try again.');
    return theme;
  }

  global.AITheme = { configured, active, generate };
})(typeof window !== 'undefined' ? window : this);
