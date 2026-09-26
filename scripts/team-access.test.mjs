#!/usr/bin/env node
/*
 * Teammates and multi-location access: who can open which shop, what each
 * role may do, and that every team change lands in the audit trail.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

delete process.env.RESEND_API_KEY;
const { prisma } = await import("../src/lib/prisma.ts");
const access = await import("../src/lib/workspace-access.ts");
const team = await import("../src/lib/team.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const made = [];

async function makeShop(overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: `Team ${uid()}`,
      slug: `team-${Date.now()}-${uid()}`,
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

test("one person can open every shop they own or were added to, and pick which", async () => {
  const operator = `ops-${uid()}@example.test`;
  const north = await makeShop({ ownerEmail: operator, name: "North" });
  const south = await makeShop({ name: "South" });
  const closed = await makeShop({ isActive: false });
  await prisma.membership.create({ data: { businessId: south.id, email: operator, role: "manager" } });
  await prisma.membership.create({ data: { businessId: closed.id, email: operator, role: "manager" } });

  const shops = await access.listShopAccess(operator.toUpperCase());
  assert.deepEqual(shops.map((s) => [s.business.id, s.role]), [[north.id, "owner"], [south.id, "manager"]]);
  assert.equal(access.pickActiveShop(shops, south.id).business.id, south.id);
  assert.equal(access.pickActiveShop(shops, closed.id).business.id, north.id, "a shop you lost access to falls back");
  assert.equal(access.pickActiveShop(shops, null).business.id, north.id);
  assert.equal((await access.resolveShopAccess(operator, south.id)).role, "manager");

  assert.equal(await access.hasAnyShopAccess(operator), true);
  assert.equal(await access.hasAnyShopAccess(`nobody-${uid()}@example.test`), false);
});

test("roles grant exactly what they say", () => {
  const all = ["settings.edit", "team.manage", "data.export", "billing.manage", "workspace.delete"];
  assert.deepEqual(all.filter((p) => access.can("owner", p)), all);
  assert.deepEqual(all.filter((p) => access.can("manager", p)), ["settings.edit", "team.manage", "data.export"]);
  assert.deepEqual(all.filter((p) => access.can("dispatcher", p)), []);
});

test("inviting validates, refuses duplicates and the owner, and is audited", async () => {
  const shop = await makeShop();
  const by = shop.ownerEmail;
  assert.equal((await team.inviteTeammate({ business: shop, email: "not-an-email", role: "dispatcher", invitedBy: by })).status, 400);
  assert.equal((await team.inviteTeammate({ business: shop, email: "a@b.co", role: "owner", invitedBy: by })).status, 400);
  assert.equal((await team.inviteTeammate({ business: shop, email: shop.ownerEmail, role: "manager", invitedBy: by })).status, 409);

  const email = `Dispatch-${uid()}@Example.test`;
  const added = await team.inviteTeammate({ business: shop, email, role: "dispatcher", invitedBy: by });
  assert.equal(added.ok, true);
  assert.equal(added.emailed, false);
  assert.match(added.signInUrl, /\/signin$/);
  assert.equal(added.person.email, email.toLowerCase());
  assert.equal((await team.inviteTeammate({ business: shop, email, role: "manager", invitedBy: by })).status, 409);

  const people = await team.listTeam(shop, by);
  assert.deepEqual(people.map((p) => [p.email, p.role, p.you]), [[by, "owner", true], [email.toLowerCase(), "dispatcher", false]]);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "team.added" } });
  assert.equal(audit.actor, "owner");
  assert.match(audit.summary, /Dispatcher access/);
});

test("role changes and removals are scoped to the shop, and a dispatcher can only leave", async () => {
  const shop = await makeShop();
  const other = await makeShop();
  const manager = await prisma.membership.create({ data: { businessId: shop.id, email: `m-${uid()}@example.test`, role: "manager" } });
  const dispatcher = await prisma.membership.create({ data: { businessId: shop.id, email: `d-${uid()}@example.test`, role: "dispatcher" } });

  assert.equal((await team.changeTeammateRole({ businessId: other.id, membershipId: dispatcher.id, role: "manager", by: other.ownerEmail, byOwner: true })).status, 404);
  assert.equal((await team.changeTeammateRole({ businessId: shop.id, membershipId: manager.id, role: "dispatcher", by: manager.email, byOwner: false })).status, 400);
  assert.equal((await team.changeTeammateRole({ businessId: shop.id, membershipId: dispatcher.id, role: "manager", by: manager.email, byOwner: false })).ok, true);
  assert.equal((await prisma.membership.findUnique({ where: { id: dispatcher.id } })).role, "manager");

  await prisma.membership.update({ where: { id: dispatcher.id }, data: { role: "dispatcher" } });
  const blocked = await team.removeTeammate({ businessId: shop.id, membershipId: manager.id, by: dispatcher.email, byOwner: false, canManage: false });
  assert.equal(blocked.status, 403);
  const left = await team.removeTeammate({ businessId: shop.id, membershipId: dispatcher.id, by: dispatcher.email, byOwner: false, canManage: false });
  assert.deepEqual(left, { ok: true, self: true });
  assert.equal(await access.hasAnyShopAccess(dispatcher.email), false);
  assert.ok(await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "team.left" } }));
});

test("every route that bypassed the shared lookup now respects roles and teammates", () => {
  assert.match(read("src/auth.ts"), /hasAnyShopAccess\(email\)/);
  assert.match(read("src/app/api/account/route.ts"), /can\(access\.role, "settings\.edit"\)/);
  assert.match(read("src/app/api/account/export/route.ts"), /requirePermission\("data\.export"/);
  assert.match(read("src/app/api/account/delete/route.ts"), /requirePermission\("workspace\.delete"/);
  assert.match(read("src/app/api/account/sync-assistant/route.ts"), /requirePermission\("settings\.edit"/);
  assert.match(read("src/app/api/billing/portal/route.ts"), /requirePermission\("billing\.manage"/);
  assert.match(read("src/app/api/team/route.ts"), /requirePermission\("team\.manage"\)/);
  assert.match(read("src/lib/provision-business.ts"), /resolveShopAccess\(email\)/);
});
