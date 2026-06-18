'use strict';
// Tests for the download-client widget's ported logic (DownloadsApi). Mirrors
// Homarr's SABnzbd / qBittorrent / Transmission integrations: state mapping,
// normalized item fields, rates/paused aggregation, and format helpers.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'download-client-widget.js'));
const { DownloadsApi, DownloadClientWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

// ── SABnzbd ───────────────────────────────────────────────────────────────────
console.log('DownloadsApi.sabnzbd — state + timeleft:');
eq(DownloadsApi.sabnzbd.getQueueState('Queued'), 'queued', 'Queued → queued');
eq(DownloadsApi.sabnzbd.getQueueState('Paused'), 'paused', 'Paused → paused');
eq(DownloadsApi.sabnzbd.getQueueState('Downloading'), 'downloading', 'else → downloading');
eq(DownloadsApi.sabnzbd.getHistoryState('Completed'), 'completed', 'Completed → completed');
eq(DownloadsApi.sabnzbd.getHistoryState('Failed'), 'failed', 'Failed → failed');
eq(DownloadsApi.sabnzbd.getHistoryState('Repairing'), 'processing', 'else → processing');
eq(DownloadsApi.sabnzbd.parseTimeleft('0:04:12'), (4 * 60 + 12) * 1000, '4m12s → ms');
eq(DownloadsApi.sabnzbd.parseTimeleft('1:00:00:00'), 86400 * 1000, '1 day → ms');

console.log('DownloadsApi.sabnzbd — build:');
const sab = DownloadsApi.sabnzbd.build(
  { queue: { paused: false, kbpersec: '1024', slots: [
    { status: 'Downloading', index: 0, mb: '100', filename: 'A', cat: 'x', timeleft: '0:00:10', percentage: '50', nzo_id: 'q1' },
    { status: 'Queued', index: 1, mb: '200', filename: 'B', cat: 'x', timeleft: '0:01:00', percentage: '0', nzo_id: 'q2' },
  ] } },
  { history: { slots: [
    { category: 'tv', download_time: 10, status: 'Completed', completed: 1000, nzo_id: 'h1', postproc_time: 5, name: 'C', bytes: 1048576 },
  ] } },
  10,
);
eq(sab.status.rates.down, 1024 * 1024, 'rate = kbpersec * 1024 bytes');
eq(sab.status.types[0], 'usenet', 'type usenet');
eq(sab.items.length, 3, '2 queue + 1 history');
eq(sab.items[0].downSpeed, 1024 * 1024, 'active slot (index 0) gets the down rate');
eq(sab.items[1].downSpeed, 0, 'queued slot (index > 0) gets 0 down');
eq(sab.items[0].progress, 0.5, 'percentage → progress');
eq(sab.items[2].progress, 1, 'history item is complete');
eq(sab.items[2].state, 'completed', 'history state');

console.log('DownloadsApi.sabnzbd — limit slices combined list:');
eq(DownloadsApi.sabnzbd.build({ queue: { paused: false, kbpersec: '0', slots: [
  { status: 'Downloading', index: 0, mb: '1', filename: 'A', cat: '', timeleft: '0', percentage: '0', nzo_id: '1' },
  { status: 'Downloading', index: 1, mb: '1', filename: 'B', cat: '', timeleft: '0', percentage: '0', nzo_id: '2' },
] } }, { history: { slots: [] } }, 1).items.length, 1, 'limit 1 → one item');

// ── qBittorrent ────────────────────────────────────────────────────────────────
console.log('DownloadsApi.qbittorrent — state mapping:');
eq(DownloadsApi.qbittorrent.getState('downloading'), 'leeching', 'downloading → leeching');
eq(DownloadsApi.qbittorrent.getState('uploading'), 'seeding', 'uploading → seeding');
eq(DownloadsApi.qbittorrent.getState('pausedUP'), 'paused', 'pausedUP → paused');
eq(DownloadsApi.qbittorrent.getState('stalledDL'), 'stalled', 'stalledDL → stalled');
eq(DownloadsApi.qbittorrent.getState('error'), 'unknown', 'error → unknown');

console.log('DownloadsApi.qbittorrent — build + mapTorrent:');
const qbit = DownloadsApi.qbittorrent.build([
  { hash: 'a', priority: 1, name: 'A', size: 100, uploaded: 10, dlspeed: 500, upspeed: 50, progress: 0.5, eta: 120, added_on: 1, completion_on: 0, state: 'downloading', category: 'x' },
  { hash: 'b', priority: 2, name: 'B', size: 200, uploaded: 20, dlspeed: 0, upspeed: 80, progress: 1, eta: 8640000, added_on: 1, completion_on: 2, state: 'uploading', category: '' },
]);
eq(qbit.status.rates.down, 500, 'rates.down summed');
eq(qbit.status.rates.up, 130, 'rates.up summed');
eq(qbit.status.paused, false, 'not paused (some active)');
eq(qbit.items[0].state, 'leeching', 'item 0 leeching');
eq(qbit.items[0].downSpeed, 500, 'downSpeed shown while incomplete');
eq(qbit.items[1].downSpeed, undefined, 'complete torrent omits downSpeed');
eq(qbit.items[0].id, 'a', 'id = hash');
ok(qbit.items[1].time < 0, 'completed torrent: time is negative (since completion)');

console.log('DownloadsApi.qbittorrent — all-paused → status.paused true:');
eq(DownloadsApi.qbittorrent.build([
  { hash: 'a', priority: 1, name: 'A', size: 1, uploaded: 0, dlspeed: 0, upspeed: 0, progress: 0.2, eta: 0, added_on: 1, completion_on: 0, state: 'pausedDL', category: '' },
]).status.paused, true, 'every torrent paused → paused');

// ── Transmission ────────────────────────────────────────────────────────────────
console.log('DownloadsApi.transmission — state mapping:');
eq(DownloadsApi.transmission.getState(0), 'paused', '0 → paused');
eq(DownloadsApi.transmission.getState(4), 'leeching', '4 → leeching');
eq(DownloadsApi.transmission.getState(6), 'seeding', '6 → seeding');
eq(DownloadsApi.transmission.getState(1), 'stalled', '1 → stalled');
eq(DownloadsApi.transmission.getState(9), 'unknown', 'unknown code → unknown');

console.log('DownloadsApi.transmission — build + mapTorrent:');
const tr = DownloadsApi.transmission.build([
  { hashString: 'x', queuePosition: 0, name: 'X', totalSize: 1000, percentDone: 0.5, rateDownload: 900, rateUpload: 100, uploadedEver: 5, downloadedEver: 500, eta: 60, status: 4, addedDate: 1, doneDate: 0, labels: ['a'] },
  { hashString: 'y', queuePosition: 1, name: 'Y', totalSize: 2000, percentDone: 1, rateDownload: 0, rateUpload: 300, uploadedEver: 9, downloadedEver: 2000, eta: -1, status: 6, addedDate: 1, doneDate: 2, labels: [] },
], 10);
eq(tr.status.rates.down, 900, 'rates.down summed');
eq(tr.status.rates.up, 400, 'rates.up summed');
eq(tr.items[0].id, 'x', 'id = hashString');
eq(tr.items[0].received, 500, 'received = downloadedEver');
eq(tr.items[0].downSpeed, 900, 'downSpeed while incomplete');
eq(tr.items[1].downSpeed, undefined, 'complete torrent omits downSpeed');
eq(tr.items[0].category[0], 'a', 'labels as category');

console.log('DownloadsApi.transmission — limit slices:');
eq(DownloadsApi.transmission.build([
  { hashString: 'a', queuePosition: 0, name: 'A', totalSize: 1, percentDone: 0, rateDownload: 0, rateUpload: 0, uploadedEver: 0, downloadedEver: 0, eta: 0, status: 4, addedDate: 1, doneDate: 0, labels: [] },
  { hashString: 'b', queuePosition: 1, name: 'B', totalSize: 1, percentDone: 0, rateDownload: 0, rateUpload: 0, uploadedEver: 0, downloadedEver: 0, eta: 0, status: 4, addedDate: 1, doneDate: 0, labels: [] },
], 1).items.length, 1, 'limit 1 → one item');

// ── format helpers ──────────────────────────────────────────────────────────────
console.log('DownloadClientWidget — format helpers:');
eq(DownloadClientWidget._fmtBytes(0), '0 B', '0 bytes');
eq(DownloadClientWidget._fmtBytes(1536), '1.5 KB', '1536 → 1.5 KB');
eq(DownloadClientWidget._fmtBytes(1073741824), '1.0 GB', '1 GiB');
eq(DownloadClientWidget._fmtSpeed(1048576), '1.0 MB/s', 'speed suffixed');
eq(DownloadClientWidget._fmtEta(0), '—', 'zero/neg eta → dash');
eq(DownloadClientWidget._fmtEta(90000), '1m 30s', '90s → 1m 30s');
eq(DownloadClientWidget._fmtEta(3700 * 1000), '1h 1m', '3700s → 1h 1m');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
