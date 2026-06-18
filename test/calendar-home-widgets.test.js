'use strict';
// Tests for the iCal, Home Assistant, and Nextcloud widgets' logic: ICS
// parsing + RRULE expansion (original implementation), HA entity mapping +
// toggle-domain detection, and Nextcloud OCS notification mapping.

const path = require('path');
global.window = global;
require(path.join(__dirname, '..', 'widgets', 'ical-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'homeassistant-widget.js'));
require(path.join(__dirname, '..', 'widgets', 'nextcloud-widget.js'));
const { IcalApi, HomeAssistantApi, NextcloudApi, NextcloudWidget } = global;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`); }

// ── iCal parsing ────────────────────────────────────────────────────────────────
console.log('IcalApi.parse:');
const ICS = [
  'BEGIN:VCALENDAR', 'VERSION:2.0',
  'BEGIN:VEVENT', 'UID:a', 'DTSTART:20260115T140000', 'DTEND:20260115T150000', 'SUMMARY:Dentist', 'LOCATION:Clinic', 'DESCRIPTION:Check-up\\, cleaning', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20260120', 'SUMMARY:All day trip', 'END:VEVENT',
  'BEGIN:VEVENT', 'UID:c', 'DTSTART:20260101T093000Z', 'SUMMARY:UTC event', 'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');
const events = IcalApi.parse(ICS);
eq(events.length, 3, 'parses 3 VEVENTs');
eq(events[0].summary, 'Dentist', 'summary'); eq(events[0].location, 'Clinic', 'location');
eq(events[0].description, 'Check-up, cleaning', 'description unescaped (\\, → ,)');
eq(events[0].allDay, false, 'datetime is not all-day');
eq(events[1].allDay, true, 'VALUE=DATE is all-day');
eq(events[0].start.getFullYear(), 2026, 'start year'); eq(events[0].start.getMonth(), 0, 'start month'); eq(events[0].start.getDate(), 15, 'start day');
eq(events[2].start.getTime(), Date.UTC(2026, 0, 1, 9, 30, 0), 'Z suffix parsed as UTC');

console.log('IcalApi — line unfolding:');
const folded = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20260101T100000', 'SUMMARY:Long title that is', '  folded across lines', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
eq(IcalApi.parse(folded)[0].summary, 'Long title that is folded across lines', 'continuation lines unfolded');

console.log('IcalApi — RRULE expansion (weekly, COUNT):');
const weekly = { uid: 'w', summary: 'Standup', start: new Date(2026, 0, 5, 9, 0), end: new Date(2026, 0, 5, 9, 30), allDay: false, rrule: 'FREQ=WEEKLY;COUNT=4' };
const occ = IcalApi.expandEvent(weekly, new Date(2026, 0, 1), new Date(2026, 1, 28));
eq(occ.length, 4, 'COUNT=4 → 4 occurrences');
eq(occ[1].startDate.getDate(), 12, 'second occurrence is +7 days'); eq(occ[3].startDate.getDate(), 26, 'fourth occurrence is +21 days');

console.log('IcalApi — RRULE window filtering + UNTIL:');
const daily = { uid: 'd', summary: 'D', start: new Date(2026, 0, 1, 8, 0), allDay: false, rrule: 'FREQ=DAILY;UNTIL=20260110T000000Z' };
const dOcc = IcalApi.expandEvent(daily, new Date(2026, 0, 5), new Date(2026, 0, 31));
ok(dOcc.length > 0 && dOcc[0].startDate.getDate() >= 5, 'window start excludes earlier occurrences');
ok(dOcc.every((e) => e.startDate <= new Date(2026, 0, 10, 23, 59)), 'UNTIL caps the series');

console.log('IcalApi — eventsInWindow sorts & filters non-recurring:');
const win = IcalApi.eventsInWindow(events, new Date(2026, 0, 1), new Date(2026, 0, 31));
ok(win.length >= 3, 'all three in-window'); ok(win[0].startDate <= win[win.length - 1].startDate, 'sorted ascending');

// ── Home Assistant ────────────────────────────────────────────────────────────────
console.log('HomeAssistantApi:');
eq(HomeAssistantApi.domainOf('light.kitchen'), 'light', 'domain extraction');
ok(HomeAssistantApi.isToggleable('light.kitchen'), 'light is toggleable');
ok(HomeAssistantApi.isToggleable('switch.x'), 'switch is toggleable');
ok(!HomeAssistantApi.isToggleable('sensor.temp'), 'sensor is not toggleable');
const lit = HomeAssistantApi.mapState({ entity_id: 'light.kitchen', state: 'on', attributes: { friendly_name: 'Kitchen' } });
eq(lit.name, 'Kitchen', 'friendly_name used'); eq(lit.isOn, true, 'on → isOn'); eq(lit.toggleable, true, 'toggleable');
const sen = HomeAssistantApi.mapState({ entity_id: 'sensor.temp', state: '21.4', attributes: { unit_of_measurement: '°C' } });
eq(sen.display, '21.4 °C', 'unit appended'); eq(sen.name, 'sensor.temp', 'falls back to entity_id'); eq(sen.toggleable, false, 'sensor not toggleable');
eq(HomeAssistantApi.mapState({ entity_id: 'cover.garage', state: 'open', attributes: {} }).isOn, true, 'open → isOn');

// ── Nextcloud ──────────────────────────────────────────────────────────────────────
console.log('NextcloudApi.mapNotifications:');
const nc = NextcloudApi.mapNotifications({ ocs: { data: [
  { notification_id: 1, datetime: '2026-01-01T10:00:00+00:00', app: 'updatenotification', subject: 'Update available', message: 'v30 is out' },
  { notification_id: 2, datetime: '2026-01-02T10:00:00+00:00', app: 'files', subject: 'File shared', message: '' },
] } });
eq(nc.length, 2, 'two notifications'); eq(nc[0].id, '2', 'sorted newest first'); eq(nc[0].title, 'File shared', 'subject as title');
eq(nc[1].body, 'v30 is out', 'message as body'); eq(nc[1].app, 'updatenotification', 'app preserved');
ok(nc[0].time instanceof Date, 'datetime → Date');
eq(NextcloudApi.mapNotifications({}).length, 0, 'missing ocs.data → empty');
eq(NextcloudWidget._fmtAgo(null), '', 'null time → empty ago');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
