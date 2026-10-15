#!/usr/bin/env node
/*
 * The shop export never cuts records silently: it states totals, says when a
 * file is not everything, and links the next page until every record is out.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { GET, EXPORT_PAGE } = await import("../src/app/api/account/export/route.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
let shopId = null;

test("past one page of leads, the file says so and the next page holds the rest", async () => {
  const owner = `export-${uid()}@example.test`;
  const shop = await prisma.business.create({
    data: { name: "Export HVAC", slug: `export-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", ownerEmail: owner },
  });
  shopId = shop.id;
  const n = EXPORT_PAGE.leads + 1;
  await prisma.lead.createMany({ data: Array.from({ length: n }, (_, i) => ({ businessId: shop.id, name: `Lead ${i}`, phone: `+1312555${String(i).padStart(4, "0")}` })) });
  signedInAs = owner;

  const first = await (await GET(new Request("http://local.test/api/account/export"))).json();
  assert.equal(first.complete, false);
  assert.equal(first.totals.leads, n);
  assert.equal(first.leads.length, EXPORT_PAGE.leads);
  assert.deepEqual(first.continuesIn, ["leads"]);
  assert.equal(first.nextPage, "/api/account/export?page=1");

  const res = await GET(new Request(`http://local.test${first.nextPage}`));
  assert.match(res.headers.get("Content-Disposition"), /-part2\.json"/);
  const second = await res.json();
  assert.equal(second.leads.length, 1);
  assert.equal(second.nextPage, null);
  const ids = new Set([...first.leads, ...second.leads].map((l) => l.id));
  assert.equal(ids.size, n, "every lead appears exactly once across the pages");
});

test("a small shop's export is one complete file", async () => {
  const owner = `export-${uid()}@example.test`;
  const shop = await prisma.business.create({
    data: { name: "Small HVAC", slug: `export-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", ownerEmail: owner },
  });
  await prisma.lead.create({ data: { businessId: shop.id, name: "One" } });
  signedInAs = owner;
  const body = await (await GET(new Request("http://local.test/api/account/export"))).json();
  assert.equal(body.complete, true);
  assert.equal(body.nextPage, null);
  await prisma.business.delete({ where: { id: shop.id } });
});

test.after(async () => {
  if (shopId) await prisma.business.delete({ where: { id: shopId } }).catch(() => {});
  await prisma.$disconnect();
});
