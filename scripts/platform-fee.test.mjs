/*
 * The take rate is the business model, so its arithmetic gets the same scrutiny
 * as the entitlement path.
 *
 * Two failures here are silent and expensive. A fee that rounds up to the full
 * charge makes Stripe reject the payment outright, so the customer's card
 * bounces at the moment a shop is trying to collect. A fee that reads a
 * malformed env var as zero hands every transaction to the shop for free and
 * nothing in the product complains.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  STRIPE_MIN_CHARGE_CENTS,
  calculatePlatformFeeCents,
  formatPlatformFeeRate,
  getPlatformFeeBps,
  isChargeableAmount,
  shopNetCents,
} from "../src/lib/platform-fee.ts";

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

test("the default take rate is 2%", () => {
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: undefined }, () => {
    assert.equal(getPlatformFeeBps(), 200);
    assert.equal(formatPlatformFeeRate(), "2%");
  });
});

test("a $450 deposit yields a $9 fee and the shop keeps $441", () => {
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: undefined }, () => {
    assert.equal(calculatePlatformFeeCents(45_000), 900);
    assert.equal(shopNetCents(45_000), 44_100);
  });
});

test("fee plus shop net always reconstructs the charge exactly", () => {
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: undefined }, () => {
    for (const amount of [50, 99, 100, 333, 1_234, 45_000, 999_999]) {
      assert.equal(
        calculatePlatformFeeCents(amount) + shopNetCents(amount),
        amount,
        `cents went missing at ${amount}`,
      );
    }
  });
});

test("even at the highest permitted rate the fee stays under the charge", () => {
  /*
    Stripe fails the whole payment when application_fee_amount reaches the
    charge, which would bounce a customer's card mid-collection. The bps clamp
    is what prevents it, so this asserts the consequence across the smallest
    chargeable amounts, where a percentage is closest to its own rounding.
  */
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: "9000" }, () => {
    for (const amount of [50, 51, 99, 100, 45_000]) {
      const fee = calculatePlatformFeeCents(amount);
      assert.ok(fee < amount, `fee ${fee} would swallow the ${amount}c charge`);
      assert.ok(shopNetCents(amount) >= 1);
    }
  });
});

test("rounding is to the nearest cent, not truncated", () => {
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: undefined }, () => {
    // 2% of 175c is 3.5c, and 2% of 125c is 2.5c.
    assert.equal(calculatePlatformFeeCents(175), 4);
    assert.equal(calculatePlatformFeeCents(125), 3);
  });
});

test("a configured rate overrides the default", () => {
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: "150" }, () => {
    assert.equal(getPlatformFeeBps(), 150);
    assert.equal(formatPlatformFeeRate(), "1.50%");
    assert.equal(calculatePlatformFeeCents(45_000), 675);
  });
});

test("a malformed rate falls back to the default instead of charging nothing", () => {
  for (const bad of ["", "  ", "abc", "NaN", "-50", "Infinity"]) {
    withEnv({ ORVIUS_PLATFORM_FEE_BPS: bad }, () => {
      assert.equal(getPlatformFeeBps(), 200, `"${bad}" zeroed the take rate`);
    });
  }
});

test("an absurd configured rate is clamped rather than passed to Stripe", () => {
  withEnv({ ORVIUS_PLATFORM_FEE_BPS: "9000" }, () => {
    assert.equal(getPlatformFeeBps(), 1000);
  });
});

test("non-amounts produce no fee rather than NaN", () => {
  for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(calculatePlatformFeeCents(amount), 0);
    assert.equal(shopNetCents(amount), 0);
  }
});

test("amounts below Stripe's floor are not chargeable", () => {
  assert.equal(STRIPE_MIN_CHARGE_CENTS, 50);
  assert.equal(isChargeableAmount(49), false);
  assert.equal(isChargeableAmount(50), true);
  assert.equal(isChargeableAmount(45_000), true);
  assert.equal(isChargeableAmount(Number.NaN), false);
});
