'use strict';
// Tests for the Uptime Kuma widget's ported aggregation logic (UptimeKumaApi).
// These mirror Homarr's own integration tests (status mapping, monitor counts,
// average-uptime computation, graceful empty handling) to prove the port is
// faithful. No DOM or network required — we exercise aggregate() directly.

const path = require('path');

// The widget script attaches its exports to (window || this). Point window at
// the global so the IIFE publishes onto it, then require the file.
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'uptime-kuma-widget.js'));
const { UptimeKumaApi, UptimeKumaWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${a}, expected ${b})`); }
function close(a, b, msg, eps) { ok(Math.abs(a - b) <= (eps || 1e-6), `${msg} (got ${a}, expected ≈${b})`); }

// ── Heartbeat status → category map ──────────────────────────────────────────
console.log('UptimeKumaApi — heartbeat status mapping:');
eq(UptimeKumaApi.HEARTBEAT_CATEGORY[0], 'down', 'status 0 → down');
eq(UptimeKumaApi.HEARTBEAT_CATEGORY[1], 'up', 'status 1 → up');
eq(UptimeKumaApi.HEARTBEAT_CATEGORY[2], 'paused', 'status 2 (pending) → paused');
eq(UptimeKumaApi.HEARTBEAT_CATEGORY[3], 'paused', 'status 3 (maintenance) → paused');
eq(UptimeKumaApi.HEARTBEAT_CATEGORY[99], undefined, 'unknown status → undefined');

// ── Aggregation ──────────────────────────────────────────────────────────────
console.log('UptimeKumaApi — aggregate():');
const statusPage = {
  publicGroupList: [
    { id: 1, name: 'Services', monitorList: [
      { id: 10, name: 'Web' }, { id: 20, name: 'API' }, { id: 30, name: 'DB' },
    ] },
  ],
};
const heartbeat = {
  heartbeatList: {
    '10': [{ status: 1 }],
    '20': [{ status: 0 }],
    '30': [{ status: 2 }],
  },
  uptimeList: { '10_24': 0.995, '20_24': 0.5, '30_24': 0.8 },
};
const agg = UptimeKumaApi.aggregate(statusPage, heartbeat);
eq(agg.totalMonitors, 3, 'counts total monitors');
eq(agg.upCount, 1, 'up count');
eq(agg.downCount, 1, 'down count');
eq(agg.pausedCount, 1, 'paused count');
close(agg.averageUptimePercent, ((0.995 + 0.5 + 0.8) * 100) / 3, 'average uptime % from uptimeList');

console.log('UptimeKumaApi — unknown heartbeat status defaults to down:');
const agg2 = UptimeKumaApi.aggregate(
  { publicGroupList: [{ id: 1, name: 'G', monitorList: [{ id: 10, name: 'Svc' }] }] },
  { heartbeatList: { '10': [{ status: 99 }] }, uptimeList: { '10_24': 1 } },
);
eq(agg2.monitors[0].status, 'down', 'present-but-unknown status → down');
eq(agg2.downCount, 1, 'down count reflects unknown status');

console.log('UptimeKumaApi — missing heartbeat defaults to paused:');
const agg3 = UptimeKumaApi.aggregate(
  { publicGroupList: [{ id: 1, name: 'G', monitorList: [{ id: 10, name: 'Svc' }] }] },
  { heartbeatList: {}, uptimeList: {} },
);
eq(agg3.monitors[0].status, 'paused', 'no heartbeat → paused');
eq(agg3.monitors[0].uptimePercent24h, null, 'no uptime data → null');

console.log('UptimeKumaApi — empty status page:');
const agg4 = UptimeKumaApi.aggregate({ publicGroupList: [] }, { heartbeatList: {}, uptimeList: {} });
eq(agg4.totalMonitors, 0, 'no monitors');
eq(agg4.averageUptimePercent, 0, 'average uptime is 0 with no data');

console.log('UptimeKumaApi — average ignores monitors without uptime data:');
const agg5 = UptimeKumaApi.aggregate(
  { publicGroupList: [{ id: 1, name: 'G', monitorList: [{ id: 10, name: 'A' }, { id: 20, name: 'B' }] }] },
  { heartbeatList: { '10': [{ status: 1 }], '20': [{ status: 1 }] }, uptimeList: { '10_24': 1.0 } },
);
close(agg5.averageUptimePercent, 100, 'only the monitor with data counts toward the average');

// ── Display helpers ──────────────────────────────────────────────────────────
console.log('UptimeKumaWidget — uptime tier thresholds:');
eq(UptimeKumaWidget._uptimeTier(99.9), 'excellent', '≥99 → excellent');
eq(UptimeKumaWidget._uptimeTier(97), 'good', '≥95 → good');
eq(UptimeKumaWidget._uptimeTier(80), 'poor', '<95 → poor');
eq(UptimeKumaWidget._clampPercent(140), 100, 'clamp above 100');
eq(UptimeKumaWidget._clampPercent(-5), 0, 'clamp below 0');

// ── URL building ─────────────────────────────────────────────────────────────
console.log('UptimeKumaApi — URL building:');
eq(UptimeKumaApi.statusPageUrl('http://h:3001/', 'Mine'),
  'http://h:3001/api/status-page/mine', 'status page URL (trailing slash trimmed, slug lowercased)');
eq(UptimeKumaApi.heartbeatUrl('http://h:3001', ''),
  'http://h:3001/api/status-page/heartbeat/default', 'heartbeat URL defaults slug to "default"');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
