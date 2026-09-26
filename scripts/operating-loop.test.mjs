#!/usr/bin/env node
/*
 * The operating loop, end to end, against the database.
 *
 * One completed call must become exactly one connected history —
 * Call → Lead → Customer → Job → Technician — with every decision in the
 * audit trail, however many times the webhook is delivered and however many
 * calls land at once. These tests drive ingestEndOfCallReport, the same
 * function the Vapi webhook and the demo endpoint call.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

// File SQLite serializes writers. One pooled connection with a long busy
// timeout keeps the logical races (interleaved awaits between deliveries)
// without turning lock waits into socket timeouts.
const baseUrl =
  process.env.DATABASE_URL ??
  readFileSync(new URL("../.env", import.meta.url), "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (baseUrl?.startsWith("file:") && !baseUrl.includes("socket_timeout")) {
  process.env.DATABASE_URL = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}connection_limit=1&socket_timeout=60`;
}

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { ingestEndOfCallReport } = await import("../src/lib/call-ingest.ts");
const { getRecordView } = await import("../src/lib/record-view.ts");
const { applyCustomerConfirmReceipt } = await import("../src/lib/customer-confirm.ts");
const { classifyRequest } = await import("../src/lib/trade-playbooks.ts");
const { rankTechnicians } = await import("../src/lib/technician-match.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);

async function makeShop(overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: "Loop Test HVAC",
      slug: `loop-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerPhone: "+15550001111",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
  return shop;
}

async function addTech(businessId, name, skills) {
  return prisma.technician.create({
    data: { businessId, name, skillsJson: JSON.stringify(skills), phone: null },
  });
}

function report(vapiCallId, data) {
  return {
    type: "end-of-call-report",
    call: { id: vapiCallId, customer: { number: data.phone } },
    summary: data.summary ?? `${data.name} called about ${data.serviceType}.`,
    transcript: `Caller: ${data.serviceType}`,
    durationSeconds: 140,
    analysis: {
      structuredData: {
        name: data.name,
        phone: data.phone,
        serviceType: data.serviceType,
        urgency: data.urgency,
        address: data.address,
        notes: data.notes,
      },
    },
  };
}

async function counts(businessId) {
  const [calls, leads, customers, jobs, audits, alerts] = await Promise.all([
    prisma.call.count({ where: { businessId } }),
    prisma.lead.count({ where: { businessId } }),
    prisma.customer.count({ where: { businessId } }),
    prisma.job.count({ where: { businessId } }),
    prisma.auditEvent.count({ where: { businessId } }),
    prisma.ownerNotification
      .groupBy({ by: ["dedupeKey"], where: { businessId } })
      .then((groups) => groups.length),
  ]);
  return { calls, leads, customers, jobs, audits, alerts };
}

const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("one call becomes one connected, audited history with the right technician", async () => {
  const shop = await makeShop();
  try {
    const heater = await addTech(shop.id, "Ben Heating", ["heating"]);
    const cooler = await addTech(shop.id, "Ana Cooling", ["cooling"]);
    const vapiCallId = `loop_${uid()}`;
    const result = await ingestEndOfCallReport({
      business: shop,
      vapiCallId,
      message: report(vapiCallId, {
        name: "Maria Lopez",
        phone: "+13125550101",
        serviceType: "AC not cooling, house is 84 degrees",
        urgency: "same-day",
        address: "418 Elm St, Evanston IL 60201",
      }),
    });

    assert.equal(result.duplicate, false);
    assert.ok(result.jobId, `expected a job, got skip ${result.skipReason}`);
    const job = await prisma.job.findUniqueOrThrow({
      where: { id: result.jobId },
      include: { lead: true, customer: true },
    });
    assert.equal(job.technicianId, cooler.id, "cooling job goes to the cooling tech");
    assert.notEqual(job.technicianId, heater.id);
    assert.equal(job.durationMin, 120);
    assert.equal(job.customerId, result.customerId);
    assert.equal(job.lead?.status, "booked");
    assert.equal(job.lead?.callId, result.callId);

    const call = await prisma.call.findUniqueOrThrow({ where: { id: result.callId } });
    assert.equal(call.customerId, result.customerId);
    assert.equal(call.booked, true);

    const actions = (
      await prisma.auditEvent.findMany({ where: { businessId: shop.id }, orderBy: { createdAt: "asc" } })
    ).map((a) => a.action);
    for (const action of [
      "call.answered",
      "lead.captured",
      "customer.created",
      "playbook.classified",
      "service_area.checked",
      "job.booked",
      "technician.assigned",
      "customer.confirmation_skipped",
      "owner.alert_queued",
    ]) {
      assert.ok(actions.includes(action), `audit is missing ${action}: ${actions.join(", ")}`);
    }

    assert.equal((await counts(shop.id)).alerts, 1);

    const view = await getRecordView(shop.id, "call", result.callId);
    assert.ok(view);
    const path = Object.fromEntries(view.path.map((n) => [n.type, n.value]));
    assert.equal(path.customer, "Maria Lopez");
    assert.equal(path.technician, "Ana Cooling");
    assert.ok(path.property?.includes("418 Elm St"));
    assert.ok(view.events.some((e) => /Assigned Ana Cooling/.test(e.label + " " + (e.detail ?? ""))));
  } finally {
    await drop(shop.id);
  }
});

test("replayed and concurrent webhook deliveries never duplicate records or decisions", async () => {
  const shop = await makeShop();
  try {
    await addTech(shop.id, "Solo Tech", []);
    const vapiCallId = `loop_${uid()}`;
    const message = report(vapiCallId, {
      name: "Dev Patel",
      phone: "+13125550102",
      serviceType: "Furnace making a banging noise",
      urgency: "this-week",
      address: "12 Oak Ave, Evanston IL 60201",
    });
    const first = await ingestEndOfCallReport({ business: shop, vapiCallId, message });
    assert.equal(first.duplicate, false);
    const before = await counts(shop.id);

    for (let i = 0; i < 3; i++) {
      assert.equal((await ingestEndOfCallReport({ business: shop, vapiCallId, message })).duplicate, true);
    }
    const parallel = await Promise.all(
      Array.from({ length: 6 }, () => ingestEndOfCallReport({ business: shop, vapiCallId, message })),
    );
    assert.ok(parallel.every((r) => r.duplicate));
    assert.deepEqual(await counts(shop.id), before);
    assert.equal(before.calls, 1);
    assert.equal(before.leads, 1);
    assert.equal(before.customers, 1);
    assert.equal(before.jobs, 1);
  } finally {
    await drop(shop.id);
  }
});

test("a returning caller is matched, not duplicated, and the touch is counted once", async () => {
  const shop = await makeShop();
  try {
    await addTech(shop.id, "Solo Tech", []);
    const phone = "+13125550103";
    const a = `loop_${uid()}`;
    const b = `loop_${uid()}`;
    const one = await ingestEndOfCallReport({
      business: shop,
      vapiCallId: a,
      message: report(a, { name: "Kim Ng", phone, serviceType: "Thermostat blank", urgency: "this-week", address: "9 Pine Rd, Evanston IL 60201" }),
    });
    const two = await ingestEndOfCallReport({
      business: shop,
      vapiCallId: b,
      message: report(b, { name: "Kim Ng", phone: "(312) 555-0103", serviceType: "Tune-up", urgency: "flexible", address: "9 Pine Rd, Evanston IL 60201" }),
    });
    assert.equal(one.customerId, two.customerId);
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: one.customerId } });
    assert.equal(customer.interactionCount, 2);
    assert.equal((await counts(shop.id)).customers, 1);
    const matched = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "customer.matched" } });
    assert.ok(matched);
  } finally {
    await drop(shop.id);
  }
});

test("a caller who gives a different callback number is still known by the number they called from", async () => {
  const shop = await makeShop();
  try {
    const callerId = "+13125550188";
    const vapiCallId = `loop_${uid()}`;
    const message = report(vapiCallId, {
      name: "Dana Reyes",
      phone: "+13125550199",
      serviceType: "AC blowing warm air",
      urgency: "this-week",
      address: "14 Maple St, Evanston IL 60201",
    });
    message.call.customer.number = callerId;
    const result = await ingestEndOfCallReport({ business: shop, vapiCallId, message });
    const call = await prisma.call.findUniqueOrThrow({ where: { id: result.callId } });
    assert.equal(call.callerPhone, callerId);
    const byCallerId = await prisma.customer.findUnique({
      where: { businessId_phoneNormalized: { businessId: shop.id, phoneNormalized: callerId } },
    });
    assert.equal(byCallerId?.name, "Dana Reyes");
  } finally {
    await drop(shop.id);
  }
});

test("a confirmation text the carrier rejects asks the owner to call, once", async () => {
  const shop = await makeShop({ name: "Confirm Test HVAC" });
  try {
    const job = await prisma.job.create({
      data: {
        businessId: shop.id,
        title: "Furnace banging",
        status: "scheduled",
        scheduledAt: new Date("2026-10-01T15:00:00Z"),
        customerConfirmSentAt: new Date(),
        customerConfirmSid: `SM${uid()}`,
      },
    });
    const receipt = { messageSid: job.customerConfirmSid, messageStatus: "undelivered", errorCode: "30034" };
    assert.deepEqual(await applyCustomerConfirmReceipt({ ...receipt, messageStatus: "delivered" }), { matched: false, alerted: false });
    assert.deepEqual(await applyCustomerConfirmReceipt(receipt), { matched: true, alerted: true });
    assert.deepEqual(await applyCustomerConfirmReceipt(receipt), { matched: true, alerted: false });
    const saved = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    assert.ok(saved.customerConfirmFailedAt);
    const alerts = await prisma.ownerNotification.findMany({ where: { businessId: shop.id, dedupeKey: `confirm-failed:${job.id}` } });
    assert.deepEqual(alerts.map((a) => a.channel).sort(), ["email", "sms"]);
    assert.match(alerts[0].message, /did not go through — carrier error 30034\. Call to confirm/);
  } finally {
    await drop(shop.id);
  }
});

test("a life-safety call is escalated to a human, never put on the calendar", async () => {
  const shop = await makeShop();
  try {
    await addTech(shop.id, "Solo Tech", []);
    const vapiCallId = `loop_${uid()}`;
    const result = await ingestEndOfCallReport({
      business: shop,
      vapiCallId,
      message: report(vapiCallId, {
        name: "Sam Ortiz",
        phone: "+13125550104",
        serviceType: "Furnace not working and I smell gas in the basement",
        urgency: "same-day",
        address: "77 Birch Ln, Evanston IL 60201",
      }),
    });
    assert.equal(result.jobId, null);
    assert.equal(result.skipReason, "safety_escalation");
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId } });
    assert.equal(lead.urgency, "emergency");
    const escalated = await prisma.auditEvent.findFirst({ where: { leadId: lead.id, action: "lead.escalated" } });
    assert.match(escalated?.summary ?? "", /Gas smell/);
    const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id } });
    assert.match(alert?.message ?? "", /^SAFETY/);
  } finally {
    await drop(shop.id);
  }
});

test("a call missing the address is held for the owner with the reason recorded", async () => {
  const shop = await makeShop();
  try {
    const vapiCallId = `loop_${uid()}`;
    const result = await ingestEndOfCallReport({
      business: shop,
      vapiCallId,
      message: report(vapiCallId, { name: "Lee", phone: "+13125550105", serviceType: "something is off", urgency: "flexible" }),
    });
    assert.equal(result.jobId, null);
    const held = await prisma.auditEvent.findFirst({ where: { leadId: result.leadId, action: "lead.held" } });
    assert.match(held?.summary ?? "", /missing .*address/);
  } finally {
    await drop(shop.id);
  }
});

test("load: 30 calls in bursts of 10 concurrent deliveries, each delivered twice, give 30 histories and no double-booked tech", async () => {
  const shop = await makeShop();
  try {
    await addTech(shop.id, "Ana Cooling", ["cooling"]);
    await addTech(shop.id, "Ben General", []);
    await addTech(shop.id, "Cy General", []);
    const deliveries = [];
    for (let i = 0; i < 30; i++) {
      const vapiCallId = `load_${uid()}_${i}`;
      const message = report(vapiCallId, {
        name: `Caller ${i}`,
        phone: `+1312555${String(2000 + i).padStart(4, "0")}`,
        serviceType: i % 2 ? "AC not cooling" : "Furnace won't start",
        urgency: "this-week",
        address: `${100 + i} Lake St, Evanston IL 60201`,
      });
      deliveries.push({ vapiCallId, message }, { vapiCallId, message });
    }
    // A sustained burst: 10 deliveries in flight at once, and every call's
    // duplicate delivery is in flight alongside its twin.
    const started = Date.now();
    const results = [];
    for (let i = 0; i < deliveries.length; i += 10) {
      const batch = deliveries.slice(i, i + 10);
      results.push(
        ...(await Promise.all(
          batch.map((d) => ingestEndOfCallReport({ business: shop, vapiCallId: d.vapiCallId, message: d.message })),
        )),
      );
    }
    const elapsed = Date.now() - started;

    assert.equal(results.filter((r) => !r.duplicate).length, 30);
    const c = await counts(shop.id);
    assert.equal(c.calls, 30);
    assert.equal(c.leads, 30);
    assert.equal(c.customers, 30);
    assert.ok(c.jobs <= 30);
    assert.equal(c.alerts, 30);

    const jobs = await prisma.job.findMany({
      where: { businessId: shop.id, technicianId: { not: null } },
      select: { technicianId: true, scheduledAt: true, durationMin: true },
    });
    for (let i = 0; i < jobs.length; i++) {
      for (let j = i + 1; j < jobs.length; j++) {
        const a = jobs[i];
        const b = jobs[j];
        if (a.technicianId !== b.technicianId) continue;
        const a0 = a.scheduledAt.getTime();
        const b0 = b.scheduledAt.getTime();
        const overlap = a0 < b0 + (b.durationMin ?? 120) * 60_000 && b0 < a0 + (a.durationMin ?? 120) * 60_000;
        assert.equal(overlap, false, "a technician was booked into two overlapping jobs");
      }
    }
    const dupKeys = await prisma.auditEvent.groupBy({
      by: ["idempotencyKey"],
      where: { businessId: shop.id, idempotencyKey: { not: null } },
      _count: true,
    });
    assert.ok(dupKeys.every((g) => g._count === 1));
    console.log(`# load: 60 deliveries → 30 histories in ${elapsed}ms, ${jobs.length} assigned`);
  } finally {
    await drop(shop.id);
  }
});

test("tenant isolation: the same caller in two shops is two customers, and records never cross", async () => {
  const a = await makeShop();
  const b = await makeShop({ name: "Other Shop" });
  try {
    const phone = "+13125550199";
    const idA = `iso_${uid()}`;
    const idB = `iso_${uid()}`;
    const ra = await ingestEndOfCallReport({
      business: a,
      vapiCallId: idA,
      message: report(idA, { name: "Pat", phone, serviceType: "No heat", urgency: "same-day", address: "1 A St, Evanston IL 60201" }),
    });
    const rb = await ingestEndOfCallReport({
      business: b,
      vapiCallId: idB,
      message: report(idB, { name: "Pat", phone, serviceType: "No heat", urgency: "same-day", address: "1 A St, Evanston IL 60201" }),
    });
    assert.notEqual(ra.customerId, rb.customerId);
    assert.equal(await getRecordView(b.id, "lead", ra.leadId), null);
    assert.equal(await getRecordView(b.id, "customer", ra.customerId), null);
    assert.equal(await getRecordView(a.id, "call", rb.callId), null);
    assert.ok(await getRecordView(a.id, "lead", ra.leadId));
    const leak = await prisma.auditEvent.count({ where: { businessId: b.id, leadId: ra.leadId } });
    assert.equal(leak, 0);
  } finally {
    await drop(a.id);
    await drop(b.id);
  }
});

test("playbooks: trade services, durations, and cross-trade safety", () => {
  const plumbing = classifyRequest({
    business: { trade: "Plumbing" },
    serviceType: "Water heater leaking, no hot water",
    urgency: null,
  });
  assert.equal(plumbing.service.key, "active_leak");
  assert.equal(plumbing.urgency, "same-day");

  const electric = classifyRequest({ business: { trade: "Electrical" }, serviceType: "Outlet sparking in kitchen" });
  assert.equal(electric.safety?.key, "sparking");
  assert.equal(electric.urgency, "emergency");

  const crossTrade = classifyRequest({ business: { trade: "Electrical" }, serviceType: "I smell gas near the stove" });
  assert.equal(crossTrade.safety?.key, "gas_smell");

  const override = classifyRequest({
    business: { trade: "HVAC", servicesJson: JSON.stringify([{ name: "Maintenance tune-up", durationMin: 45 }]) },
    serviceType: "Annual tune-up",
  });
  assert.equal(override.service.durationMin, 45);
});

test("technician ranking: skill first, then free calendar, then lightest day", () => {
  const at = new Date("2026-10-01T15:00:00Z");
  const busy = [{ id: "j1", scheduledAt: new Date("2026-10-01T14:30:00Z"), durationMin: 120 }];
  const ranking = rankTechnicians({
    scheduledAt: at,
    durationMin: 90,
    skill: "cooling",
    candidates: [
      { id: "a", name: "Ana", skills: ["cooling"], jobs: busy },
      { id: "b", name: "Ben", skills: ["heating"], jobs: [] },
      { id: "c", name: "Cy", skills: [], jobs: [] },
    ],
  });
  assert.equal(ranking.pick?.technicianId, "c");
  assert.deepEqual(
    Object.fromEntries(ranking.considered.map((x) => [x.name, x.fit])),
    { Ana: "busy", Ben: "no_skill", Cy: "picked" },
  );
  const none = rankTechnicians({ scheduledAt: at, durationMin: 60, skill: "sewer", candidates: [{ id: "b", name: "Ben", skills: ["heating"], jobs: [] }] });
  assert.equal(none.pick, null);
  assert.match(none.blocked, /sewer/);
});

test("the record drawer's next action matches the inbox: call when the address or safety demands it", async () => {
  const shop = await makeShop();
  try {
    const lead = (data) =>
      prisma.lead.create({ data: { businessId: shop.id, phone: "+13125550190", status: "new", ...data } });
    const noAddress = await lead({ name: "No Address", serviceType: "No heat", urgency: "same-day" });
    const gas = await lead({ name: "Gas", serviceType: "Smell gas", urgency: "emergency", address: "1 Elm St" });
    const ready = await lead({ name: "Ready", serviceType: "Tune-up", urgency: "this-week", address: "2 Elm St" });

    assert.equal((await getRecordView(shop.id, "lead", noAddress.id)).next.label, "Call back");
    const gasNext = (await getRecordView(shop.id, "lead", gas.id)).next;
    assert.equal(gasNext.label, "Call now");
    assert.equal(gasNext.href, "tel:+13125550190");
    assert.equal((await getRecordView(shop.id, "lead", ready.id)).next.label, "Book job");
  } finally {
    await drop(shop.id);
  }
});

test.after(() => prisma.$disconnect());
