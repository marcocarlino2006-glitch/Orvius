import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("every attention kind has a label and a one-tap strategy", () => {
  assert.ok(ATTENTION_KINDS.length >= 17);
  for (const kind of ATTENTION_KINDS) {
    assert.ok(attentionKindLabel(kind).length > 0, kind);
    assert.ok(attentionActionStrategy(kind).length > 0, kind);
  }
});

test("critical night paths resolve to direct actions not only open", () => {
  assert.equal(attentionActionStrategy("alert_failed"), "test_alert");
  assert.equal(attentionActionStrategy("stale_weekly_proof"), "proof");
  assert.equal(attentionActionStrategy("needs_booking"), "book");
  assert.equal(attentionActionStrategy("unassigned_job"), "assign");
  assert.equal(attentionActionStrategy("needs_customer_confirm"), "text_confirm");
  assert.equal(attentionActionStrategy("available_tech"), "open");
  assert.equal(attentionActionStrategy("wants_human"), "call");
  assert.equal(attentionActionStrategy("partial_capture"), "call");
});
