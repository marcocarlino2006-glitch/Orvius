import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const machine = await import("../src/lib/shop-machine.ts");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a shop gets a line only when one is free after the demos", () => {
  const open = machine.linePlan({ purchased: 20, demoBudget: 16, shops: 3 });
  assert.equal(open.shopLines, 3);
  assert.equal(open.left, 1);
  assert.equal(machine.canReserveShopLine(open), true);

  const full = machine.linePlan({ purchased: 20, demoBudget: 16, shops: 4 });
  assert.equal(full.left, 0);
  assert.equal(machine.canReserveShopLine(full), false);

  const unknown = machine.linePlan({ purchased: null, demoBudget: 16, shops: 0 });
  assert.equal(unknown.left, null);
  assert.equal(machine.canReserveShopLine(unknown), false);
});

test("the purchased total and the demo budget are recorded, not invented", () => {
  assert.equal(machine.purchasedCallLines({}), null);
  assert.equal(machine.purchasedCallLines({ ORVIUS_VAPI_CALL_LINES: "25" }), 25);
  assert.equal(machine.purchasedCallLines({ ORVIUS_VAPI_CALL_LINES: "0" }), null);
  assert.equal(machine.demoLineBudget({}), 16);
  assert.equal(machine.demoLineBudget({ ORVIUS_DEMO_MAX_LIVE_CALLS: "2", ORVIUS_DEMO_WEB_MAX_LIVE: "3" }), 5);
});

test("go-live refuses an unreserved line, and a second caller cannot take the shop's line", () => {
  const checkout = read("src/app/api/billing/checkout/route.ts");
  assert.match(checkout, /canReserveShopLine/);
  assert.match(checkout, /line_not_reserved/);
  const guard = read("src/lib/call-spend-guard.ts");
  assert.match(guard, /reserveShopLine/);
  assert.match(guard, /shop_line/);
  const hook = read("src/app/api/webhooks/vapi/route.ts");
  assert.match(hook, /ownsLine: business\.environment === "production"/);
  assert.match(hook, /releaseShopLine/);
  const setup = read("src/components/turn-on-orvius.tsx");
  assert.match(setup, /Hear your shop answer/);
  assert.match(setup, /TalkInBrowser/);
  assert.doesNotMatch(setup, /lineBlocked/);
  assert.doesNotMatch(machine.LINE_NOT_RESERVED, /support@orvius\.im/);
  assert.match(machine.LINE_NOT_RESERVED, /Checkout opens once that line is reserved/);
});

test("one shop, one line: the second call waits", async () => {
  const { prisma } = await import("../src/lib/prisma.ts");
  const shop = `shop-line-test-${Math.random().toString(36).slice(2, 8)}`;
  const now = new Date();
  try {
    const first = `vc-${shop}-1`;
    const second = `vc-${shop}-2`;
    assert.equal(await machine.reserveShopLine(shop, first, now), true);
    assert.equal(await machine.reserveShopLine(shop, second, now), false, "the line stays with the first call");
    assert.equal(await machine.reserveShopLine(shop, first, now), true, "the same call keeps its line");
    await machine.releaseShopLine(first);
    assert.equal(await machine.reserveShopLine(shop, second, now), true, "ending the call frees the line");
  } finally {
    await prisma.provisionAttempt.deleteMany({ where: { key: `shop-line:${shop}` } });
    await prisma.$disconnect();
  }
});
