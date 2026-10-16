#!/usr/bin/env node
/*
 * Turning a test shop on is approved on our side, not just ticked in the
 * browser: the checkout refuses without the approval or with an approval of a
 * notice/permission set that has since changed, keeps who approved what and
 * when, and binds that approval to the paid checkout that turns the shop on.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY"]) delete process.env[key];
process.env.STRIPE_SECRET_KEY = "sk_test_activation";
process.env.STRIPE_PRICE_ID_LINE = "price_local_line";
process.env.STRIPE_PRICE_ID_PRO = "price_local_pro";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const sessions = [];
const realStripe = await import("../src/lib/stripe.ts");
mock.module(new URL("../src/lib/stripe.ts", import.meta.url).href, {
  namedExports: {
    ...realStripe,
    getStripe: () => ({
      checkout: {
        sessions: {
          list: async () => ({ data: [] }),
          expire: async () => ({}),
          create: async (params) => {
            sessions.push(params);
            return { id: `cs_test_act_${sessions.length}`, url: "https://checkout.stripe.test/s" };
          },
        },
      },
    }),
  },
});

const { NextRequest } = nextServer;
const { POST } = await import("../src/app/api/billing/checkout/route.ts");
const { activationVersions, bindActivationAck, checkActivationClaim } = await import("../src/lib/activation-ack.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const made = [];
test.after(async () => {
  await prisma.activationAcknowledgement.deleteMany({ where: { businessId: { in: made } } });
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

async function sandbox() {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const ownerEmail = `owner-${id}@example.test`;
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = ownerEmail;
  const business = await prisma.business.create({
    data: {
      name: "Sandbox Heating",
      slug: `act-${id}`,
      trade: "HVAC",
      ownerEmail,
      environment: "test",
      setupJson: JSON.stringify({ sandbox: true, permissions: "offer" }),
      greeting: "Thanks for calling Sandbox Heating.",
      bookingMode: "offer",
    },
  });
  made.push(business.id);
  return business;
}

const checkout = (body) =>
  POST(
    new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        planId: "pro",
        shop: { name: "Sandbox Heating", trade: "HVAC", ownerPhone: "+13035550111", acceptedTerms: true, acceptedSms: true },
        ...body,
      }),
    }),
  );

test("no approval, no checkout: the browser's tick is not enough", async () => {
  const shop = await sandbox();
  signedInAs = shop.ownerEmail;
  const before = sessions.length;
  const res = await checkout({});
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "activation_missing");
  assert.equal(sessions.length, before, "no Stripe session was opened");
  assert.equal(await prisma.activationAcknowledgement.count({ where: { businessId: shop.id } }), 0);
});

test("an approval of a notice or permissions that have since changed is refused", async () => {
  const shop = await sandbox();
  signedInAs = shop.ownerEmail;
  const seen = activationVersions(shop);
  await prisma.business.update({ where: { id: shop.id }, data: { greeting: "Hi, Sandbox Heating here, how can we help?" } });
  const res = await checkout({ activation: { recording: true, approved: true, ...seen } });
  assert.equal(res.status, 409);
  assert.equal((await res.json()).code, "activation_stale");

  const fresh = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
  await prisma.business.update({ where: { id: shop.id }, data: { bookingMode: "alert" } });
  const changed = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
  assert.equal(checkActivationClaim(changed, { recording: true, approved: true, ...activationVersions(fresh) })?.code, "activation_stale", "permissions changed");
});

test("a current approval is kept with the notice, permissions, versions, actor and time, and bound to the paid checkout once", async () => {
  const shop = await sandbox();
  signedInAs = shop.ownerEmail;
  const res = await checkout({ activation: { recording: true, approved: true, ...activationVersions(shop) } });
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const ack = await prisma.activationAcknowledgement.findFirstOrThrow({ where: { businessId: shop.id } });
  assert.equal(ack.actorEmail, shop.ownerEmail);
  assert.equal(ack.noticeVersion, activationVersions(shop).noticeVersion);
  assert.match(ack.noticeText, /Sandbox Heating/);
  assert.equal(JSON.parse(ack.permissionsJson).bookingMode, "offer");
  assert.ok(ack.acceptedRecording && ack.approvedTurnOn && ack.acceptedTerms && ack.acceptedSms);
  assert.ok(ack.termsVersion);
  assert.equal(sessions.at(-1).metadata.activation_ack, ack.id);

  assert.deepEqual(await bindActivationAck({ ackId: ack.id, businessId: shop.id, actorEmail: shop.ownerEmail, checkoutSessionId: "cs_paid_1" }), { bound: true });
  assert.deepEqual(await bindActivationAck({ ackId: ack.id, businessId: shop.id, actorEmail: shop.ownerEmail, checkoutSessionId: "cs_paid_1" }), { bound: true }, "webhook and redirect both land");
  assert.equal((await bindActivationAck({ ackId: ack.id, businessId: shop.id, actorEmail: shop.ownerEmail, checkoutSessionId: "cs_other" })).bound, false, "one approval, one checkout");
  assert.equal((await bindActivationAck({ ackId: ack.id, businessId: shop.id, actorEmail: "someone@else.test", checkoutSessionId: "cs_paid_1" })).bound, true, "already bound to this checkout");
  assert.deepEqual(await bindActivationAck({ ackId: null, businessId: shop.id, actorEmail: shop.ownerEmail, checkoutSessionId: "cs_paid_2" }), { bound: false, reason: "missing" });
});
