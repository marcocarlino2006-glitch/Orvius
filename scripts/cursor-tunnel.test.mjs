import assert from "node:assert/strict";
import test from "node:test";

import { isNextActionQuestion, resolveShopOperateNext } from "../src/lib/shop-operate.ts";

test("next-action questions route to the operate tunnel", () => {
  assert.equal(isNextActionQuestion("What should I do now?"), true);
  assert.equal(isNextActionQuestion("what's next"), true);
  assert.equal(isNextActionQuestion("help"), true);
  assert.equal(isNextActionQuestion("Who called today?"), false);
});

test("covered next always points at Ask", () => {
  const next = resolveShopOperateNext({
    setupReady: true,
    setupNext: "done",
    setupHref: "/dashboard",
    failedAlerts: 0,
    stuckAlerts: 0,
    criticalAttention: 0,
    attentionCount: 0,
    proofStale: false,
    economicsReady: false,
  });
  assert.equal(next.id, "covered");
  assert.equal(next.href, "/dashboard/ask");
});
