#!/usr/bin/env node
/*
 * Callers on the line at the same moment asking for the same time. The
 * receptionist says "you're penciled in" only for a time a technician can
 * actually do — however the race falls.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { handleInCallToolCalls } from "../src/lib/in-call-tools.ts";
import { maxOverlap } from "./live-booking-load.mjs";

const prisma = new PrismaClient();

test("overlap counts what is happening at the same instant, and touching ends do not overlap", () => {
  assert.equal(maxOverlap([]), 0);
  assert.equal(maxOverlap([[0, 10], [10, 20]]), 1);
  assert.equal(maxOverlap([[0, 10], [5, 15], [8, 9]]), 3);
});

test("five callers holding the last technician's time at once: exactly one keeps it", async () => {
  const stamp = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const shop = await prisma.business.create({
    data: {
      name: "Race Heating",
      slug: `hold-race-${stamp}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      servicesJson: "[]",
    },
  });
  try {
    await prisma.technician.create({ data: { businessId: shop.id, name: "Only Tech", phone: "+15550001111", skillsJson: "[]" } });
    const calls = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.call.create({ data: { businessId: shop.id, vapiCallId: `race_${stamp}_${i}`, status: "in-progress" } }),
      ),
    );
    const shopForTools = { id: shop.id, name: shop.name, hoursJson: shop.hoursJson, timezone: shop.timezone, trade: shop.trade, servicesJson: shop.servicesJson };
    const [offer] = await handleInCallToolCalls({
      shop: shopForTools,
      callId: calls[0].id,
      toolCalls: [{ id: "c", name: "check_availability", args: { serviceType: "Furnace blowing cold air" } }],
    });
    const slot = offer.result.match(/\[slot ([^\]]+)\]/)?.[1];
    assert.ok(slot, offer.result);

    const replies = await Promise.all(
      calls.map((call) =>
        handleInCallToolCalls({
          shop: shopForTools,
          callId: call.id,
          toolCalls: [{ id: "h", name: "hold_appointment", args: { slot, serviceType: "Furnace blowing cold air" } }],
        }).then(([r]) => r.result),
      ),
    );
    const held = replies.filter((r) => r.startsWith("Held "));
    assert.equal(held.length, 1, replies.join("\n"));
    assert.equal(replies.filter((r) => /just taken/.test(r)).length, 4);

    const holding = await prisma.call.count({ where: { businessId: shop.id, heldSlotAt: new Date(slot) } });
    assert.equal(holding, 1, "the losers let go of the time");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
