#!/usr/bin/env node
/*
 * Customer audit: the places an owner would have caught us out.
 *
 * Ask answers "today" with today, money with the same number Performance
 * shows, and leaves booking-rate questions to the outcomes summary. A shop
 * that says "Just me" has someone on the books. Health never says texts work
 * while they're off. Test mode never shows a plan the owner didn't pick.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { answerDirect, readAskIntent } from "../src/lib/ask-direct.ts";
import { saveSetupDay, startSetup } from "../src/lib/setup-sandbox.ts";
import { getShopHealth } from "../src/lib/shop-health.ts";
import { planDetail, planLabel } from "../src/components/settings-center/settings-model.ts";

const prisma = new PrismaClient();
const read = (path) => readFileSync(path, "utf8");
const email = () => `cust-audit-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@orvius.invalid`;
const TZ = "America/Chicago";
const NOW = new Date("2026-10-12T17:00:00Z");

test.after(async () => {
  await prisma.business.deleteMany({ where: { ownerEmail: { startsWith: "cust-audit-" } } });
  await prisma.$disconnect();
});

test("Ask reads the kind of question and the window on the shop's clock", () => {
  const kind = (q) => readAskIntent(q, TZ, NOW)?.kind ?? null;
  assert.equal(kind("Who called today?"), "calls");
  assert.equal(kind("Any emergencies last night?"), "emergencies");
  assert.equal(kind("What's on the schedule tomorrow?"), "jobs");
  assert.equal(kind("How many jobs today?"), "jobs");
  assert.equal(kind("How much did we collect this week?"), "money");
  assert.equal(kind("Who owes us money?"), "money");
  assert.equal(kind("What's our booking rate this week?"), null, "rates need the outcomes denominator");
  assert.equal(kind("How many jobs got booked this week?"), null);
  assert.equal(kind("What does Helen Brooks usually call about?"), null, "open questions fall through to search");

  const today = readAskIntent("Who called today?", TZ, NOW).window;
  assert.equal(today.label, "today");
  assert.equal(today.start.toISOString(), "2026-10-12T05:00:00.000Z", "midnight in Chicago, not UTC");
  const tomorrow = readAskIntent("Jobs tomorrow?", TZ, NOW).window;
  assert.equal(tomorrow.start.toISOString(), "2026-10-13T05:00:00.000Z");
  assert.equal(readAskIntent("Jobs this week?", TZ, NOW).window.label, "in the next 7 days");
  assert.equal(readAskIntent("Calls this week?", TZ, NOW).window.label, "in the last 7 days");
  assert.deepEqual(readAskIntent("Any AC calls today?", TZ, NOW).topic?.includes("ac"), true);
});

test("Ask answers from the records: today's calls, unpaid work first when asked who owes", async () => {
  const shop = await prisma.business.create({
    data: { name: "Audit Air", slug: `audit-air-${Date.now()}`, ownerEmail: email(), timezone: TZ },
  });
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Dana Cole", phone: "+13125550190", phoneNormalized: "+13125550190" } });
  await prisma.call.create({ data: { businessId: shop.id, direction: "inbound", callerPhone: "+13125550190", createdAt: new Date(NOW.getTime() - 3600_000), customerId: customer.id } });
  await prisma.call.create({ data: { businessId: shop.id, direction: "inbound", callerPhone: "+13125550191", createdAt: new Date(NOW.getTime() - 2 * 86_400_000) } });
  const job = await prisma.job.create({ data: { businessId: shop.id, customerId: customer.id, title: "AC tune-up", scheduledAt: new Date(NOW.getTime() - 86_400_000), status: "completed" } });
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 30000, status: "open" } });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 10000, createdAt: new Date(NOW.getTime() - 3600_000) } });

  const calls = await answerDirect("Who called today?", shop.id, NOW);
  assert.match(calls.answer, /^1 call today: Dana Cole/);

  const owed = await answerDirect("Who owes us money?", shop.id, NOW);
  assert.match(owed.answer, /^1 unpaid invoice still out, \$200/, "the balance is net of what was already paid");
  assert.match(owed.answer, /Collected \$100 in the last 7 days from 1 payment\./, "recorded payments count, as on Performance");
  assert.equal(owed.hits[0].href, `/dashboard/jobs/${job.id}`);
});

test("'Just me' puts the owner on the books; switching to a crew takes them off", async () => {
  const owner = email();
  const shop = await startSetup(owner, { name: "Solo Plumbing", trade: "Plumbing", timezone: TZ });
  await saveSetupDay(owner, { hours: "weekdays", team: "solo", ownerName: "Pat Solo" });
  let techs = await prisma.technician.findMany({ where: { businessId: shop.id } });
  assert.equal(techs.length, 1);
  assert.equal(techs[0].name, "Pat Solo");
  assert.equal(techs[0].phone, null, "no assignment texts to the owner, who already gets alerts");

  await saveSetupDay(owner, { hours: "weekdays", team: "solo", ownerName: "Pat Solo" });
  assert.equal(await prisma.technician.count({ where: { businessId: shop.id } }), 1, "saving twice doesn't add a second owner");

  await saveSetupDay(owner, { hours: "weekdays", team: "crew", crew: [{ name: "Ana", phone: "3125550172" }] });
  techs = await prisma.technician.findMany({ where: { businessId: shop.id } });
  assert.deepEqual(techs.map((t) => t.name), ["Ana"]);
});

test("health never calls texts working while they're off", async () => {
  const before = process.env.ENABLE_OWNER_SMS;
  process.env.ENABLE_OWNER_SMS = "false";
  try {
    const shop = await prisma.business.create({
      data: { name: "Quiet Air", slug: `quiet-air-${Date.now()}`, ownerEmail: email(), ownerPhone: "+13125550193", timezone: TZ },
    });
    const health = await getShopHealth(shop.id);
    assert.equal(health.checks.find((c) => c.id === "sms").ok, false);
    assert.notEqual(health.status, "healthy");
  } finally {
    if (before === undefined) delete process.env.ENABLE_OWNER_SMS;
    else process.env.ENABLE_OWNER_SMS = before;
  }
});

test("test mode shows no plan and no charge, with the way to go live", () => {
  const account = { business: { environment: "test", billingStatus: "pilot" }, billing: { status: "pilot", entitled: true } };
  assert.equal(planLabel(account), "No plan yet");
  assert.match(planDetail(account), /Nothing is charged until you go live/);
  const billing = read("src/components/billing-content.tsx");
  assert.match(billing, /dashboard\/onboarding\?step=live/);
  assert.match(billing, /loading \|\| testMode \|\|/, "no pay buttons in test mode");
});

test("signup says what happens before paying; sample activity is labelled as samples", () => {
  assert.match(read("src/components/signin-panel.tsx"), /hear a test call before you pay/);
  assert.match(read("src/components/signin-board.tsx"), /not real customers/);
});
