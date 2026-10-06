#!/usr/bin/env node
/*
 * The scale audit, item by item: each test pins one way the business could
 * have failed at scale — a takeover, a silent line, a cost leak — so it stays
 * fixed.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

delete process.env.RESEND_API_KEY;

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

const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];

async function makeShop(overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: `Audit ${uid()}`,
      slug: `audit-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
  made.push(shop.id);
  return shop;
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

function patch(body) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("1. a manager cannot take the shop by changing the owner email; the owner still can", async () => {
  const { PATCH } = await import("../src/app/api/account/route.ts");
  const shop = await makeShop();
  const manager = `mgr-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });

  signedInAs = manager;
  const takeover = await PATCH(patch({ ownerEmail: manager }));
  assert.equal(takeover.status, 403);
  assert.match((await takeover.json()).error, /owns the shop/);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).ownerEmail, shop.ownerEmail);

  // The settings form sends the unchanged owner email on every save; that must keep working for managers.
  const save = await PATCH(patch({ ownerEmail: shop.ownerEmail.toUpperCase(), name: "Renamed by manager" }));
  assert.equal(save.status, 200);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).name, "Renamed by manager");

  signedInAs = shop.ownerEmail;
  const next = `new-owner-${uid()}@example.test`;
  const transfer = await PATCH(patch({ ownerEmail: next }));
  assert.equal(transfer.status, 200);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).ownerEmail, next);
  signedInAs = null;
});
