/*
 * Regression tests for the tier 0 backlog fixes (docs/BACKLOG.md B3, B5–B10):
 * paid provisioning that can't double-buy, held times that can't double-book,
 * text alerts that can't be lost, refunds that reach the books, and the two
 * gates that were open.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { maybeAutoBookLead } from "../src/lib/auto-job.ts";
import { handleInCallToolCalls } from "../src/lib/in-call-tools.ts";
import { applyChargeRefund } from "../src/lib/payment-refund.ts";
import {
  claimProvisionAttempt,
  finishProvisionAttempt,
  ProvisionBusyError,
  recordProvisionStep,
  reopenProvisionAttempt,
} from "../src/lib/provision-attempt.ts";
import { alertStrandedTextLeads } from "../src/lib/stranded-lead-alerts.ts";

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

async function makeShop(extra = {}) {
  return prisma.business.create({
    data: {
      name: "Tier Zero Air",
      slug: `tier0-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      servicesJson: "[]",
      ...extra,
    },
  });
}

// B7
test("the mastery endpoint refuses anyone who is not the founder before doing any work", () => {
  const route = read("src/app/api/admin/mastery/route.ts");
  const gate = route.indexOf("if (!isFounderEmail(email))");
  assert.ok(gate > 0, "founder gate present");
  assert.ok(gate < route.indexOf("getBusinessForOwnerWithAutoLine(email)"), "gate runs before the shop lookup that can buy a line");
});

// B8
test("the daily cron reports and logs failed steps instead of swallowing them, with no shop cap", () => {
  const route = read("src/app/api/cron/notifications/route.ts");
  assert.doesNotMatch(route, /\.catch\(\(\) => null\)/);
  assert.doesNotMatch(route, /take: 200/);
  assert.match(route, /ok: failed\.length === 0/);
  assert.match(route, /logError\("cron\.step_failed"/);
});

// B6
test("the in-app test call cannot verify the line and invents no address", () => {
  const route = read("src/app/api/onboarding/test-call/route.ts");
  assert.doesNotMatch(route, /1842 Oak/);
  assert.doesNotMatch(route, /lineVerifiedAt:\s*new Date\(\)/);
  const verify = read("src/app/api/onboarding/verify/route.ts");
  assert.match(verify, /NOT: \{ vapiCallId: \{ startsWith: OWNER_TEST_CALL_PREFIX \} \}/);
});

// B3
test("only one provisioning run can hold the lease; the rest are told to wait", async () => {
  const key = `test:${stamp()}`;
  try {
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => claimProvisionAttempt(key)));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    for (const r of results.filter((r) => r.status === "rejected")) assert.ok(r.reason instanceof ProvisionBusyError);
  } finally {
    await prisma.provisionAttempt.deleteMany({ where: { key } });
  }
});

test("a retry after a failed run gets back the number that run could not release", async () => {
  const key = `test:${stamp()}`;
  try {
    const first = await claimProvisionAttempt(key);
    await recordProvisionStep(key, { phoneNumber: "+15555550123", vapiAssistantId: "asst_1" });
    await finishProvisionAttempt(key, {
      status: "failed",
      error: "release failed",
      keep: { phoneNumber: "+15555550123", vapiAssistantId: null },
    });
    const retry = await claimProvisionAttempt(key);
    assert.equal(retry.tag, first.tag, "same tag, so a lost purchase can still be found in Twilio");
    assert.equal(retry.phoneNumber, "+15555550123", "reuse, don't buy again");
    assert.equal(retry.vapiAssistantId, null, "the assistant was deleted, so it is not reused");
    assert.equal(retry.attempts, 2);
  } finally {
    await prisma.provisionAttempt.deleteMany({ where: { key } });
  }
});

test("a crashed run's lease lapses so the shop is not stuck, and success is final until reopened", async () => {
  const key = `test:${stamp()}`;
  try {
    await claimProvisionAttempt(key, new Date(Date.now() - 10 * 60 * 1000));
    const resumed = await claimProvisionAttempt(key);
    assert.equal(resumed.attempts, 2);
    await finishProvisionAttempt(key, { status: "succeeded", businessId: "b1" });
    assert.equal((await claimProvisionAttempt(key)).status, "succeeded");
    await reopenProvisionAttempt(key);
    assert.equal((await claimProvisionAttempt(key)).status, "running");
  } finally {
    await prisma.provisionAttempt.deleteMany({ where: { key } });
  }
});

test("both provisioning paths go through the lease and record the purchase before anything else", () => {
  const source = read("src/lib/provision-business.ts");
  assert.match(source, /claimProvisionAttempt\(key\)/);
  assert.match(source, /onboardingAttemptKey\(email\)/);
  assert.match(source, /shopLineAttemptKey\(business\.id\)/);
  const buy = source.indexOf("await purchaseLocalNumber(");
  const record = source.indexOf("await recordProvisionStep(params.attempt.key, { phoneNumber: phone })");
  const configure = source.indexOf("await configureSmsWebhook(phone)");
  assert.ok(buy > 0 && buy < record && record < configure);
  assert.match(source, /findLineByFriendlyName\(friendlyName\)/);
});

// B5
async function holdOnCall(shop, lead) {
  const call = await prisma.call.create({
    data: { businessId: shop.id, vapiCallId: `held_${stamp()}`, status: "in-progress" },
  });
  await prisma.lead.update({ where: { id: lead.id }, data: { callId: call.id } });
  const tools = { id: shop.id, name: shop.name, hoursJson: shop.hoursJson, timezone: shop.timezone, trade: shop.trade, servicesJson: shop.servicesJson };
  const [offer] = await handleInCallToolCalls({
    shop: tools,
    callId: call.id,
    toolCalls: [{ id: "c", name: "check_availability", args: { serviceType: "AC not cooling" } }],
  });
  const slot = offer.result.match(/\[slot ([^\]]+)\]/)?.[1];
  assert.ok(slot, offer.result);
  const [held] = await handleInCallToolCalls({
    shop: tools,
    callId: call.id,
    toolCalls: [{ id: "h", name: "hold_appointment", args: { slot, serviceType: "AC not cooling" } }],
  });
  assert.match(held.result, /^Held /);
  return new Date(slot);
}

async function bookableLead(shop) {
  return prisma.lead.create({
    data: {
      businessId: shop.id,
      name: "Held Caller",
      phone: `+1555${2_000_000 + Math.floor(Math.random() * 8e6)}`,
      serviceType: "AC not cooling",
      address: "400 Congress Ave, Austin TX 78701",
      status: "new",
    },
  });
}

test("a held time still open at end of call books at exactly that time", async () => {
  const shop = await makeShop();
  try {
    await prisma.technician.create({ data: { businessId: shop.id, name: "Only Tech", phone: "+15550001112", skillsJson: "[]" } });
    const lead = await bookableLead(shop);
    const slot = await holdOnCall(shop, lead);
    const result = await maybeAutoBookLead(lead.id);
    assert.equal(result.created, true, JSON.stringify(result));
    const job = await prisma.job.findUnique({ where: { id: result.jobId } });
    assert.equal(job.scheduledAt.getTime(), slot.getTime());
  } finally {
    await drop(shop.id);
  }
});

test("a held time taken before the end-of-call report goes to the owner, not a double-booking", async () => {
  const shop = await makeShop();
  try {
    await prisma.technician.create({ data: { businessId: shop.id, name: "Only Tech", phone: "+15550001113", skillsJson: "[]" } });
    const lead = await bookableLead(shop);
    const slot = await holdOnCall(shop, lead);
    await prisma.job.create({
      data: { businessId: shop.id, title: "Owner booked this by hand", status: "scheduled", scheduledAt: slot, durationMin: 120 },
    });
    const result = await maybeAutoBookLead(lead.id);
    assert.equal(result.created, false);
    assert.equal(result.skipReason, "held_slot_taken");
    assert.equal(await prisma.job.count({ where: { businessId: shop.id, scheduledAt: slot } }), 1);
  } finally {
    await drop(shop.id);
  }
});

// B9
test("a real text lead with no alert gets one, once, and seeded or fresh leads are left alone", async () => {
  const shop = await makeShop({ ownerPhone: "+15555550188", environment: "production" });
  const minutesAgo = (m) => new Date(Date.now() - m * 60 * 1000);
  try {
    const stranded = await prisma.lead.create({
      data: { businessId: shop.id, source: "sms", externalId: `SM${stamp()}`, phone: "+15555550189", notes: "AC out", createdAt: minutesAgo(5) },
    });
    await prisma.lead.create({
      data: { businessId: shop.id, source: "sms", externalId: `demo_${stamp()}`, phone: "+15555550190", createdAt: minutesAgo(5) },
    });
    await prisma.lead.create({
      data: { businessId: shop.id, source: "sms", externalId: `SM${stamp()}`, phone: "+15555550191", createdAt: new Date() },
    });

    await alertStrandedTextLeads();
    const rows = await prisma.ownerNotification.findMany({ where: { businessId: shop.id } });
    assert.deepEqual([...new Set(rows.map((r) => r.leadId))], [stranded.id]);

    await alertStrandedTextLeads();
    assert.equal(await prisma.ownerNotification.count({ where: { businessId: shop.id } }), rows.length, "never twice");
  } finally {
    await drop(shop.id);
  }
});

test("a failure after an inbound text is saved can't stop its owner alert", () => {
  const route = read("src/app/api/webhooks/twilio/sms/route.ts");
  const guard = route.indexOf('logError("twilio.sms.post_capture_failed"');
  assert.ok(guard > 0 && guard < route.indexOf("await enqueueOwnerAlert("));
});

// B10
test("a full Stripe refund marks the deposit refunded; a partial one only logs it; replays do nothing", async () => {
  const shop = await makeShop();
  try {
    const deposit = await prisma.deposit.create({ data: { businessId: shop.id, amountCents: 5000, status: "paid" } });
    const partial = await applyChargeRefund({
      metadata: { kind: "booking_deposit", depositId: deposit.id, businessId: shop.id },
      amountRefundedCents: 1000,
      fullyRefunded: false,
      chargeId: "ch_partial",
    });
    assert.equal(partial.applied, "deposit");
    assert.equal((await prisma.deposit.findUnique({ where: { id: deposit.id } })).status, "paid");

    await applyChargeRefund({
      metadata: { kind: "booking_deposit", depositId: deposit.id, businessId: shop.id },
      amountRefundedCents: 5000,
      fullyRefunded: true,
      chargeId: "ch_full",
    });
    assert.equal((await prisma.deposit.findUnique({ where: { id: deposit.id } })).status, "refunded");

    const replay = await applyChargeRefund({
      metadata: { kind: "booking_deposit", depositId: deposit.id, businessId: shop.id },
      amountRefundedCents: 5000,
      fullyRefunded: true,
      chargeId: "ch_full",
    });
    assert.equal(replay.applied, null);
  } finally {
    await drop(shop.id);
  }
});

test("a full refund on an invoice marks it and its payments refunded; another shop's id matches nothing", async () => {
  const shop = await makeShop();
  const other = await makeShop();
  try {
    const invoice = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 42000, status: "paid" } });
    await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 42000 } });

    const wrongShop = await applyChargeRefund({
      metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: other.id },
      amountRefundedCents: 42000,
      fullyRefunded: true,
      chargeId: "ch_x",
    });
    assert.equal(wrongShop.applied, null);

    await applyChargeRefund({
      metadata: { kind: "invoice_pay", invoiceId: invoice.id, businessId: shop.id },
      amountRefundedCents: 42000,
      fullyRefunded: true,
      chargeId: "ch_inv",
    });
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "refunded");
    assert.deepEqual(
      (await prisma.payment.findMany({ where: { invoiceId: invoice.id } })).map((p) => p.status),
      ["refunded"],
    );
  } finally {
    await drop(shop.id);
    await drop(other.id);
  }
});

test.after(() => prisma.$disconnect());
