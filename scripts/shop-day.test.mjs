#!/usr/bin/env node
/*
 * One shop's day, flown end to end on the real code before any real shop
 * depends on it. Calls become jobs, then the day goes wrong the way days do:
 * three callers want the same time, a confirmation text bounces, a
 * technician can't take a job, another never answers, a caller's address
 * didn't come through, and the shop's calendar stops syncing.
 *
 * The standard is not that nothing fails. It is that no failure becomes a
 * false confirmation or lost work, and every one is in front of the owner.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { buildCommandBoard } from "../src/lib/command-board.ts";
import { applyCustomerConfirmReceipt, confirmJobByCustomerToken, sendCustomerConfirmSms } from "../src/lib/customer-confirm.ts";
import { createJobFromLead, findOpenSlots, SlotTakenError } from "../src/lib/job.ts";
import { techForToken, techUpdateJob } from "../src/lib/tech-app.ts";
import { listWork } from "../src/lib/work.ts";

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const HOUR = 60 * 60_000;
const OPEN = Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "00:00", close: "23:59" }]));
let shop;
const techs = {};
const jobs = {};
const leads = {};

test.after(async () => {
  if (shop) await prisma.business.delete({ where: { id: shop.id } }).catch(() => undefined);
  await prisma.$disconnect();
});

let phoneSeq = 0;
async function call(name, over = {}) {
  const phone = `+1312555${String(1000 + (phoneSeq++ % 9000)).padStart(4, "0")}`;
  const lead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      name,
      phone,
      serviceType: "AC not cooling",
      urgency: "routine",
      address: "77 Main St, Evanston IL 60202",
      status: "new",
      source: "call",
      ...over,
    },
  });
  leads[name] = lead;
  return lead;
}

const slot = (h) => {
  const d = new Date(Date.now() + 3 * 24 * HOUR);
  d.setUTCHours(h, 0, 0, 0);
  return d;
};

test("morning: the shop opens with two technicians and a quiet board", async () => {
  shop = await prisma.business.create({
    data: {
      name: "Sim Day Heating",
      slug: `sim-day-${stamp()}`,
      trade: "HVAC",
      timezone: "America/Chicago",
      hoursJson: JSON.stringify(OPEN),
      servicesJson: "[]",
      environment: "demo",
      ownerEmail: `owner-${stamp()}@sim.test`,
      ownerPhone: "+13125550100",
    },
  });
  for (const name of ["Ana Ruiz", "Ben Ito"]) {
    techs[name] = await prisma.technician.create({ data: { businessId: shop.id, name, phone: name === "Ana Ruiz" ? "+13125550111" : "+13125550122", appToken: `sim-${stamp()}-abcdefghijklmnop`, isActive: true } });
  }
  const board = await buildCommandBoard(shop.id);
  assert.equal(board.lanes.exceptions.length, 0);
});

test("three callers want the same time: two technicians take two, the third is never double-booked", async () => {
  const at = slot(16);
  const outcomes = await Promise.allSettled(
    ["Dana Cole", "Eli Park", "Fay Moss"].map(async (name) => {
      const lead = await call(name);
      return createJobFromLead({ leadId: lead.id, scheduledAt: at, enforceCapacity: true });
    }),
  );
  const booked = outcomes.filter((o) => o.status === "fulfilled").map((o) => o.value.job ?? o.value);
  const refused = outcomes.filter((o) => o.status === "rejected");
  assert.equal(booked.length, 2, "two technicians, two jobs at that time");
  assert.equal(refused.length, 1);
  assert.ok(refused[0].reason instanceof SlotTakenError, "the third is refused, not squeezed in");

  const rows = await prisma.job.findMany({ where: { businessId: shop.id, scheduledAt: at } });
  const crew = rows.map((r) => r.technicianId).filter(Boolean);
  assert.equal(new Set(crew).size, crew.length, "no technician is in two places");
  for (const r of rows) {
    const lead = await prisma.lead.findUnique({ where: { id: r.leadId }, select: { name: true } });
    jobs[lead.name] = r;
  }
  const loser = ["Dana Cole", "Eli Park", "Fay Moss"].find((n) => !jobs[n]);
  const stillOpen = await prisma.lead.findUnique({ where: { id: leads[loser].id }, include: { job: true } });
  assert.equal(stillOpen.job, null);
  assert.notEqual(stillOpen.status, "lost", "the caller who lost the race is still waiting on a time, not dropped");
  jobs.loser = loser;
});

test("confirmations: one customer says yes, one text bounces, and only the yes reads as confirmed", async () => {
  const [yes, bounce] = ["Dana Cole", "Eli Park", "Fay Moss"].filter((n) => jobs[n]);
  for (const name of [yes, bounce]) {
    const sent = await sendCustomerConfirmSms(jobs[name].id);
    assert.equal(sent.sent, true, `${name}'s confirm text went out`);
  }
  const yesRow = await prisma.job.findUnique({ where: { id: jobs[yes].id } });
  await confirmJobByCustomerToken(yesRow.customerConfirmToken);

  const bounceRow = await prisma.job.findUnique({ where: { id: jobs[bounce].id } });
  const receipt = await applyCustomerConfirmReceipt({ messageSid: bounceRow.customerConfirmSid, messageStatus: "undelivered", errorCode: "30006" });
  assert.equal(receipt.matched, true);

  const after = await prisma.job.findUnique({ where: { id: jobs[bounce].id } });
  assert.ok(after.customerConfirmFailedAt);
  assert.equal(after.customerConfirmedAt, null, "a bounced text is never a confirmation");
  jobs.yes = yes;
  jobs.bounce = bounce;
});

test("the technician on the confirmed job can't take it; the one on the bounced job never answers", async () => {
  const declined = await prisma.job.findUnique({ where: { id: jobs[jobs.yes].id }, include: { technician: true } });
  const session = await techForToken(declined.technician.appToken);
  await techUpdateJob(session, declined.id, { decline: true, reason: "Truck in the shop" });
  jobs.declinedBy = declined.technician.name;

  await prisma.job.update({
    where: { id: jobs[jobs.bounce].id },
    data: { scheduledAt: new Date(Date.now() + 3 * HOUR), techAssignedAt: new Date(Date.now() - 3 * HOUR), techNotifiedAt: new Date(Date.now() - 3 * HOUR), techAcceptedAt: null },
  });
});

test("a caller's address didn't come through, and the shop's calendar stopped syncing", async () => {
  await call("Gus Hale", { address: null, serviceType: "No heat" });
  await prisma.business.update({
    where: { id: shop.id },
    data: { busyCalendarUrl: "https://calendar.example.test/busy.ics", busyCalendarSyncedAt: new Date(Date.now() - 3 * HOUR), busyCalendarError: "fetch failed" },
  });
  const offered = await findOpenSlots(
    { businessId: shop.id, urgency: "routine", durationMin: 90, skill: "hvac", hoursJson: shop.hoursJson, timezone: shop.timezone },
    { count: 3 },
  );
  assert.deepEqual(offered, [], "a calendar Orvius can't read offers no times instead of stale ones");
});

test("end of day: nothing is lost, nothing is falsely confirmed, and every failure is in front of the owner", async () => {
  const board = await buildCommandBoard(shop.id);
  const work = await listWork(shop.id);
  const itemFor = (name) => {
    const job = jobs[name];
    return work.items.find((i) => (job ? i.key === `job:${job.id}` : i.key === `request:${leads[name].id}`));
  };

  for (const name of Object.keys(leads)) {
    assert.ok(itemFor(name), `${name}'s call is on Work`);
  }

  for (const item of board.lanes.confirmed) {
    const row = await prisma.job.findUnique({ where: { id: item.jobId } });
    assert.ok(row.customerConfirmedAt || row.status === "confirmed", `${item.title} is only in Confirmed if someone confirmed it`);
  }

  const declined = itemFor(jobs.yes);
  assert.equal(declined.needsYou, true);
  assert.ok(declined.problems.some((p) => p.kind === "tech_declined"), "the decline is on the job");
  assert.match(declined.nextAction, new RegExp(`${jobs.declinedBy} can't take it`));
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, dedupeKey: { startsWith: `tech_declined:${jobs[jobs.yes].id}` } } });
  assert.ok(alert, "and the owner was texted about it");

  const bounced = itemFor(jobs.bounce);
  assert.equal(bounced.needsYou, true);
  const kinds = bounced.problems.map((p) => p.kind);
  assert.ok(kinds.includes("failed_message"), "the bounced text is on the job");
  assert.ok(kinds.includes("tech_unanswered"), "and so is the technician who hasn't answered");

  const raceLoser = itemFor(jobs.loser);
  assert.equal(raceLoser.needsYou, true, "the caller who lost the race waits on the owner for a time");

  const noAddress = itemFor("Gus Hale");
  assert.equal(noAddress.needsYou, true);
  assert.ok(board.lanes.requests.some((r) => r.leadId === leads["Gus Hale"].id && /no address yet/.test(r.detail)));

  const report = {
    calls: Object.keys(leads).length,
    booked: Object.values(jobs).filter((j) => j && typeof j === "object").length,
    needsOwner: work.needsYou,
    exceptions: board.lanes.exceptions.map((e) => e.exception),
  };
  assert.ok(report.needsOwner >= 4, `owner sees at least the four problems (saw ${report.needsOwner})`);
  console.log("# shop day:", JSON.stringify(report));
});

test("stress: eight callers at once for one time with three technicians never double-books anyone", async () => {
  const crew = [];
  for (const name of ["Cal", "Dee", "Eve"]) crew.push(await prisma.technician.create({ data: { businessId: shop.id, name: `${name} Stress`, isActive: true } }));
  await prisma.business.update({ where: { id: shop.id }, data: { busyCalendarUrl: null, busyCalendarSyncedAt: null } });
  for (let round = 0; round < 5; round++) {
    const at = slot(2 + round);
    await Promise.allSettled(
      Array.from({ length: 8 }, async (_, i) => {
        const lead = await call(`Stress ${round}-${i}`);
        return createJobFromLead({ leadId: lead.id, scheduledAt: at });
      }),
    );
    const rows = await prisma.job.findMany({ where: { businessId: shop.id, scheduledAt: at, technicianId: { not: null } }, select: { technicianId: true } });
    const ids = rows.map((r) => r.technicianId);
    assert.equal(new Set(ids).size, ids.length, `round ${round}: one technician was put on ${ids.length - new Set(ids).size + 1} jobs at the same time`);
  }
});
