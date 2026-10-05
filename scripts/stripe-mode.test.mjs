/*
 * Production with a test key: the public test card would count as paid and buy
 * a real line. Readiness closes checkout instead of reporting it live.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { stripeKeyMode, isStripeTestModeInProduction } = await import("../src/lib/stripe-mode.ts");
const { getBillingReadiness } = await import("../src/lib/billing-readiness.ts");
const { isPlanCheckoutReady } = await import("../src/lib/pricing-plans.ts");

function withEnv(vars, fn) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

const allPrices = {
  STRIPE_PRICE_ID_LINE: "price_line",
  STRIPE_PRICE_ID_PRO: "price_pro",
  STRIPE_PRICE_ID_FLEET: "price_fleet",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_x",
};

test("key mode reads the key prefix, restricted keys included", () => {
  assert.equal(stripeKeyMode("sk_live_abc"), "live");
  assert.equal(stripeKeyMode("rk_live_abc"), "live");
  assert.equal(stripeKeyMode(" sk_test_abc "), "test");
  assert.equal(stripeKeyMode("rk_test_abc"), "test");
  assert.equal(stripeKeyMode(""), null);
  assert.equal(stripeKeyMode(undefined), null);
  assert.equal(stripeKeyMode("whatever"), null);
});

test("a test key on the production deployment closes checkout and says why", () => {
  withEnv({ ...allPrices, STRIPE_SECRET_KEY: "sk_test_abc", VERCEL_ENV: "production" }, () => {
    assert.equal(isStripeTestModeInProduction(), true);
    assert.equal(isPlanCheckoutReady("pro"), false, "no plan can start a checkout");
    const readiness = getBillingReadiness();
    assert.equal(readiness.checkoutReady, false);
    assert.equal(readiness.fullyReady, false);
    assert.equal(readiness.checklist.find((item) => item.id === "live")?.ok, false);
    assert.ok(readiness.nextSteps.some((step) => /live-mode/.test(step)));
  });
});

test("live keys on production, and test keys on previews, stay open", () => {
  withEnv({ ...allPrices, STRIPE_SECRET_KEY: "sk_live_abc", VERCEL_ENV: "production" }, () => {
    const readiness = getBillingReadiness();
    assert.equal(readiness.fullyReady, true);
    assert.equal(readiness.checklist.find((item) => item.id === "live")?.ok, true);
  });
  withEnv({ ...allPrices, STRIPE_SECRET_KEY: "sk_test_abc", VERCEL_ENV: "preview", NODE_ENV: "production" }, () => {
    assert.equal(isStripeTestModeInProduction(), false);
    assert.equal(getBillingReadiness().fullyReady, true);
  });
});
