import assert from "node:assert/strict";
import test from "node:test";

import { leadWantsHuman } from "../src/lib/lead-wants-human.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("detects caller asked for a human from notes or service text", () => {
  assert.equal(
    leadWantsHuman({ notes: "Caller asked for a person — callback" }),
    true,
  );
  assert.equal(leadWantsHuman({ serviceType: "talk to someone" }), true);
  assert.equal(leadWantsHuman({ notes: "AC not cooling", serviceType: "AC" }), false);
});

test("wants_human is a first-class board kind with Call strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("wants_human"));
  assert.equal(attentionKindLabel("wants_human"), "Wants you");
  assert.equal(attentionActionStrategy("wants_human"), "call");
});
