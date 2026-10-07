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

test("Dispatch Hours is a third view on the same board", () => {
  const page = readFileSync(new URL("../src/app/dashboard/dispatch/page.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/dispatch/route.ts", import.meta.url), "utf8");
  assert.match(page, /"hours"/);
  assert.match(page, /"Hours"/);
  assert.match(route, /get\("view"\) === "hours"/);
});
