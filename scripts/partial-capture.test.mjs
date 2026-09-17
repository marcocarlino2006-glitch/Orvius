import assert from "node:assert/strict";
import test from "node:test";

import { leadIsPartialCapture } from "../src/lib/lead-partial-capture.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("stamped hang-up notes are partial capture", () => {
  assert.equal(
    leadIsPartialCapture({
      phone: "+15555550123",
      notes: "Hung up mid-call — partial",
    }),
    true,
  );
});

test("incomplete intake with a phone is partial, not qualify theater", () => {
  assert.equal(
    leadIsPartialCapture({
      phone: "+15555550123",
      name: "Jordan",
      serviceType: "AC",
    }),
    true,
  );
  assert.equal(
    leadIsPartialCapture({
      phone: "+15555550123",
      serviceType: "AC repair",
      address: "1842 Oak Street",
    }),
    false,
  );
  assert.equal(
    leadIsPartialCapture({
      phone: "+15555550123",
      notes: "Caller asked for a person — callback",
    }),
    false,
  );
});

test("partial_capture is a board kind with Call strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("partial_capture"));
  assert.equal(attentionKindLabel("partial_capture"), "Partial");
  assert.equal(attentionActionStrategy("partial_capture"), "call");
});
