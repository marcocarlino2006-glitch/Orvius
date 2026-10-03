#!/usr/bin/env node
/*
 * The weekly value text: measured counts and real money only, once a week,
 * Monday morning in the shop's own zone, never to an owner who opted out.
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { PrismaClient } from "@prisma/client";

const { buildWeeklyValueText, inWeeklyTextWindow, sendDueWeeklyTexts } = await import("../src/lib/weekly-report.ts");

const prisma = new PrismaClient();
const PREFIX = "weekly-text";
/* A zone no other test uses, so only these shops are ever in the window. */
const TZ = "Pacific/Chatham";
/* Monday Oct 5 2026, 9:00 AM in Chatham (UTC+13:45). */
const MONDAY_9AM = new Date("2026-10-04T19:15:00Z");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

after(async () => {
  await prisma.business.deleteMany({ where: { slug: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

const outcomes = (o = {}) => ({
  windowDays: 7,
  calls: 23,
  jobsBooked: 9,
  afterHoursBooked: 4,
  collectedCents: 3_400_00,
  openInvoiceCents: 0,
  unassignedJobs: 0,
  ...o,
});

test("the text says what the line did and what money moved, nothing estimated", () => {
  assert.equal(
    buildWeeklyValueText(outcomes(), "Summit HVAC"),
    "Orvius · Summit HVAC, last 7 days: 23 calls answered, 9 jobs booked, 4 of them after hours, $3,400 collected. Reply TODAY for today's board.",
  );
  const owed = buildWeeklyValueText(outcomes({ collectedCents: 0, afterHoursBooked: 0, openInvoiceCents: 820_00, unassignedJobs: 1 }), "X");
  assert.match(owed, /23 calls answered, 9 jobs booked\. \$820 in bills still unpaid\. 1 job still needs a tech\./);
  assert.match(buildWeeklyValueText(outcomes({ calls: 0 }), "X"), /no calls reached your line/);
  assert.doesNotMatch(buildWeeklyValueText(outcomes(), "X"), /about|estimate|never miss|guarantee/i);
});

test("the window is Monday 8–11 AM where the shop is", () => {
  assert.equal(inWeeklyTextWindow(TZ, MONDAY_9AM), true);
  assert.equal(inWeeklyTextWindow(TZ, new Date(MONDAY_9AM.getTime() + 3 * 60 * 60_000)), false, "noon is too late");
  assert.equal(inWeeklyTextWindow(TZ, new Date(MONDAY_9AM.getTime() - 2 * 60 * 60_000)), false, "7 AM is too early");
  assert.equal(inWeeklyTextWindow(TZ, new Date(MONDAY_9AM.getTime() + 24 * 60 * 60_000)), false, "Tuesday");
  assert.equal(inWeeklyTextWindow("Not/AZone", MONDAY_9AM), false);
});

test("one text per shop per week, only to owners who can get it", async () => {
  const old = new Date(MONDAY_9AM.getTime() - 30 * 24 * 60 * 60_000);
  const make = (o = {}) =>
    prisma.business.create({
      data: { name: "Weekly HVAC", slug: `${PREFIX}-${stamp()}`, environment: "production", timezone: TZ, ownerPhone: "+15555550111", createdAt: old, ...o },
    });
  const due = await make();
  const optedOut = await make({ ownerSmsOptOutAt: old });
  const brandNew = await make({ createdAt: new Date(MONDAY_9AM.getTime() - 2 * 24 * 60 * 60_000) });
  const noPhone = await make({ ownerPhone: null });

  const sent = [];
  const texts = { toOwner: async (m) => (sent.push(m), { sid: "SM_test" }) };
  const first = await sendDueWeeklyTexts({ now: MONDAY_9AM, texts });
  assert.equal(first.sent, 1);
  assert.equal(sent[0].audience, "owner");
  assert.equal(sent[0].businessId, due.id);
  assert.match(sent[0].body, /^Orvius · Weekly HVAC/);

  const again = await sendDueWeeklyTexts({ now: new Date(MONDAY_9AM.getTime() + 30 * 60_000), texts });
  assert.equal(again.sent, 0, "the next half-hour run sends nothing");
  for (const shop of [optedOut, brandNew, noPhone]) {
    assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).weeklyTextSentAt, null);
  }

  const failing = { toOwner: async () => null };
  const other = await make();
  await sendDueWeeklyTexts({ now: MONDAY_9AM, texts: failing });
  assert.equal((await prisma.business.findUnique({ where: { id: other.id } })).weeklyTextSentAt, null, "a failed send stays due");
});
