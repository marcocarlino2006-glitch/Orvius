import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveShopOperateNext,
  shopOperateBannerVisible,
} from "../src/lib/shop-operate.ts";

const base = {
  setupReady: true,
  setupNext: "done",
  setupHref: "/dashboard",
  failedAlerts: 0,
  stuckAlerts: 0,
  criticalAttention: 0,
  attentionCount: 0,
  proofStale: false,
  economicsReady: false,
};

test("alerts beat everything else", () => {
  const next = resolveShopOperateNext({
    ...base,
    failedAlerts: 2,
    setupReady: false,
    setupNext: "verify",
    criticalAttention: 3,
  });
  assert.equal(next?.id, "alerts");
  assert.equal(next?.tone, "critical");
  assert.equal(shopOperateBannerVisible(next), true);
});

test("setup precedes board work when the front door is open", () => {
  const next = resolveShopOperateNext({
    ...base,
    setupReady: false,
    setupNext: "verify",
    setupHref: "/dashboard/onboarding",
    attentionCount: 4,
  });
  assert.equal(next?.id, "setup:verify");
  assert.match(next?.cta ?? "", /Prove/);
});

test("critical board items beat weekly proof", () => {
  const next = resolveShopOperateNext({
    ...base,
    criticalAttention: 1,
    attentionCount: 1,
    proofStale: true,
    economicsReady: true,
  });
  assert.equal(next?.id, "board-critical");
  assert.equal(shopOperateBannerVisible(next), false);
});

test("board work does not paint a second Open-the-board banner", () => {
  const next = resolveShopOperateNext({
    ...base,
    attentionCount: 3,
  });
  assert.equal(next.id, "board");
  assert.equal(shopOperateBannerVisible(next), false);
});

test("weekly proof surfaces when the board is clear", () => {
  const next = resolveShopOperateNext({
    ...base,
    proofStale: true,
    economicsReady: true,
  });
  assert.equal(next?.id, "weekly-proof");
  assert.equal(next?.tone, "ritual");
  assert.equal(shopOperateBannerVisible(next), true);
});

test("clear shop returns covered for Ask — Command banner stays dark", () => {
  const next = resolveShopOperateNext(base);
  assert.equal(next.id, "covered");
  assert.equal(next.tone, "ritual");
  assert.match(next.cta, /Ask/);
  assert.equal(shopOperateBannerVisible(next), false);
});
