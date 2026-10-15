#!/usr/bin/env node
/*
 * The shared operating loop, once per launched trade, with every provider
 * simulated: call → qualification → a real open window → confirmation →
 * on the way → done with the amount the tech entered → an invoice → a payment
 * that counts only when Stripe says it cleared. Plus the exceptions each trade
 * must hand to a person instead of faking: a hazard, a missing address, a
 * shop that books nothing itself.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) {
  delete process.env[key];
}

const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");
const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
const { ensureCustomerConfirmToken, confirmJobByCustomerToken } = await import("../src/lib/customer-confirm.ts");
const { updateJobStatus, completeJobWithOutcome } = await import("../src/lib/job.ts");
const { invoiceCompletedJob, fulfillInvoiceCheckoutSession } = await import("../src/lib/invoice-pay.ts");
const { jobSteps, textDelivery } = await import("../src/lib/job-lifecycle.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);
const OPEN = JSON.stringify(
  Object.fromEntries(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, { open: "06:00", close: "22:00" }])),
);
const shops = [];

const TRADES = {
  HVAC: { ask: "AC not cooling, upstairs is 84 degrees", hazard: "I smell gas by the furnace" },
  Plumbing: { ask: "Kitchen sink drain is clogged and backing up", hazard: "I smell gas near the water heater" },
  Electrical: { ask: "Half the outlets in the kitchen stopped working", hazard: "The panel is sparking and smells like burning" },
};

async function sampleShop(trade, overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: `Loop ${trade}`,
      slug: `demo-loop-${uid()}`,
      environment: "demo",
      trade,
      timezone: "America/Chicago",
      hoursJson: OPEN,
      servicesJson: "[]",
      ownerPhone: "+13125550110",
      ownerEmail: `loop-${uid()}@orvius.test`,
      billingStatus: "pilot",
      ...overrides,
    },
  });
  shops.push(shop.id);
  const skill = classifyRequest({ business: shop, callerWords: TRADES[trade].ask }).service.skill;
  await prisma.technician.create({
    data: { businessId: shop.id, name: `${trade} Tech`, phone: "+13125550133", skillsJson: JSON.stringify([skill, "general"]), isActive: true },
  });
  return shop;
}

function call(shop, data) {
  const vapiCallId = `loop_${uid()}`;
  return ingestEndOfCallReport({
    business: shop,
    vapiCallId,
    message: {
      type: "end-of-call-report",
      call: { id: vapiCallId, customer: { number: data.phone } },
      summary: `${data.name} called about ${data.serviceType}.`,
      transcript: `AI: Thanks for calling.\nUser: ${data.serviceType}`,
      durationSeconds: 120,
      analysis: { structuredData: { name: data.name, phone: data.phone, serviceType: data.serviceType, urgency: data.urgency ?? "this-week", address: data.address } },
    },
  });
}

test.after(async () => {
  for (const id of shops) {
    await prisma.lead.deleteMany({ where: { businessId: id } }).catch(() => {});
    await prisma.business.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

for (const trade of Object.keys(TRADES)) {
  test(`${trade}: one request runs the whole loop, and money counts only when it clears`, async () => {
    const shop = await sampleShop(trade);
    const booked = await call(shop, { name: "Dana Reyes", phone: "+13125550141", serviceType: TRADES[trade].ask, address: "418 Elm St, Evanston IL 60201" });
    assert.ok(booked.jobId, `${trade} call was not booked: ${booked.skipReason}`);

    let job = await prisma.job.findUniqueOrThrow({ where: { id: booked.jobId } });
    assert.ok(job.scheduledAt && job.scheduledAt.getTime() > Date.now(), "booked on a future open window");
    assert.ok(job.technicianId, "assigned to the trade's tech");
    assert.ok(job.customerConfirmSentAt, "the confirm text went out (simulated)");
    const delivery = textDelivery({ sid: job.customerConfirmSid, deliveryStatus: null, sentAt: job.customerConfirmSentAt });
    assert.equal(delivery, "simulated", "a demo confirm text never reads as delivered");
    const step = jobSteps({ ...job, customerConfirmDelivery: delivery }).find((s) => s.key === "customer");
    assert.match(step.detail, /simulated/);

    await confirmJobByCustomerToken(await ensureCustomerConfirmToken(job.id));
    for (const status of ["en_route", "on_site"]) await updateJobStatus(job.id, status, { notifyCustomer: false });
    await completeJobWithOutcome(job.id, { resolutionCode: "repaired", finalAmountCents: 38_500 });

    const billed = await invoiceCompletedJob(job.id);
    assert.equal(billed.invoiced, true);
    assert.equal(billed.invoice.amountCents, 38_500, "the bill is the amount the tech entered, not a guess");
    assert.notEqual(billed.invoice.status, "paid");
    assert.equal(billed.reason, "connect_incomplete", "no card link is sent from a shop that can't take cards");

    const session = (payment_status) => ({
      id: `cs_test_${uid()}`,
      payment_status,
      amount_total: 38_500,
      payment_intent: `pi_${uid()}`,
      metadata: { kind: "invoice_pay", invoiceId: billed.invoice.id, businessId: shop.id },
    });
    assert.deepEqual(await fulfillInvoiceCheckoutSession(session("unpaid")), { ok: false, reason: "not_paid" });
    assert.notEqual((await prisma.invoice.findUniqueOrThrow({ where: { id: billed.invoice.id } })).status, "paid", "an open checkout is not money in");
    assert.equal((await fulfillInvoiceCheckoutSession(session("paid"))).ok, true);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: billed.invoice.id } })).status, "paid");

    job = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(job.status, "completed");
    const actions = (await prisma.auditEvent.findMany({ where: { businessId: shop.id }, select: { action: true } })).map((a) => a.action);
    for (const a of ["call.answered", "lead.captured", "playbook.classified", "job.booked", "technician.assigned"]) {
      assert.ok(actions.includes(a), `${trade} audit trail is missing ${a}`);
    }
  });

  test(`${trade}: a hazard, a missing address and an alert-only shop each go to a person`, async () => {
    const shop = await sampleShop(trade);
    const hazard = await call(shop, { name: "Sam Rivera", phone: "+13125550144", serviceType: TRADES[trade].hazard, urgency: "emergency", address: "77 Main St, Evanston IL" });
    assert.equal(hazard.jobId ?? null, null, "a hazard is escalated, never booked");

    const vague = await call(shop, { name: "Owen Park", phone: "+13125550148", serviceType: TRADES[trade].ask });
    assert.equal(vague.jobId ?? null, null, "no address, nothing booked");
    const held = await prisma.lead.findFirstOrThrow({ where: { businessId: shop.id, phone: { contains: "5550148" } } });
    assert.notEqual(held.status, "booked");

    const alertOnly = await sampleShop(trade, { bookingMode: "alert" });
    const waiting = await call(alertOnly, { name: "Lee Wong", phone: "+13125550149", serviceType: TRADES[trade].ask, address: "12 Oak St, Evanston IL" });
    assert.equal(waiting.jobId ?? null, null, "an alert-only shop books nothing itself");
    assert.equal(await prisma.job.count({ where: { businessId: alertOnly.id } }), 0);
  });
}
