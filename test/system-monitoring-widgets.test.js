'use strict';
// Tests for the system-monitoring widgets' ported mapping logic: the five
// SystemHealthApi adapters (Glances, Dashdot, Unraid, OpenMediaVault, TrueNAS),
// plus Proxmox, PBS, and Beszel. No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'system-health-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'proxmox-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'pbs-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'beszel-widget.js'));
const { SystemHealthApi, SystemHealthWidget, ProxmoxApi, PbsApi, BeszelApi, BeszelWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }
function close(a, b, msg) { ok(Math.abs(a - b) <= 0.5, `${msg} (got ${a}, expected ≈${b})`); }
const GB = 1024 ** 3;

// ── Glances ───────────────────────────────────────────────────────────────────
console.log('SystemHealthApi.glances:');
eq(SystemHealthApi.glances.parseUptime('12 days, 4:13:09'), 12 * 86400 + 4 * 3600 + 13 * 60 + 9, 'parse "12 days, ..." uptime');
eq(SystemHealthApi.glances.parseUptime('9:51:24'), 9 * 3600 + 51 * 60 + 24, 'parse "H:M:S" uptime');
const g = SystemHealthApi.glances.mapAll({ cpu: { total: 23.4 }, mem: { total: 32 * GB, used: 8 * GB }, network: [{ bytes_recv_rate_per_sec: 1000, bytes_sent_rate_per_sec: 250 }], fs: [{ device_name: '/dev/sda1', used: 1, free: 2, percent: 33 }], uptime: '1 day, 0:00:00', quicklook: { cpu_name: 'Ryzen' }, gpu: [] }, '4.2.0');
eq(g.cpuUtilization, 23.4, 'cpu total'); eq(g.memUsedInBytes, 8 * GB, 'mem used'); eq(g.memAvailableInBytes, 24 * GB, 'mem available');
eq(g.network.down, 1000, 'network down summed'); eq(g.uptime, 86400, 'uptime parsed'); eq(g.fileSystem[0].percentage, 33, 'fs percentage'); eq(g.version, '4.2.0', 'version');

// ── Dashdot ─────────────────────────────────────────────────────────────────────
console.log('SystemHealthApi.dashdot:');
const dd = SystemHealthApi.dashdot.mapData({ maxAvailableMemoryBytes: 16 * GB, storage: [{ size: 1000 }], cpuBrand: 'Intel', cpuModel: 'i5', operatingSystemVersion: 'Debian', uptime: 1000, gpuNames: [] }, { sumLoad: 40, averageTemperature: 50 }, 4 * GB, [220], { up: 1, down: 2 }, []);
eq(dd.cpuUtilization, 40, 'cpu load'); eq(dd.cpuTemp, 50, 'cpu temp'); eq(dd.memUsedInBytes, 4 * GB, 'mem used'); eq(dd.memAvailableInBytes, 12 * GB, 'mem available');
eq(dd.cpuModelName, 'i5 (Intel)', 'cpu model'); eq(dd.fileSystem[0].percentage, 22, 'storage percentage');

// ── Unraid ────────────────────────────────────────────────────────────────────
console.log('SystemHealthApi.unraid:');
const u = SystemHealthApi.unraid.mapSystemInfo({ metrics: { cpu: { cpus: [{ percentTotal: 20 }, { percentTotal: 40 }] }, memory: { percentTotal: 50 } }, array: { disks: [{ name: 'disk1', size: 1000, fsUsed: 250, status: 'DISK_OK', temp: 34 }, { name: 'disk2', size: 1000, fsUsed: 900, status: 'DISK_DSBL', temp: 39 }] }, info: { os: { release: '7.0.0', uptime: new Date(Date.now() - 3600 * 1000).toISOString() }, cpu: { brand: 'Xeon', cores: 4 }, memory: { layout: [{ size: 8 * GB }, { size: 8 * GB }] } } });
close(u.cpuUtilization, 15, 'cpu avg = (20+40)/4 cores'); eq(u.memUsedInBytes, 8 * GB, 'mem used = 50% of 16GB');
eq(u.smart[0].healthy, true, 'DISK_OK → healthy'); eq(u.smart[1].healthy, false, 'DISK_DSBL → unhealthy');
eq(u.fileSystem[1].percentage, 90, 'disk2 90% used'); close(u.uptime, 3600, 'uptime ~1h');

// ── OpenMediaVault ──────────────────────────────────────────────────────────────
console.log('SystemHealthApi.openmediavault:');
const o = SystemHealthApi.openmediavault.mapResponses({ response: { version: '7.4', cpuModelName: 'N100', cpuUtilization: 12.5, memUsed: 2 * GB, memAvailable: 8 * GB, uptime: 1000, loadAverage: { '1min': 0.4, '5min': 0.6, '15min': 0.5 }, rebootRequired: true, availablePkgUpdates: 5 } }, { response: [{ devicename: '/dev/sda1', used: '120 GiB', available: 380, percentage: 24 }] }, { response: [{ devicename: '/dev/sda', temperature: 36, overallstatus: 'GOOD' }, { devicename: '/dev/sdb', temperature: 41, overallstatus: 'BAD' }] }, { response: { cputemp: 44 } });
eq(o.version, '7.4', 'version'); eq(o.rebootRequired, true, 'reboot required'); eq(o.availablePkgUpdates, 5, 'pkg updates'); eq(o.cpuTemp, 44, 'cpu temp');
eq(o.smart[0].healthy, true, 'GOOD → healthy'); eq(o.smart[1].healthy, false, 'BAD → unhealthy'); eq(o.loadAverage['5min'], 0.6, 'load average');

// ── TrueNAS ─────────────────────────────────────────────────────────────────────
console.log('SystemHealthApi.truenas:');
// First element of each row is a (large) unix timestamp, treated as 0 by the avg.
const t = SystemHealthApi.truenas.mapResults({ physmem: 64 * GB, version: 'SCALE-24.10', model: 'EPYC', uptime_seconds: 1000 }, [{ identifier: 'cpu', data: [[1700000000, 10, 20, 30]] }, { identifier: 'memory', data: [[0, 40 * GB]] }, { identifier: 'cputemp', data: [[0, 45, 50]] }], [{ name: 'tank', allocated: 6, size: 10, healthy: true, status: 'ONLINE' }], [{ data: [[0, 1000, 250]] }]);
close(t.cpuUtilization, 15, 'cpu avg = (0+10+20+30)/4, timestamp zeroed'); eq(t.cpuTemp, 50, 'cpu temp = max'); eq(t.memUsedInBytes, 40 * GB, 'mem used'); eq(t.memAvailableInBytes, 64 * GB, 'physmem');
eq(t.fileSystem[0].percentage, 60, 'pool 60% used'); eq(t.smart[0].healthy, true, 'pool healthy'); eq(t.network.down, 1000 * 100, 'network down (index 1) ×100'); eq(t.network.up, 250 * 100, 'network up (index 2) ×100');

console.log('SystemHealthWidget — helpers:');
eq(SystemHealthWidget._fmtUptime(90000), '1d 1h', 'uptime format');

// ── Proxmox ─────────────────────────────────────────────────────────────────────
console.log('ProxmoxApi.mapResources:');
const px = ProxmoxApi.mapResources([
  { type: 'node', id: 'node/pve1', node: 'pve1', status: 'online', cpu: 0.18, maxcpu: 16, mem: 18 * GB, maxmem: 64 * GB },
  { type: 'qemu', id: 'qemu/100', vmid: 100, name: 'web', status: 'running' },
  { type: 'qemu', id: 'qemu/101', vmid: 101, name: 'db', status: 'stopped' },
  { type: 'lxc', id: 'lxc/200', vmid: 200, name: 'pihole', status: 'running' },
  { type: 'storage', id: 'storage/local', storage: 'local', status: 'available', disk: 80, maxdisk: 100, shared: 0 },
]);
eq(px.nodes.length, 1, 'one node'); eq(px.vms.length, 2, 'two vms'); eq(px.lxcs.length, 1, 'one lxc'); eq(px.storages.length, 1, 'one storage');
eq(px.nodes[0].name, 'pve1', 'node name from .node'); eq(px.nodes[0].isRunning, true, 'node online → running');
eq(px.vms[0].isRunning, true, 'running vm'); eq(px.vms[1].isRunning, false, 'stopped vm');
eq(px.storages[0].isShared, false, 'shared=0 → not shared'); eq(px.storages[0].used, 80, 'storage used');
eq(ProxmoxApi.authHeader({ username: 'root', realm: 'pam', tokenId: 'h', apiKey: 'sec' }).Authorization, 'PVEAPIToken=root@pam!h=sec', 'PVE token header uses "="');

// ── PBS ──────────────────────────────────────────────────────────────────────────
console.log('PbsApi:');
const pn = PbsApi.mapNode({ cpu: 0.25, memory: { total: 16 * GB, used: 4 * GB }, uptime: 1000 });
eq(pn.cpuUtilization, 25, 'cpu 0.25 → 25%'); eq(pn.memUsed, 4 * GB, 'mem used');
const pds = PbsApi.mapDatastores([{ store: 'main', used: 3 * GB, total: 8 * GB, avail: 5 * GB }]);
eq(pds[0].name, 'main', 'datastore name'); close(pds[0].percentage, 37.5, 'datastore % used');
eq(PbsApi.authHeader({ username: 'root', realm: 'pbs', tokenId: 'd', apiKey: 'sec' }).Authorization, 'PBSAPIToken=root@pbs!d:sec', 'PBS token header uses ":"');

// ── Beszel ───────────────────────────────────────────────────────────────────────
console.log('BeszelApi.mapSystems:');
const bz = BeszelApi.mapSystems([
  { id: '1', name: 'web', host: '10.0.0.5', status: 'up', info: { cpu: 14, mp: 38, dp: 52, u: 540000, m: 'Xeon', c: 8, v: '0.9.1' } },
  { id: '2', name: '', host: 'h2', status: 'down', info: { h: 'fallback-host', cpu: 0, mp: 0, dp: 0, u: 0 } },
]);
eq(bz[0].name, 'web', 'system name'); eq(bz[0].cpu, 14, 'cpu %'); eq(bz[0].memPct, 38, 'mem %'); eq(bz[0].diskPct, 52, 'disk %'); eq(bz[0].uptime, 540000, 'uptime');
eq(bz[1].name, 'fallback-host', 'name falls back to info.h'); eq(bz[1].status, 'down', 'status');
eq(BeszelWidget._fmtUptime(540000), '6d 6h', 'uptime format');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
