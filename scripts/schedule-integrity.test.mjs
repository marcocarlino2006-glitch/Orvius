#!/usr/bin/env node
/*
 * One schedule decision for every owner channel, and owner texts that only
 * act when they are unambiguous:
 *  - an assigned technician without the job's skill is a clash, as is a time
 *    the shop's field software already has the team booked for;
 *  - a bare DONE with a different job in progress than the latest alert asks
 *    which one and changes nothing;
 *  - a technician's day load is counted on the shop's calendar date, across
 *    the UTC boundary and a DST change.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) delete process.env[key];
const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

const { ownerScheduleClash } = await import("../src/lib/job.ts");
const { handleOwnerText } = await import("../src/lib/owner-text-commands.ts");
const { rankTechnicians, shopDate } = await import("../src/lib/technician-match.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
test.after(async () => {
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

async function makeShop(data = {}) {
  const shop = await prisma.business.create({
    data: {
      name: "Integrity HVAC",
      slug: `integrity-${uid()}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      ownerPhone: `+1312555${String(Math.floor(Math.random() * 9000) + 1000)}`,
      operatingPolicy: { create: { travelMode: "duration_only" } },
      ...data,
    },
  });
  made.push(shop.id);
  return shop;
}

function nextWeekdayAt(hourUtc) {
  const d = new Date(Date.now() + 2 * 86_400_000);
  while ([0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

test("an assigned technician without the job's skill is a clash the owner sees", async () => {
  const shop = await makeShop();
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Pat Pipes", skillsJson: JSON.stringify(["plumbing_drain"]) } });
  const at = nextWeekdayAt(16);
  const base = { businessId: shop.id, at, durationMin: 60, timezone: shop.timezone, technicianId: tech.id };
  assert.equal(await ownerScheduleClash({ ...base, skill: "hvac_install" }), "Pat Pipes isn't set up for this kind of job.");
  assert.equal(await ownerScheduleClash({ ...base, skill: "plumbing_drain" }), null);
  assert.equal(await ownerScheduleClash({ ...base, skill: "general" }), null);
});

test("an assigned technician who looks free still clashes when the field software has the team booked", async () => {
  const at = nextWeekdayAt(16);
  const shop = await makeShop({
    fsmScheduleSource: "jobber",
    fsmScheduleSyncedAt: new Date(),
    fsmScheduleJson: JSON.stringify([{ s: new Date(at.getTime() - 30 * 60_000).toISOString(), e: new Date(at.getTime() + 90 * 60_000).toISOString() }]),
  });
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Only Tech", skillsJson: "[]" } });
  const clash = await ownerScheduleClash({ businessId: shop.id, at, durationMin: 60, skill: "general", timezone: shop.timezone, technicianId: tech.id });
  assert.equal(clash, "Your field software already has the team booked then.");
  const later = new Date(at.getTime() + 4 * 3_600_000);
  assert.equal(await ownerScheduleClash({ businessId: shop.id, at: later, durationMin: 60, skill: "general", timezone: shop.timezone, technicianId: tech.id }), null);
});

test("a bare DONE with the latest alert on one job and a tech on another asks which, and changes nothing", async () => {
  const shop = await makeShop();
  const ref = { id: shop.id, name: shop.name, timezone: shop.timezone, ownerPhone: shop.ownerPhone };
  const alertLead = await prisma.lead.create({ data: { businessId: shop.id, name: "Ana Ruiz", phone: "+13125550101" } });
  const scheduled = await prisma.job.create({
    data: { businessId: shop.id, leadId: alertLead.id, title: "Tune-up", status: "scheduled", scheduledAt: new Date(Date.now() + 3_600_000), durationMin: 60 },
  });
  const workingLead = await prisma.lead.create({ data: { businessId: shop.id, name: "Ben Lee", phone: "+13125550102" } });
  const working = await prisma.job.create({
    data: { businessId: shop.id, leadId: workingLead.id, title: "No cool", status: "on_site", onSiteAt: new Date(), durationMin: 60 },
  });
  await prisma.ownerNotification.create({
    data: { businessId: shop.id, leadId: alertLead.id, channel: "sms", status: "sent", message: "New lead", dedupeKey: `alert-${uid()}` },
  });

  const reply = await handleOwnerText({ shop: ref, body: "DONE 450 FIXED", now: new Date() });
  assert.match(reply, /^Which job\? /);
  assert.match(reply, /Ana Ruiz \(scheduled\)/);
  assert.match(reply, /Ben Lee \(on site now\)/);
  assert.match(reply, /Nothing was changed/);
  for (const id of [scheduled.id, working.id]) {
    const row = await prisma.job.findUnique({ where: { id } });
    assert.notEqual(row.status, "completed");
    assert.equal(await prisma.invoice.count({ where: { jobId: id } }), 0, "no bill");
  }

  // With only the in-progress job, DONE has one plain answer again.
  await prisma.job.update({ where: { id: scheduled.id }, data: { status: "cancelled" } });
  await handleOwnerText({ shop: ref, body: "DONE NO CHARGE DIAGNOSED", now: new Date() });
  assert.equal((await prisma.job.findUnique({ where: { id: working.id } })).status, "completed");
});

test("two techs on site and no alert: a bare DONE asks which", async () => {
  const shop = await makeShop();
  const ref = { id: shop.id, name: shop.name, timezone: shop.timezone, ownerPhone: shop.ownerPhone };
  const ids = [];
  for (const name of ["Cara One", "Dev Two"]) {
    const lead = await prisma.lead.create({ data: { businessId: shop.id, name, phone: `+1312555${Math.floor(1000 + Math.random() * 8999)}` } });
    ids.push((await prisma.job.create({ data: { businessId: shop.id, leadId: lead.id, title: "Visit", status: "on_site", onSiteAt: new Date(), durationMin: 60 } })).id);
  }
  assert.match(await handleOwnerText({ shop: ref, body: "DONE 200 FIXED", now: new Date() }), /^Which job\? .*Nothing was changed/);
  for (const id of ids) assert.equal((await prisma.job.findUnique({ where: { id } })).status, "on_site");
});

test("day load counts the shop's calendar date, across the UTC boundary and a DST change", () => {
  const tz = "America/Chicago";
  // 9:30pm local on Mon Mar 9 2026 (the day after DST starts) is already Tuesday in UTC.
  const evening = new Date("2026-03-10T02:30:00Z");
  assert.equal(shopDate(evening, tz), "2026-03-09");
  const mondayMorning = new Date("2026-03-09T15:00:00Z");
  const tuesdayMorning = new Date("2026-03-10T14:00:00Z");
  const candidates = [
    { id: "a", name: "Alex", skills: [], jobs: [{ id: "j1", scheduledAt: mondayMorning, durationMin: 60 }] },
    { id: "b", name: "Blair", skills: [], jobs: [{ id: "j2", scheduledAt: tuesdayMorning, durationMin: 60 }] },
  ];
  const ranked = rankTechnicians({ candidates, scheduledAt: evening, durationMin: 60, skill: null, timezone: tz });
  assert.equal(ranked.pick.technicianId, "b", "Blair has nothing on Monday local; Alex already has a Monday job");
  assert.match(ranked.pick.reason, /no other jobs that day/);

  // The night DST starts: 11:30pm Sun Mar 8 local is Mon 04:30 UTC.
  const dstNight = new Date("2026-03-09T04:30:00Z");
  assert.equal(shopDate(dstNight, tz), "2026-03-08");
  const sundayNoon = new Date("2026-03-08T18:00:00Z");
  const onDst = rankTechnicians({
    candidates: [
      { id: "a", name: "Alex", skills: [], jobs: [{ id: "j3", scheduledAt: sundayNoon, durationMin: 60 }] },
      { id: "b", name: "Blair", skills: [], jobs: [{ id: "j4", scheduledAt: mondayMorning, durationMin: 60 }] },
    ],
    scheduledAt: dstNight,
    durationMin: 60,
    skill: null,
    timezone: tz,
  });
  assert.equal(onDst.pick.technicianId, "b");
});
