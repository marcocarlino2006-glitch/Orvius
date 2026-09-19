import assert from "node:assert/strict";
import test from "node:test";

import { sentryBeforeSend, sentryRuntimeOptions } from "../src/lib/sentry-options.ts";

test("sentryBeforeSend scrubs phones and emails from messages", () => {
  const scrubbed = sentryBeforeSend({
    message: "Failed SMS to +1 (347) 258-4837 from owner@shop.com",
    extra: {
      phone: "+13472584837",
      note: "Call +15551234567 back",
      ok: true,
    },
  });
  assert.ok(scrubbed);
  assert.equal(String(scrubbed.message).includes("+1"), false);
  assert.match(String(scrubbed.message), /\[phone\]/);
  assert.match(String(scrubbed.message), /\[email\]/);
  const extra = scrubbed.extra;
  assert.ok(extra && typeof extra === "object");
  assert.equal(extra.phone, "[redacted]");
  assert.match(String(extra.note), /\[phone\]/);
});

test("sentryRuntimeOptions includes beforeSend and environment", () => {
  const opts = sentryRuntimeOptions();
  assert.equal(typeof opts.beforeSend, "function");
  assert.ok(opts.environment);
});
