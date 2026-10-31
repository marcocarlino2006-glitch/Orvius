#!/usr/bin/env node
/*
 * Jobs search reaches every job the shop has ever had. The board loads all
 * open work and the latest closed jobs; a customer calling about an install
 * closed months ago must still be found, and older closed jobs page in.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { prisma } = await import("../src/lib/prisma.ts");
const { parseClosedCursor, closedCursor, jobSearchWhere, CLOSED_PAGE } = await import("../src/lib/job-search.ts");
const jobs = await import("../src/app/api/jobs/route.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];

async function makeShop() {
  const shop = await prisma.business.create({
    data: {
      name: `Search ${uid()}`,
      slug: `search-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
    },
  });
  made.push(shop.id);
  return shop;
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const get = async (query = "") => {
  const res = await jobs.GET(new Request(`http://localhost/api/jobs${query}`));
  assert.equal(res.status, 200);
  return res.json();
};

test("one or two characters do not search; phone digits match however typed", () => {
  assert.equal(jobSearchWhere("b1", " a "), null);
  const where = jobSearchWhere("b1", "(720) 555");
  assert.equal(where.businessId, "b1");
  assert.ok(JSON.stringify(where).includes('"contains":"720555"'));
  assert.ok(!JSON.stringify(jobSearchWhere("b1", "Maria")).includes("phone"));
});

test("the cursor round-trips and rejects junk", () => {
  const at = new Date("2026-03-01T10:00:00.000Z");
  assert.deepEqual(parseClosedCursor(closedCursor({ updatedAt: at, id: "job_9" })), { at, id: "job_9" });
  assert.equal(parseClosedCursor("nonsense"), null);
  assert.equal(parseClosedCursor("not-a-date_job"), null);
});

test("an old closed job beyond the board is found by search, only in this shop, and older closed jobs page in", async () => {
  const shop = await makeShop();
  const other = await makeShop();
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Rosalind Okafor", phone: "+17205550142", phoneNormalized: "+17205550142" } });
  const old = await prisma.job.create({
    data: { businessId: shop.id, customerId: customer.id, title: "Heat pump install", status: "completed", address: "88 Larkspur Ln" },
  });
  await prisma.$executeRaw`UPDATE "Job" SET "updatedAt" = ${new Date("2025-04-01T12:00:00Z")} WHERE "id" = ${old.id}`;
  const newer = Array.from({ length: CLOSED_PAGE + 5 }, (_, i) => ({
    businessId: shop.id,
    title: `Tune-up ${i}`,
    status: "completed",
  }));
  await prisma.job.createMany({ data: newer });
  await prisma.job.create({ data: { businessId: shop.id, title: "No heat", status: "scheduled", scheduledAt: new Date("2026-11-02T14:00:00Z") } });
  await prisma.job.create({ data: { businessId: other.id, title: "Heat pump install", status: "completed", address: "88 Larkspur Ln" } });

  signedInAs = shop.ownerEmail;
  const board = await get();
  assert.equal(board.closedTotal, CLOSED_PAGE + 6);
  assert.ok(board.closedNext, "more closed jobs than one page");
  assert.ok(board.jobs.some((j) => j.title === "No heat"), "open work is always on the board");
  assert.ok(!board.jobs.some((j) => j.id === old.id), "the old job is past the first page");

  for (const q of ["Rosalind", "larkspur", "720-555-0142", "Heat pump"]) {
    const found = await get(`?q=${encodeURIComponent(q)}`);
    assert.deepEqual(found.jobs.map((j) => j.id), [old.id], q);
    assert.equal(found.truncated, false);
  }

  const seen = new Set(board.jobs.map((j) => j.id));
  let cursor = board.closedNext;
  while (cursor) {
    const page = await get(`?closedBefore=${encodeURIComponent(cursor)}`);
    for (const j of page.jobs) {
      assert.ok(!seen.has(j.id), "no job repeats across pages");
      seen.add(j.id);
    }
    cursor = page.closedNext;
  }
  assert.ok(seen.has(old.id), "paging reaches the oldest closed job");
  assert.equal([...seen].length, CLOSED_PAGE + 7);
});

test("search needs a signed-in shop", async () => {
  signedInAs = null;
  const res = await jobs.GET(new Request("http://localhost/api/jobs?q=heat"));
  assert.equal(res.status, 401);
});
