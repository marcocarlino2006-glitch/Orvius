import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { getShiftTimeline } from "../src/lib/shift-timeline.ts";

const prisma = new PrismaClient();

function unique(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

test("the shift timeline is measured, deduplicated, sorted, and tenant scoped", async (t) => {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [shop, otherShop] = await Promise.all([
    prisma.business.create({
      data: { name: "Shift Proof HVAC", slug: unique("shift-proof") },
    }),
    prisma.business.create({
      data: { name: "Other Shift HVAC", slug: unique("other-shift") },
    }),
  ]);

  t.after(async () => {
    await prisma.business.deleteMany({
      where: { id: { in: [shop.id, otherShop.id] } },
    });
    await prisma.$disconnect();
  });

  const call = await prisma.call.create({
    data: {
      businessId: shop.id,
      status: "completed",
      summary: "No heat after hours",
      createdAt: new Date(Date.now() - 50 * 60 * 1000),
    },
  });
  const callLead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      callId: call.id,
      name: "Dana",
      serviceType: "No heat",
      source: "call",
      createdAt: call.createdAt,
    },
  });
  const textLead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      name: "Renee",
      serviceType: "Burst pipe",
      source: "sms",
      createdAt: new Date(Date.now() - 40 * 60 * 1000),
    },
  });
  const job = await prisma.job.create({
    data: {
      businessId: shop.id,
      leadId: callLead.id,
      title: "No heat — Dana",
      status: "completed",
      createdAt: new Date(Date.now() - 35 * 60 * 1000),
      completedAt: new Date(Date.now() - 10 * 60 * 1000),
      resolutionSummary: "Replaced failed igniter",
      finalAmountCents: 42500,
    },
  });
  const deposit = await prisma.deposit.create({
    data: {
      businessId: shop.id,
      leadId: textLead.id,
      amountCents: 4900,
      sentAt: new Date(Date.now() - 30 * 60 * 1000),
      paidAt: new Date(Date.now() - 20 * 60 * 1000),
      status: "paid",
    },
  });
  const sentAlert = await prisma.ownerNotification.create({
    data: {
      businessId: shop.id,
      leadId: callLead.id,
      channel: "sms",
      dedupeKey: unique("shift-alert"),
      status: "sent",
      processedAt: new Date(Date.now() - 25 * 60 * 1000),
    },
  });
  await prisma.ownerNotification.create({
    data: {
      businessId: shop.id,
      leadId: textLead.id,
      channel: "email",
      dedupeKey: unique("pending-alert"),
      status: "pending",
    },
  });
  const otherLead = await prisma.lead.create({
    data: {
      businessId: otherShop.id,
      name: "Cross tenant",
      serviceType: "Must not appear",
      source: "sms",
    },
  });

  const events = await getShiftTimeline(shop.id, since);
  const keys = events.map((event) => event.key);

  assert.ok(keys.includes(`call_captured:${call.id}`));
  assert.ok(
    !keys.includes(`lead_captured:${callLead.id}`),
    "the lead attached to a call must not double-count the same inbound touch",
  );
  assert.ok(keys.includes(`lead_captured:${textLead.id}`));
  assert.ok(keys.includes(`job_booked:${job.id}`));
  assert.ok(keys.includes(`job_completed:${job.id}`));
  assert.ok(keys.includes(`deposit_sent:${deposit.id}`));
  assert.ok(keys.includes(`deposit_paid:${deposit.id}`));
  assert.ok(keys.includes(`owner_alerted:${sentAlert.id}:sms`));
  assert.ok(
    !events.some((event) => event.key.includes(otherLead.id)),
    "another shop's events must never enter this feed",
  );
  assert.equal(
    events.find((event) => event.key === `deposit_paid:${deposit.id}`)
      ?.amountCents,
    4900,
  );
  assert.equal(new Set(keys).size, keys.length, "every timeline key is unique");
  assert.deepEqual(
    events.map((event) => event.at),
    events.map((event) => event.at).toSorted().reverse(),
    "newest measured event renders first",
  );
});
