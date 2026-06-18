'use strict';
// Tests for the PeaNUT, Umami, Speedtest Tracker, and ntfy widgets' ported
// logic. Mirrors Homarr's integrations: NUT status parsing + UPS mapping,
// Umami bounce/duration computation, Speedtest bits→Mbps mapping, ntfy
// newline-JSON parsing. No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'peanut-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'umami-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'speedtest-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'ntfy-widget.js'));
const { PeanutApi, PeanutWidget, UmamiApi, SpeedtestApi, NtfyApi } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

// ── PeaNUT ────────────────────────────────────────────────────────────────────
console.log('PeanutApi — NUT status flag parsing:');
eq(PeanutApi.parseStatus('OL'), 'online', 'OL → online');
eq(PeanutApi.parseStatus('OL CHRG'), 'charging', 'OL CHRG → charging');
eq(PeanutApi.parseStatus('OB DISCHRG'), 'onBattery', 'OB → onBattery');
eq(PeanutApi.parseStatus('OB DISCHRG LB'), 'lowBattery', 'LB wins → lowBattery');
eq(PeanutApi.parseStatus(''), 'unknown', 'empty → unknown');

console.log('PeanutApi — device mapping:');
const dev = PeanutApi.mapDevice({ 'peanut.device_id': 'ups1', 'device.mfr': 'APC', 'device.model': 'Back-UPS', 'ups.status': 'OL', 'battery.charge': '95', 'ups.load': 20, 'ups.realpower': 88, 'input.voltage': '121.5' }, 0);
eq(dev.id, 'ups1', 'device id');
eq(dev.name, 'APC Back-UPS', 'name = mfr + model');
eq(dev.status, 'online', 'status mapped');
eq(dev.batteryCharge, 95, 'battery charge coerced to number');
eq(dev.load, 20, 'load');
eq(dev.power, 88, 'realpower → power');
eq(dev.inputVoltage, 121.5, 'input voltage parsed');
eq(PeanutApi.mapDevice({}, 2).id, 'ups-2', 'fallback id from index');
eq(PeanutApi.mapDevices([{ 'ups.status': 'OL' }, { 'ups.status': 'OB' }]).length, 2, 'mapDevices maps all');
eq(PeanutWidget._fmtRuntime(3720), '1h 2m', 'runtime format');

// ── Umami ─────────────────────────────────────────────────────────────────────
console.log('UmamiApi — bounce rate + avg duration:');
const um = UmamiApi.buildSummary({ pageviews: 1000, visitors: 500, visits: 800, bounces: 200, totaltime: 16000 }, 12, '7d');
eq(um.active, 12, 'active visitors');
eq(um.pageviews, 1000, 'pageviews');
eq(um.bounceRate, 25, 'bounce rate = bounces/visits% = 200/800');
eq(um.avgDuration, 20, 'avg duration = totaltime/visits = 16000/800');
eq(um.timeFrame, '7d', 'time frame preserved');
const umZero = UmamiApi.buildSummary({ pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 }, 0, '24h');
eq(umZero.bounceRate, 0, 'no visits → 0% bounce (no divide by zero)');
eq(umZero.avgDuration, 0, 'no visits → 0 duration');
ok(UmamiApi.computeRange('7d').startAt < UmamiApi.computeRange('7d').endAt, 'computeRange 7d is a valid window');

// ── Speedtest Tracker ───────────────────────────────────────────────────────────
console.log('SpeedtestApi — latest + stats mapping:');
eq(SpeedtestApi.bitsToMbps(942000000), 942, '942 Mbit/s → 942 Mbps');
eq(SpeedtestApi.bitsToMbps(null), null, 'null bits → null');
const lt = SpeedtestApi.mapLatest({ id: 5, ping: 12.44, download_bits: 500000000, upload_bits: 100000000, healthy: true, created_at: '2026-06-01 12:00:00' });
eq(lt.downloadMbps, 500, 'download bits → Mbps');
eq(lt.uploadMbps, 100, 'upload bits → Mbps');
eq(lt.ping, 12.4, 'ping rounded to 1 decimal');
eq(lt.healthy, true, 'healthy flag');
ok(lt.createdAt instanceof Date && !isNaN(lt.createdAt), 'created_at parsed to Date');
eq(SpeedtestApi.mapLatest(null), null, 'null result → null');
const stats = SpeedtestApi.mapStats({ ping: { avg: 13.81 }, download: { avg: 910.25 }, upload: { avg: 115.6 }, total_results: 412 });
eq(stats.download.avg, 910.3, 'stats download avg rounded');
eq(stats.total, 412, 'total results');

// ── ntfy ──────────────────────────────────────────────────────────────────────
console.log('NtfyApi — newline-JSON parsing:');
const lines = [
  JSON.stringify({ id: 'a', time: 1000, event: 'open', topic: 't' }),
  JSON.stringify({ id: 'b', time: 2000, event: 'message', topic: 't', title: 'Hi', message: 'Body 1' }),
  '',
  JSON.stringify({ id: 'c', time: 3000, event: 'message', topic: 't', message: 'Body 2' }),
  'not json',
].join('\n');
const msgs = NtfyApi.parseMessages(lines);
eq(msgs.length, 2, 'only message events kept (open/blank/garbage skipped)');
eq(msgs[0].id, 'c', 'sorted newest first');
eq(msgs[0].title, 't', 'missing title falls back to topic');
eq(msgs[1].title, 'Hi', 'title used when present');
ok(msgs[0].time instanceof Date, 'time → Date');
eq(NtfyApi.topicUrl('http://ntfy/', 'my topic'), 'http://ntfy/my%20topic/json?poll=1', 'topic URL encoded with poll=1');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
