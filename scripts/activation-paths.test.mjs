#!/usr/bin/env node
/*
 * Every way a shop starts answering real callers carries an approval of the
 * exact call notice and permissions it will run with, checked on the server
 * before a number or receptionist is bought: a new shop's checkout, the
 * webhook or browser build after it, a test shop turning on, Orvius staff
 * creating a shop, and the line repair that runs on every dashboard load.
 * Fake Twilio and Vapi count what would have been bought.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["RESEND_API_KEY", "VAPI_WEBHOOK_SECRET"]) delete process.env[key];
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
process.env.VAPI_API_KEY = "vapi-test";
process.env.STRIPE_SECRET_KEY = "sk_test_paths";
process.env.STRIPE_PRICE_ID_LINE = "price_local_line";
process.env.STRIPE_PRICE_ID_PRO = "price_local_pro";
process.env.ORVIUS_ADMIN_KEY = "local-admin-key-for-tests";

const bought = { numbers: 0, assistants: 0 };
let nextNumber = 4000;
mock.module("twilio", {
  defaultExport: () => {
    const owned = new Map();
    const incomingPhoneNumbers = (sid) => ({ update: async () => ({ sid }), remove: async () => {} });
    incomingPhoneNumbers.list = async ({ phoneNumber, friendlyName }) =>
      [...owned.values()].filter((e) => (phoneNumber ? e.phoneNumber === phoneNumber : e.friendlyName === friendlyName)).slice(0, 1);
    incomingPhoneNumbers.create = async ({ phoneNumber, friendlyName }) => {
      bought.numbers += 1;
      const entry = { sid: `PN${bought.numbers}`, phoneNumber, friendlyName };
      owned.set(phoneNumber, entry);
      return entry;
    };
    return {
      incomingPhoneNumbers,
      availablePhoneNumbers: () => ({
        local: { list: async ({ areaCode, limit = 3 }) => Array.from({ length: limit }, () => ({ phoneNumber: `+1${areaCode ?? 512}555${nextNumber++}` })) },
      }),
    };
  },
});

const vapiNumbers = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.host !== "api.vapi.ai") return realFetch(input, init);
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : {};
  const json = (data) => new Response(JSON.stringify(data ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  const [, kind, id] = url.pathname.split("/");
  if (kind === "assistant" && method === "POST") {
    bought.assistants += 1;
    return json({ id: `asst_paths_${bought.assistants}`, ...body });
  }
  if (kind === "phone-number" && method === "GET" && !id) return json(vapiNumbers);
  if (kind === "phone-number" && method === "POST") {
    const n = { id: `pn_paths_${vapiNumbers.length + 1}`, createdAt: new Date().toISOString(), ...body };
    vapiNumbers.push(n);
    return json(n);
  }
  return json({ id: id ?? "x" });
};

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
            return { id: `cs_paths_${sessions.length}`, url: "https://checkout.stripe.test/s" };
          },
        },
      },
    }),
  },
});

const { NextRequest } = nextServer;
const { POST: checkoutPOST } = await import("../src/app/api/billing/checkout/route.ts");
const { POST: adminCreate } = await import("../src/app/api/businesses/route.ts");
const { provisionBusiness, ensureDedicatedShopLine } = await import("../src/lib/provision-business.ts");
const { provisionFromCheckout, shopDraftMetadata } = await import("../src/lib/checkout-shop.ts");
const { ActivationRequiredError, activationVersions, draftActivationBusiness, recordActivationAck } = await import("../src/lib/activation-ack.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const emails = [];
test.after(async () => {
  const shops = await prisma.business.findMany({ where: { OR: [{ ownerEmail: { in: emails } }, { slug: { startsWith: "paths-admin-" } }] }, select: { id: true } });
  const ids = shops.map((s) => s.id);
  await prisma.activationAcknowledgement.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const newOwner = () => {
  const email = `paths-${stamp()}@example.test`;
  emails.push(email);
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = email;
  return email;
};
const claimFor = (business) => ({ recording: true, approved: true, ...activationVersions(business) });
const billing = { customerId: "cus_paths", subscriptionId: "sub_paths", planId: "pro" };
const input = (email, name, activation) => ({ name, trade: "HVAC", ownerEmail: email, ownerPhone: "+15125550177", billing, activation });
const spent = () => ({ ...bought });

test("no approval, a forged one, or one for another shop name: refused before anything is bought", async () => {
  const email = newOwner();
  const before = spent();
  await assert.rejects(provisionBusiness(input(email, "Cold Snap HVAC", undefined)), (e) => e instanceof ActivationRequiredError && e.code === "activation_missing");
  await assert.rejects(
    provisionBusiness(input(email, "Cold Snap HVAC", { actorEmail: email, claim: { recording: true, approved: true, noticeVersion: "notice-forged", setupVersion: "setup-forged" }, acceptedTerms: true, acceptedSms: true })),
    (e) => e instanceof ActivationRequiredError && e.code === "activation_stale",
  );
  await assert.rejects(
    provisionBusiness(input(email, "Cold Snap HVAC", { actorEmail: email, claim: claimFor(draftActivationBusiness("Another Shop")), acceptedTerms: true, acceptedSms: true })),
    (e) => e instanceof ActivationRequiredError && e.code === "activation_stale" && /Cold Snap HVAC/.test(e.terms.notice),
  );
  await assert.rejects(
    provisionBusiness(input(email, "Cold Snap HVAC", { actorEmail: email, claim: { ...claimFor(draftActivationBusiness("Cold Snap HVAC")), recording: false }, acceptedTerms: true, acceptedSms: true })),
    (e) => e instanceof ActivationRequiredError && e.code === "activation_missing",
    "a claim that didn't accept recording is not an approval",
  );
  assert.deepEqual(spent(), before, "no number and no receptionist were bought");
  assert.equal(await prisma.business.count({ where: { ownerEmail: email } }), 0);
});

test("an approval of the shop that will run is kept with the shop, atomically: actor, notice, versions and time", async () => {
  const email = newOwner();
  const at = new Date("2026-10-15T14:00:00Z");
  const draft = draftActivationBusiness("Cold Snap HVAC");
  const { business } = await provisionBusiness(input(email, "Cold Snap HVAC", { actorEmail: email.toUpperCase(), claim: claimFor(draft), acceptedTerms: true, acceptedSms: true, checkoutSessionId: `cs_ok_${stamp()}`, at }));
  const ack = await prisma.activationAcknowledgement.findFirstOrThrow({ where: { businessId: business.id } });
  assert.equal(ack.actorEmail, email);
  assert.equal(ack.actorKind, "owner");
  assert.equal(ack.noticeVersion, activationVersions(business).noticeVersion, "the version approved is the version running");
  assert.equal(ack.setupVersion, activationVersions(business).setupVersion);
  assert.match(ack.noticeText, /may be recorded/);
  assert.equal(ack.createdAt.toISOString(), at.toISOString(), "kept at the time the owner approved, not when the build ran");
  assert.ok(ack.acceptedRecording && ack.approvedTurnOn);
});

async function sandboxShop(email, name = "Sandbox Plumbing") {
  return prisma.business.create({
    data: {
      name,
      slug: `paths-sbx-${stamp()}`,
      trade: "Plumbing",
      ownerEmail: email,
      environment: "test",
      setupJson: JSON.stringify({ sandbox: true }),
      greeting: `Thanks for calling ${name}.`,
      bookingMode: "offer",
    },
  });
}

test("a test shop turns on only with its own owner's approval, of its current notice, bound to one checkout", async () => {
  const email = newOwner();
  const shop = await sandboxShop(email);
  const other = await sandboxShop(newOwner(), "Someone Else Plumbing");
  const foreign = await recordActivationAck({ business: other, actorEmail: other.ownerEmail, acceptedTerms: true, acceptedSms: true });
  const before = spent();
  const promote = (activation) => provisionBusiness({ ...input(email, shop.name, activation), trade: "Plumbing", promoteBusinessId: shop.id });

  await assert.rejects(promote({ actorEmail: email, ackId: foreign.id, acceptedTerms: true, acceptedSms: true, checkoutSessionId: "cs_sbx_1" }), ActivationRequiredError, "another shop's approval");
  const own = await recordActivationAck({ business: shop, actorEmail: email, acceptedTerms: true, acceptedSms: true });
  await assert.rejects(promote({ actorEmail: "teammate@example.test", ackId: own.id, acceptedTerms: true, acceptedSms: true, checkoutSessionId: "cs_sbx_1" }), ActivationRequiredError, "someone else's session");
  await prisma.activationAcknowledgement.update({ where: { id: own.id }, data: { checkoutSessionId: "cs_sbx_other" } });
  await assert.rejects(promote({ actorEmail: email, ackId: own.id, acceptedTerms: true, acceptedSms: true, checkoutSessionId: "cs_sbx_1" }), ActivationRequiredError, "already used by another checkout");
  await prisma.activationAcknowledgement.update({ where: { id: own.id }, data: { checkoutSessionId: null } });
  await prisma.business.update({ where: { id: shop.id }, data: { bookingMode: "alert" } });
  await assert.rejects(
    promote({ actorEmail: email, ackId: own.id, acceptedTerms: true, acceptedSms: true, checkoutSessionId: "cs_sbx_1" }),
    (e) => e instanceof ActivationRequiredError && e.code === "activation_stale",
    "permissions changed after the approval",
  );
  assert.deepEqual(spent(), before);

  const current = await prisma.business.findUniqueOrThrow({ where: { id: shop.id } });
  const { business } = await promote({ actorEmail: email, ackId: own.id, claim: claimFor(current), acceptedTerms: true, acceptedSms: true, checkoutSessionId: "cs_sbx_1" });
  assert.equal(business.environment, "production");
  const acks = await prisma.activationAcknowledgement.findMany({ where: { businessId: shop.id }, orderBy: { createdAt: "asc" } });
  assert.equal(acks.at(-1).checkoutSessionId, "cs_sbx_1", "the fresh approval is the one tied to the checkout");
  assert.equal(JSON.parse(acks.at(-1).permissionsJson).level, "alert");
});

test("the line repair that runs on every dashboard load never gives a test shop a real number", async () => {
  const email = newOwner();
  const shop = await prisma.business.update({ where: { id: (await sandboxShop(email)).id }, data: { vapiAssistantId: "asst_sbx", ownerPhone: "+15125550190" } });
  const before = spent();
  await assert.rejects(ensureDedicatedShopLine(shop), ActivationRequiredError);
  assert.deepEqual(spent(), before);
});

const checkout = (body) =>
  checkoutPOST(
    new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ planId: "pro", shop: { name: "Brand New Air", trade: "HVAC", ownerPhone: "+15125550133", acceptedTerms: true, acceptedSms: true }, ...body }),
    }),
  );

test("a new shop's checkout opens only with an approval of the notice that shop will run with", async () => {
  signedInAs = newOwner();
  const before = sessions.length;
  const missing = await checkout({});
  assert.equal(missing.status, 409);
  assert.equal((await missing.json()).code, "activation_missing");
  const forged = await checkout({ activation: claimFor(draftActivationBusiness("A Different Name")) });
  assert.equal(forged.status, 409);
  assert.equal((await forged.json()).code, "activation_stale");
  assert.equal(sessions.length, before, "no Stripe session was opened");

  const ok = await checkout({ activation: claimFor(draftActivationBusiness("Brand New Air")) });
  assert.equal(ok.status, 200, JSON.stringify(await ok.clone().json()));
  const meta = sessions.at(-1).metadata;
  assert.equal(meta.activation_notice, activationVersions(draftActivationBusiness("Brand New Air")).noticeVersion);
  assert.ok(meta.activation_setup && !Number.isNaN(Date.parse(meta.activation_at)));
});

function paidSession({ email, metadata }) {
  const subscription = { id: `sub_${stamp()}`, status: "active", customer: "cus_paths", metadata: { planId: "pro" }, items: { data: [] } };
  return {
    checkout: { sessions: { retrieve: async (id) => ({ id, mode: "subscription", customer_email: email, metadata, subscription }) } },
    subscriptions: { retrieve: async () => subscription },
  };
}

test("after paying, a shop renamed on the form needs a fresh approval; the webhook build without one buys nothing", async () => {
  const email = newOwner();
  const draft = { name: "Paid Air", trade: "HVAC", ownerPhone: "+15125550144" };
  const versions = activationVersions(draftActivationBusiness("Paid Air"));
  const metadata = { ...shopDraftMetadata(draft, new Date()), activation_notice: versions.noticeVersion, activation_setup: versions.setupVersion, activation_at: new Date().toISOString() };
  const sessionId = `cs_paid_${stamp()}`;
  const before = spent();

  const noApproval = await provisionFromCheckout({ sessionId, email, stripe: paidSession({ email, metadata: shopDraftMetadata(draft, new Date()) }) });
  assert.equal(noApproval.status, "needs_activation", "an older checkout with no approval on it");
  const renamed = await provisionFromCheckout({ sessionId, email, draft: { ...draft, name: "Paid Air & Heat" }, stripe: paidSession({ email, metadata }) });
  assert.equal(renamed.status, "needs_activation");
  assert.equal(renamed.code, "activation_stale");
  assert.match(renamed.terms.notice, /Paid Air & Heat/);
  assert.deepEqual(spent(), before);

  const done = await provisionFromCheckout({
    sessionId,
    email,
    draft: { ...draft, name: "Paid Air & Heat" },
    activation: { recording: true, approved: true, ...activationVersions(draftActivationBusiness("Paid Air & Heat")) },
    stripe: paidSession({ email, metadata }),
  });
  assert.equal(done.status, "created");
  const ack = await prisma.activationAcknowledgement.findFirstOrThrow({ where: { businessId: done.business.id } });
  assert.equal(ack.checkoutSessionId, sessionId);
  assert.equal(ack.actorEmail, email);
});

const admin = (body) =>
  adminCreate(
    new NextRequest("http://localhost/api/businesses", {
      method: "POST",
      headers: { "content-type": "application/json", "x-orvius-admin-key": process.env.ORVIUS_ADMIN_KEY },
      body: JSON.stringify({ name: "Concierge Heating", slug: `paths-admin-${stamp()}`, ownerPhone: "+15125550155", ...body }),
    }),
  );

test("Orvius staff creating a shop record whose approval it is, how it was given and which notice was read", async () => {
  const before = spent();
  const refused = await admin({});
  assert.equal(refused.status, 409);
  const terms = (await refused.json()).activation;
  assert.match(terms.notice, /Concierge Heating/);
  const vague = await admin({ acknowledgement: { ownerEmail: "owner@concierge.test", method: "call", reference: "", operator: "Sam", ...activationVersions(draftActivationBusiness("Concierge Heating")) } });
  assert.equal(vague.status, 400, "no reference, no record");
  const stale = await admin({ acknowledgement: { ownerEmail: "owner@concierge.test", method: "call", reference: "call 10/15", operator: "Sam", noticeVersion: "notice-old", setupVersion: terms.setupVersion } });
  assert.equal(stale.status, 409);
  assert.deepEqual(spent(), before, "no receptionist was created");

  const ok = await admin({ acknowledgement: { ownerEmail: "Owner@Concierge.test", method: "written", reference: "signed form 2026-10-15", operator: "Sam", noticeVersion: terms.noticeVersion, setupVersion: terms.setupVersion } });
  assert.equal(ok.status, 201, JSON.stringify(await ok.clone().json()));
  const shop = await ok.json();
  const ack = await prisma.activationAcknowledgement.findFirstOrThrow({ where: { businessId: shop.id } });
  assert.equal(ack.actorKind, "operator");
  assert.equal(ack.actorEmail, "operator:sam");
  assert.deepEqual(JSON.parse(ack.attestationJson), { ownerEmail: "owner@concierge.test", method: "written", reference: "signed form 2026-10-15" });
  assert.equal(ack.noticeVersion, terms.noticeVersion);
});
