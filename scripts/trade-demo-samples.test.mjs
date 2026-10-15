#!/usr/bin/env node
/*
 * Plumbing and electrical sample calls run through the same ingest, playbook,
 * safety and booking code as the HVAC demo. Demo shops only; texts simulated.
 */
import assert from "node:assert/strict";
import test from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { ensureDemoWorkspace, simulateDemoCall, demoScenariosFor, TRADE_SAMPLE_CALLS, DEMO_SCENARIOS } = await import("../src/lib/demo-workspace.ts");
const { servicesForTrade } = await import("../src/lib/provision-business.ts");
const { prisma } = await import("../src/lib/prisma.ts");
const { buildRequestTrace } = await import("../src/lib/request-trace.ts");

const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

const CREWS = {
  Plumbing: [
    { name: "Pia Leaks", skills: ["leaks", "general"] },
    { name: "Hal Heaters", skills: ["water_heaters", "drains", "sewer"] },
  ],
  Electrical: [
    { name: "Tess Trouble", skills: ["troubleshooting", "general"] },
    { name: "Dev Devices", skills: ["devices", "panels"] },
  ],
};

async function tradeDemo(trade) {
  const { business } = await ensureDemoWorkspace(`trade-${stamp()}@orvius.test`);
  made.push(business.id);
  await prisma.technician.deleteMany({ where: { businessId: business.id } });
  for (const t of CREWS[trade]) {
    await prisma.technician.create({ data: { businessId: business.id, name: t.name, skillsJson: JSON.stringify(t.skills), isActive: true } });
  }
  return prisma.business.update({
    where: { id: business.id },
    data: { trade, name: `Lakeside ${trade} (demo)`, servicesJson: servicesForTrade(trade) },
  });
}

test("each launch trade gets its own sample calls; anything else gets the HVAC set", () => {
  assert.equal(demoScenariosFor("Plumbing"), TRADE_SAMPLE_CALLS.Plumbing);
  assert.equal(demoScenariosFor("Electrical"), TRADE_SAMPLE_CALLS.Electrical);
  assert.equal(demoScenariosFor("HVAC"), DEMO_SCENARIOS);
  assert.equal(demoScenariosFor(null), DEMO_SCENARIOS);
});

for (const trade of ["Plumbing", "Electrical"]) {
  test(`${trade}: routine calls book with a matching tech; emergencies and safety calls go to a person, never a slot`, async () => {
    const shop = await tradeDemo(trade);
    for (const sample of TRADE_SAMPLE_CALLS[trade]) {
      const call = await simulateDemoCall(shop, sample.id);
      const safety = /safety/i.test(sample.label);
      if (safety) {
        assert.equal(call.autoBooked, false, `${sample.id} must not book`);
        assert.equal(call.skipReason, "safety_escalation", sample.id);
        const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, leadId: call.leadId, channel: "sms" } });
        assert.match(alert?.message ?? "", /^SAFETY/, `${sample.id} owner alert`);
        continue;
      }
      if (sample.urgency === "emergency") {
        assert.equal(call.autoBooked, false, `${sample.id} must not book`);
        assert.equal(call.skipReason, "emergency_escalation", sample.id);
        assert.equal(await prisma.job.count({ where: { businessId: shop.id, leadId: call.leadId } }), 0);
        continue;
      }
      assert.equal(call.autoBooked, true, `${sample.id}: expected a booking, got ${call.skipReason}`);
      const job = await prisma.job.findUniqueOrThrow({ where: { id: call.jobId }, include: { technician: true } });
      assert.ok(job.technician, `${sample.id}: a tech is assigned`);
      assert.ok(job.scheduledAt > new Date(), `${sample.id}: window in the future`);
      const text = await prisma.message.findFirst({ where: { businessId: shop.id, phoneNormalized: sample.phone, direction: "out" } });
      assert.ok(text?.sid?.startsWith("SIM_"), `${sample.id}: the confirmation text is simulated`);
      const trace = await buildRequestTrace(shop.id, call.leadId);
      assert.equal(trace.job?.id, job.id, `${sample.id}: the trace follows the request to its job`);
      assert.ok(trace.events.some((e) => e.tone === "ok"), `${sample.id}: the trace shows what Orvius did`);
      assert.ok(trace.events.every((e) => e.title), `${sample.id}: every trace step is readable`);
    }
    const call = await prisma.call.findFirst({ where: { businessId: shop.id }, orderBy: { createdAt: "asc" } });
    assert.match(call.transcript, new RegExp(`^AI: Lakeside ${trade}, this is Orvius`), "the greeting names the demo shop, not the HVAC one");
  });
}

test("a scenario from another trade is refused", async () => {
  const shop = await tradeDemo("Plumbing");
  await assert.rejects(() => simulateDemoCall(shop, "elec_burning"), /Unknown scenario/);
  await assert.rejects(() => simulateDemoCall(shop, "no_cool"), /Unknown scenario/);
});

test.after(async () => {
  for (const id of made) {
    await prisma.lead.deleteMany({ where: { businessId: id } }).catch(() => {});
    await prisma.business.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});
