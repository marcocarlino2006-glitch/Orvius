#!/usr/bin/env node
/*
 * Lost confirmations: a booking whose after-response text never ran gets one
 * retry from the 30-minute cron. Jobs that already recorded an outcome, owner
 * jobs with no lead, fresh bookings still inside the grace window, and old or
 * past visits are left alone.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { retryLostConfirmations } = await import("../src/lib/confirm-sweep.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const NOW = new Date("2026-10-02T15:00:00Z");
const minsAgo = (m) => new Date(NOW.getTime() - m * 60_000);
const hoursAhead = (h) => new Date(NOW.getTime() + h * 3_600_000);

test("only bookings whose confirmation outcome was never recorded are retried, once", async () => {
  const shop = await prisma.business.create({
    data: {
      name: "Sweep HVAC",
      slug: `sweep-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "live",
    },
  });
  try {
    const job = async (label, { lead = true, createdAt = minsAgo(20), scheduledAt = hoursAhead(20), ...data } = {}) => {
      const l = lead
        ? await prisma.lead.create({ data: { businessId: shop.id, name: label, phone: "+13125550147", source: "call" } })
        : null;
      return prisma.job.create({
        data: { businessId: shop.id, leadId: l?.id ?? null, title: label, status: "scheduled", scheduledAt, createdAt, ...data },
      });
    };

    const lost = await job("lost");
    const recorded = await job("recorded");
    await prisma.auditEvent.create({
      data: {
        businessId: shop.id,
        entityType: "job",
        entityId: recorded.id,
        action: "customer.confirmation_skipped",
        summary: "no phone",
        idempotencyKey: `job:${recorded.id}:confirmation`,
      },
    });
    const fresh = await job("fresh", { createdAt: minsAgo(2) });
    const old = await job("old", { createdAt: minsAgo(60 * 8) });
    const past = await job("past", { scheduledAt: minsAgo(30) });
    const ownerMade = await job("owner", { lead: false });
    const sentAlready = await job("sent", { customerConfirmSentAt: minsAgo(15) });

    const calls = [];
    const confirm = async (id) => {
      calls.push(id);
      return { sent: true };
    };

    const first = await retryLostConfirmations({ now: NOW, confirm });
    assert.deepEqual(calls, [lost.id]);
    assert.equal(first.sent, 1);
    for (const skip of [recorded, fresh, old, past, ownerMade, sentAlready]) {
      assert.ok(!calls.includes(skip.id), `${skip.title} must not be retried`);
    }

    const row = await prisma.auditEvent.findFirst({ where: { idempotencyKey: `job:${lost.id}:confirmation` } });
    assert.equal(row?.action, "customer.confirmation_sent");

    await retryLostConfirmations({ now: NOW, confirm });
    assert.deepEqual(calls, [lost.id], "the recorded outcome stops a second retry");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
