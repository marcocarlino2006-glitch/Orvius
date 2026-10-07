/*
 * The Dispatch week is Monday to Sunday on the shop's calendar, puts each job
 * on its technician's day, and carries who is off into each day.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { weekDays, getDispatchWeek } = await import("../src/lib/field.ts");
const { zonedWallToUtc, shopDayBounds } = await import("../src/lib/availability.ts");

const prisma = new PrismaClient();
const TZ = "America/Chicago";
const at = (y, m, d, h) => zonedWallToUtc(y, m, d, h, 0, 0, TZ);

test("the week runs Monday to Sunday around any day in it", () => {
  assert.deepEqual(weekDays("2026-10-07", TZ), ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
  assert.equal(weekDays("2026-10-11", TZ)[0], "2026-10-05", "Sunday belongs to the week before it");
  assert.equal(weekDays("2026-11-02", TZ)[6], "2026-11-08", "across the daylight-saving change");
});

test("jobs land on their technician's day, unassigned work is listed, and time off shows", async () => {
  const business = await prisma.business.create({
    data: { name: "Week Air", slug: `week-${Date.now()}`, environment: "production", timezone: TZ },
  });
  try {
    const ann = await prisma.technician.create({ data: { businessId: business.id, name: "Ann" } });
    const ben = await prisma.technician.create({ data: { businessId: business.id, name: "Ben" } });
    await prisma.job.createMany({
      data: [
        { businessId: business.id, title: "No heat", status: "scheduled", scheduledAt: at(2026, 10, 6, 9), durationMin: 60, technicianId: ann.id },
        { businessId: business.id, title: "Tune-up", status: "scheduled", scheduledAt: at(2026, 10, 8, 23), durationMin: 60, technicianId: ben.id },
        { businessId: business.id, title: "Leak", status: "scheduled", scheduledAt: at(2026, 10, 9, 14), durationMin: 60 },
        { businessId: business.id, title: "Next week", status: "scheduled", scheduledAt: at(2026, 10, 12, 9), durationMin: 60, technicianId: ann.id },
      ],
    });
    const thursday = shopDayBounds("2026-10-08", TZ);
    await prisma.technicianTimeOff.create({
      data: { businessId: business.id, technicianId: ann.id, startsAt: thursday.start, endsAt: thursday.end, reason: "Training" },
    });

    const week = await getDispatchWeek(business.id, "2026-10-07");
    assert.deepEqual(week.days.map((d) => d.day)[0], "2026-10-05");
    const day = (iso) => week.days.find((d) => d.day === iso).schedule;
    const titles = (iso, techId) => day(iso).lanes.find((l) => l.technician.id === techId).blocks.map((b) => b.title);
    assert.deepEqual(titles("2026-10-06", ann.id), ["No heat"]);
    assert.deepEqual(titles("2026-10-08", ben.id), ["Tune-up"], "11 PM Chicago stays on Thursday, not Friday UTC");
    assert.deepEqual(day("2026-10-09").unassigned.map((u) => u.title), ["Leak"]);
    assert.equal(week.days.flatMap((d) => d.schedule.lanes.flatMap((l) => l.blocks)).some((b) => b.title === "Next week"), false);
    const annThursday = day("2026-10-08").lanes.find((l) => l.technician.id === ann.id);
    assert.equal(annThursday.availability, "Off · Training");
    assert.equal(annThursday.offAllDay, true);
    assert.equal(day("2026-10-07").lanes.find((l) => l.technician.id === ann.id).offAllDay, false);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});
