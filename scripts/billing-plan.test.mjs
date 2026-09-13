#!/usr/bin/env node
/*
 * What a shop is entitled to, versus what it is being charged.
 *
 * The four billing routes had no tests at all, which meant the code that turns
 * a shop into revenue had never been executed by anything — not in CI, not
 * locally, and not in production, where Stripe has never been configured. The
 * first bug that fell out is the one covered here: entitlement was read from
 * `subscription.metadata`, and metadata is written by exactly one place, our
 * own checkout. Stripe's customer portal changes the price and leaves metadata
 * alone, so a plan change made there moved the money and nothing else.
 *
 * These assert the money and the capability agree, in both directions, because
 * each direction is a different way to lose: an upgrade that grants nothing is
 * a refund, and a downgrade that takes nothing back leaks for as long as the
 * shop stays.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveBillingPlan, mapStripeStatusToBilling } from "../src/lib/billing-sync.ts";
import { planIdForStripePriceId } from "../src/lib/pricing-plans.ts";
import { canAccessModule, getEffectivePlanId, getFeatureSetForPlan } from "../src/lib/plan-features.ts";

const PRICES = {
  STRIPE_PRICE_ID_LINE: "price_line_monthly",
  STRIPE_PRICE_ID_LINE_ANNUAL: "price_line_annual",
  STRIPE_PRICE_ID_PRO: "price_pro_monthly",
  STRIPE_PRICE_ID_PRO_ANNUAL: "price_pro_annual",
  STRIPE_PRICE_ID_FLEET: "price_fleet_monthly",
  STRIPE_PRICE_ID_FLEET_ANNUAL: "price_fleet_annual",
};

function withEnv(vars, run) {
  const previous = new Map(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return run();
  } finally {
    for (const [k, v] of previous) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

/** A Stripe subscription, as the webhook receives it. */
function subscription({ priceId, metadata = {}, status = "active" }) {
  return {
    id: "sub_1",
    status,
    customer: "cus_1",
    metadata,
    items: { data: priceId ? [{ price: { id: priceId } }] : [] },
  };
}

describe("a Stripe price maps back to the plan that sells it", () => {
  it("finds the plan for both monthly and annual prices", () => {
    withEnv(PRICES, () => {
      assert.equal(planIdForStripePriceId("price_line_monthly"), "line");
      assert.equal(planIdForStripePriceId("price_line_annual"), "line");
      assert.equal(planIdForStripePriceId("price_fleet_monthly"), "fleet");
      assert.equal(planIdForStripePriceId("price_fleet_annual"), "fleet");
    });
  });

  it("returns null for a price we do not sell", () => {
    withEnv(PRICES, () => {
      assert.equal(planIdForStripePriceId("price_someone_elses"), null);
      assert.equal(planIdForStripePriceId(""), null);
    });
  });
});

describe("entitlement follows the price, not our metadata", () => {
  /*
    The portal upgrade. Metadata still says line because checkout wrote it
    months ago; the shop is now paying the fleet price.
  */
  it("an upgrade made in the Stripe portal grants the new plan", () => {
    withEnv(PRICES, () => {
      const sub = subscription({
        priceId: "price_fleet_monthly",
        metadata: { planId: "line", product: "orvius-line" },
      });

      assert.equal(resolveBillingPlan(sub), "fleet");
    });
  });

  /* The portal downgrade, which is the one that leaks money. */
  it("a downgrade made in the Stripe portal takes the old plan away", () => {
    withEnv(PRICES, () => {
      const sub = subscription({
        priceId: "price_line_monthly",
        metadata: { planId: "fleet", product: "orvius-fleet" },
      });

      assert.equal(resolveBillingPlan(sub), "line");
    });
  });

  it("the capability actually changes, not just the label", () => {
    withEnv(PRICES, () => {
      const downgraded = resolveBillingPlan(
        subscription({
          priceId: "price_line_monthly",
          metadata: { planId: "fleet", product: "orvius-fleet" },
        }),
      );
      const plan = getEffectivePlanId({
        billingStatus: "active",
        billingPlan: downgraded,
      });

      assert.equal(plan, "line");
      /* Dispatch is a Pro/Fleet module — paying the Line price must lose it. */
      assert.equal(canAccessModule(plan, "dispatch"), false);
      assert.equal(canAccessModule(plan, "calls"), true);
      /* And unlimited technicians was the whole of what Fleet added. */
      assert.equal(getFeatureSetForPlan(plan).maxTechnicians, 0);
    });
  });

  it("an upgrade's capability lands too", () => {
    withEnv(PRICES, () => {
      const upgraded = resolveBillingPlan(
        subscription({
          priceId: "price_fleet_monthly",
          metadata: { planId: "line", product: "orvius-line" },
        }),
      );
      const plan = getEffectivePlanId({
        billingStatus: "active",
        billingPlan: upgraded,
      });

      assert.equal(plan, "fleet");
      assert.equal(canAccessModule(plan, "dispatch"), true);
      assert.equal(getFeatureSetForPlan(plan).maxTechnicians, null);
    });
  });
});

describe("metadata is still the fallback when there is nothing better", () => {
  it("uses metadata for a subscription on a price we do not recognise", () => {
    withEnv(PRICES, () => {
      const sub = subscription({
        priceId: "price_migrated_legacy",
        metadata: { planId: "pro" },
      });

      assert.equal(resolveBillingPlan(sub), "pro");
    });
  });

  it("uses the product key when there is no planId either", () => {
    withEnv(PRICES, () => {
      const sub = subscription({
        priceId: "price_migrated_legacy",
        metadata: { product: "orvius-fleet" },
      });

      assert.equal(resolveBillingPlan(sub), "fleet");
    });
  });

  it("returns null rather than guessing when nothing identifies the plan", () => {
    withEnv(PRICES, () => {
      assert.equal(resolveBillingPlan(subscription({ priceId: null })), null);
    });
  });

  /*
    A subscription with no identifiable plan currently resolves to the pilot
    feature set rather than locking the shop out. That is the right default —
    a paying customer must never be shut off by our own bookkeeping gap — but
    it is worth pinning, because it is also why the metadata bug was silent.
  */
  it("an unidentifiable plan leaves a paying shop working", () => {
    const plan = getEffectivePlanId({ billingStatus: "active", billingPlan: null });
    assert.equal(plan, "pilot");
    assert.equal(canAccessModule(plan, "calls"), true);
  });
});

describe("Stripe subscription status maps to something the product can act on", () => {
  it("trialing is as entitled as active", () => {
    assert.equal(mapStripeStatusToBilling("trialing"), "active");
    assert.equal(mapStripeStatusToBilling("active"), "active");
  });

  it("past_due keeps the shop up while Stripe retries the card", () => {
    assert.equal(mapStripeStatusToBilling("past_due"), "past_due");
  });

  it("canceled and unpaid both end entitlement", () => {
    assert.equal(mapStripeStatusToBilling("canceled"), "canceled");
    assert.equal(mapStripeStatusToBilling("unpaid"), "canceled");
  });

  it("an incomplete signup is not a free pilot", () => {
    assert.equal(mapStripeStatusToBilling("incomplete"), "incomplete");
    assert.equal(mapStripeStatusToBilling("incomplete_expired"), "incomplete");
  });
});
