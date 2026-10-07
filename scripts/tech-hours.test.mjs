/*
 * Technician hours and time off: nobody is booked, offered to a caller, or
 * recommended on Dispatch while they are off or outside their own hours, and
 * a job already on someone who is off is called out.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { slotHasRoom, techUnavailable, parseTechHours } = await import("../src/lib/tech-hours.ts");
const { findOpenSlots } = await import("../src/lib/job.ts");
const { rankTechnicians } = await import("../src/lib/technician-match.ts");
const { buildDispatchSchedule } = await import("../src/lib/dispatch-schedule.ts");
const { shopDayBounds, zonedWallToUtc } = await import("../src/lib/availability.ts");

const prisma = new PrismaClient();
const TZ = "America/Chicago";
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const WEEK = JSON.stringify(
  Object.fromEntries(
    ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "08:00", close: "18:00" }]),
  ),
);
const afternoons = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "13:00", close: "18:00" }]),
);
const at = (y, m, d, h, min = 0) => zonedWallToUtc(y, m, d, h, min, 0, TZ);
const localHour = (date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(date)) % 24;
const localDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

test("room counts only the technicians who are working, and their own jobs", () => {
  const start = at(2026, 10, 12, 9);
  const vacation = { start: at(2026, 10, 12, 0), end: at(2026, 10, 13, 0) };
  const pool = [{ id: "ray" }, { id: "ben", timeOff: [vacation] }];
  assert.equal(techUnavailable(pool[1], start, 120, TZ), "time_off");
  assert.equal(slotHasRoom({ pool, booked: [], start, durationMin: 120, timezone: TZ }), true);
  assert.equal(
    slotHasRoom({ pool, booked: [{ scheduledAt: start, durationMin: 120, technicianId: "ray" }], start, durationMin: 120, timezone: TZ }),
    false,
    "Ray is busy and Ben is off",
  );
  assert.equal(
    slotHasRoom({ pool, booked: [{ scheduledAt: start, durationMin: 120, technicianId: "ben" }], start, durationMin: 120, timezone: TZ }),
    true,
    "a stale job on Ben does not use up Ray",
  );
  assert.equal(slotHasRoom({ pool: [{ id: "ben", timeOff: [vacation] }], booked: [], start, durationMin: 120, timezone: TZ }), false);
  assert.equal(slotHasRoom({ pool: [], booked: [], start, durationMin: 120, timezone: TZ }), true, "owner working alone");

  const late = { id: "kim", hoursJson: JSON.stringify(afternoons) };
  assert.equal(techUnavailable(late, start, 120, TZ), "off_shift");
  assert.equal(techUnavailable(late, at(2026, 10, 12, 13), 120, TZ), null);
  assert.equal(techUnavailable(late, at(2026, 10, 12, 17), 120, TZ), "off_shift", "the whole job has to fit the shift");
});

test("hours are validated day by day", () => {
  assert.equal(parseTechHours({ monday: { open: "09:00", close: "08:00" } }), null);
  assert.equal(parseTechHours({ monday: { open: "9am", close: "17:00" } }), null);
  const ok = parseTechHours({ monday: { open: "07:00", close: "15:30" } });
  assert.deepEqual(ok.monday, { open: "07:00", close: "15:30" });
  assert.equal(ok.tuesday.closed, true, "a day left out is a day off");
});

test("the slot search skips a day the only technician is off, and their off-shift hours", async () => {
  const business = await prisma.business.create({
    data: { name: "Shift Air", slug: `shift-${stamp()}`, environment: "production", timezone: TZ, hoursJson: WEEK },
  });
  try {
    const tech = await prisma.technician.create({ data: { businessId: business.id, name: "Ray" } });
    const params = { businessId: business.id, urgency: "routine", durationMin: 120, skill: "general", hoursJson: WEEK, timezone: TZ };
    const [first] = await findOpenSlots(params, { count: 1 });
    assert.ok(first, "open before any time off");

    const day = shopDayBounds(localDay(first), TZ);
    await prisma.technicianTimeOff.create({
      data: { businessId: business.id, technicianId: tech.id, startsAt: day.start, endsAt: day.end, reason: "Vacation" },
    });
    const slots = await findOpenSlots(params, { count: 40 });
    assert.ok(slots.length > 0);
    assert.ok(slots.every((s) => s >= day.end), "nothing offered on Ray's day off");
    assert.deepEqual(await findOpenSlots(params, { count: 1, onlyAt: first }), [], "a held time on the day off is no longer open");

    await prisma.technicianTimeOff.deleteMany({ where: { technicianId: tech.id } });
    await prisma.technician.update({ where: { id: tech.id }, data: { hoursJson: JSON.stringify(afternoons) } });
    const afternoon = await findOpenSlots(params, { count: 20 });
    assert.ok(afternoon.length > 0);
    assert.ok(afternoon.every((s) => localHour(s) >= 13 && localHour(s) <= 16), "only inside Ray's 1-6 shift");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the technician picker passes over someone who is off and says why when nobody is left", () => {
  const scheduledAt = at(2026, 10, 12, 9);
  const vacation = [{ start: at(2026, 10, 12, 0), end: at(2026, 10, 13, 0) }];
  const ranking = rankTechnicians({
    candidates: [
      { id: "a", name: "Ann", skills: [], jobs: [], timeOff: vacation },
      { id: "b", name: "Ben", skills: [], jobs: [] },
    ],
    scheduledAt,
    durationMin: 120,
    skill: null,
    timezone: TZ,
  });
  assert.equal(ranking.pick.name, "Ben");
  assert.deepEqual(ranking.considered.find((c) => c.id === "a").fit, "off");

  const none = rankTechnicians({
    candidates: [{ id: "a", name: "Ann", skills: [], jobs: [], timeOff: vacation }],
    scheduledAt,
    durationMin: 120,
    skill: null,
    timezone: TZ,
  });
  assert.equal(none.pick, null);
  assert.equal(none.blocked, "Every qualified technician is off at that time.");
});

test("Dispatch shows who is off and flags a job already booked on them", () => {
  const dayStart = at(2026, 10, 12, 0);
  const schedule = buildDispatchSchedule({
    business: { trade: "HVAC" },
    timezone: TZ,
    dayStart,
    crew: [
      { id: "a", name: "Ann", phone: null, skills: [], timeOff: [{ start: dayStart, end: at(2026, 10, 13, 0), reason: "Vacation" }] },
      { id: "b", name: "Ben", phone: null, skills: [], hoursJson: JSON.stringify(afternoons) },
      { id: "c", name: "Cy", phone: null, skills: [] },
    ],
    jobs: [
      { id: "j1", title: "No heat", status: "scheduled", scheduledAt: at(2026, 10, 12, 9), durationMin: 60, technicianId: "a", serviceType: "No heat", notes: null, urgency: null, address: null, postalCode: null, customerName: null },
      { id: "j2", title: "Tune-up", status: "scheduled", scheduledAt: at(2026, 10, 12, 9), durationMin: 60, technicianId: null, serviceType: "Tune-up", notes: null, urgency: null, address: null, postalCode: null, customerName: null },
    ],
  });
  const lane = (id) => schedule.lanes.find((l) => l.technician.id === id);
  assert.equal(lane("a").availability, "Off · Vacation");
  assert.equal(lane("a").offAllDay, true);
  assert.equal(lane("b").availability, "Works 1:00 PM–6:00 PM");
  assert.equal(lane("c").availability, null);
  assert.match(schedule.conflicts[0].message, /^Ann is off that day: No heat at 9:00 AM needs someone else\.$/);
  assert.equal(schedule.unassigned[0].recommendation.name, "Cy", "not Ann (off) or Ben (mornings off)");
});
