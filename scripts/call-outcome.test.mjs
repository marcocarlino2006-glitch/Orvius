#!/usr/bin/env node
/*
 * One synthetic call, traced to its outcome: call → request → job or explicit
 * hold → owner notification → the record the owner sees. Drives the same
 * ingestEndOfCallReport the Vapi webhook calls. No provider is configured, so
 * nothing leaves this machine.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");
const { gradeCall } = await import("../src/lib/call-quality.ts");
const { holdDecisionsByLead } = await import("../src/lib/booking-decision.ts");
const { failuresThatReachedNoOne } = await import("../src/lib/alert-reach.ts");
const { getShopHealth } = await import("../src/lib/shop-health.ts");
const { isInformationOnlyRequest } = await import("../src/lib/info-request.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);

async function makeShop(overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: "Outcome Test Air",
      slug: `outcome-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      timezone: "America/Chicago",
      ownerPhone: "+15550003333",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
  await prisma.technician.create({ data: { businessId: shop.id, name: "Tech One", skillsJson: "[]" } });
  return shop;
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

function report(vapiCallId, data, transcript) {
  return {
    type: "end-of-call-report",
    call: { id: vapiCallId, customer: { number: data.phone } },
    summary: data.summary ?? `${data.name ?? "Caller"} called.`,
    transcript: transcript ?? `User: ${data.serviceType ?? ""}`,
    durationSeconds: 120,
    analysis: { structuredData: data },
  };
}

const BOOKING = {
  name: "Ann Lee",
  phone: "+15125550101",
  serviceType: "AC not cooling",
  urgency: "same-day",
  address: "12 Oak St, Austin TX 78701",
};

test("a valid booking creates exactly one job, and the alert does not claim a confirmation it lacks", async () => {
  const shop = await makeShop();
  try {
    const vapiCallId = `outcome-book-${uid()}`;
    const message = report(vapiCallId, BOOKING);
    const result = await ingestEndOfCallReport({ business: shop, vapiCallId, message });
    assert.equal(result.autoBooked, true);

    const jobs = await prisma.job.findMany({ where: { businessId: shop.id } });
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0].scheduledAt, "a booked job has the slot the schedule produced");
    assert.equal(jobs[0].customerConfirmedAt, null, "no customer confirmation happened");

    const alerts = await prisma.ownerNotification.findMany({ where: { leadId: result.leadId } });
    assert.ok(alerts.length > 0);
    assert.match(alerts[0].message, /awaiting customer confirm/);
    assert.doesNotMatch(alerts[0].message, /\bconfirmed\b/i);

    // Replays: no second job, no second alert.
    assert.equal((await ingestEndOfCallReport({ business: shop, vapiCallId, message })).duplicate, true);
    await Promise.all(Array.from({ length: 4 }, () => ingestEndOfCallReport({ business: shop, vapiCallId, message })));
    assert.equal(await prisma.job.count({ where: { businessId: shop.id } }), 1);
    assert.equal(await prisma.ownerNotification.count({ where: { leadId: result.leadId } }), alerts.length);
  } finally {
    await drop(shop.id);
  }
});

test("call, request, job, notification and decisions trace together by id", async () => {
  const shop = await makeShop();
  try {
    const vapiCallId = `outcome-trace-${uid()}`;
    const r = await ingestEndOfCallReport({ business: shop, vapiCallId, message: report(vapiCallId, BOOKING) });
    const call = await prisma.call.findUniqueOrThrow({ where: { id: r.callId }, include: { lead: { include: { job: true } } } });
    assert.equal(call.vapiCallId, vapiCallId);
    assert.equal(call.lead.id, r.leadId);
    assert.equal(call.lead.job.id, r.jobId);
    const alerts = await prisma.ownerNotification.findMany({ where: { leadId: r.leadId } });
    assert.ok(alerts.every((a) => a.businessId === shop.id && a.dedupeKey.includes(vapiCallId)));
    const audit = await prisma.auditEvent.findMany({ where: { callId: r.callId } });
    const actions = audit.map((a) => a.action);
    for (const step of ["call.answered", "lead.captured", "job.booked", "owner.alert_queued"]) {
      assert.ok(actions.includes(step), `audit has ${step}`);
    }
    assert.ok(audit.every((a) => a.businessId === shop.id));
  } finally {
    await drop(shop.id);
  }
});

test("an opening-hours question is answered, not held as a booking missing its address", async () => {
  const shop = await makeShop();
  try {
    const vapiCallId = `outcome-hours-${uid()}`;
    const message = report(
      vapiCallId,
      { phone: "+15125550102", summary: "Caller asked about Saturday opening hours." },
      "User: What time are you open on Saturday?\nAI: Saturday we're open nine to two.",
    );
    const r = await ingestEndOfCallReport({ business: shop, vapiCallId, message });
    assert.equal(r.jobId, null);
    assert.equal(r.skipReason, "info_only");

    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: r.leadId } });
    assert.equal(lead.status, "new", "still visible to the owner");
    const audit = await prisma.auditEvent.findMany({ where: { leadId: r.leadId } });
    assert.ok(audit.some((a) => a.action === "lead.answered"));
    assert.ok(!audit.some((a) => a.action === "lead.held"), "not recorded as held for missing details");
    const captured = audit.find((a) => a.action === "lead.captured");
    assert.doesNotMatch(captured.summary, /missing/);

    const call = await prisma.call.findUniqueOrThrow({ where: { id: r.callId }, include: { lead: { include: { job: true } } } });
    const grade = gradeCall({ call, lead: call.lead, business: shop });
    assert.ok(!grade.findings.some((f) => f.key === "missing_capture"));

    const alert = await prisma.ownerNotification.findFirst({ where: { leadId: r.leadId } });
    assert.match(alert.message, /not a service request/);
  } finally {
    await drop(shop.id);
  }
});

test("a service problem that mentions hours still needs its address before booking", async () => {
  assert.equal(
    isInformationOnlyRequest({ serviceType: "AC not cooling", notes: "Are you open on Saturday?" }),
    false,
  );
  assert.equal(isInformationOnlyRequest({ categoryCode: "hvac.no_cool", notes: "what are your hours" }), false);
  assert.equal(isInformationOnlyRequest({ address: "12 Oak St", notes: "are you open today" }), false);
  assert.equal(isInformationOnlyRequest({ notes: "Caller wanted a callback" }), false);

  const shop = await makeShop();
  try {
    const vapiCallId = `outcome-noaddr-${uid()}`;
    const r = await ingestEndOfCallReport({
      business: shop,
      vapiCallId,
      message: report(vapiCallId, { ...BOOKING, address: null, notes: "Are you open on Saturday?" }),
    });
    assert.equal(r.jobId, null);
    assert.equal(r.skipReason, "missing_address");
  } finally {
    await drop(shop.id);
  }
});

test("a lead held on purpose is not reported as 'had what it needed but no job was created'", async () => {
  const shop = await makeShop({ serviceZipsJson: JSON.stringify(["60201"]) });
  try {
    const vapiCallId = `outcome-ooa-${uid()}`;
    const r = await ingestEndOfCallReport({ business: shop, vapiCallId, message: report(vapiCallId, BOOKING) });
    assert.equal(r.skipReason, "out_of_area");

    const call = await prisma.call.findUniqueOrThrow({ where: { id: r.callId }, include: { lead: { include: { job: true } } } });
    const holds = await holdDecisionsByLead(shop.id, [r.leadId]);
    assert.match(holds.get(r.leadId), /Outside the service area/);

    const withHold = gradeCall({ call, lead: call.lead, business: shop, holdDecision: holds.get(r.leadId) });
    assert.ok(!withHold.findings.some((f) => f.key === "not_booked"));

    // With no recorded decision the same lead is the unexplained case, and still flagged.
    const unexplained = gradeCall({ call, lead: call.lead, business: shop });
    assert.ok(unexplained.findings.some((f) => f.key === "not_booked"));
  } finally {
    await drop(shop.id);
  }
});

test("an email that cannot send while the text is in flight is not 'alerts not delivering'", async () => {
  const shop = await makeShop();
  try {
    const key = `lead:outcome-${uid()}`;
    const base = { businessId: shop.id, dedupeKey: key, businessName: shop.name, message: "m", attempts: 1 };
    await prisma.ownerNotification.create({ data: { ...base, channel: "sms", status: "sent", deliveryStatus: "queued" } });
    const email = await prisma.ownerNotification.create({
      data: { ...base, channel: "email", status: "failed", error: "Email not configured", processedAt: new Date() },
    });

    assert.deepEqual(await failuresThatReachedNoOne(shop.id, [email]), []);
    assert.equal((await getShopHealth(shop.id)).failedAlerts24h, 0);

    // The text then fails for good: now nothing reached the owner, and it is loud.
    await prisma.ownerNotification.updateMany({
      where: { businessId: shop.id, channel: "sms" },
      data: { status: "failed", error: "undelivered" },
    });
    assert.equal((await failuresThatReachedNoOne(shop.id, [email])).length, 1);
    assert.equal((await getShopHealth(shop.id)).failedAlerts24h, 2);
  } finally {
    await drop(shop.id);
  }
});

test("an SMS failover email that went out counts as reaching the owner", async () => {
  const shop = await makeShop();
  try {
    const key = `lead:outcome-${uid()}`;
    const base = { businessId: shop.id, businessName: shop.name, message: "m", attempts: 5 };
    const sms = await prisma.ownerNotification.create({
      data: { ...base, dedupeKey: key, channel: "sms", status: "failed", error: "undelivered" },
    });
    await prisma.ownerNotification.create({
      data: { ...base, dedupeKey: `${key}:sms-failover`, channel: "email", status: "sent" },
    });
    assert.deepEqual(await failuresThatReachedNoOne(shop.id, [sms]), []);
  } finally {
    await drop(shop.id);
  }
});

test.after(() => prisma.$disconnect());
