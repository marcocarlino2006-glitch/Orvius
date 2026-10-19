#!/usr/bin/env node
/*
 * The remaining Orvius-side Stripe writes, through their real callers against
 * a disposable database and a mocked Stripe that honours idempotency keys:
 * the monthly overage invoice is recorded before it is sent, a lost reply is
 * flagged and never billed twice, and Stripe's own record lands the flag; the
 * plan checkout never leaves two payable sessions open.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY"]) delete process.env[key];
process.env.STRIPE_SECRET_KEY = "sk_test_stripe_effects";
process.env.STRIPE_PRICE_ID_LINE = "price_local_line";
process.env.STRIPE_PRICE_ID_PRO = "price_local_pro";

const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const billable = new Map();
const realBillable = await import("../src/lib/billable-calls.ts");
mock.module(new URL("../src/lib/billable-calls.ts", import.meta.url).href, {
  namedExports: { ...realBillable, countBillableCalls: async (shop) => billable.get(shop.id) ?? 0 },
});

const stripeState = { invoices: [], items: [], byKey: new Map(), creates: 0, loseInvoiceReply: false, openSessions: [], sessionCreates: 0, failExpire: false };
const remember = (key, value) => {
  stripeState.byKey.set(key, value);
  return value;
};
const realStripe = await import("../src/lib/stripe.ts");
mock.module(new URL("../src/lib/stripe.ts", import.meta.url).href, {
  namedExports: {
    ...realStripe,
    getStripe: () => ({
      subscriptions: { retrieve: async (id) => ({ id, start_date: 1 }) },
      invoiceItems: {
        list: async ({ customer, pending }) => ({ data: stripeState.items.filter((i) => i.customer === customer && (!pending || !i.invoice)) }),
        create: async (params, { idempotencyKey }) => {
          if (stripeState.byKey.has(idempotencyKey)) return stripeState.byKey.get(idempotencyKey);
          const item = { id: `ii_${stripeState.items.length + 1}`, invoice: null, ...params };
          stripeState.items.push(item);
          return remember(idempotencyKey, item);
        },
        retrieve: async (id) => stripeState.items.find((i) => i.id === id),
      },
      invoices: {
        list: async ({ customer }) => ({ data: stripeState.invoices.filter((i) => i.customer === customer) }),
        create: async (params, { idempotencyKey }) => {
          if (stripeState.byKey.has(idempotencyKey)) return stripeState.byKey.get(idempotencyKey);
          stripeState.creates += 1;
          const invoice = { id: `in_${stripeState.invoices.length + 1}`, ...params };
          stripeState.invoices.push(invoice);
          for (const item of stripeState.items) if (item.customer === params.customer && !item.invoice) item.invoice = invoice.id;
          remember(idempotencyKey, invoice);
          if (stripeState.loseInvoiceReply) {
            stripeState.loseInvoiceReply = false;
            throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
          }
          return invoice;
        },
        retrieve: async (id) => stripeState.invoices.find((i) => i.id === id),
      },
      checkout: {
        sessions: {
          list: async () => ({ data: stripeState.openSessions.filter((s) => s.status === "open") }),
          expire: async (id) => {
            if (stripeState.failExpire) throw Object.assign(new Error("stripe unavailable"), { type: "StripeAPIError" });
            const s = stripeState.openSessions.find((x) => x.id === id);
            if (s) s.status = "expired";
            return s;
          },
          create: async (params) => {
            stripeState.sessionCreates += 1;
            const s = { id: `cs_${stripeState.sessionCreates}`, status: "open", mode: "subscription", metadata: params.metadata, url: "https://checkout.stripe.test/s" };
            stripeState.openSessions.push(s);
            return s;
          },
        },
      },
    }),
  },
});

const { NextRequest } = nextServer;
const { billPreviousMonthOverage, previousPeriod } = await import("../src/lib/overage-billing.ts");
const { POST: checkoutPOST } = await import("../src/app/api/billing/checkout/route.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const made = [];
test.after(async () => {
  await prisma.providerEffect.deleteMany({ where: { businessId: { in: made } } });
  await prisma.reconciliationException.deleteMany({ where: { businessId: { in: made } } });
  await prisma.auditEvent.deleteMany({ where: { businessId: { in: made } } });
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

async function paidShop(extra = {}) {
  const id = uid();
  const shop = await prisma.business.create({
    data: {
      name: "Overage Heating",
      slug: `ovg-${id}`,
      ownerEmail: `ovg-${id}@example.test`,
      billingStatus: "active",
      billingPlan: "line",
      stripeCustomerId: `cus_ovg_${id}`,
      stripeSubscriptionId: `sub_ovg_${id}`,
      ...extra,
    },
  });
  made.push(shop.id);
  return shop;
}

test("a lost overage invoice reply is flagged and the shop isn't stamped; the next run lands it from Stripe's record and never bills twice", async () => {
  const shop = await paidShop();
  billable.set(shop.id, 1000);
  const now = new Date();
  const key = `overage:${shop.id}:${previousPeriod(now).key}`;

  stripeState.loseInvoiceReply = true;
  await billPreviousMonthOverage(now);
  assert.equal(stripeState.invoices.filter((i) => i.customer === shop.stripeCustomerId).length, 1, "Stripe did make it");
  const effect = await prisma.providerEffect.findUniqueOrThrow({ where: { provider_correlationKey: { provider: "stripe", correlationKey: `${key}:invoice` } } });
  assert.equal(effect.status, "uncertain");
  assert.ok(effect.exceptionId, "a person can see it");
  assert.equal((await prisma.business.findUniqueOrThrow({ where: { id: shop.id } })).overageBilledPeriod, null, "not stamped while unknown");
  assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, action: "billing.overage_invoiced" } }), 0);

  await billPreviousMonthOverage(now);
  assert.equal(stripeState.invoices.filter((i) => i.customer === shop.stripeCustomerId).length, 1, "billed once");
  assert.equal(stripeState.items.filter((i) => i.customer === shop.stripeCustomerId).length, 1, "one line item");
  assert.equal((await prisma.business.findUniqueOrThrow({ where: { id: shop.id } })).overageBilledPeriod, previousPeriod(now).key);
  const landed = await prisma.providerEffect.findUniqueOrThrow({ where: { id: effect.id } });
  assert.equal(landed.status, "finalized");
  assert.equal(landed.providerId, stripeState.invoices.find((i) => i.customer === shop.stripeCustomerId).id);
  assert.equal((await prisma.reconciliationException.findUniqueOrThrow({ where: { id: effect.exceptionId } })).status, "resolved");
});

test("a clean overage run records the item and invoice as finalized and audits once", async () => {
  const shop = await paidShop();
  billable.set(shop.id, 1000);
  const now = new Date();
  await billPreviousMonthOverage(now);
  await billPreviousMonthOverage(now);
  const rows = await prisma.providerEffect.findMany({ where: { businessId: shop.id }, orderBy: { operation: "asc" } });
  assert.deepEqual(
    rows.map((r) => [r.operation, r.status]),
    [
      ["overage.invoice", "finalized"],
      ["overage.invoice_item", "finalized"],
    ],
  );
  assert.equal(stripeState.invoices.filter((i) => i.customer === shop.stripeCustomerId).length, 1);
  assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, action: "billing.overage_invoiced" } }), 1);
});

test("plan checkout: concurrent taps leave one payable session, and an unclosable earlier one blocks a second", async (t) => {
  const email = `tap-${uid()}@example.test`;
  process.env.ORVIUS_AUTH_ALLOWED_EMAILS = email;
  signedInAs = email;
  const { activationVersions, draftActivationBusiness } = await import("../src/lib/activation-ack.ts");
  const versions = activationVersions(draftActivationBusiness("Tap Twice Air"));
  const tap = () =>
    checkoutPOST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          planId: "pro",
          shop: { name: "Tap Twice Air", trade: "HVAC", ownerPhone: "+13035550111", acceptedTerms: true, acceptedSms: true },
          activation: { recording: true, approved: true, ...versions },
        }),
      }),
    );
  const results = await Promise.all([tap(), tap(), tap()]);
  for (const res of results) assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  assert.equal(stripeState.openSessions.filter((s) => s.status === "open").length, 1, "only the newest can be paid");

  stripeState.failExpire = true;
  t.after(() => (stripeState.failExpire = false));
  const before = stripeState.sessionCreates;
  const blocked = await tap();
  assert.equal(blocked.status, 503);
  assert.equal((await blocked.json()).code, "checkout_busy");
  assert.equal(stripeState.sessionCreates, before, "no second session while the first is still payable");
});
