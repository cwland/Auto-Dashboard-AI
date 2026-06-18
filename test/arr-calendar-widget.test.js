'use strict';
// Tests for the Sonarr/Radarr calendar widget's ported logic (ArrCalendarApi).
// Mirrors Homarr's own integration behaviour: episode → SxxExx event, movie →
// one event per populated release type, image-priority selection, URL building,
// and date handling. No DOM or network required.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'arr-calendar-widget.js'));
const { ArrCalendarApi, ArrCalendarWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

// ── Image priority ────────────────────────────────────────────────────────────
console.log('ArrCalendarApi — image priority selection:');
eq(
  ArrCalendarApi.chooseBestImageUrl([
    { coverType: 'fanart', remoteUrl: 'F' },
    { coverType: 'poster', remoteUrl: 'P' },
    { coverType: 'banner', remoteUrl: 'B' },
  ]),
  'P', 'poster beats banner and fanart');
eq(ArrCalendarApi.chooseBestImageUrl([]), null, 'no images → null');
eq(
  ArrCalendarApi.chooseBestImageUrl([{ coverType: 'unknown', remoteUrl: 'U' }]),
  'U', 'falls back to whatever is available');

// ── Sonarr mapping ──────────────────────────────────────────────────────────────
console.log('ArrCalendarApi — Sonarr episode mapping:');
const sonarrRaw = [{
  title: 'Pilot',
  airDateUtc: '2026-06-20T01:00:00Z',
  seasonNumber: 2,
  episodeNumber: 5,
  series: {
    title: 'Severance', titleSlug: 'severance', overview: 'o', imdbId: 'tt111',
    images: [{ coverType: 'poster', remoteUrl: 'SP' }],
  },
  images: [],
}];
const sEvents = ArrCalendarApi.mapEvents(sonarrRaw, 'sonarr', {});
eq(sEvents.length, 1, 'one event per episode');
eq(sEvents[0].title, 'Pilot', 'episode title');
eq(sEvents[0].subTitle, 'Severance', 'series title as subtitle');
eq(sEvents[0].badge.text, 'S2·E5', 'SxxExx badge');
eq(sEvents[0].badge.color, 'red', 'sonarr badge is red');
eq(sEvents[0].imageUrl, 'SP', 'uses series poster');
ok(sEvents[0].startDate instanceof Date && !isNaN(sEvents[0].startDate), 'startDate parsed to Date');
eq(sEvents[0].links.length, 2, 'Sonarr + IMDb links');
eq(sEvents[0].links[1].href, 'https://www.imdb.com/title/tt111/', 'IMDb link built from imdbId');

// ── Radarr mapping (one event per release type) ───────────────────────────────
console.log('ArrCalendarApi — Radarr movie mapping:');
const radarrRaw = [{
  title: 'Dune', originalTitle: 'Dune (2021)', titleSlug: 'dune', overview: 'o', imdbId: 'tt222',
  inCinemas: '2026-06-01T00:00:00Z',
  digitalRelease: '2026-06-22T00:00:00Z',
  // physicalRelease intentionally omitted
  images: [{ coverType: 'poster', remoteUrl: 'RP' }],
}];
const rEvents = ArrCalendarApi.mapEvents(radarrRaw, 'radarr', {});
eq(rEvents.length, 2, 'one event per populated release type (cinemas + digital, physical skipped)');
eq(rEvents[0].badge.text, 'In cinemas', 'first event labelled In cinemas');
eq(rEvents[1].badge.text, 'Digital', 'second event labelled Digital');
ok(rEvents.every((e) => e.badge.color === 'yellow'), 'radarr badges are yellow');
ok(rEvents[0].startDate < rEvents[1].startDate, 'events sorted ascending by date');
eq(rEvents[0].releaseType, 'inCinemas', 'releaseType recorded');

console.log('ArrCalendarApi — Radarr release-type filter:');
const onlyDigital = ArrCalendarApi.mapEvents(radarrRaw, 'radarr', { releaseTypes: ['digitalRelease'] });
eq(onlyDigital.length, 1, 'filter to a single release type');
eq(onlyDigital[0].badge.text, 'Digital', 'kept the digital release only');

console.log('ArrCalendarApi — empty / malformed input:');
eq(ArrCalendarApi.mapEvents([], 'sonarr', {}).length, 0, 'empty array → no events');
eq(ArrCalendarApi.mapEvents(null, 'radarr', {}).length, 0, 'non-array → no events');

// ── URL building ──────────────────────────────────────────────────────────────
console.log('ArrCalendarApi — calendar URL building:');
const sUrl = ArrCalendarApi.buildCalendarUrl('http://h:8989/', {
  start: '2026-06-01T00:00:00Z', end: '2026-06-30T00:00:00Z', service: 'sonarr', showUnmonitored: true,
});
ok(sUrl.startsWith('http://h:8989/api/v3/calendar?'), 'hits /api/v3/calendar (trailing slash trimmed)');
ok(sUrl.includes('includeSeries=true'), 'sonarr requests series data');
ok(sUrl.includes('unmonitored=true'), 'passes unmonitored flag');
const rUrl = ArrCalendarApi.buildCalendarUrl('http://h:7878', {
  start: '2026-06-01T00:00:00Z', end: '2026-06-30T00:00:00Z', service: 'radarr', showUnmonitored: false,
});
ok(!rUrl.includes('includeSeries'), 'radarr does NOT request series data');
ok(rUrl.includes('unmonitored=false'), 'radarr respects unmonitored=false');

// ── Date helpers ──────────────────────────────────────────────────────────────
console.log('ArrCalendarWidget — date helpers:');
const D = ArrCalendarWidget._dateHelpers;
const ref = new Date(2026, 5, 17); // Jun 17 2026
eq(D.startOfMonth(ref).getDate(), 1, 'startOfMonth → day 1');
eq(D.endOfMonth(ref).getDate(), 30, 'endOfMonth → June has 30 days');
eq(D.addMonths(ref, 1).getMonth(), 6, 'addMonths rolls to July');
ok(D.sameDay(new Date(2026, 5, 17, 9), new Date(2026, 5, 17, 23)), 'sameDay ignores time');
ok(!D.sameDay(new Date(2026, 5, 17), new Date(2026, 5, 18)), 'sameDay distinguishes days');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
