#!/usr/bin/env node
/*
 * Efficiency is a feature: Ask must search the shop's whole history without
 * loading it. Retrieval used to read the newest 200 customers / 120 jobs /
 * 80 leads / 80 calls into memory on every question — so a long-time
 * customer outside that slice was invisible, and every question paid for
 * hundreds of rows it never used. Now the database does the searching.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("retrieval searches the database and keeps the recent-slice fallback", () => {
  const memory = read("src/lib/shop-memory.ts");
  assert.match(memory, /loadTargeted/, "targeted database search exists");
  assert.match(memory, /contains: term/, "matching happens in the query, not after loading rows");
  assert.match(memory, /loadRecent\(\)/, "the old recent slice remains the fallback");
  assert.match(memory, /targeted && !customers\.length/, "an empty targeted read falls back instead of answering 'no records'");
});

test("one shop lookup per Ask question, not one per reader", () => {
  const brain = read("src/lib/shop-brain.ts");
  assert.match(brain, /knownTimezone: tz/, "the record answerer reuses the shop lookup");
  assert.match(brain, /retrieveShopMemory\(recordQuery, businessId, tz\)/, "retrieval reuses it too");
  assert.match(read("src/lib/ask-direct.ts"), /knownTimezone/, "exact answers accept it");
  assert.match(read("src/lib/ask-answer.ts"), /knownTimezone/, "record answers accept it");
});

test("a customer older than the newest 200 is findable by name", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const businessId = `eff-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  try {
    await prisma.business.create({
      data: { id: businessId, name: "Efficiency Test HVAC", slug: businessId, timezone: "America/New_York" },
    });
    const base = Date.now();
    const rows = Array.from({ length: 210 }, (_, i) => ({
      businessId,
      name: i === 0 ? "Zebediah Oldcustomer" : `Customer Number ${i}`,
      phone: `+1312555${String(1000 + i)}`,
      phoneNormalized: `1312555${String(1000 + i)}`,
      lastSeenAt: new Date(base - (210 - i) * 60_000),
    }));
    await prisma.customer.createMany({ data: rows });
    const { retrieveShopMemory } = await import("../src/lib/shop-memory.ts");
    const found = await retrieveShopMemory("Zebediah Oldcustomer", businessId, "America/New_York");
    assert.ok(
      found.hits.some((h) => h.type === "customer" && h.title.includes("Zebediah")),
      "the oldest customer is found even though 209 newer customers exist",
    );
    const nobody = await retrieveShopMemory("Xylophone Nonexistent", businessId, "America/New_York");
    assert.equal(nobody.hits.filter((h) => h.title.includes("Xylophone")).length, 0, "invention still returns nothing");
  } finally {
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  }
});
