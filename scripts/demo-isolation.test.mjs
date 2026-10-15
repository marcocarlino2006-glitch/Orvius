#!/usr/bin/env node
/*
 * A person's demo shop is a separate tenant that never reaches the outside
 * world, and opening it never gets in the way of their real shop.
 *  - Two tabs or a double click opening or resetting the demo leave exactly
 *    one demo shop, seeded once.
 *  - Opening the demo first does not count as "already has a shop": signup and
 *    paid checkout still create the real one, and it opens by default.
 *  - A demo row carrying a real line, Connect account or field-software
 *    connection from an older build still texts, dials, charges and pushes
 *    nothing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.TWILIO_ACCOUNT_SID = "AC_fake_for_fence_test";
process.env.TWILIO_AUTH_TOKEN = "fake";
process.env.TWILIO_PHONE_NUMBER = "+13125550999";
process.env.ENABLE_OWNER_SMS = "true";
delete process.env.RESEND_API_KEY;

const { ensureDemoWorkspace, resetDemoWorkspace } = await import("../src/lib/demo-workspace.ts");
const { findBusinessForOwner, isOnboardingComplete } = await import("../src/lib/provision-business.ts");
const { pickActiveShop, listShopAccess } = await import("../src/lib/workspace-access.ts");
const { isOwnerDemoWorkspace, DemoFenceError } = await import("../src/lib/demo-fence.ts");
const { isSimulatedWorkspace, isSimulatedSid } = await import("../src/lib/sms-simulation.ts");
const { sendSms } = await import("../src/lib/twilio-sms.ts");
const { startForwardTest } = await import("../src/lib/forward-test.ts");
const { createInvoiceCheckoutSession } = await import("../src/lib/invoice-pay.ts");
const { syncBusinessAssistant } = await import("../src/lib/sync-business-assistant.ts");
const { jobberAccessToken, enqueueJobberSync } = await import("../src/lib/jobber.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const cleanup = new Set();

async function demosFor(email) {
  return prisma.business.findMany({ where: { ownerEmail: email, environment: "demo", slug: { startsWith: "demo-" } } });
}

test.after(async () => {
  for (const id of cleanup) {
    await prisma.lead.deleteMany({ where: { businessId: id } }).catch(() => {});
    await prisma.business.delete({ where: { id } }).catch(() => {});
  }
  await prisma.provisionAttempt.deleteMany({ where: { key: { startsWith: "demo:" } } }).catch(() => {});
  await prisma.$disconnect();
});

test("five simultaneous first opens make one demo shop, seeded once", async () => {
  const baselineEmail = `base-${stamp()}@orvius.test`;
  const baseline = await ensureDemoWorkspace(baselineEmail, { seed: true });
  cleanup.add(baseline.business.id);
  const oneSeed = await prisma.job.count({ where: { businessId: baseline.business.id } });

  const email = `race-${stamp()}@orvius.test`;
  const results = await Promise.all(Array.from({ length: 5 }, () => ensureDemoWorkspace(email, { seed: true })));
  for (const r of results) cleanup.add(r.business.id);
  const demos = await demosFor(email);
  assert.equal(demos.length, 1, "one demo shop per person");
  assert.ok(results.every((r) => r.business.id === demos[0].id), "every tab opens the same shop");
  assert.equal(results.filter((r) => r.created).length, 1);
  assert.equal(await prisma.job.count({ where: { businessId: demos[0].id } }), oneSeed, "the sample week is not seeded twice");
});

test("simultaneous resets leave one fresh demo, and the real shop is untouched", async () => {
  const email = `reset-${stamp()}@orvius.test`;
  const real = await prisma.business.create({
    data: { name: "Real Plumbing", slug: `real-${stamp()}`, environment: "production", ownerEmail: email, hoursJson: "{}", servicesJson: "[]" },
  });
  cleanup.add(real.id);
  const realLead = await prisma.lead.create({ data: { businessId: real.id, name: "Real Customer", phone: "+13125550998", status: "new" } });
  const first = await ensureDemoWorkspace(email, { seed: true });
  cleanup.add(first.business.id);
  const oneSeed = await prisma.job.count({ where: { businessId: first.business.id } });

  const results = await Promise.all(Array.from({ length: 4 }, () => resetDemoWorkspace(email)));
  for (const r of results) cleanup.add(r.business.id);
  const demos = await demosFor(email);
  assert.equal(demos.length, 1, "one demo shop after the resets");
  assert.notEqual(demos[0].id, first.business.id);
  assert.equal(await prisma.job.count({ where: { businessId: demos[0].id } }), oneSeed);
  assert.ok(await prisma.business.findUnique({ where: { id: real.id } }));
  assert.ok(await prisma.lead.findUnique({ where: { id: realLead.id } }), "real customer kept");
  assert.ok(results.every((r) => r.business.id === demos[0].id), "every tab is pointed at the shop that exists");
  assert.equal(results.filter((r) => r.created).length, 1, "the resets collapse into one start-over");
});

test("opening the demo first does not stand in for the real shop", async () => {
  const email = `first-${stamp()}@orvius.test`;
  const demo = await ensureDemoWorkspace(email, { seed: true });
  cleanup.add(demo.business.id);
  assert.equal(await findBusinessForOwner(email), null, "signup and paid checkout still create the real shop");
  assert.equal(await isOnboardingComplete(email), false, "onboarding is not skipped");

  const real = await prisma.business.create({
    data: { name: "Real Electric", slug: `real-${stamp()}`, environment: "production", ownerEmail: email, hoursJson: "{}", servicesJson: "[]" },
  });
  cleanup.add(real.id);
  assert.equal((await findBusinessForOwner(email))?.id, real.id);
  const access = await listShopAccess(email);
  assert.equal(access.length, 2, "both shops stay reachable from the switcher");
  assert.equal(pickActiveShop(access, null)?.business.id, real.id, "with nothing remembered, the real shop opens");
  assert.equal(pickActiveShop(access, demo.business.id)?.business.id, demo.business.id, "a chosen demo stays chosen");
});

test("a demo row with a stored real line, Connect account and Jobber link reaches no provider", async () => {
  const email = `legacy-${stamp()}@orvius.test`;
  const { business } = await ensureDemoWorkspace(email);
  cleanup.add(business.id);
  const legacy = await prisma.business.update({
    where: { id: business.id },
    data: {
      twilioPhone: "+18475551234",
      vapiPhoneNumber: "+18475551234",
      vapiAssistantId: "asst_legacy",
      stripeConnectAccountId: "acct_legacy",
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
      stripeConnectDetailsSubmitted: true,
    },
  });
  assert.equal(isOwnerDemoWorkspace(legacy), true);
  assert.equal(await isSimulatedWorkspace(legacy.id), true, "a real-looking stored line does not make the demo live");

  const sms = await sendSms({ to: "+13125550141", body: "Your visit is booked", businessId: legacy.id, audience: "customer" });
  assert.ok(isSimulatedSid(sms?.sid), "the text is simulated, not sent through Twilio");

  const dialed = [];
  const client = { calls: { create: async (c) => (dialed.push(c), { sid: "CA_x" }) }, messages: {} };
  const forward = await startForwardTest({ business: legacy, businessNumber: "+18475550000", coverage: "all", client });
  assert.equal(forward.ok, false);
  assert.equal(dialed.length, 0, "no test call is placed");

  const invoice = await prisma.invoice.create({
    data: { businessId: legacy.id, amountCents: 42_000, status: "sent", publicToken: `tok-${stamp()}` },
  });
  await assert.rejects(
    createInvoiceCheckoutSession({ invoice, business: legacy }),
    (e) => e instanceof DemoFenceError,
    "no Stripe checkout is created",
  );

  const sync = await syncBusinessAssistant(legacy);
  assert.equal(sync.assistantUpdated, false, "the voice assistant is not pushed");
  assert.equal(sync.lineAttached, false);

  await prisma.jobberConnection.create({
    data: { businessId: legacy.id, accountId: "jb_legacy", status: "active", accessTokenEnc: "x", refreshTokenEnc: "x", accessExpiresAt: new Date(Date.now() + 3_600_000) },
  });
  const lead = await prisma.lead.create({ data: { businessId: legacy.id, name: "Maria Lopez", phone: "+13125550141", status: "new" } });
  assert.equal(await enqueueJobberSync({ businessId: legacy.id, leadId: lead.id }), false, "nothing queued for Jobber");
  assert.equal(await jobberAccessToken(legacy.id), null, "no Jobber token is ever handed out");
});

test("the public reference shop is not a person's demo and keeps its real line", () => {
  assert.equal(isOwnerDemoWorkspace({ environment: "demo", slug: "summit-hvac-demo" }), false);
  assert.equal(isOwnerDemoWorkspace({ environment: "production", slug: "demo-abc" }), false, "a real shop named demo-* is not fenced");
});
