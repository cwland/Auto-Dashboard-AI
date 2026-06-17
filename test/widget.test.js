'use strict';
// Minimal DOM mock — just enough to exercise TautulliWidget end-to-end
// (skeleton build, card creation via innerHTML templates, reconcile, carousel
// rotation, error display) without a browser.

let ELID = 0;
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this._id = ++ELID;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this._classes = new Set();
    this.style = {
      _props: {},
      setProperty(k, v) { this._props[k] = v; },
      getPropertyValue(k) { return this._props[k] || ''; },
    };
    this._text = '';
    this._attrs = {};
    this._listeners = {};
    this.clientWidth = 800;
    this.offsetWidth = 800;
  }
  get classList() {
    const c = this._classes;
    return {
      add: (...x) => x.forEach((n) => c.add(n)),
      remove: (...x) => x.forEach((n) => c.delete(n)),
      toggle: (n, f) => { const on = f === undefined ? !c.has(n) : f; on ? c.add(n) : c.delete(n); return on; },
      contains: (n) => c.has(n),
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k]; }
  removeAttribute(k) { delete this._attrs[k]; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text; }
  set innerHTML(html) { this.children = []; this._text = ''; parseInto(this, html); }
  get innerHTML() { return ''; }
  appendChild(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    this.children.push(node);
    return node;
  }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    node.parentNode = null;
    return node;
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); }
  _all() { const out = []; const walk = (n) => n.children.forEach((c) => { out.push(c); walk(c); }); walk(this); return out; }
  matches(sel) {
    if (sel.startsWith('.')) return this._classes.has(sel.slice(1));
    if (sel.startsWith('[')) { const m = sel.match(/\[data-([\w-]+)\]/); return m && (this.dataset[camel(m[1])] !== undefined); }
    return this.tagName === sel.toUpperCase();
  }
  querySelector(sel) { return this._all().find((n) => n.matches(sel)) || null; }
  querySelectorAll(sel) { return this._all().filter((n) => n.matches(sel)); }
}

function camel(s) { return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); }

// Very small HTML parser for the widget's templates (tags, class, data-* attrs).
function parseInto(root, html) {
  const stack = [root];
  const re = /<(\/?)([a-zA-Z0-9]+)((?:\s+[a-zA-Z-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (m[5] !== undefined) { // text
      const txt = m[5].trim();
      if (txt) stack[stack.length - 1]._text = txt;
      continue;
    }
    const closing = m[1] === '/';
    const tag = m[2];
    const attrs = m[3] || '';
    const selfClose = m[4] === '/' || /^(img|input|br)$/i.test(tag);
    if (closing) { if (stack.length > 1) stack.pop(); continue; }
    const el = new El(tag);
    const aRe = /([a-zA-Z-]+)="([^"]*)"/g; let a;
    while ((a = aRe.exec(attrs)) !== null) {
      if (a[1] === 'class') el.className = a[2];
      else if (a[1].startsWith('data-')) el.dataset[camel(a[1].slice(5))] = a[2];
      else el.setAttribute(a[1], a[2]);
    }
    stack[stack.length - 1].appendChild(el);
    if (!selfClose) stack.push(el);
  }
}

// ── Globals the widget expects ──
global.window = global;
global.document = { createElement: (t) => new El(t) };
global.ResizeObserver = class { observe() {} disconnect() {} };
global.AbortController = class { constructor() { this.signal = {}; } abort() {} };

let timers = [];
global.setTimeout = (fn, ms) => { const id = { fn, ms }; timers.push(id); return id; };
global.clearTimeout = (id) => { timers = timers.filter((t) => t !== id); };
global.setInterval = () => 0;
global.clearInterval = () => {};
function flushTimers() { const t = timers; timers = []; t.forEach((x) => x.fn()); }

// ── Load the widget ──
require('../widgets/tautulli-widget.js');
const { TautulliWidget, TautulliApi } = global;

// ── Test runner ──
let pass = 0, fail = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.log(`  ✗ ${label}\n      expected ${e}\n      got      ${a}`); }
}
function ok(cond, label) { if (cond) pass++; else { fail++; console.log(`  ✗ ${label}`); } }

// Spec sample session (mirrors the requirements doc's "Fields with Sample Data")
const sampleSession = {
  session_key: '42', media_type: 'episode',
  user: 'alice', friendly_name: 'Alice',
  grandparent_title: 'The Show', title: 'The Episode',
  product: 'Plex Web', player: 'Chrome',
  quality_profile: 'Original', stream_bitrate: '4200',
  transcode_decision: 'transcode', transcode_throttled: 1,
  container: 'mkv', stream_container: 'mp4', stream_container_decision: 'transcode',
  video_decision: 'copy', stream_video_codec: 'h264', stream_video_resolution: '720',
  audio_decision: 'transcode', audio_language: 'English',
  audio_codec: 'ac3', audio_channel_layout: '5.1',
  stream_audio_codec: 'aac', stream_audio_channel_layout: 'stereo',
  subtitles: '0',
  grandparent_thumb: '/library/metadata/123/thumb/1700000000',
  art: '/library/metadata/123/art/1700000000',
  parent_media_index: '1', media_index: '11', platform: 'Chrome',
  secure: '1',
  location: 'lan', ip_address: '192.168.50.4',
  bandwidth: '8000',
  view_offset: 977000, duration: 2594000, progress_percent: '37',
  state: 'playing',
};

console.log('describeSession — field mapping vs spec sample:');
const d = TautulliWidget._describeSession(sampleSession, 'http://host:8181', 'KEY');
eq(d.username, 'Alice', 'username');
eq(d.product, 'Plex Web', 'product');
eq(d.player, 'Chrome', 'player');
eq(d.quality, 'Original (4.2 Mbps)', 'quality with bitrate');
eq(d.stream, 'Transcode (Throttled)', 'stream throttled');
eq(d.container, 'Converting (MKV → MP4)', 'container converting');
eq(d.video, 'Direct Stream (H264 720p)', 'video direct stream');
eq(d.audio, 'Transcode (English - AC3 5.1 → AAC Stereo)', 'audio transcode');
eq(d.subtitle, 'None', 'subtitle none');
eq(d.location, 'LAN: 192.168.50.4', 'location');
eq(d.bandwidth, '8.0 Mbps', 'bandwidth');
eq(d.progressText, '16:17 / 43:14', 'progress text');
ok(d.poster.includes('pms_image_proxy') && d.poster.includes('KEY'), 'poster url built');
eq(d.footTitle, 'The Show - The Episode', 'footer title (show - episode)');
eq(d.footSub, 'S1 · E11', 'footer index (season · episode)');
eq(d.stateIcon, '▶', 'play-state icon');
eq(d.avatarInitial, 'A', 'avatar initial');
ok(d.qualityWarn === true, 'quality transcode warning flagged');
ok(d.secure === true, 'secure stream flagged for lock icon');
ok(d.platformIcon.includes('/images/platforms/chrome.svg'), 'platform icon url');
ok(d.backdrop.includes('pms_image_proxy'), 'backdrop art url');

console.log('TautulliApi — URL building & error path:');
eq(TautulliApi.buildUrl('http://h:8181/', 'K', 'get_activity'),
   'http://h:8181/api/v2?apikey=K&cmd=get_activity&out_type=json', 'buildUrl strips trailing slash');

// mocked fetch — invalid apikey returns success HTTP but error result
global.fetch = async () => ({ ok: true, json: async () => ({ response: { result: 'error', message: 'Invalid apikey' } }) });
(async () => {
  let threw = false;
  try { await TautulliApi.getActivity('http://h', 'bad'); } catch (e) { threw = /apikey/i.test(e.message); }
  ok(threw, 'getActivity throws on invalid apikey');

  // ── Widget lifecycle: header + reconcile + carousel ──
  console.log('Widget — header summary & no-streams:');
  const host = new El('div');
  const w = new TautulliWidget(host, { baseUrl: 'http://h', apiKey: 'K', maxVisible: 3 });

  w._apply({ stream_count: 0, sessions: [] });
  ok(w.noStreams.style && host.querySelector('.tw-empty')._text === 'No Streams', 'shows "No Streams"');
  eq(w.headerSummary.textContent, '', 'no summary when empty');

  w._apply({
    stream_count: 1, stream_count_transcode: 1,
    total_bandwidth: 8000, lan_bandwidth: 8000,
    sessions: [sampleSession],
  });
  eq(w.headerSummary.textContent,
     'Sessions: 1 stream (1 transcode) | Bandwidth: 8.0 Mbps (LAN: 8.0 Mbps)',
     'active-stream header matches spec format');
  eq(w.order.length, 1, 'one card tracked');
  ok(w.mode === 'static', 'static mode at/below max');

  console.log('Widget — carousel reconcile (add / remove / preserve order):');
  const mk = (k) => ({ session_key: k, user: 'u' + k, title: 't' + k, media_type: 'movie',
    view_offset: 0, duration: 1000, bandwidth: '1000', location: 'lan', ip_address: '1.1.1.1' });
  w._apply({ stream_count: 5, stream_count_transcode: 0, total_bandwidth: 5000, lan_bandwidth: 5000,
    sessions: [mk('a'), mk('b'), mk('c'), mk('d'), mk('e')] });
  ok(w.mode === 'carousel', 'carousel mode when count > max');
  eq(w.order, ['a', 'b', 'c', 'd', 'e'], 'ring order established');
  eq(w.cards.size, 5, 'five cards mounted');

  // simulate one rotation step completing
  w._step();
  ok(w.animating, 'rotation in flight after _step');
  w.track.dispatchEvent({ type: 'transitionend', target: w.track, propertyName: 'transform' });
  eq(w.order, ['b', 'c', 'd', 'e', 'a'], 'first card rotated to back, no reset');

  // a stream ends mid-life: card removed, order preserved otherwise
  w._apply({ stream_count: 4, sessions: [mk('b'), mk('c'), mk('d'), mk('e')] });
  eq(w.order, ['b', 'c', 'd', 'e'], 'ended stream removed cleanly');
  eq(w.cards.size, 4, 'card count drops to four');

  // a new stream starts: appended to the END (appears naturally next cycle)
  w._apply({ stream_count: 5, sessions: [mk('b'), mk('c'), mk('d'), mk('e'), mk('f')] });
  eq(w.order, ['b', 'c', 'd', 'e', 'f'], 'new stream appended to ring tail');

  // deferral: data arriving mid-animation must not restructure immediately
  w._step();
  w._apply({ stream_count: 2, sessions: [mk('b'), mk('c')] });
  eq(w.order.length, 5, 'reconcile deferred while animating');
  ok(w.pending && w.pending.length === 2, 'pending update stored');
  w.track.dispatchEvent({ type: 'transitionend', target: w.track, propertyName: 'transform' });
  eq(w.cards.size, 2, 'deferred update applied after animation');

  console.log('Widget — error handling:');
  w._showError('Network error');
  eq(w.errorEl.style.display, 'block', 'error shown');
  ok(w.cards.size === 2, 'cards preserved during error (graceful retry)');
  w._clearError();
  eq(w.errorEl.style.display, 'none', 'error cleared on recovery');

  console.log('Widget — carousel speed config:');
  const host2 = new El('div');
  const w2 = new TautulliWidget(host2, { baseUrl: 'http://h', apiKey: 'K', maxVisible: 2 });
  eq(w2.cfg.dwellMs, 4000, 'default dwell is slightly slower (4000ms)');
  w2._apply({ stream_count: 3, sessions: [mk('x'), mk('y'), mk('z')] });
  ok(w2.mode === 'carousel', 'carousel engaged at >max');
  eq(w2.rotateTimer && w2.rotateTimer.ms, 4000, 'rotation scheduled at default dwell');
  w2.setConfig({ dwellMs: 1500 });
  eq(w2.rotateTimer && w2.rotateTimer.ms, 1500, 'setConfig updates rotation speed live');
  w2.setConfig({ dwellMs: 50 });
  eq(w2.rotateTimer && w2.rotateTimer.ms, 400, 'dwell floored at 400ms');

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
