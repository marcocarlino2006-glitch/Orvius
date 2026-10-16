#!/usr/bin/env node
/*
 * Being on the team is not money, integration or team-admin power.
 * Disposable database, no providers: a dispatcher bills a job and logs cash in
 * hand, but can't change a bill the customer already has, vouch for a payment
 * nobody took, edit prices, connect integrations or manage the team; an
 * approved plan is rechecked for freshness before anything happens.
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

const { can } = await import("../src/lib/workspace-access-labels.ts");
const paymentsRoute = await import("../src/app/api/payments/route.ts");
const invoiceRoute = await import("../src/app/api/jobs/[id]/invoice/route.ts");
const priceBookRoute = await import("../src/app/api/price-book/route.ts");
const { executeProposal, PROPOSAL_FRESH_MS } = await import("../src/lib/copilot-execute.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];

test.after(async () => {
  signedInAs = null;
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
});

async function shopWith(role) {
  const shop = await prisma.business.create({
    data: { name: "Authority HVAC", slug: `auth-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro", ownerEmail: `owner-${uid()}@example.test` },
  });
  made.push(shop.id);
  const member = `${role}-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: member, role } });
  return { shop, member };
}

const json = (url, method, body) => new Request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

test("money, integration and team rights come from the role, not from being a member", () => {
  for (const permission of ["money.adjust", "settings.edit", "team.manage", "billing.manage", "command.approve"]) {
    assert.equal(can("dispatcher", permission), false, permission);
    assert.equal(can("owner", permission), true, permission);
  }
  assert.equal(can("manager", "money.adjust"), false, "a manager needs a scoped money grant from the owner");
  assert.equal(can("manager", "billing.manage"), false);
});

test("a dispatcher logs cash in hand but can't vouch for an 'I paid' or edit prices", async () => {
  const { shop, member } = await shopWith("dispatcher");
  const job = await prisma.job.create({ data: { businessId: shop.id, title: "Tune-up", status: "completed" } });
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 18_500, status: "open", publicToken: `tok-${uid()}` } });
  await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 18_500, status: "claimed", method: "customer:zelle" } });
  signedInAs = member;
  try {
    const confirm = await paymentsRoute.POST(json("http://x/api/payments", "POST", { invoiceId: invoice.id, action: "confirm" }));
    assert.equal(confirm.status, 403);
    assert.match((await confirm.json()).error, /Ask the shop owner/);
    assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "open", "the claim didn't settle the bill");
    assert.equal((await paymentsRoute.POST(json("http://x/api/payments", "POST", { invoiceId: invoice.id, action: "reject" }))).status, 403);

    const priced = await priceBookRoute.POST(json("http://x/api/price-book", "POST", { name: "Capacitor", kind: "part", unitCents: 9_000 }));
    assert.equal(priced.status, 403);
    assert.equal(await prisma.priceBookItem.count({ where: { businessId: shop.id } }), 0);

    const record = await paymentsRoute.POST(json("http://x/api/payments", "POST", { invoiceId: invoice.id, action: "record", method: "cash" }));
    assert.equal(record.status, 200, "cash the team took in hand is still theirs to log");
  } finally {
    signedInAs = null;
  }
});

test("a dispatcher can bill a job but not change a bill the customer already has, even with a reason", async () => {
  const { shop, member } = await shopWith("dispatcher");
  const job = await prisma.job.create({ data: { businessId: shop.id, title: "Repair", status: "completed" } });
  await prisma.invoice.create({ data: { businessId: shop.id, jobId: job.id, amountCents: 18_500, status: "open", sentAt: new Date(), publicToken: `tok-${uid()}` } });
  const fresh = await prisma.job.create({ data: { businessId: shop.id, title: "Second visit", status: "completed" } });
  signedInAs = member;
  try {
    const post = (id, body) => invoiceRoute.POST(json(`http://x/api/jobs/${id}/invoice`, "POST", body), { params: Promise.resolve({ id }) });
    assert.equal((await post(fresh.id, { totalCents: 12_000 })).status, 200);
    assert.equal((await post(job.id, { totalCents: 27_500, reason: "Extra part" })).status, 403);
    assert.equal((await prisma.invoice.findFirst({ where: { jobId: job.id } })).amountCents, 18_500);
  } finally {
    signedInAs = null;
  }
  const { shop: other, member: manager } = await shopWith("manager");
  const otherJob = await prisma.job.create({ data: { businessId: other.id, title: "Repair", status: "completed" } });
  await prisma.invoice.create({ data: { businessId: other.id, jobId: otherJob.id, amountCents: 18_500, status: "open", sentAt: new Date(), publicToken: `tok-${uid()}` } });
  signedInAs = manager;
  try {
    const revise = () => invoiceRoute.POST(json(`http://x/api/jobs/${otherJob.id}/invoice`, "POST", { totalCents: 27_500, reason: "Extra part" }), { params: Promise.resolve({ id: otherJob.id }) });
    assert.equal((await revise()).status, 403, "manager role alone is not money authority");
    const { grantMoneyAuthority } = await import("../src/lib/money-authority.ts");
    await grantMoneyAuthority({ businessId: other.id, ownerEmail: other.ownerEmail, granteeEmail: manager, scope: "revise_bill", days: 7 });
    const res = await revise();
    assert.equal(res.status, 200);
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: other.id, action: "invoice.revised" } });
    assert.equal(audit.actor, "teammate");
    assert.equal(audit.actorEmail, manager);
  } finally {
    signedInAs = null;
  }
});

test("an approved plan made on an old picture of the shop is refused before anything happens", async () => {
  const { shop } = await shopWith("dispatcher");
  const lead = await prisma.lead.create({ data: { businessId: shop.id, phone: "+15550008888", name: "Rae" } });
  const old = await prisma.copilotAction.create({
    data: { businessId: shop.id, action: "mark_contacted", paramsJson: JSON.stringify({ leadId: lead.id }), preview: "Mark Rae contacted", status: "proposed", createdAt: new Date(Date.now() - PROPOSAL_FRESH_MS - 60_000) },
  });
  const out = await executeProposal({ business: shop, proposalId: old.id, by: { role: "owner", email: shop.ownerEmail } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "proposal_stale");
  assert.match(out.error, /Nothing was changed/);
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: old.id } })).status, "proposed");
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "new");
});

test("a follow-up text approved after the lead was booked doesn't go out, and says nothing changed", async () => {
  const { shop } = await shopWith("dispatcher");
  const lead = await prisma.lead.create({ data: { businessId: shop.id, phone: "+15550009999", name: "Sam", status: "booked" } });
  const plan = await prisma.copilotAction.create({
    data: { businessId: shop.id, action: "sms_followup", paramsJson: JSON.stringify({ leadId: lead.id }), preview: "Text Sam", status: "proposed" },
  });
  const out = await executeProposal({ business: shop, proposalId: plan.id, by: { role: "owner", email: shop.ownerEmail } });
  assert.equal(out.ok, false);
  assert.equal(out.reason, "lead_moved_on");
  assert.match(out.error, /already marked booked.*Nothing was changed/);
  assert.equal((await prisma.copilotAction.findUnique({ where: { id: plan.id } })).status, "proposed", "the claim is released, not left executing");
  assert.equal(await prisma.smsIntent.count({ where: { businessId: shop.id } }).catch(() => 0), 0);
});
