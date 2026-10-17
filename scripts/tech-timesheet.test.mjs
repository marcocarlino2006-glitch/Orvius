import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const { visitMinutes, buildTimesheet, formatHours, weekBounds } = await import("../src/lib/tech-timesheet.ts");

test("hours come from on-site to done, then the booked length", () => {
  const start = new Date("2026-10-07T14:00:00Z");
  const end = new Date("2026-10-07T16:30:00Z");
  assert.equal(visitMinutes({ id: "1", title: "A", technicianId: "t", technicianName: "Ana", dispatchedAt: null, onSiteAt: start, completedAt: end, durationMin: 60, status: "completed" }), 150);
  assert.equal(visitMinutes({ id: "2", title: "B", technicianId: "t", technicianName: "Ana", dispatchedAt: null, onSiteAt: null, completedAt: end, durationMin: 90, status: "completed" }), 90);
  assert.equal(visitMinutes({ id: "3", title: "C", technicianId: "t", technicianName: "Ana", dispatchedAt: null, onSiteAt: null, completedAt: null, durationMin: 90, status: "scheduled" }), 0);
});

test("the week sheet groups minutes by technician", () => {
  const start = new Date("2026-10-07T14:00:00Z");
  const lanes = buildTimesheet([
    { id: "1", title: "Leak", technicianId: "ana", technicianName: "Ana", dispatchedAt: null, onSiteAt: start, completedAt: new Date("2026-10-07T15:00:00Z"), durationMin: 60, status: "completed" },
    { id: "2", title: "Tune", technicianId: "ben", technicianName: "Ben", dispatchedAt: null, onSiteAt: start, completedAt: new Date("2026-10-07T17:00:00Z"), durationMin: 60, status: "completed" },
    { id: "3", title: "Open", technicianId: "ana", technicianName: "Ana", dispatchedAt: null, onSiteAt: null, completedAt: null, durationMin: 60, status: "scheduled" },
  ]);
  assert.equal(lanes[0].name, "Ben");
  assert.equal(lanes[0].minutes, 180);
  assert.equal(lanes[1].name, "Ana");
  assert.equal(lanes[1].minutes, 60);
  assert.equal(formatHours(150), "2h 30m");
  const { start: mon, end } = weekBounds("2026-10-07");
  assert.equal(mon.toISOString().slice(0, 10), "2026-10-05");
  assert.equal(end.toISOString().slice(0, 10), "2026-10-12");
});

test("a technician's week runs Monday to Monday in the shop's timezone, across clock changes and the Sunday-night edge", () => {
  const chicago = weekBounds("2026-10-07", "America/Chicago");
  assert.equal(chicago.start.toISOString(), "2026-10-05T05:00:00.000Z", "Monday midnight in Chicago, not UTC");
  assert.equal(chicago.end.toISOString(), "2026-10-12T05:00:00.000Z");
  const fallBack = weekBounds("2026-11-04", "America/Chicago");
  assert.equal(fallBack.start.toISOString(), "2026-11-02T06:00:00.000Z", "after the clocks go back, midnight is 06:00Z");
  const across = weekBounds("2026-10-28", "America/Chicago");
  assert.equal((across.end.getTime() - across.start.getTime()) / 3_600_000, 169, "the week holding the fall-back hour is 169 hours");
  // 9pm Sunday in Los Angeles is already Monday in UTC; with no day given it is still the shop's Sunday week.
  const lateSunday = weekBounds(null, "America/Los_Angeles", new Date("2026-10-12T04:00:00Z"));
  assert.equal(lateSunday.start.toISOString(), "2026-10-05T07:00:00.000Z");
});

test("the hours view is served by the dispatch API while Dispatch itself lives on Schedule", () => {
  const page = readFileSync(new URL("../src/app/dashboard/dispatch/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/dispatch/route.ts", import.meta.url), "utf8");
  assert.match(page, /redirect\("\/dashboard\/schedule"\)/);
  assert.match(route, /get\("view"\) === "hours"/);
});
