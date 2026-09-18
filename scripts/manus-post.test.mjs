import assert from "node:assert/strict";
import test from "node:test";

import {
  isPlaceholderOwnerPhone,
  ownerMobileConfigured,
  MANUS_POST_STEPS,
  MANUS_ALLOWED_FIRST_POST,
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
});
