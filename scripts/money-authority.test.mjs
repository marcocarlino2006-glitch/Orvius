#!/usr/bin/env node
/*
 * Money authority is scoped, explicit and checked when the action runs.
 * Disposable database, no providers. A manager has no money power from the
 * role; the owner grants one kind of action, optionally capped, for a set
 * number of days. Revoked, expired, old-policy, over-limit, wrong-scope and
 * removed-teammate grants all refuse, through the real routes.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY", "STRIPE_SECRET_KEY"]) delete process.env[key];

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const paymentsRoute = await import("../src/app/api/payments/route.ts");
const priceBookRoute = await import("../src/app/api/price-book/route.ts");
const priceBookItemRoute = await import("../src/app/api/price-book/[id]/route.ts");
const recordContractRoute = await import("../src/app/api/record-contract/route.ts");
const grantsRoute = await import("../src/app/api/money-grants/route.ts");
const { checkMoneyAuthority, FINANCIAL_POLICY_VERSION } = await import("../src/lib/money-authority.ts");
const { raiseReconciliation } = await import("../src/lib/system-of-record.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const json = (url, method, body) => new Request(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

test.after(async () => {
  signedInAs = null;
  await prisma.$disconnect();
});

async function shop() {
  const owner = `owner-${uid()}@example.test`;
  const business = await prisma.business.create({
    data: { name: "Money HVAC", slug: `money-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", ownerEmail: owner },
  });
  const manager = `manager-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: business.id, email: manager, role: "manager" } });
  return { business, owner, manager };
}

async function claimedBill(businessId, cents) {
  const job = await prisma.job.create({ data: { businessId, title: "Repair", status: "completed" } });
  const invoice = await prisma.invoice.create({ data: { businessId, jobId: job.id, amountCents: cents, status: "open", publicToken: `tok-${uid()}` } });
  await prisma.payment.create({ data: { businessId, invoiceId: invoice.id, amountCents: cents, status: "claimed", method: "customer:zelle" } });
  return invoice;
}

async function as(email, run) {
  signedInAs = email;
  try {
    return await run();
  } finally {
    signedInAs = null;
  }
}

const grant = (email, body) => as(email, () => grantsRoute.POST(json("http://x/api/money-grants", "POST", body)));
const confirm = (email, invoiceId) => as(email, () => paymentsRoute.POST(json("http://x/api/payments", "POST", { invoiceId, action: "confirm" })));

test("only the owner issues money grants, and only to current teammates", async () => {
  const { owner, manager } = await shop();
  assert.equal((await grant(manager, { granteeEmail: manager, scope: "confirm_payment", days: 7 })).status, 403, "a manager can't grant themselves");
  assert.equal((await grant(owner, { granteeEmail: `stranger-${uid()}@example.test`, scope: "confirm_payment", days: 7 })).status, 404);
  assert.equal((await grant(owner, { granteeEmail: manager, scope: "everything", days: 7 })).status, 400);
  assert.equal((await grant(owner, { granteeEmail: manager, scope: "confirm_payment", days: 365 })).status, 400, "no open-ended grants");
  assert.equal((await grant(owner, { granteeEmail: manager, scope: "confirm_payment", days: 7 })).status, 200);
});

test("a manager without a grant can't accept an 'I paid', edit prices or close a payment mismatch; the owner can", async () => {
  const { business, owner, manager } = await shop();
  const invoice = await claimedBill(business.id, 18_500);
  const refused = await confirm(manager, invoice.id);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).code, "money_authority");
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "open");
  const priced = await as(manager, () => priceBookRoute.POST(json("http://x/api/price-book", "POST", { name: "Tune-up", kind: "service", unitCents: 9_900 })));
  assert.equal(priced.status, 403);

  await raiseReconciliation({ businessId: business.id, kind: "payment", entityType: "invoice", entityId: invoice.id, system: "stripe", expected: { paid: 18_500 }, observed: { paid: 0 } });
  const exception = await prisma.reconciliationException.findFirstOrThrow({ where: { businessId: business.id, entityId: invoice.id } });
  const resolve = (email) => as(email, () => recordContractRoute.POST(json("http://x/api/record-contract", "POST", { id: exception.id, resolution: "Checked Stripe" })));
  assert.equal((await resolve(manager)).status, 403);
  assert.equal((await confirm(owner, invoice.id)).status, 200);
  assert.equal((await resolve(owner)).status, 200);
});

test("a grant covers one kind of action, up to its limit, and its use is logged with the grant id", async () => {
  const { business, owner, manager } = await shop();
  await grant(owner, { granteeEmail: manager, scope: "confirm_payment", maxCents: 20_000, days: 7 });
  const small = await claimedBill(business.id, 18_500);
  const large = await claimedBill(business.id, 45_000);
  assert.equal((await confirm(manager, small.id)).status, 200);
  const over = await confirm(manager, large.id);
  assert.equal(over.status, 403);
  assert.match((await over.json()).error, /over your \$200\.00 limit/);
  const used = await prisma.auditEvent.findFirstOrThrow({ where: { businessId: business.id, action: "money.grant_used" } });
  const g = await prisma.financialGrant.findFirstOrThrow({ where: { businessId: business.id } });
  assert.equal(JSON.parse(used.detailJson).grantId, g.id);
  assert.equal(used.actorEmail, manager);
  const priced = await as(manager, () => priceBookRoute.POST(json("http://x/api/price-book", "POST", { name: "Tune-up", kind: "service", unitCents: 9_900 })));
  assert.equal(priced.status, 403, "a payment grant is not a price-book grant");
});

test("checked at execution: revoked, expired, old-policy and removed-teammate grants refuse", async () => {
  const { business, owner, manager } = await shop();
  await grant(owner, { granteeEmail: manager, scope: "price_book", days: 7 });
  const actor = { businessId: business.id, role: "manager", email: manager };
  assert.equal((await checkMoneyAuthority(actor, "price_book")).allowed, true);
  const created = await as(manager, () => priceBookRoute.POST(json("http://x/api/price-book", "POST", { name: "Tune-up", kind: "service", unitCents: 9_900 })));
  assert.equal(created.status, 200);
  const itemId = (await created.json()).item.id;

  const g = await prisma.financialGrant.findFirstOrThrow({ where: { businessId: business.id } });
  assert.equal((await checkMoneyAuthority(actor, "price_book", null, new Date(g.expiresAt.getTime() + 1))).allowed, false, "expired");

  await prisma.financialGrant.update({ where: { id: g.id }, data: { policyVersion: "money-grants-v0" } });
  assert.equal((await checkMoneyAuthority(actor, "price_book")).allowed, false, "written under an older policy");
  await prisma.financialGrant.update({ where: { id: g.id }, data: { policyVersion: FINANCIAL_POLICY_VERSION } });

  await prisma.membership.delete({ where: { businessId_email: { businessId: business.id, email: manager } } });
  assert.equal((await checkMoneyAuthority(actor, "price_book")).allowed, false, "a removed teammate's grant doesn't outlive them");
  await prisma.membership.create({ data: { businessId: business.id, email: manager, role: "manager" } });

  assert.equal((await as(owner, () => grantsRoute.DELETE(json(`http://x/api/money-grants?id=${g.id}`, "DELETE")))).status, 200);
  const retire = await as(manager, () => priceBookItemRoute.DELETE(json(`http://x/api/price-book/${itemId}`, "DELETE"), { params: Promise.resolve({ id: itemId }) }));
  assert.equal(retire.status, 403, "revoked between two actions: the second is refused");
  assert.equal((await prisma.priceBookItem.findUnique({ where: { id: itemId } })).isActive, true);
  const listed = await as(owner, () => grantsRoute.GET());
  assert.equal((await listed.json()).grants[0].active, false);
});
