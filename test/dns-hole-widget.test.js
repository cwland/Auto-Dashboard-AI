'use strict';
// Tests for the Pi-hole / AdGuard widget's ported logic (DnsHoleApi).
// Mirrors Homarr's AdGuard Home and Pi-hole (v5/v6) integrations: summary
// computation, status mapping, blocked-percentage, and the Basic-auth header.
// No DOM or network required.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'dns-hole-widget.js'));
const { DnsHoleApi, DnsHoleWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function close(a, b, msg) { ok(Math.abs(a - b) <= 1e-6, `${msg} (got ${a}, expected ≈${b})`); }

// ── AdGuard summary computation ───────────────────────────────────────────────
console.log('DnsHoleApi.adguard — computeSummary (hours: sum across buckets):');
const agHours = DnsHoleApi.adguard.computeSummary(
  { time_units: 'hours', dns_queries: [100, 200, 300], blocked_filtering: [10, 20, 30] },
  { protection_enabled: true },
  { filters: [{ enabled: true, rules_count: 1000 }, { enabled: true, rules_count: 500 }, { enabled: false, rules_count: 999 }] },
);
eq(agHours.dnsQueriesToday, 600, 'queries summed across hourly buckets');
eq(agHours.adsBlockedToday, 60, 'blocked summed across hourly buckets');
close(agHours.adsBlockedTodayPercentage, 10, 'block % = 60/600*100');
eq(agHours.domainsBeingBlocked, 1500, 'only enabled filters counted toward blocklist size');
eq(agHours.status, 'enabled', 'protection_enabled → enabled');

console.log('DnsHoleApi.adguard — computeSummary (days: take latest bucket):');
const agDays = DnsHoleApi.adguard.computeSummary(
  { time_units: 'days', dns_queries: [10, 20, 999], blocked_filtering: [1, 2, 99] },
  { protection_enabled: false },
  { filters: [] },
);
eq(agDays.dnsQueriesToday, 999, 'days → last dns_queries bucket');
eq(agDays.adsBlockedToday, 99, 'days → last blocked bucket');
eq(agDays.status, 'disabled', 'protection disabled → disabled');

console.log('DnsHoleApi.adguard — zero queries → 0% (no divide by zero):');
const agZero = DnsHoleApi.adguard.computeSummary(
  { time_units: 'hours', dns_queries: [0], blocked_filtering: [0] },
  { protection_enabled: true }, { filters: [] });
eq(agZero.adsBlockedTodayPercentage, 0, 'no queries → 0%');

console.log('DnsHoleApi.adguard — Basic auth header:');
eq(DnsHoleApi.adguard.authHeader('admin', 'secret'),
  'Basic ' + Buffer.from('admin:secret').toString('base64'), 'base64(user:pass)');

// ── Pi-hole v5 mapping ──────────────────────────────────────────────────────────
console.log('DnsHoleApi.pihole — mapV5:');
const v5 = DnsHoleApi.pihole.mapV5({
  status: 'enabled', domains_being_blocked: 120000, ads_blocked_today: 8400,
  dns_queries_today: 42000, ads_percentage_today: 20,
});
eq(v5.status, 'enabled', 'status passthrough');
eq(v5.adsBlockedToday, 8400, 'ads_blocked_today');
eq(v5.adsBlockedTodayPercentage, 20, 'ads_percentage_today');
eq(v5.domainsBeingBlocked, 120000, 'domains_being_blocked');
eq(v5.dnsQueriesToday, 42000, 'dns_queries_today');

// ── Pi-hole v6 mapping ──────────────────────────────────────────────────────────
console.log('DnsHoleApi.pihole — mapV6:');
const v6 = DnsHoleApi.pihole.mapV6(
  { queries: { total: 50000, blocked: 12500, percent_blocked: 25 }, gravity: { domains_being_blocked: 200000 } },
  { blocking: 'enabled', timer: null },
);
eq(v6.status, 'enabled', 'blocking status mapped');
eq(v6.adsBlockedToday, 12500, 'queries.blocked');
eq(v6.adsBlockedTodayPercentage, 25, 'queries.percent_blocked');
eq(v6.domainsBeingBlocked, 200000, 'gravity.domains_being_blocked');
eq(v6.dnsQueriesToday, 50000, 'queries.total');

console.log('DnsHoleApi.pihole — mapV6 unknown/failed blocking → undefined status:');
eq(DnsHoleApi.pihole.mapV6({ queries: {}, gravity: {} }, { blocking: 'failed' }).status, undefined, 'failed → undefined');
eq(DnsHoleApi.pihole.mapV6({ queries: {}, gravity: {} }, { blocking: 'unknown' }).status, undefined, 'unknown → undefined');

// ── Base normalization ────────────────────────────────────────────────────────
console.log('DnsHoleApi — base URL normalization:');
eq(DnsHoleApi.normalizeBase('http://pi.hole/'), 'http://pi.hole', 'trailing slash trimmed');

// ── Display helpers ──────────────────────────────────────────────────────────────
console.log('DnsHoleWidget — display helpers:');
eq(DnsHoleWidget._fmtPct(123), '100.0%', 'percentage clamped to 100');
eq(DnsHoleWidget._fmtPct(-5), '0.0%', 'percentage clamped to 0');
eq(DnsHoleWidget._fmtInt(12345), (12345).toLocaleString(), 'integers localized');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
