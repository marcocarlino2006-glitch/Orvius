/*
 * Command shows the receptionist's week the way Intercom shows Fin's: one
 * booking rate, then where every call went. Each figure counts the shop's own
 * records, and nothing appears before there is a caller to count.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { buildReceptionistCard, getReceptionistWeek } from "../src/lib/receptionist-week.ts";

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const DAY = 24 * 60 * 60 * 1000;

const week = (over = {}) => ({ windowDays: 7, answered: 0, realCallers: 0, booked: 0, handedToYou: 0, filtered: 0, replyMs: null, ...over });

test("the headline is the share of real callers booked, and spam doesn't count against it", () => {
  const card = buildReceptionistCard(week({ answered: 12, realCallers: 10, booked: 8, handedToYou: 1, filtered: 2, replyMs: 840 }));
  assert.deepEqual(card.headline, { value: "80%", label: "of real callers booked this week" });
  assert.equal(card.bookedShare, 8 / 10);
  const rows = Object.fromEntries(card.rows.map((r) => [r.label, r]));
  assert.equal(rows.Answered.value, "12 calls");
  assert.equal(rows["Became a job"].value, "8 jobs");
  assert.equal(rows["Became a job"].detail, "of 10 real callers");
  assert.equal(rows["Handed to you"].value, "1 call");
  assert.equal(rows["Filtered out"].value, "2 calls");
  assert.equal(rows["Typical reply"].value, "0.8s");
});

test("a quiet week has no rate, no bar and no invented reply time", () => {
  const card = buildReceptionistCard(week());
  assert.equal(card.headline, null);
  assert.equal(card.bookedShare, null);
  assert.ok(!card.rows.some((r) => r.label === "Typical reply"));
});

test("the week counts calls, real callers, bookings, hand-offs and filtered calls from the records", async () => {
  const shop = await prisma.business.create({ data: { name: "Rate Air", slug: `rate-${stamp()}`, environment: "test" } });
  try {
    const call = (over = {}) =>
      prisma.call.create({ data: { businessId: shop.id, direction: "inbound", status: "ended", ...over } });
    const old = new Date(Date.now() - 9 * DAY);
    const [c1, c2, c3, c4] = await Promise.all([call({ replyP50Ms: 700 }), call({ replyP50Ms: 900 }), call(), call()]);
    await call({ createdAt: old });
    await call({ direction: "outbound" });
    const booked = await prisma.lead.create({ data: { businessId: shop.id, callId: c1.id, status: "booked" } });
    await prisma.job.create({ data: { businessId: shop.id, leadId: booked.id, title: "AC repair" } });
    await prisma.lead.create({ data: { businessId: shop.id, callId: c2.id, status: "new" } });
    await prisma.lead.create({ data: { businessId: shop.id, callId: c3.id, status: "spam" } });
    await prisma.lead.create({ data: { businessId: shop.id, status: "new", source: "sms" } });
    await prisma.auditEvent.create({
      data: { businessId: shop.id, entityType: "lead", entityId: c4.id, action: "lead.escalated", actor: "orvius", summary: "Gas smell" },
    });

    const got = await getReceptionistWeek(shop.id);
    assert.deepEqual(got, { windowDays: 7, answered: 4, realCallers: 2, booked: 1, handedToYou: 1, filtered: 1, replyMs: 800 });
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("Command loads the week with the rest of its data and shows it in the rail", () => {
  const route = read("src/app/api/ring1/route.ts");
  assert.match(route, /getReceptionistWeek\(business\.id, 7, now\)/);
  assert.match(route, /outcomes,\n\s*receptionist,/);
  const command = read("src/components/ring1-command-center.tsx");
  assert.match(command, /<CommandReceptionist week=\{data\?\.receptionist\} \/>/);
});

test.after(() => prisma.$disconnect());
