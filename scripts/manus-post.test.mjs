import assert from "node:assert/strict";
import test from "node:test";

import {
  isPlaceholderOwnerPhone,
  ownerMobileConfigured,
  MANUS_POST_STEPS,
  MANUS_ALLOWED_FIRST_POST,
  MANUS_FORBIDDEN_CLAIMS,
  claimsViolateManusPost,
  resolveManusPostNext,
  probeManusEnvSecrets,
  hasRealSecret,
  buildManusPostStatus,
} from "../src/lib/manus-post.ts";

test("placeholder owner phones fail the Manus mobile gate", () => {
  assert.equal(isPlaceholderOwnerPhone("+1YOUR_CELL_NUMBER"), true);
  assert.equal(isPlaceholderOwnerPhone("placeholder"), true);
  assert.equal(isPlaceholderOwnerPhone("+15555550100"), true);
  assert.equal(isPlaceholderOwnerPhone("+13472584837"), false);
  assert.equal(isPlaceholderOwnerPhone(null), true);
});

test("owner mobile cannot equal the shop line", () => {
  assert.equal(
    ownerMobileConfigured({
      ownerPhone: "+13472584837",
      shopLines: ["+18446439170"],
    }),
    true,
  );
  assert.equal(
    ownerMobileConfigured({
      ownerPhone: "+18446439170",
      shopLines: ["+18446439170"],
    }),
    false,
  );
});

test("Manus post sequence is ordered and includes the allowed first post", () => {
  assert.ok(MANUS_POST_STEPS.length >= 10);
  for (let i = 1; i < MANUS_POST_STEPS.length; i++) {
    assert.ok(
      MANUS_POST_STEPS[i].order > MANUS_POST_STEPS[i - 1].order,
      "steps must stay ordered",
    );
  }
  assert.match(MANUS_ALLOWED_FIRST_POST, /after-hours and overflow/i);
  assert.doesNotMatch(MANUS_ALLOWED_FIRST_POST, /never miss|guaranteed|every call/i);
  assert.equal(claimsViolateManusPost(MANUS_ALLOWED_FIRST_POST).length, 0);
  assert.ok(MANUS_FORBIDDEN_CLAIMS.length >= 5);
  assert.ok(claimsViolateManusPost("we never miss a call").includes("never miss"));
});

test("resolveManusPostNext returns the first red gate", () => {
  const next = resolveManusPostNext({
    telephony: true,
    wedge_line: true,
    wedge_verify: false,
  });
  assert.equal(next?.id, "wedge_verify");
  assert.equal(resolveManusPostNext({
    telephony: true,
    wedge_line: true,
    wedge_verify: true,
    wedge_alert: true,
    phone_cert: true,
    proof_video: true,
    stripe_key: true,
    stripe_setup: true,
    stripe_webhook: true,
    formation: true,
    bulletproof_green: true,
  }), null);
});

test("probeManusEnvSecrets rejects theater values", () => {
  assert.equal(hasRealSecret("YOUR_KEY"), false);
  assert.equal(hasRealSecret("sk_live_abc"), true);
  const probed = probeManusEnvSecrets({
    TWILIO_ACCOUNT_SID: "ACxxxxxxxx",
    TWILIO_AUTH_TOKEN: "token",
    TWILIO_PHONE_NUMBER: "+15551234567",
    VAPI_API_KEY: "vapi",
    STRIPE_SECRET_KEY: "",
  });
  assert.equal(probed.telephony, true);
  assert.equal(probed.stripe_key, false);
  const status = buildManusPostStatus({
    secrets: probed,
    formation: false,
  });
  assert.equal(status.telephony, true);
  assert.equal(status.formation, false);
  assert.equal(resolveManusPostNext(status)?.id, "wedge_line");
});

test("resolveManusPostNext can skip unknown when local wedge is unscored", () => {
  const next = resolveManusPostNext(
    {
      telephony: true,
      wedge_line: null,
      wedge_verify: null,
      wedge_alert: null,
      phone_cert: null,
      proof_video: null,
      stripe_key: false,
    },
    { skipUnknown: true },
  );
  assert.equal(next?.id, "stripe_key");
});

test("probeManusEnvSecrets accepts prod telephony + billing when local env is empty", () => {
  const localDark = probeManusEnvSecrets({});
  assert.equal(localDark.telephony, false);
  assert.equal(localDark.stripe_key, false);
  const prodLive = probeManusEnvSecrets(
    {},
    { prodTelephonyOk: true, prodBillingOk: true },
  );
  assert.equal(prodLive.telephony, true);
  assert.equal(prodLive.stripe_key, true);
  assert.equal(prodLive.stripe_setup, true);
  assert.equal(prodLive.stripe_webhook, true);
});
