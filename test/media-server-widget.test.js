'use strict';
// Tests for the Jellyfin / Emby widget's ported logic
// (MediaServerApi.mapSessions + type map + URL building). Mirrors Homarr's
// Jellyfin/Emby media-server session mapping. No DOM or network.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'media-server-widget.js'));
const { MediaServerApi } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

console.log('MediaServerApi — type mapping:');
eq(MediaServerApi.getCurrentlyPlayingType('Movie'), 'movie', 'Movie → movie');
eq(MediaServerApi.getCurrentlyPlayingType('Episode'), 'video', 'Episode → video');
eq(MediaServerApi.getCurrentlyPlayingType('Audio'), 'audio', 'Audio → audio');
eq(MediaServerApi.getCurrentlyPlayingType('MusicVideo'), 'audio', 'MusicVideo → audio');
eq(MediaServerApi.getCurrentlyPlayingType('LiveTvChannel'), 'tv', 'LiveTvChannel → tv');
eq(MediaServerApi.getCurrentlyPlayingType('Whatever'), 'video', 'unknown → video');

console.log('MediaServerApi — mapSessions (episode, half watched, paused):');
const ep = MediaServerApi.mapSessions([{
  Id: 's1', UserName: 'cory', Client: 'Jellyfin Web', DeviceName: 'Chrome',
  PlayState: { PositionTicks: 3000000000, IsPaused: true },
  NowPlayingItem: {
    Type: 'Episode', SeriesName: 'Severance', SeasonName: 'Season 2',
    IndexNumber: 4, Name: 'Cold Harbor', RunTimeTicks: 6000000000,
  },
}])[0];
eq(ep.type, 'video', 'episode → video');
eq(ep.title, 'Severance', 'uses SeriesName as title');
eq(ep.subtitle, 'Season 2 · E4', 'subtitle = season · episode');
eq(ep.user, 'cory', 'username');
eq(ep.device, 'Jellyfin Web (Chrome)', 'device = client (device)');
eq(ep.paused, true, 'paused state preserved');
eq(ep.progress, 50, 'progress = position / runtime (%)');
eq(ep.sessionId, 's1', 'session id');

console.log('MediaServerApi — mapSessions (movie + music):');
const movie = MediaServerApi.mapSessions([{
  Id: 'm', UserName: 'sam', Client: 'Android TV',
  NowPlayingItem: { Type: 'Movie', Name: 'Dune', ProductionYear: 2021 },
}])[0];
eq(movie.type, 'movie', 'movie type');
eq(movie.title, 'Dune', 'movie title');
eq(movie.subtitle, '2021', 'movie subtitle = production year');
eq(movie.device, 'Android TV', 'device without device-name');
eq(movie.progress, null, 'no runtime → no progress');

const track = MediaServerApi.mapSessions([{
  UserName: 'x', Client: 'Finamp',
  NowPlayingItem: { Type: 'Audio', AlbumArtist: 'Daft Punk', Album: 'Discovery', Name: 'Digital Love' },
}])[0];
eq(track.type, 'audio', 'audio type');
eq(track.title, 'Daft Punk', 'album artist as title');
eq(track.subtitle, 'Discovery', 'album as subtitle');

console.log('MediaServerApi — mapSessions edge cases:');
eq(MediaServerApi.mapSessions([]).length, 0, 'empty → none');
eq(MediaServerApi.mapSessions([{ UserName: 'x' }]).length, 0, 'session without NowPlayingItem is dropped');
const anon = MediaServerApi.mapSessions([{ NowPlayingItem: { Type: 'Movie', Name: 'X' } }])[0];
eq(anon.user, 'Anonymous', 'missing user → Anonymous');

console.log('MediaServerApi — URL building:');
eq(MediaServerApi.sessionsUrl('http://h:8096/', 'a b'),
  'http://h:8096/Sessions?api_key=a%20b', 'sessions URL, key encoded, slash trimmed');
eq(MediaServerApi.infoUrl('http://h:8096', 'k'),
  'http://h:8096/System/Info?api_key=k', 'info URL');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
