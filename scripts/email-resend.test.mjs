import assert from "node:assert/strict";
import test from "node:test";

import {
  isEmailConfigured,
  isValidResendFrom,
  resolveResendFrom,
} from "../src/lib/email.ts";

test("Resend From rejects theater values", () => {
  assert.equal(isValidResendFrom("changeme"), false);
  assert.equal(isValidResendFrom("YOUR_FROM"), false);
  assert.equal(isValidResendFrom("alerts@example.com"), false);
  assert.equal(isValidResendFrom("Orvius <alerts@orvius.im>"), true);
  assert.equal(isValidResendFrom("alerts@orvius.im"), true);
});

test("isEmailConfigured fails closed on bad RESEND_FROM", () => {
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.RESEND_FROM;
  try {
    process.env.RESEND_API_KEY = "re_test";
    delete process.env.RESEND_FROM;
    assert.equal(isEmailConfigured(), true);
    assert.match(resolveResendFrom(), /orvius\.im/i);

    process.env.RESEND_FROM = "changeme";
    assert.equal(isEmailConfigured(), false);

    process.env.RESEND_FROM = "Orvius <alerts@orvius.im>";
    assert.equal(isEmailConfigured(), true);
    assert.equal(resolveResendFrom(), "Orvius <alerts@orvius.im>");
  } finally {
    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;
    if (prevFrom === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = prevFrom;
  }
});
