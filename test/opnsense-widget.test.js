'use strict';
// Tests for the OPNsense widget's ported mapping logic (OpnsenseApi). Mirrors
// Homarr's OPNsense firewall-summary integration. No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'opnsense-widget.js'));
const { OpnsenseApi, OpnsenseWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function close(a, b, msg) { ok(Math.abs(a - b) <= 0.01, `${msg} (got ${a}, expected ≈${b})`); }

console.log('OpnsenseApi — auth header:');
eq(OpnsenseApi.authHeader('key', 'secret'), 'Basic ' + Buffer.from('key:secret').toString('base64'), 'Basic base64(key:secret)');

console.log('OpnsenseApi — version mapping:');
eq(OpnsenseApi.mapVersion({ name: 'fw', versions: ['24.7.3', 'extra'] }).version, '24.7.3', 'first version string');
eq(OpnsenseApi.mapVersion({ versions: [] }).version, 'Unknown', 'no versions → Unknown');

console.log('OpnsenseApi — memory mapping:');
const m = OpnsenseApi.mapMemory({ memory: { total: '8589934592', used: 2147483648 } });
eq(m.total, 8589934592, 'total parsed from string'); eq(m.used, 2147483648, 'used');
close(m.percent, 25, 'percent = 100*used/total');
eq(OpnsenseApi.mapMemory({ memory: { total: '0', used: 5 } }).percent, 0, 'zero total → 0% (no divide by zero)');

console.log('OpnsenseApi — interfaces mapping:');
const ifaces = OpnsenseApi.mapInterfaces({ interfaces: {
  wan: { name: 'WAN', 'bytes received': '4000000000', 'bytes transmitted': '1000000000' },
  lan: { name: 'LAN', 'bytes received': '12000000000', 'bytes transmitted': '9000000000' },
}, time: 1 });
eq(ifaces.length, 2, 'two interfaces');
eq(ifaces[0].name, 'WAN', 'name'); eq(ifaces[0].receive, 4000000000, 'bytes received parsed'); eq(ifaces[0].transmit, 1000000000, 'bytes transmitted parsed');

console.log('OpnsenseApi — cpu mapping:');
eq(OpnsenseApi.mapCpu({ total: 23.5 }).total, 23.5, 'cpu total'); eq(OpnsenseApi.mapCpu({}).total, 0, 'missing → 0');

console.log('OpnsenseWidget — speed format:');
eq(OpnsenseWidget._fmtSpeed(1048576), '1.0 MB/s', 'bytes/s formatted');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
