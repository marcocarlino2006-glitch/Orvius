import assert from "node:assert/strict";
import test from "node:test";

import { isDashboardEmailAuthorized } from "../src/lib/auth-allowlist.ts";
import {
  arePublicLaunchRequirementsMet,
} from "../src/lib/bulletproof-status.ts";
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
      canCreateShopForEmail("owner@shop.test", () => false),
      false,
    );
    assert.equal(
      canCreateShopForEmail(
        " INVITED@SHOP.TEST ",
        (email) => email === "invited@shop.test",
      ),
      true,
    );
  });

  await withEnv({ ORVIUS_SELF_SERVE_SIGNUP: "true" }, async () => {
    assert.equal(isSelfServeSignupEnabled(), true);
    assert.equal(
      canCreateShopForEmail("new-owner@shop.test", () => false),
      true,
    );
  });
});

test("the public signup switch authorizes a new owner without weakening empty-email checks", async () => {
  await withEnv({ ORVIUS_SELF_SERVE_SIGNUP: "1" }, async () => {
    let ownershipLookups = 0;
    assert.equal(
      await isDashboardEmailAuthorized("new-owner@shop.test", async () => {
        ownershipLookups += 1;
        return false;
      }),
      true,
    );
    assert.equal(ownershipLookups, 0);
    assert.equal(
      await isDashboardEmailAuthorized(null, async () => true),
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
