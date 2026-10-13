#!/usr/bin/env node
/*
 * Which paying shops lean on Orvius and which are slipping: calls and bookings
 * against the two weeks before, and whether anyone in the shop still acts in
 * it. Slipping shops are named on the founders' board and in the weekly email.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const { judgeReliance, payingShopReliance } = await import("../src/lib/shop-reliance.ts");
const { relianceLines } = await import("../src/lib/reliance-lines.ts");

const prisma = new PrismaClient();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const DAY = 86_400_000;
const now = new Date();
const old = new Date(now.getTime() - 90 * DAY);
const facts = (over) => ({ shopId: "s", name: "Summit", createdAt: old, calls: 20, callsBefore: 20, jobs: 6, jobsBefore: 6, activeDays: 8, ...over });

test("a shop is judged on its trend and its people, not one number", () => {
  assert.equal(judgeReliance(facts({}), now).verdict, "relies");
  assert.equal(judgeReliance(facts({ calls: 5, activeDays: 2 }), now).verdict, "slipping", "calls halved");
  assert.match(judgeReliance(facts({ calls: 5 }), now).reason, /still forwards/);
  assert.equal(judgeReliance(facts({ jobs: 2 }), now).verdict, "slipping", "bookings halved");
  assert.match(judgeReliance(facts({ jobs: 2 }), now).reason, /open time/);
  assert.equal(judgeReliance(facts({ activeDays: 0 }), now).verdict, "slipping", "nobody uses it");
  assert.equal(judgeReliance(facts({ calls: 3, callsBefore: 2, jobs: 1, jobsBefore: 1, activeDays: 2 }), now).verdict, "steady", "a small shop isn't slipping for being small");
  assert.equal(judgeReliance(facts({ createdAt: new Date(now.getTime() - 10 * DAY), calls: 0, activeDays: 0 }), now).verdict, "too_new");
});

test("the board names slipping shops and counts the ones relying on Orvius", () => {
  const all = [
    judgeReliance(facts({ name: "A" }), now),
    judgeReliance(facts({ name: "B", calls: 4 }), now),
    judgeReliance(facts({ name: "C", createdAt: now }), now),
  ];
  const lines = relianceLines(all);
  assert.equal(lines[0], "Shops relying on Orvius, 14 days: 1 of 2");
  assert.equal(lines[1], "Shops slipping: 1");
  assert.match(lines[2], /^  - B: Calls halved/);
  assert.deepEqual(relianceLines([]), ["Shops relying on Orvius: none old enough to judge yet", "Shops slipping: none"]);
});

test("counted from the shop's own records: inbound calls, booked jobs, and days people acted", async () => {
  const shop = await prisma.business.create({
    data: { name: "Reliance Air", slug: `rel-${Date.now()}`, environment: "production", isActive: true, billingStatus: "active", createdAt: old },
  });
  try {
    const at = (daysAgo) => new Date(now.getTime() - daysAgo * DAY);
    for (const d of [20, 19, 18, 17, 16, 15]) await prisma.call.create({ data: { businessId: shop.id, direction: "inbound", createdAt: at(d) } });
    await prisma.call.create({ data: { businessId: shop.id, direction: "inbound", createdAt: at(2) } });
    await prisma.call.create({ data: { businessId: shop.id, direction: "outbound", createdAt: at(1) } });
    for (const d of [3, 3, 1]) {
      await prisma.auditEvent.create({
        data: { businessId: shop.id, entityType: "shop", entityId: shop.id, action: "settings.updated", actor: "owner", summary: "x", createdAt: at(d) },
      });
    }
    await prisma.auditEvent.create({
      data: { businessId: shop.id, entityType: "shop", entityId: shop.id, action: "call.ingested", actor: "orvius", summary: "x", createdAt: at(1) },
    });
    const mine = (await payingShopReliance(now)).find((r) => r.shopId === shop.id);
    assert.deepEqual([mine.calls, mine.callsBefore, mine.activeDays], [1, 6, 2], "outbound calls and Orvius's own actions don't count");
    assert.equal(mine.verdict, "slipping");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("wired into the admin board and the founders' weekly email, without the database in the browser bundle", () => {
  assert.doesNotMatch(read("src/lib/reliance-lines.ts"), /from "@\/lib\/prisma"/);
  assert.match(read("src/lib/reliance-lines.ts"), /^import type /m);
  assert.match(read("src/app/admin/page.tsx"), /relianceLines\(board\.reliance \?\? \[\]\)/);
  assert.doesNotMatch(read("src/app/admin/page.tsx"), /@\/lib\/shop-reliance/);
  const board = read("src/lib/company-scoreboard.ts");
  assert.match(board, /payingShopReliance\(now\)/);
  assert.match(board, /\.\.\.relianceLines\(board\.reliance \?\? \[\]\)/);
});
