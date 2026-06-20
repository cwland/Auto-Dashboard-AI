// Auto Dashboard AI — Host reachability monitor (window.HostStatus)
//
// Adapted from Homarr's ping service (apps `packages/ping`): fetch the host with
// a timeout, treat any HTTP response < 500 as "reachable/responding" and a
// network failure, timeout, or 5xx as "unreachable". Homarr runs this server-
// side via undici; here we run it directly from the extension page, which is
// allowed because the manifest grants host_permissions for http(s)://*/*  (so
// the browser does NOT apply CORS to these fetches and we can read real status).
//
// Design goals from the spec:
//   • Efficient + scalable: one entry per unique URL.
//   • No redundant checks: many cards on the same URL share a single request.
//   • Cached + shared: results are cached with a TTL and re-used.
//   • No render impact: all checks are async; callers subscribe for updates.
(function (global) {
  'use strict';

  const TTL_MS = 60 * 1000; // a cached result is considered fresh for 60s
  const POLL_MS = 60 * 1000; // re-check actively-watched hosts every 60s
  const TIMEOUT_MS = 8000; // give up on a silent host after 8s → unreachable

  // url -> { result, ts, inflight:Promise|null, subs:Set<fn> }
  const entries = new Map();
  let pollTimer = null;

  function entryFor(url) {
    let e = entries.get(url);
    if (!e) {
      e = { result: null, ts: 0, inflight: null, subs: new Set() };
      entries.set(url, e);
    }
    return e;
  }

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  async function ping(url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const start = now();
    try {
      // GET (Homarr's default) — some hosts reject HEAD. We don't read the body.
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        cache: 'no-store',
        signal: ctrl.signal,
      });
      const durationMs = now() - start;
      // Homarr: error when statusCode >= 500. Anything else (200, 301, 401, 403…)
      // means the host is up and answering, which is what "reachable" means here.
      const ok = res.status > 0 && res.status < 500;
      return { ok, statusCode: res.status, durationMs };
    } catch (err) {
      const aborted = err && (err.name === 'AbortError');
      return { ok: false, error: aborted ? 'Timed out' : 'Unreachable' };
    } finally {
      clearTimeout(timer);
    }
  }

  function notify(e) {
    e.subs.forEach((fn) => { try { fn(e.result); } catch (_) {} });
  }

  // Run (or reuse) a check for a URL. Returns a Promise of the result. A fresh
  // cached result is returned without a new request unless `force` is set.
  function check(url, force) {
    const e = entryFor(url);
    if (e.inflight) return e.inflight;
    if (!force && e.result && (Date.now() - e.ts) < TTL_MS) {
      return Promise.resolve(e.result);
    }
    e.inflight = ping(url).then((r) => {
      e.result = r;
      e.ts = Date.now();
      e.inflight = null;
      notify(e);
      return r;
    });
    return e.inflight;
  }

  // Subscribe a callback to a URL's status. `cb(result)` fires immediately with
  // any cached result, then again on every refresh. Returns an unwatch function.
  // Cards sharing a URL share one entry and one network check (dedupe).
  function watch(url, cb) {
    if (!url || typeof cb !== 'function') return function () {};
    const e = entryFor(url);
    e.subs.add(cb);
    if (e.result) cb(e.result); // instant paint from cache
    check(url); // refresh if stale / first time
    ensurePolling();
    return function () { e.subs.delete(cb); };
  }

  function ensurePolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      entries.forEach((e, url) => { if (e.subs.size) check(url, true); });
    }, POLL_MS);
  }

  // Drop every subscriber (called when the dashboard re-renders) but KEEP the
  // cached results, so a rebuild repaints instantly and doesn't re-hammer hosts.
  function reset() {
    entries.forEach((e) => e.subs.clear());
  }

  global.HostStatus = { watch, check, reset };
})(typeof window !== 'undefined' ? window : this);
