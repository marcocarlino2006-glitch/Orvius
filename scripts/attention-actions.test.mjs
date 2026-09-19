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
  assert.equal(attentionActionStrategy("alert_unacked"), "call");
  assert.equal(attentionActionStrategy("concurrent_calls"), "open");
  assert.equal(attentionActionStrategy("transcript_dispute"), "call");
  assert.equal(attentionActionStrategy("customer_no_show"), "call");
  assert.equal(attentionActionStrategy("tech_no_show"), "call");
  assert.equal(attentionActionStrategy("deposit_failed"), "call");
  assert.equal(attentionActionStrategy("estimate_failed"), "call");
  assert.equal(attentionActionStrategy("open_invoice"), "call");
  assert.equal(attentionActionStrategy("open_estimate"), "call");
  assert.equal(attentionActionStrategy("tech_needs_phone"), "open");
  assert.equal(attentionActionStrategy("alerts_muted"), "open");
  assert.equal(attentionActionStrategy("money_path_broken"), "open");
});
