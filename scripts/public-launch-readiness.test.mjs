import assert from "node:assert/strict";
import test from "node:test";

import {
  arePublicLaunchRequirementsMet,
  canOfferCheckout,
} from "../src/lib/public-launch-readiness.ts";
import {
  canCreateShopForEmail,
  isSelfServeSignupEnabled,
} from "../src/lib/self-serve-signup.ts";

async function withEnv(values, run) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("public signup is explicit and invite onboarding remains available", async () => {
  await withEnv({ ORVIUS_SELF_SERVE_SIGNUP: undefined }, async () => {
    assert.equal(isSelfServeSignupEnabled(), false);
    assert.equal(
      canCreateShopForEmail("owner@shop.test", () => false, false),
      false,
    );
    assert.equal(
      canCreateShopForEmail(
        " INVITED@SHOP.TEST ",
        (email) => email === "invited@shop.test",
        false,
      ),
      true,
    );
  });

  await withEnv({ ORVIUS_SELF_SERVE_SIGNUP: "true" }, async () => {
    assert.equal(isSelfServeSignupEnabled(), true);
    assert.equal(
      canCreateShopForEmail("new-owner@shop.test", () => false, true),
      true,
    );
  });
});

test("a raw signup switch cannot bypass a red composed launch gate", async () => {
  await withEnv({ ORVIUS_SELF_SERVE_SIGNUP: "1" }, async () => {
    assert.equal(isSelfServeSignupEnabled(), true);
    assert.equal(
      canCreateShopForEmail("new-owner@shop.test", () => false, false),
      false,
    );
    assert.equal(
      canCreateShopForEmail(null, () => true, true),
      false,
    );
  });
});

test("public launch fails closed when any required system is unavailable", () => {
  const ready = {
    selfServeEnabled: true,
    authReady: true,
    billingReady: true,
    telephonyReady: true,
    lineProvisioningReady: true,
    voiceWebhookReady: true,
    emailReady: true,
    legalReady: true,
  };

  assert.equal(arePublicLaunchRequirementsMet(ready), true);
  for (const key of Object.keys(ready)) {
    assert.equal(
      arePublicLaunchRequirementsMet({ ...ready, [key]: false }),
      false,
      `${key} must block public self-serve`,
    );
  }
});

test("public checkout stays hidden while invited owners can still subscribe", () => {
  assert.equal(canOfferCheckout(null, false), false);
  assert.equal(canOfferCheckout("owner@shop.test", false), true);
  assert.equal(canOfferCheckout(null, true), true);
});
