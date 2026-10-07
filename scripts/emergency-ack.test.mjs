/*
 * Delivery is not acknowledgement: an emergency nobody worked within ten
 * minutes is alerted again, the backup number is texted, it is audited, and it
 * happens once. The recording and automated-receptionist notice is spoken in
 * the opening line on every call rather than left to the model.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { escalateUnackedEmergencies, emergencyAcknowledged, EMERGENCY_ESCALATED } = await import("../src/lib/emergency-ack.ts");
const { isOwnerAlertUnacked } = await import("../src/lib/owner-alert-unacked.ts");
const { buildVapiAssistantConfig, openingWithNotice } = await import("../src/lib/vapi.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const minutesAgo = (m) => new Date(Date.now() - m * 60_000);

async function shop() {
  return prisma.business.create({
    data: {
      name: "Night Air",
      slug: `na-${stamp()}`,
      environment: "production",
      timezone: "America/Chicago",
      ownerPhone: "+15555550180",
      ownerEmail: `owner-${stamp()}@example.test`,
      transferPhone: "+15555550181",
    },
  });
}

test("an emergency nobody worked in 10 minutes is alerted again, audited, and only once", async () => {
  const s = await shop();
  try {
    const stale = await prisma.lead.create({
      data: { businessId: s.id, phone: "+15555550182", urgency: "emergency", serviceType: "Gas smell", status: "new", createdAt: minutesAgo(12) },
    });
    const fresh = await prisma.lead.create({
      data: { businessId: s.id, phone: "+15555550183", urgency: "emergency", status: "new", createdAt: minutesAgo(4) },
    });
    const worked = await prisma.lead.create({
      data: { businessId: s.id, phone: "+15555550184", urgency: "emergency", status: "contacted", firstContactedAt: minutesAgo(8), createdAt: minutesAgo(15) },
    });
    const routine = await prisma.lead.create({
      data: { businessId: s.id, phone: "+15555550185", urgency: "routine", status: "new", createdAt: minutesAgo(30) },
    });

    assert.ok((await escalateUnackedEmergencies()) >= 1);
    const alerts = await prisma.ownerNotification.findMany({ where: { businessId: s.id } });
    assert.ok(alerts.length >= 1);
    assert.deepEqual([...new Set(alerts.map((a) => a.leadId))], [stale.id]);
    assert.match(alerts[0].message, /UNANSWERED EMERGENCY · Gas smell/);
    const audit = await prisma.auditEvent.findMany({ where: { businessId: s.id, action: EMERGENCY_ESCALATED } });
    assert.deepEqual(audit.map((a) => a.leadId), [stale.id]);

    await escalateUnackedEmergencies();
    assert.equal(await prisma.auditEvent.count({ where: { businessId: s.id, action: EMERGENCY_ESCALATED } }), 1, "a second sweep does not escalate again");
    assert.equal(await prisma.ownerNotification.count({ where: { businessId: s.id } }), alerts.length);
    for (const lead of [fresh, worked, routine]) {
      assert.equal(await prisma.ownerNotification.count({ where: { leadId: lead.id } }), 0);
    }
  } finally {
    await prisma.business.delete({ where: { id: s.id } }).catch(() => {});
  }
});

test("a safety escalation counts as an emergency even when the urgency label was lost", async () => {
  const s = await shop();
  try {
    const lead = await prisma.lead.create({
      data: { businessId: s.id, phone: "+15555550186", urgency: null, status: "new", createdAt: minutesAgo(11) },
    });
    await prisma.auditEvent.create({
      data: { businessId: s.id, entityType: "lead", entityId: lead.id, leadId: lead.id, action: "lead.escalated", summary: "Escalated to a human — gas smell." },
    });
    assert.ok((await escalateUnackedEmergencies()) >= 1);
    assert.equal(await prisma.auditEvent.count({ where: { leadId: lead.id, action: EMERGENCY_ESCALATED } }), 1);
  } finally {
    await prisma.business.delete({ where: { id: s.id } }).catch(() => {});
  }
});

test("acknowledged means a person contacted the caller or moved the request on", () => {
  assert.equal(emergencyAcknowledged({ status: "new", firstContactedAt: null, closedAt: null }), false);
  assert.equal(emergencyAcknowledged({ status: null, firstContactedAt: null, closedAt: null }), false);
  assert.equal(emergencyAcknowledged({ status: "new", firstContactedAt: new Date(), closedAt: null }), true);
  assert.equal(emergencyAcknowledged({ status: "booked", firstContactedAt: null, closedAt: null }), true);
  assert.equal(emergencyAcknowledged({ status: "new", firstContactedAt: null, closedAt: new Date() }), true);
});

test("Command flags an unseen emergency alert after 10 minutes, not 30", () => {
  const now = new Date("2026-10-07T08:00:00Z");
  const alertedAt = new Date("2026-10-07T07:48:00Z");
  assert.equal(isOwnerAlertUnacked({ alertedAt, now, afterHours: true }), false);
  assert.equal(isOwnerAlertUnacked({ alertedAt, now, afterHours: true, emergency: true }), true);
});

test("every caller hears the recording and automated-receptionist notice in the opening line", () => {
  const shopName = "Summit Heating & Air";
  assert.equal(
    openingWithNotice("Thanks for calling Summit Heating & Air, this is Orvius. What's going on?", shopName),
    "Thanks for calling Summit Heating & Air, this is Orvius. This call may be recorded and is answered by an automated receptionist for Summit Heating & Air. What's going on?",
  );
  assert.equal(
    openingWithNotice("Thanks for calling.", shopName),
    "Thanks for calling. This call may be recorded and is answered by an automated receptionist for Summit Heating & Air.",
  );
  const own = "Hi! This call is recorded by our AI assistant. How can we help?";
  assert.equal(openingWithNotice(own, shopName), own);
  const config = buildVapiAssistantConfig({ businessName: shopName, systemPrompt: "x", greeting: "Thanks for calling.", webhookUrl: "https://example.test/hook" });
  assert.match(config.firstMessage, /may be recorded and is answered by an automated receptionist/);
});
