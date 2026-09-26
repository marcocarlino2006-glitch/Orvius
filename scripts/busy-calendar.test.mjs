import assert from "node:assert/strict";
import test from "node:test";

const { parseBusyWindows, normalizeBusyCalendarUrl, fetchBusyCalendar } = await import("../src/lib/busy-calendar.ts");
const { findAvailableSchedules } = await import("../src/lib/availability.ts");

const TZ = "America/New_York";
const cal = (...events) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((e) => ["BEGIN:VEVENT", ...e, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
const iso = (w) => [w.start.toISOString(), w.end.toISOString()];
const window = (from, days = 15) => ({ from: new Date(from), to: new Date(new Date(from).getTime() + days * 86_400_000), timezone: TZ });

test("single events: UTC, zoned, all-day; free and cancelled events don't block", () => {
  const ics = cal(
    ["UID:a", "DTSTART:20260929T140000Z", "DTEND:20260929T150000Z"],
    ["UID:b", "DTSTART;TZID=America/New_York:20260930T090000", "DTEND;TZID=America/New_York:20260930T103000"],
    ["UID:c", "DTSTART;VALUE=DATE:20261001", "DTEND;VALUE=DATE:20261002"],
    ["UID:d", "DTSTART:20261002T140000Z", "DTEND:20261002T150000Z", "TRANSP:TRANSPARENT"],
    ["UID:e", "DTSTART:20261002T160000Z", "DTEND:20261002T170000Z", "STATUS:CANCELLED"],
    ["UID:f", "DTSTART:20261003T160000Z", "DURATION:PT45M"],
  );
  const got = parseBusyWindows(ics, window("2026-09-28T00:00:00Z")).map(iso);
  assert.deepEqual(got, [
    ["2026-09-29T14:00:00.000Z", "2026-09-29T15:00:00.000Z"],
    ["2026-09-30T13:00:00.000Z", "2026-09-30T14:30:00.000Z"],
    ["2026-10-01T04:00:00.000Z", "2026-10-02T04:00:00.000Z"],
    ["2026-10-03T16:00:00.000Z", "2026-10-03T16:45:00.000Z"],
  ]);
});

test("weekly repeat keeps local time across the DST change, skips EXDATE, and uses the moved instance", () => {
  const ics = cal(
    [
      "UID:gym",
      "DTSTART;TZID=America/New_York:20260105T070000",
      "DTEND;TZID=America/New_York:20260105T080000",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,WE",
      "EXDATE;TZID=America/New_York:20261104T070000",
    ],
    [
      "UID:gym",
      "RECURRENCE-ID;TZID=America/New_York:20261102T070000",
      "DTSTART;TZID=America/New_York:20261102T120000",
      "DTEND;TZID=America/New_York:20261102T130000",
    ],
  );
  const got = parseBusyWindows(ics, window("2026-10-26T00:00:00Z", 15)).map(iso);
  assert.deepEqual(got, [
    ["2026-10-26T11:00:00.000Z", "2026-10-26T12:00:00.000Z"],
    ["2026-10-28T11:00:00.000Z", "2026-10-28T12:00:00.000Z"],
    ["2026-11-02T17:00:00.000Z", "2026-11-02T18:00:00.000Z"],
    ["2026-11-09T12:00:00.000Z", "2026-11-09T13:00:00.000Z"],
  ]);
});

test("COUNT, UNTIL, INTERVAL and monthly nth-weekday rules", () => {
  const ics = cal(
    ["UID:count", "DTSTART:20260928T150000Z", "DTEND:20260928T160000Z", "RRULE:FREQ=DAILY;COUNT=2"],
    ["UID:until", "DTSTART:20260928T180000Z", "DTEND:20260928T190000Z", "RRULE:FREQ=DAILY;UNTIL=20260929T235959Z"],
    ["UID:every2", "DTSTART;TZID=America/New_York:20260901T090000", "DTEND;TZID=America/New_York:20260901T091500", "RRULE:FREQ=WEEKLY;INTERVAL=2"],
    ["UID:second-tue", "DTSTART;TZID=America/New_York:20260908T170000", "DTEND;TZID=America/New_York:20260908T180000", "RRULE:FREQ=MONTHLY;BYDAY=2TU"],
  );
  const got = parseBusyWindows(ics, window("2026-09-28T00:00:00Z", 16)).map((w) => w.start.toISOString());
  assert.deepEqual(got, [
    "2026-09-28T15:00:00.000Z",
    "2026-09-28T18:00:00.000Z",
    "2026-09-29T13:00:00.000Z",
    "2026-09-29T15:00:00.000Z",
    "2026-09-29T18:00:00.000Z",
    "2026-10-13T13:00:00.000Z",
    "2026-10-13T21:00:00.000Z",
  ]);
});

test("folded lines, quoted params and Outlook zone names parse", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT",
    "UID:x",
    'DTSTART;TZID="Pacific Standard Time":20260929T090000',
    "DTEND;TZID=\"Pacific Standard Time\":20260929T1",
    " 00000",
    "SUMMARY:Dentist",
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  assert.deepEqual(parseBusyWindows(ics, window("2026-09-28T00:00:00Z")).map(iso), [
    ["2026-09-29T16:00:00.000Z", "2026-09-29T17:00:00.000Z"],
  ]);
});

test("only calendar providers can be fetched", () => {
  assert.equal(normalizeBusyCalendarUrl("webcal://p42-caldav.icloud.com/published/2/abc").ok, true);
  assert.equal(normalizeBusyCalendarUrl("https://calendar.google.com/calendar/ical/x%40gmail.com/private-abc/basic.ics").ok, true);
  assert.equal(normalizeBusyCalendarUrl("https://outlook.office365.com/owa/calendar/a/b/calendar.ics").ok, true);
  for (const bad of ["http://calendar.google.com/x", "https://169.254.169.254/latest", "https://calendar.google.com.evil.io/x", "not a url", "file:///etc/passwd"]) {
    assert.equal(normalizeBusyCalendarUrl(bad).ok, false, bad);
  }
});

test("fetch rejects redirects off-provider, dead addresses and non-calendars", async () => {
  const url = "https://calendar.google.com/calendar/ical/a/private-b/basic.ics";
  const stub = (body, init = {}, finalUrl = url) => async () => Object.defineProperty(new Response(body, init), "url", { value: finalUrl });
  assert.match(await fetchBusyCalendar(url, stub(cal())), /BEGIN:VCALENDAR/);
  await assert.rejects(fetchBusyCalendar(url, stub(cal(), {}, "http://10.0.0.1/")), /redirected/);
  await assert.rejects(fetchBusyCalendar(url, stub("nope", { status: 404 })), /no longer works/);
  await assert.rejects(fetchBusyCalendar(url, stub("<html></html>")), /didn't return a calendar/);
});

test("busy blocks are never offered, even with free technicians", () => {
  const hoursJson = JSON.stringify({ tuesday: { open: "08:00", close: "17:00" } });
  const now = new Date("2026-09-28T12:00:00Z");
  const base = { now, urgency: "routine", hoursJson, timezone: TZ, capacity: 3, existing: [], durationMin: 120 };
  const open = findAvailableSchedules(base, { count: 1 });
  assert.equal(open[0].toISOString(), "2026-09-29T12:00:00.000Z");
  const blocked = [{ start: new Date("2026-09-29T12:00:00Z"), end: new Date("2026-09-29T16:00:00Z") }];
  const withBusy = findAvailableSchedules({ ...base, blocked }, { count: 1 });
  assert.equal(withBusy[0].toISOString(), "2026-09-29T16:00:00.000Z");
  assert.deepEqual(findAvailableSchedules({ ...base, blocked }, { count: 1, onlyAt: new Date("2026-09-29T14:00:00Z") }), []);
});
