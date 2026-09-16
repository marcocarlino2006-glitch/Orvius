import assert from "node:assert/strict";
import test from "node:test";

import { buildPipelineProof } from "../src/lib/pipeline-proof.ts";

function event(key, proves) {
  return {
    key,
    kind: "call_captured",
    tone: "agent",
    at: new Date().toISOString(),
    title: key,
    detail: null,
    href: null,
    amountCents: null,
    proves,
  };
}

test("pipeline proof only marks stages backed by measured events", () => {
  const proof = buildPipelineProof(
    [
      event("call", ["call", "lead"]),
      event("job", ["job"]),
      event("alert", ["alert"]),
    ],
    true,
  );

  assert.deepEqual(
    proof.map(({ id, state }) => [id, state]),
    [
      ["call", "proven"],
      ["lead", "proven"],
      ["job", "proven"],
      ["alert", "proven"],
      ["money", "waiting"],
    ],
  );
});

test("money is optional until the shop enables collection", () => {
  const proof = buildPipelineProof([], false);
  assert.equal(proof.find((stage) => stage.id === "money")?.state, "optional");
  assert.equal(
    proof.filter((stage) => stage.state === "proven").length,
    0,
  );
});
