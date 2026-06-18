'use strict';
// Tests for the Plex widget's ported logic (PlexApi.mapSessions + type map).
// Mirrors Homarr's Plex integration session mapping. No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'plex-widget.js'));
const { PlexApi } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

console.log('PlexApi — currently-playing type mapping:');
eq(PlexApi.getCurrentlyPlayingType('movie'), 'movie', 'movie → movie');
eq(PlexApi.getCurrentlyPlayingType('episode'), 'video', 'episode → video');
eq(PlexApi.getCurrentlyPlayingType('track'), 'audio', 'track → audio');
eq(PlexApi.getCurrentlyPlayingType('clip'), 'video', 'unknown → video');

console.log('PlexApi — mapSessions (episode):');
const ep = PlexApi.mapSessions([{
  type: 'episode', grandparentTitle: 'Severance', parentTitle: 'Season 2', title: 'Cold Harbor', index: '4',
  user: { id: '1', title: 'cory', thumb: 'https://plex.tv/u.png' }, player: { product: 'Plex Web', title: 'Chrome' }, session: { id: 's1' },
}])[0];
eq(ep.type, 'video', 'episode type → video');
eq(ep.title, 'Severance', 'uses grandparentTitle as title');
eq(ep.subtitle, 'Season 2 · E4', 'subtitle = season · episode');
eq(ep.user, 'cory', 'username');
eq(ep.device, 'Plex Web (Chrome)', 'device = product (title)');
eq(ep.userThumb, 'https://plex.tv/u.png', 'user thumb preserved');
eq(ep.sessionId, 's1', 'session id');

console.log('PlexApi — mapSessions (movie + track + live):');
const movie = PlexApi.mapSessions([{ type: 'movie', title: 'Dune', user: { title: 'sam' }, player: { product: 'TV' }, session: { id: 'm' } }])[0];
eq(movie.type, 'movie', 'movie type');
eq(movie.subtitle, null, 'movie has no subtitle');
eq(movie.device, 'TV', 'device without player title');

const track = PlexApi.mapSessions([{ type: 'track', grandparentTitle: 'Daft Punk', parentTitle: 'Discovery', title: 'Digital Love', user: { title: 'x' }, player: { product: 'Plexamp' } }])[0];
eq(track.type, 'audio', 'track type → audio');
eq(track.title, 'Daft Punk', 'artist as title');
eq(track.subtitle, 'Discovery', 'album as subtitle');

const live = PlexApi.mapSessions([{ type: 'episode', live: '1', title: 'News', user: { title: 'x' }, player: { product: 'TV' } }])[0];
eq(live.type, 'tv', 'live=1 → tv');

console.log('PlexApi — mapSessions edge cases:');
eq(PlexApi.mapSessions([]).length, 0, 'empty → none');
eq(PlexApi.mapSessions([{ type: 'movie', title: 'NoPlayer', user: { title: 'x' } }]).length, 0, 'session without a player is dropped');
const anon = PlexApi.mapSessions([{ type: 'movie', title: 'X', player: { product: 'TV' } }])[0];
eq(anon.user, 'Anonymous', 'missing user → Anonymous');

console.log('PlexApi — URL building:');
eq(PlexApi.sessionsUrl('http://h:32400/', 'tok en'),
  'http://h:32400/status/sessions?X-Plex-Token=tok%20en', 'token query-encoded, trailing slash trimmed');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
