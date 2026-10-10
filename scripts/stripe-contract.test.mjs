/*
 * The billing check reads Stripe through the real SDK, against stripe-mock
 * (Stripe's own API simulator, started by CI). Unit tests feed hand-built
 * objects; this proves the SDK's pagination and response shapes still parse
 * into what reconcile and the revenue math expect. Skips when no stripe-mock
 * is reachable, so a local run without it stays honest instead of green.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const MOCK = process.env.STRIPE_MOCK_URL?.trim() || "http://localhost:12111";
const reachable = await fetch(`${MOCK}/v1/subscriptions?limit=1`, { headers: { Authorization: "Bearer sk_test_contract" } })
  .then((r) => r.ok)
  .catch(() => false);
if (!reachable && process.env.STRIPE_MOCK_REQUIRED === "1") {
  throw new Error(`stripe-mock is required here but not reachable at ${MOCK}`);
}
const skip = reachable ? false : `stripe-mock not reachable at ${MOCK}`;

process.env.STRIPE_SECRET_KEY = "sk_test_contract";
process.env.STRIPE_API_BASE = MOCK;

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

test("the daily billing check lists subscriptions through the real Stripe SDK", { skip }, async () => {
  const { getStripe } = await import("../src/lib/stripe.ts");
  const { loadBillingFacts, reconcileBilling } = await import("../src/lib/billing-reconcile.ts");
  const { resolveBillingInterval, resolveBillingPlan } = await import("../src/lib/billing-sync.ts");

  const stripe = getStripe();
  const listed = [];
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) listed.push(sub);
  assert.ok(listed.length > 0, "stripe-mock returns subscriptions");
  const sample = listed[0];
  const customerId = typeof sample.customer === "string" ? sample.customer : sample.customer.id;
  assert.match(sample.id, /^sub_/);
  assert.match(customerId, /^cus_/);
  assert.ok(["month", "year"].includes(resolveBillingInterval(sample)), "interval read from the SDK's price object");

  const shop = await prisma.business.create({
    data: {
      name: "Contract Heating",
      slug: `stripe-contract-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      servicesJson: "[]",
      environment: "production",
      stripeCustomerId: customerId,
      billingStatus: "canceled",
    },
  });
  try {
    const { subs, shops } = await loadBillingFacts(stripe);
    const fact = subs.find((s) => s.id === sample.id);
    assert.ok(fact, "a subscription on a known customer is kept even when its price is not an Orvius plan");
    assert.equal(fact.customerId, customerId);
    assert.equal(fact.status, sample.status);
    assert.equal(fact.planId, resolveBillingPlan(sample));
    assert.ok(shops.some((s) => s.id === shop.id));

    if (["active", "trialing", "past_due"].includes(sample.status)) {
      const ours = shops.filter((s) => s.id === shop.id);
      assert.ok(reconcileBilling([fact], ours).some((m) => m.kind === "link_drift"), "charged on a subscription the shop's record doesn't point at");
      const linked = ours.map((s) => ({ ...s, stripeSubscriptionId: sample.id }));
      assert.ok(reconcileBilling([fact], linked).some((m) => m.kind === "status_drift"), "a charged shop Orvius thinks is canceled is flagged");
    }
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("a subscription on an Orvius price is recognised by plan with no shop attached", { skip }, async () => {
  const { getStripe } = await import("../src/lib/stripe.ts");
  const { loadBillingFacts, reconcileBilling } = await import("../src/lib/billing-reconcile.ts");
  const stripe = getStripe();
  const first = (await stripe.subscriptions.list({ status: "all", limit: 1 })).data[0];
  const priceId = first.items.data[0].price.id;

  const before = process.env.STRIPE_PRICE_ID_PRO;
  process.env.STRIPE_PRICE_ID_PRO = priceId;
  try {
    const { subs } = await loadBillingFacts(stripe);
    const fact = subs.find((s) => s.id === first.id);
    assert.equal(fact?.planId, "pro");
    if (["active", "trialing", "past_due"].includes(first.status)) {
      const unknownShopOnly = reconcileBilling([fact], []);
      assert.ok(unknownShopOnly.some((m) => m.kind === "charged_without_shop"));
    }
  } finally {
    if (before === undefined) delete process.env.STRIPE_PRICE_ID_PRO;
    else process.env.STRIPE_PRICE_ID_PRO = before;
  }
});
