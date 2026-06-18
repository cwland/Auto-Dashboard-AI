'use strict';
// Tests for the UniFi widget's ported logic (UnifiApi.mapSites). Mirrors
// Homarr's UniFi aggregation: per-subsystem status via "every site ok", numeric
// aggregation by sum (users) / max (latency, uptime). No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'unifi-widget.js'));
const { UnifiApi, UnifiWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

const site = (over) => ({ health: [
  { subsystem: 'wan', status: over.wan || 'ok' },
  { subsystem: 'www', status: over.wan || 'ok', latency: over.lat ?? 10, speedtest_ping: over.ping ?? 14, uptime: over.up ?? 1000 },
  { subsystem: 'wlan', status: 'ok', num_user: over.wlanU ?? 5, num_guest: over.wlanG ?? 1 },
  { subsystem: 'lan', status: 'ok', num_user: over.lanU ?? 3, num_guest: over.lanG ?? 0 },
  { subsystem: 'vpn', status: 'ok', remote_user_num_active: over.vpn ?? 2 },
] });

console.log('UnifiApi — mapSites (single site):');
const one = UnifiApi.mapSites([site({})]);
eq(one.wanStatus, 'enabled', 'wan ok → enabled');
eq(one.www.status, 'enabled', 'www status from wan');
eq(one.www.latency, 10, 'www latency');
eq(one.www.uptime, 1000, 'www uptime');
eq(one.wifi.users, 5, 'wifi users');
eq(one.wifi.guests, 1, 'wifi guests');
eq(one.lan.users, 3, 'lan users');
eq(one.vpn.users, 2, 'vpn users');

console.log('UnifiApi — mapSites (two sites: sum users, max latency/uptime):');
const two = UnifiApi.mapSites([
  site({ wlanU: 5, lanU: 3, vpn: 2, lat: 10, up: 1000 }),
  site({ wlanU: 7, lanU: 4, vpn: 1, lat: 25, up: 5000 }),
]);
eq(two.wifi.users, 12, 'wifi users summed across sites');
eq(two.lan.users, 7, 'lan users summed');
eq(two.vpn.users, 3, 'vpn users summed');
eq(two.www.latency, 25, 'latency = max across sites');
eq(two.www.uptime, 5000, 'uptime = max across sites');

console.log('UnifiApi — mapSites (status requires ALL sites ok):');
const mixed = UnifiApi.mapSites([site({ wan: 'ok' }), site({ wan: 'error' })]);
eq(mixed.wanStatus, 'disabled', 'one site wan not ok → disabled overall');

console.log('UnifiApi — mapSites (missing subsystem is defensive):');
const partial = UnifiApi.mapSites([{ health: [{ subsystem: 'wan', status: 'ok' }] }]);
eq(partial.wanStatus, 'enabled', 'present wan ok');
eq(partial.wifi.users, 0, 'missing wlan → 0 users');
eq(partial.wifi.status, 'disabled', 'missing wlan subsystem → disabled');
eq(UnifiApi.mapSites([]).wanStatus, 'disabled', 'no sites → disabled');

console.log('UnifiApi — health URL building:');
eq(UnifiApi.healthUrl('https://udm/', 'unifios', 'default'),
  'https://udm/proxy/network/api/s/default/stat/health', 'UniFi OS proxied path');
eq(UnifiApi.healthUrl('https://ctrl:8443', 'classic', 'home'),
  'https://ctrl:8443/api/s/home/stat/health', 'classic controller path');

console.log('UnifiWidget — uptime formatting:');
eq(UnifiWidget._fmtUptime(0), '0m', 'zero → 0m');
eq(UnifiWidget._fmtUptime(90), '1m', '90s → 1m');
eq(UnifiWidget._fmtUptime(3700), '1h 1m', '3700s → 1h 1m');
eq(UnifiWidget._fmtUptime(90000), '1d 1h', '90000s → 1d 1h');
eq(UnifiWidget._fmtMs(12.6), '13 ms', 'ms rounded');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
