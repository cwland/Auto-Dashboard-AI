'use strict';
// Tests for the Audiobookshelf, Navidrome, Prowlarr, and Tracearr widgets'
// ported logic. Mirrors Homarr's integrations: ABS aggregation, Navidrome
// Subsonic counting/now-playing, Prowlarr indexer health, Tracearr stream
// mapping. No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'audiobookshelf-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'navidrome-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'prowlarr-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'tracearr-widget.js'));
const { AudiobookshelfApi, AudiobookshelfWidget, NavidromeApi, ProwlarrApi, TracearrApi } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

// ── Audiobookshelf ────────────────────────────────────────────────────────────
console.log('AudiobookshelfApi — dashboard aggregation:');
const abs = AudiobookshelfApi.buildDashboard(
  [{ id: 'a', mediaType: 'book' }, { id: 'b', mediaType: 'podcast' }, { id: 'c', mediaType: 'book' }],
  [{ mediaType: 'book', totalItems: 500 }, { mediaType: 'podcast', totalItems: 40 }, { mediaType: 'book', totalItems: 25 }],
  360000, 3);
eq(abs.libraryCount, 3, 'library count');
eq(abs.totalAudiobooks, 525, 'audiobooks summed across book libraries');
eq(abs.totalPodcasts, 40, 'podcasts summed across podcast libraries');
eq(abs.totalListeningTimeSeconds, 360000, 'listening time');
eq(abs.activeSessions, 3, 'active sessions');
eq(AudiobookshelfWidget._fmtListening(36000), '10h', '36000s → 10h');
eq(AudiobookshelfWidget._fmtListening(90000), '1d', '90000s (25h) → 1d');
eq(AudiobookshelfWidget._fmtListening(1800), '30m', '1800s → 30m');

// ── Navidrome (Subsonic) ─────────────────────────────────────────────────────
console.log('NavidromeApi — asArray handles single-or-array:');
eq(NavidromeApi._asArray(undefined).length, 0, 'undefined → []');
eq(NavidromeApi._asArray({ x: 1 }).length, 1, 'single object → [obj]');
eq(NavidromeApi._asArray([1, 2, 3]).length, 3, 'array passthrough');

console.log('NavidromeApi — artist counting:');
eq(NavidromeApi.countArtists({ artists: { index: [{ artist: [{}, {}] }, { artist: { } }] } }), 3, 'sums artists across indexes (single + array)');
eq(NavidromeApi.countArtists({}), 0, 'no artists → 0');

console.log('NavidromeApi — album/song counting:');
const cs = NavidromeApi.countAlbumsSongs([[{ songCount: 10 }, { songCount: 5 }], [{ songCount: 3 }]]);
eq(cs.albumCount, 3, 'albums across pages');
eq(cs.songCount, 18, 'songs summed');

console.log('NavidromeApi — now playing mapping:');
const np = NavidromeApi.mapNowPlaying({ nowPlaying: { entry: { title: 'Song', artist: 'A', album: 'Al', username: 'u', playerName: 'p' } } });
eq(np.length, 1, 'single entry coerced to array');
eq(np[0].title, 'Song', 'title'); eq(np[0].artist, 'A', 'artist'); eq(np[0].username, 'u', 'username');

// ── Prowlarr ──────────────────────────────────────────────────────────────────
console.log('ProwlarrApi — indexer health:');
const ix = ProwlarrApi.buildIndexers(
  [{ id: 1, name: 'A', indexerUrls: ['https://a.test'], enable: true },
   { id: 2, name: 'B', indexerUrls: ['https://b.test'], enable: true },
   { id: 3, name: 'C', indexerUrls: [], enable: false }],
  [{ indexerId: 2 }]);
eq(ix.length, 3, 'all indexers mapped');
eq(ix[0].status, true, 'indexer not in error set → status true');
eq(ix[1].status, false, 'indexer in error set → status false');
eq(ix[0].url, 'https://a.test', 'first indexer url used');
ok(ProwlarrApi.isHealthy(ix[0]), 'enabled + ok → healthy');
ok(!ProwlarrApi.isHealthy(ix[1]), 'enabled but errored → not healthy');
ok(!ProwlarrApi.isHealthy(ix[2]), 'disabled → not healthy');

// ── Tracearr ──────────────────────────────────────────────────────────────────
console.log('TracearrApi — stream mapping:');
const ep = TracearrApi.mapStream({ id: 's1', serverName: 'Plex', username: 'cory', mediaTitle: 'Cold Harbor', mediaType: 'episode', showTitle: 'Severance', seasonNumber: 2, episodeNumber: 4, state: 'playing', videoDecision: 'transcode' });
eq(ep.title, 'Severance', 'episode uses show title');
eq(ep.subtitle, 'S2·E4 · Cold Harbor', 'episode subtitle has SxxExx + title');
eq(ep.isTranscode, true, 'videoDecision transcode → isTranscode');
const movie = TracearrApi.mapStream({ id: 's2', serverName: 'Plex', username: 'x', mediaTitle: 'Dune', mediaType: 'movie', year: 2024, state: 'paused', isTranscode: false });
eq(movie.title, 'Dune', 'movie title'); eq(movie.subtitle, '2024', 'movie subtitle = year'); eq(movie.isTranscode, false, 'direct play');

console.log('TracearrApi — dashboard build:');
const dash = TracearrApi.buildDashboard(
  { activeStreams: 3, totalUsers: 14, totalSessions: 5210, recentViolations: 2 },
  { summary: { total: 3, transcodes: 1, directStreams: 1, directPlays: 1 }, data: [{ id: 'a', mediaTitle: 'X', mediaType: 'movie', state: 'playing' }] },
  null, null);
eq(dash.activeStreams, 3, 'active streams from stats');
eq(dash.totalUsers, 14, 'users');
eq(dash.recentViolations, 2, 'violations');
eq(dash.transcodes, 1, 'transcodes from summary');
eq(dash.directStreams, 2, 'directStreams + directPlays combined');
eq(dash.streams.length, 1, 'streams mapped');
console.log('TracearrApi — falls back to summary when stats missing:');
eq(TracearrApi.buildDashboard({}, { summary: { total: 5 }, data: [] }, { meta: { total: 7 } }, null).activeStreams, 5, 'activeStreams from summary.total');
eq(TracearrApi.buildDashboard({}, { summary: {}, data: [] }, { meta: { total: 7 } }, null).recentViolations, 7, 'violations from meta.total');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
