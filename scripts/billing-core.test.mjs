/*
 * Billing sync against a stand-in Stripe (docs/BACKLOG.md M7): the paths
 * that turn a paid checkout into a paying shop, and the guard that keeps a
 * second subscription from charging twice or switching a paying shop's line
 * off. Stripe's client is pointed at a local server through STRIPE_API_BASE,
 * which lib/stripe.ts honours only for a test key outside production.
 */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const subscriptions = new Map();
const sessions = new Map();
const updates = [];

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://stripe.local");
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const session = url.pathname.match(/^\/v1\/checkout\/sessions\/([^/]+)$/);
    if (session && req.method === "GET") {
      const found = sessions.get(session[1]);
      if (!found) return send(404, { error: { type: "invalid_request_error", message: "No such session" } });
      const expand = url.searchParams.getAll("expand[]").includes("subscription");
      return send(200, expand && found.subscription ? { ...found, subscription: subscriptions.get(found.subscription) } : found);
    }
    const sub = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (sub && req.method === "GET") return send(200, subscriptions.get(sub[1]));
    if (sub && req.method === "POST") {
      const form = new URLSearchParams(body);
      const metadata = {};
      for (const [key, value] of form) {
        const m = key.match(/^metadata\[(.+)\]$/);
        if (m) metadata[m[1]] = value;
      }
      updates.push({ id: sub[1], metadata });
      const current = subscriptions.get(sub[1]);
      current.metadata = { ...current.metadata, ...metadata };
      return send(200, current);
    }
    send(404, { error: { type: "invalid_request_error", message: `unhandled ${req.method} ${url.pathname}` } });
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

process.env.STRIPE_SECRET_KEY = "sk_test_billing_core";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${server.address().port}`;
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY"]) delete process.env[key];

const { confirmCheckoutSession, linkPaidCheckoutToBusiness, shopHasLivePlan, syncSubscriptionToBusiness } = await import(
  "../src/lib/billing-sync.ts"
);

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

function subscription(id, status, metadata = {}) {
  const sub = { id, object: "subscription", status, customer: "cus_core", metadata: { planId: "pro", ...metadata }, items: { object: "list", data: [] } };
  subscriptions.set(id, sub);
  return sub;
}

async function makeShop(extra = {}) {
  const email = `owner-${stamp()}@example.test`;
  const shop = await prisma.business.create({
    data: { name: "Core Air", slug: `core-${stamp()}`, environment: "test", ownerEmail: email, billingStatus: "pilot", ...extra },
  });
  return shop;
}

test.after(() => new Promise((resolve) => server.close(resolve)));

test("a paid checkout turns the shop active and tags the subscription with the shop", async () => {
  const shop = await makeShop();
  try {
    const sub = subscription(`sub_${stamp()}`, "active");
    const id = `cs_${stamp()}`;
    sessions.set(id, {
      id,
      object: "checkout.session",
      mode: "subscription",
      status: "complete",
      customer_email: shop.ownerEmail,
      subscription: sub.id,
      metadata: { businessId: shop.id, planId: "pro", product: "orvius-pro" },
    });

    const result = await confirmCheckoutSession(id, shop.ownerEmail.toUpperCase());
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.business.billingStatus, "active");
    assert.equal(result.business.billingPlan, "pro");
    const tagged = updates.find((u) => u.id === sub.id);
    assert.equal(tagged.metadata.businessId, shop.id);

    const after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.stripeSubscriptionId, sub.id);
    assert.equal(after.stripeCustomerId, "cus_core");
  } finally {
    await drop(shop.id);
  }
});

test("someone else's checkout, or a one-off payment, never activates a shop", async () => {
  const shop = await makeShop();
  try {
    const sub = subscription(`sub_${stamp()}`, "active");
    const theirs = `cs_${stamp()}`;
    sessions.set(theirs, { id: theirs, object: "checkout.session", mode: "subscription", customer_email: "someone@else.test", subscription: sub.id, metadata: {} });
    const refused = await confirmCheckoutSession(theirs, shop.ownerEmail);
    assert.deepEqual(refused, { ok: false, error: "Checkout does not belong to this account" });

    const payment = `cs_${stamp()}`;
    sessions.set(payment, { id: payment, object: "checkout.session", mode: "payment", customer_email: shop.ownerEmail, metadata: {} });
    assert.equal((await confirmCheckoutSession(payment, shop.ownerEmail)).ok, false);

    const after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.billingStatus, "pilot");
  } finally {
    await drop(shop.id);
  }
});

test("linking a checkout to a new shop writes the shop id onto the subscription", async () => {
  const sub = subscription(`sub_${stamp()}`, "active");
  await linkPaidCheckoutToBusiness({ customerId: "cus_core", subscriptionId: sub.id, planId: "line" }, "biz_new");
  const tagged = updates.filter((u) => u.id === sub.id).at(-1);
  assert.deepEqual(tagged.metadata, { businessId: "biz_new", planId: "line", product: "orvius-line" });
});

test("cancelling an extra subscription leaves a paying shop active and its line on", async () => {
  const current = subscription(`sub_${stamp()}`, "active");
  const shop = await makeShop({ billingStatus: "active", stripeSubscriptionId: current.id, stripeCustomerId: "cus_core" });
  try {
    const extra = subscription(`sub_${stamp()}`, "canceled", { businessId: shop.id });
    const result = await syncSubscriptionToBusiness(extra, shop.ownerEmail);
    assert.equal(result.ignored, true);
    const after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.billingStatus, "active");
    assert.equal(after.stripeSubscriptionId, current.id);
    assert.equal(after.canceledAt, null);
    const suspended = await prisma.auditEvent.count({ where: { businessId: shop.id, action: "line.suspended" } }).catch(() => 0);
    assert.equal(suspended, 0);

    const pending = subscription(`sub_${stamp()}`, "incomplete", { businessId: shop.id });
    assert.equal((await syncSubscriptionToBusiness(pending, shop.ownerEmail)).ignored, true, "an unpaid new subscription doesn't cancel the paying one");
  } finally {
    await drop(shop.id);
  }
});

test("a replacement subscription is adopted once it is paying, and the current one can still cancel the shop", async () => {
  const old = subscription(`sub_${stamp()}`, "active");
  const shop = await makeShop({ billingStatus: "active", stripeSubscriptionId: old.id, stripeCustomerId: "cus_core" });
  try {
    const replacement = subscription(`sub_${stamp()}`, "active", { businessId: shop.id });
    await syncSubscriptionToBusiness(replacement, shop.ownerEmail);
    let after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.stripeSubscriptionId, replacement.id);

    replacement.status = "canceled";
    await syncSubscriptionToBusiness(replacement, shop.ownerEmail);
    after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.billingStatus, "canceled");
    assert.ok(after.canceledAt);
  } finally {
    await drop(shop.id);
  }
});

test("checkout refuses a second plan for a shop that is already paying", () => {
  assert.equal(shopHasLivePlan({ stripeSubscriptionId: "sub_1", billingStatus: "active" }), true);
  assert.equal(shopHasLivePlan({ stripeSubscriptionId: "sub_1", billingStatus: "past_due" }), true);
  assert.equal(shopHasLivePlan({ stripeSubscriptionId: "sub_1", billingStatus: "canceled" }), false, "a canceled shop can pay again");
  assert.equal(shopHasLivePlan({ stripeSubscriptionId: null, billingStatus: "pilot" }), false, "a pilot can start paying");
});
