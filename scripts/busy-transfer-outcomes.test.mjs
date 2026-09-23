import assert from "node:assert/strict";
import test from "node:test";

import { isActionableVoiceStatus } from "../src/lib/busy-inbound.ts";
import {
  endedReasonLooksLikeTransferMiss,
  leadLooksLikeTransferMiss,
} from "../src/lib/transfer-miss.ts";
import { leadWantsHuman } from "../src/lib/lead-wants-human.ts";

test("busy / no-answer / failed voice statuses are actionable", () => {
  assert.equal(isActionableVoiceStatus("busy"), true);
  assert.equal(isActionableVoiceStatus("no-answer"), true);
  assert.equal(isActionableVoiceStatus("failed"), true);
  assert.equal(isActionableVoiceStatus("completed"), false);
  assert.equal(isActionableVoiceStatus("ringing"), false);
});

test("transfer-miss notes and ended reasons are detectable", () => {
  assert.equal(
    leadLooksLikeTransferMiss({
      notes: "Owner missed transfer — callback",
    }),
    true,
  );
  assert.equal(
    endedReasonLooksLikeTransferMiss("transfer-destination-no-answer"),
    true,
  );
  assert.equal(
    endedReasonLooksLikeTransferMiss("assistant-forwarded-call"),
    false,
    "a successful forward is not a miss",
  );
  assert.equal(endedReasonLooksLikeTransferMiss("customer-ended-call"), false);
});

test("transfer miss stamps as wants_human on the board", () => {
  assert.equal(
    leadWantsHuman({ notes: "Owner missed transfer — callback" }),
    true,
  );
});
