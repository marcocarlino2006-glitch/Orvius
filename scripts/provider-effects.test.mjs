#!/usr/bin/env node
/*
 * A Stripe or Vapi call whose reply is lost, or whose result Orvius fails to
 * save, is recorded and shown, and the next attempt recovers from the
 * provider's own record instead of repeating the effect blindly. Fake
 * providers accept the request and then drop the reply, or Orvius's own write
 * fails after they accepted; the counts are of effects that really happened.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["RESEND_API_KEY", "VAPI_WEBHOOK_SECRET"]) delete process.env[key];
process.env.STRIPE_SECRET_KEY = "sk_test_effects";
process.env.TWILIO_ACCOUNT_SID = "ACtest";
process.env.TWILIO_AUTH_TOKEN = "test-token";
process.env.VAPI_API_KEY = "vapi-test";

const lost = () => Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
const faults = { loseStripeReply: 0, refuseStripe: 0, loseVapiReply: 0, vapiListDown: false };
const stripe = { sessions: new Map(), byKey: new Map(), created: 0, accounts: new Map(), accountsCreated: 0 };

const fakeStripe = {
  checkout: {
    sessions: {
      create: async (params, options = {}) => {
        if (faults.refuseStripe > 0) {
          faults.refuseStripe -= 1;
          throw Object.assign(new Error("Invalid amount"), { type: "StripeInvalidRequestError", statusCode: 400 });
        }
        let session = stripe.byKey.get(options.idempotencyKey);
        if (!session) {
          stripe.created += 1;
          session = { id: `cs_eff_${stripe.created}`, status: "open", url: `https://checkout.stripe.test/${stripe.created}`, amount_total: params.line_items[0].price_data.unit_amount, metadata: params.metadata };
          stripe.sessions.set(session.id, session);
          if (options.idempotencyKey) stripe.byKey.set(options.idempotencyKey, session);
        }
        if (faults.loseStripeReply > 0) {
          faults.loseStripeReply -= 1;
          throw lost();
        }
        return session;
      },
      retrieve: async (id) => stripe.sessions.get(id),
      expire: async (id) => Object.assign(stripe.sessions.get(id) ?? {}, { status: "expired" }),
    },
  },
  accounts: {
    create: async (params, options = {}) => {
      let account = stripe.byKey.get(options.idempotencyKey);
      if (!account) {
        stripe.accountsCreated += 1;
        account = { id: `acct_eff_${stripe.accountsCreated}`, metadata: params.metadata, charges_enabled: false, payouts_enabled: false, details_submitted: false };
        stripe.accounts.set(account.id, account);
        if (options.idempotencyKey) stripe.byKey.set(options.idempotencyKey, account);
      }
      if (faults.loseStripeReply > 0) {
        faults.loseStripeReply -= 1;
        throw lost();
      }
      return account;
    },
    retrieve: async (id) => stripe.accounts.get(id),
    list: () => ({
      async *[Symbol.asyncIterator]() {
        for (const account of stripe.accounts.values()) yield account;
      },
    }),
  },
};
const realStripe = await import("../src/lib/stripe.ts");
mock.module(new URL("../src/lib/stripe.ts", import.meta.url).href, { namedExports: { ...realStripe, getStripe: () => fakeStripe } });

const vapi = { assistants: new Map(), posts: 0, seq: 0 };
mock.module("twilio", {
  defaultExport: () => {
    const incomingPhoneNumbers = (sid) => ({ update: async () => ({ sid }), remove: async () => {} });
    incomingPhoneNumbers.list = async () => [];
    let n = 0;
    incomingPhoneNumbers.create = async ({ phoneNumber, friendlyName }) => ({ sid: `PN_eff_${++n}`, phoneNumber, friendlyName });
    return { incomingPhoneNumbers, availablePhoneNumbers: () => ({ local: { list: async ({ areaCode }) => [{ phoneNumber: `+1${areaCode ?? 512}555${String(Date.now()).slice(-4)}` }] } }) };
  },
});
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(String(input));
  if (url.host !== "api.vapi.ai") return realFetch(input, init);
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(init.body) : {};
  const json = (data, status = 200) => new Response(JSON.stringify(data ?? {}), { status, headers: { "content-type": "application/json" } });
  const [, kind, id] = url.pathname.split("/");
  if (kind === "assistant" && method === "POST") {
    vapi.posts += 1;
    const a = { id: `asst_eff_${++vapi.seq}`, ...body };
    vapi.assistants.set(a.id, a);
    if (faults.loseVapiReply > 0) {
      faults.loseVapiReply -= 1;
      throw new TypeError("fetch failed");
    }
    return json(a);
  }
  if (kind === "assistant" && method === "GET" && !id) return faults.vapiListDown ? json({ message: "down" }, 503) : json([...vapi.assistants.values()]);
  if (kind === "assistant" && method === "DELETE") {
    vapi.assistants.delete(id);
    return json({});
  }
  if (kind === "phone-number" && method === "GET" && !id) return json([]);
  return json({ id: id ?? `pn_eff_${++vapi.seq}` });
};

const { createInvoiceCheckoutSession } = await import("../src/lib/invoice-pay.ts");
const { ensureConnectAccount } = await import("../src/lib/stripe-connect.ts");
const { provisionBusiness } = await import("../src/lib/provision-business.ts");
const { activationVersions, draftActivationBusiness } = await import("../src/lib/activation-ack.ts");
const { UncertainEffectError, stuckEffects } = await import("../src/lib/provider-effect.ts");
const { mismatchText } = await import("../src/lib/command-board.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const emails = [];
test.after(async () => {
  const shops = await prisma.business.findMany({ where: { OR: [{ id: { in: made } }, { ownerEmail: { in: emails } }] }, select: { id: true } });
  const ids = shops.map((s) => s.id);
  await prisma.providerEffect.deleteMany({ where: { OR: [{ businessId: { in: ids } }, { correlationKey: { startsWith: "assistant:" } }] } });
  await prisma.activationAcknowledgement.deleteMany({ where: { businessId: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

async function payableInvoice() {
  const shop = await prisma.business.create({
    data: { name: "Effects HVAC", slug: `eff-${stamp()}`, stripeConnectAccountId: `acct_shop_${stamp()}`, stripeConnectChargesEnabled: true, billingStatus: "active" },
  });
  made.push(shop.id);
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, amountCents: 18_500, status: "sent", publicToken: `tok-${stamp()}` } });
  return { shop, invoice };
}
const effectFor = (invoiceId) => prisma.providerEffect.findFirst({ where: { entityType: "invoice", entityId: invoiceId } });
const openExceptions = (businessId) => prisma.reconciliationException.findMany({ where: { businessId, status: "open" } });

test("Stripe opened the checkout but the reply was lost: recorded, shown, and the retry gets the same session back", async () => {
  const { shop, invoice } = await payableInvoice();
  const before = stripe.created;
  faults.loseStripeReply = 1;
  await assert.rejects(createInvoiceCheckoutSession({ invoice, business: shop }), UncertainEffectError);
  assert.equal(stripe.created - before, 1, "Stripe did make one session");
  const effect = await effectFor(invoice.id);
  assert.equal(effect.status, "uncertain");
  assert.equal(effect.idempotencyKey, effect.correlationKey);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).openCheckoutSessionId, null, "nothing was recorded as open");
  const [exception] = await openExceptions(shop.id);
  assert.equal(JSON.parse(exception.observedJson).reason, "response_lost");
  assert.match(mismatchText(exception).title, /No reply from Stripe/);

  const session = await createInvoiceCheckoutSession({ invoice, business: shop });
  assert.equal(stripe.created - before, 1, "the retry replayed the same key: still one session");
  assert.equal(session.id, `cs_eff_${before + 1}`);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).openCheckoutSessionId, session.id);
  const after = await effectFor(invoice.id);
  assert.equal(after.status, "finalized");
  assert.equal(after.providerId, session.id);
  assert.equal((await openExceptions(shop.id)).length, 0, "the exception closes itself once the session is recovered");
});

test("Stripe accepted but Orvius failed to save it: the retry saves it without asking Stripe again", async () => {
  const { shop, invoice } = await payableInvoice();
  const before = stripe.created;
  const realUpdate = prisma.invoice.update;
  let failNext = true;
  prisma.invoice.update = async (...args) => {
    if (failNext && args[0]?.data?.openCheckoutSessionId) {
      failNext = false;
      throw new Error("database is locked");
    }
    return realUpdate.apply(prisma.invoice, args);
  };
  try {
    await assert.rejects(createInvoiceCheckoutSession({ invoice, business: shop }), /database is locked/);
  } finally {
    prisma.invoice.update = realUpdate;
  }
  const effect = await effectFor(invoice.id);
  assert.equal(effect.status, "accepted");
  assert.equal(effect.providerId, `cs_eff_${before + 1}`, "the provider's id is kept");
  const [exception] = await openExceptions(shop.id);
  assert.equal(JSON.parse(exception.observedJson).reason, "local_finalize_failed");

  const createsBefore = stripe.created;
  const session = await createInvoiceCheckoutSession({ invoice, business: shop });
  assert.equal(stripe.created, createsBefore, "no second create");
  assert.equal(session.id, effect.providerId);
  assert.equal((await effectFor(invoice.id)).status, "finalized");
  assert.equal((await openExceptions(shop.id)).length, 0);
});

test("past Stripe's replay window, an unconfirmed checkout is not sent again", async () => {
  const { shop, invoice } = await payableInvoice();
  faults.loseStripeReply = 1;
  await assert.rejects(createInvoiceCheckoutSession({ invoice, business: shop }), UncertainEffectError);
  const effect = await effectFor(invoice.id);
  await prisma.providerEffect.update({ where: { id: effect.id }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60_000) } });
  const before = stripe.created;
  await assert.rejects(createInvoiceCheckoutSession({ invoice, business: shop }), UncertainEffectError);
  assert.equal(stripe.created, before, "refused rather than risk a second payable session");
  assert.equal((await effectFor(invoice.id)).status, "uncertain");
  assert.equal((await openExceptions(shop.id)).length, 1, "still one exception, not one per attempt");
});

test("a refusal is not uncertain: nothing happened, and the next try uses a fresh key", async () => {
  const { shop, invoice } = await payableInvoice();
  faults.refuseStripe = 1;
  await assert.rejects(createInvoiceCheckoutSession({ invoice, business: shop }), /Invalid amount/);
  assert.equal((await effectFor(invoice.id)).status, "failed");
  assert.equal((await openExceptions(shop.id)).length, 0);
  const session = await createInvoiceCheckoutSession({ invoice, business: shop });
  const effect = await effectFor(invoice.id);
  assert.equal(effect.status, "finalized");
  assert.match(effect.idempotencyKey, /:r1$/);
  assert.equal(effect.providerId, session.id);
});

test("a card-payments account whose reply was lost a day ago is found by its shop tag, not opened twice", async () => {
  const shop = await prisma.business.create({ data: { name: "Connect Plumbing", slug: `eff-c-${stamp()}`, ownerEmail: `c-${stamp()}@example.test` } });
  made.push(shop.id);
  faults.loseStripeReply = 1;
  await assert.rejects(ensureConnectAccount(shop), UncertainEffectError);
  assert.equal(stripe.accountsCreated, 1);
  await prisma.providerEffect.updateMany({ where: { businessId: shop.id }, data: { createdAt: new Date(Date.now() - 30 * 60 * 60_000) } });
  const accountId = await ensureConnectAccount(shop);
  assert.equal(stripe.accountsCreated, 1, "found, not created again");
  assert.equal(accountId, "acct_eff_1");
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).stripeConnectAccountId, "acct_eff_1");
});

test("a receptionist created at Vapi with the reply lost is found by its attempt tag on the retry; no second one", async () => {
  const email = `eff-v-${stamp()}@example.test`;
  emails.push(email);
  const input = {
    name: "Vapi Lost Reply HVAC",
    trade: "HVAC",
    ownerEmail: email,
    ownerPhone: "+15125550166",
    billing: { customerId: "cus_eff", subscriptionId: "sub_eff", planId: "pro" },
    activation: { actorEmail: email, claim: { recording: true, approved: true, ...activationVersions(draftActivationBusiness("Vapi Lost Reply HVAC")) }, acceptedTerms: true, acceptedSms: true },
  };
  faults.loseVapiReply = 1;
  await assert.rejects(provisionBusiness(input));
  assert.equal(vapi.posts, 1);
  const stuck = (await stuckEffects()).filter((e) => e.provider === "vapi");
  assert.equal(stuck.length, 1, "visible to Orvius ops even though no shop exists yet");
  assert.equal(stuck[0].status, "uncertain");

  faults.vapiListDown = true;
  await assert.rejects(provisionBusiness(input), UncertainEffectError, "can't tell whether it exists: refuse");
  assert.equal(vapi.posts, 1);
  faults.vapiListDown = false;

  const { business } = await provisionBusiness(input);
  assert.equal(vapi.posts, 1, "found by its tag, not created again");
  assert.equal(business.vapiAssistantId, "asst_eff_1");
  const effect = await prisma.providerEffect.findUnique({ where: { id: stuck[0].id } });
  assert.equal(effect.status, "finalized");
  assert.equal(effect.providerId, "asst_eff_1");
});
