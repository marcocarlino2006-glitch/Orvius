import assert from "node:assert/strict";
import test from "node:test";

import {
  leadHasTranscriptDispute,
  TRANSCRIPT_DISPUTE_STAMP,
} from "../src/lib/lead-transcript-dispute.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("dispute stamps and common phrases fire", () => {
  assert.equal(
    leadHasTranscriptDispute({ notes: TRANSCRIPT_DISPUTE_STAMP }),
    true,
  );
  assert.equal(
    leadHasTranscriptDispute({ notes: "That's not what I said about the leak" }),
    true,
  );
  assert.equal(
    leadHasTranscriptDispute({ notes: "Wrong address — caller corrected" }),
    true,
  );
  assert.equal(
    leadHasTranscriptDispute({ notes: "AI got it wrong on the unit type" }),
    true,
  );
});

test("ordinary notes are not disputes; human/spam win first", () => {
  assert.equal(
    leadHasTranscriptDispute({ notes: "AC not cooling, wants tomorrow" }),
    false,
  );
  assert.equal(
    leadHasTranscriptDispute({
      notes: "Caller asked for a person — callback",
    }),
    false,
  );
  assert.equal(
    leadHasTranscriptDispute({ notes: "Spam / sales — not a job" }),
    false,
  );
});

test("transcript_dispute is a board kind with Call strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("transcript_dispute"));
  assert.equal(attentionKindLabel("transcript_dispute"), "Dispute");
  assert.equal(attentionActionStrategy("transcript_dispute"), "call");
});
