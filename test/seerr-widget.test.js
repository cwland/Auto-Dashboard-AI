'use strict';
// Tests for the Seerr (Overseerr/Jellyseerr) widget's ported logic (SeerrApi).
// Mirrors Homarr's Overseerr integration: request-status mapping, availability
// mapping (incl. in-progress downloads), request normalization + merge,
// poster/avatar URL building, and endpoint shapes. No DOM or network required.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'seerr-widget.js'));
const { SeerrApi } = global;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

// ── Request status mapping ────────────────────────────────────────────────────
console.log('SeerrApi — request status mapping:');
eq(SeerrApi.mapRequestStatus(1), 'pending', '1 → pending');
eq(SeerrApi.mapRequestStatus(2), 'approved', '2 → approved');
eq(SeerrApi.mapRequestStatus(3), 'declined', '3 → declined');
eq(SeerrApi.mapRequestStatus(4), 'failed', '4 → failed');
eq(SeerrApi.mapRequestStatus(5), 'completed', '5 → completed');
eq(SeerrApi.mapRequestStatus(99), 'failed', 'unknown → failed');

// ── Availability mapping (status + in-progress flag) ──────────────────────────
console.log('SeerrApi — availability mapping:');
eq(SeerrApi.mapAvailability(5, false), 'available', 'Available, not downloading → available');
eq(SeerrApi.mapAvailability(5, true), 'processing', 'Available but downloading → processing');
eq(SeerrApi.mapAvailability(4, false), 'partiallyAvailable', 'Partial → partiallyAvailable');
eq(SeerrApi.mapAvailability(3, false), 'requested', 'Processing → requested');
eq(SeerrApi.mapAvailability(3, true), 'processing', 'Processing + downloading → processing');
eq(SeerrApi.mapAvailability(2, false), 'pending', 'Pending → pending');
eq(SeerrApi.mapAvailability(6, false), 'deleted', 'blacklisted/deleted → deleted');
eq(SeerrApi.mapAvailability(1, false), 'unknown', 'Unknown → unknown');

// ── Request normalization ─────────────────────────────────────────────────────
console.log('SeerrApi — request normalization:');
const raw = {
  id: 7, type: 'tv', status: 1,
  createdAt: '2026-06-10T00:00:00Z',
  media: { status: 5, tmdbId: 1399, downloadStatus: [] },
  requestedBy: { id: 3, displayName: 'cory', avatar: '/avatarproxy/abc' },
};
const mapped = SeerrApi.mapRequest(raw, { name: 'Game of Thrones', posterPath: '/got.jpg' }, 'http://seerr:5055');
eq(mapped.title, 'Game of Thrones', 'title from fetched info');
eq(mapped.type, 'tv', 'type preserved');
eq(mapped.status, 'pending', 'status mapped');
eq(mapped.statusColor, 'blue', 'pending status colour is blue');
eq(mapped.availability, 'available', 'availability mapped');
eq(mapped.availabilityColor, 'green', 'available colour is green');
eq(mapped.posterUrl, 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/got.jpg', 'poster URL built from TMDB path');
eq(mapped.href, 'http://seerr:5055/tv/1399', 'deep link built from tmdbId');
eq(mapped.requestedBy.name, 'cory', 'requester name');
eq(mapped.requestedBy.avatarUrl, 'http://seerr:5055/avatarproxy/abc', 'relative avatar resolved against base');

console.log('SeerrApi — in-progress download flips availability to processing:');
const dl = SeerrApi.mapRequest(
  { id: 8, type: 'movie', status: 2, media: { status: 5, tmdbId: 1, downloadStatus: [{}] } },
  { name: 'X', posterPath: null }, 'http://h');
eq(dl.availability, 'processing', 'available + active download → processing');
eq(dl.posterUrl, null, 'no poster path → null posterUrl');

console.log('SeerrApi — absolute avatar URLs pass through:');
const gravatar = SeerrApi.constructAvatarUrl('http://h', 'https://gravatar.com/x.png');
eq(gravatar, 'https://gravatar.com/x.png', 'absolute avatar kept as-is');

// ── Merge logic ────────────────────────────────────────────────────────────────
console.log('SeerrApi — pending/all merge:');
const pending = [{ id: 1, status: 1 }, { id: 2, status: 1 }];
const all = [{ id: 2, status: 1 }, { id: 3, status: 2 }, { id: 4, status: 5 }];
const merged = SeerrApi.mergeRequests(pending, all);
eq(merged.length, 4, 'pending first, then non-pending from all (dropped duplicate pending #2)');
eq(merged[0].id, 1, 'pending items come first');
ok(merged.filter((r) => r.id === 2).length === 1, 'duplicate pending appears only once');
eq(SeerrApi.mergeRequests([], all).length, 3, 'no pending → all results');
eq(SeerrApi.mergeRequests(pending, []).length, 2, 'no general results → pending only');

// ── Poster URL helper ───────────────────────────────────────────────────────────
console.log('SeerrApi — poster URL helper:');
eq(SeerrApi.buildPosterUrl(null), null, 'null path → null');
eq(SeerrApi.buildPosterUrl('/a.jpg'), 'https://image.tmdb.org/t/p/w600_and_h900_bestv2/a.jpg', 'builds TMDB URL');

// ── Base normalization ───────────────────────────────────────────────────────────
console.log('SeerrApi — base URL normalization:');
eq(SeerrApi.normalizeBase('http://h:5055/'), 'http://h:5055', 'trailing slash trimmed');
eq(SeerrApi.constructAvatarUrl('http://h', 'avatarproxy/x'), 'http://h/avatarproxy/x', 'relative without leading slash gets one');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
