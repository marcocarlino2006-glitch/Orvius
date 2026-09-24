import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatchSchedule } from "../src/lib/dispatch-schedule.ts";

const dayStart = new Date(2026, 8, 28, 0, 0, 0, 0);
const at = (h, m = 0) => new Date(2026, 8, 28, h, m);
const business = { trade: "HVAC", servicesJson: "[]" };

function job(id, overrides = {}) {
  return {
    id,
    title: id,
    status: "scheduled",
    scheduledAt: at(9),
    durationMin: 120,
    technicianId: null,
    serviceType: "AC not cooling",
    notes: null,
    urgency: null,
    address: null,
    postalCode: null,
    customerName: null,
    ...overrides,
  };
}

const crew = [
  { id: "ana", name: "Ana Cooling", phone: null, skills: ["cooling"] },
  { id: "ben", name: "Ben Heating", phone: null, skills: ["heating"] },
  { id: "gus", name: "Gus General", phone: null, skills: [] },
];

test("lanes place jobs on the time axis and name double-bookings", () => {
  const s = buildDispatchSchedule({
    business,
    crew,
    dayStart,
    jobs: [job("a", { technicianId: "ana" }), job("b", { technicianId: "ana", scheduledAt: at(10) })],
  });
  const ana = s.lanes.find((l) => l.technician.id === "ana");
  assert.equal(ana.blocks[0].startMin, 9 * 60);
  assert.equal(ana.blocks[0].endMin, 11 * 60);
  assert.equal(ana.bookedMin, 240);
  assert.equal(s.conflicts.length, 1);
  assert.match(s.conflicts[0].message, /double-booked/);
  assert.ok(ana.blocks.every((b) => b.conflict));
});

test("back-to-back jobs in different ZIPs are a travel conflict", () => {
  const s = buildDispatchSchedule({
    business,
    crew,
    dayStart,
    jobs: [
      job("a", { technicianId: "gus", postalCode: "60201" }),
      job("b", { technicianId: "gus", scheduledAt: at(11, 10), postalCode: "60614" }),
      job("c", { technicianId: "gus", scheduledAt: at(14), postalCode: "60614" }),
    ],
  });
  assert.equal(s.conflicts.length, 1);
  assert.match(s.conflicts[0].message, /10 min to get from 60201 to 60614/);
});

test("recommendations pick the skilled technician and never collide with each other", () => {
  const s = buildDispatchSchedule({
    business,
    crew,
    dayStart,
    jobs: [job("first"), job("second"), job("third"), job("heat", { serviceType: "Furnace not heating" })],
  });
  const byId = Object.fromEntries(s.unassigned.map((u) => [u.id, u]));
  assert.equal(byId.first.recommendation.technicianId, "ana");
  assert.equal(byId.second.recommendation.technicianId, "gus");
  assert.equal(byId.third.recommendation, null);
  assert.match(byId.third.blocked, /already booked/);
  assert.equal(byId.heat.recommendation.technicianId, "ben");
});

test("emergencies are decided first; jobs without a time explain why", () => {
  const s = buildDispatchSchedule({
    business,
    crew: [crew[0]],
    dayStart,
    jobs: [job("routine"), job("urgent", { urgency: "emergency" }), job("later", { scheduledAt: null })],
  });
  assert.deepEqual(
    s.unassigned.map((u) => u.id),
    ["urgent", "routine", "later"],
  );
  assert.equal(s.unassigned[0].recommendation.technicianId, "ana");
  assert.equal(s.unassigned[1].recommendation, null);
  assert.match(s.unassigned[2].blocked, /No appointment time/);
});

test("the window covers the working day and stretches for early or late jobs", () => {
  const normal = buildDispatchSchedule({ business, crew, dayStart, jobs: [job("a", { technicianId: "ana" })] });
  assert.deepEqual(normal.window, { startMin: 7 * 60, endMin: 19 * 60 });
  const late = buildDispatchSchedule({
    business,
    crew,
    dayStart,
    jobs: [job("a", { technicianId: "ana", scheduledAt: at(20), durationMin: 90 })],
  });
  assert.equal(late.window.endMin, 22 * 60);
});
