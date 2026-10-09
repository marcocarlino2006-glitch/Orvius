import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const { prisma } = await import("../src/lib/prisma.ts");
const { callSpendCut } = await import("../src/lib/call-spend-guard.ts");
const load = await import("../src/lib/demo-load.ts");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

async function makeShop() {
  const shop = await prisma.business.create({
    data: { name: "Summit HVAC", slug: `demo-load-${uid()}`, environment: "demo", ownerEmail: `o-${uid()}@example.test`, billingStatus: "active" },
  });
  made.push(shop.id);
  return shop;
}

async function addCalls(businessId, n, { status = "in-progress", minutesAgo = 1 } = {}) {
  const createdAt = new Date(Date.now() - minutesAgo * 60_000);
  for (let i = 0; i < n; i++) {
    await prisma.call.create({
      data: { businessId, vapiCallId: `vc-${uid()}`, callerPhone: `+1512555${String(1000 + made.length * 50 + i).slice(-4)}`, status, createdAt },
    });
  }
}

test("limits come from the environment, with safe defaults", () => {
  assert.equal(load.demoLiveCallCap({}), 6);
  assert.equal(load.demoDailyCeiling({}), 1500);
  assert.equal(load.demoLiveCallCap({ ORVIUS_DEMO_MAX_LIVE_CALLS: "12" }), 12);
  assert.equal(load.demoLiveCallCap({ ORVIUS_DEMO_MAX_LIVE_CALLS: "-1" }), 6);
  assert.equal(load.demoDailyCeiling({ ORVIUS_DEMO_DAILY_CALL_CEILING: "abc" }), 1500);
});

test("the verdict counts the call being decided", () => {
  const limits = { cap: 2, ceiling: 10 };
  assert.deepEqual(load.demoVerdict({ live: 2, today: 5 }, limits), { busy: false });
  assert.deepEqual(load.demoVerdict({ live: 3, today: 5 }, limits), { busy: true, reason: "demo_live_cap" });
  assert.deepEqual(load.demoVerdict({ live: 1, today: 11 }, limits), { busy: true, reason: "demo_daily_ceiling" });
  assert.equal(load.demoLineBusyForVisitor({ live: 2, today: 0 }, limits), true);
  assert.equal(load.demoLineBusyForVisitor({ live: 1, today: 0 }, limits), false);
});

test("the demo line ends calls past the live cap, and stale or finished calls don't count", async () => {
  const shop = await makeShop();
  const params = { shop: { id: shop.id, name: shop.name, ownerPhone: null, transferPhone: null }, callerPhone: "+15125559999", demo: true };

  await addCalls(shop.id, 6);
  await addCalls(shop.id, 5, { minutesAgo: 30 });
  await addCalls(shop.id, 5, { status: "completed" });
  assert.equal(await callSpendCut(params), null, "six live calls is at the cap, not over it");

  await addCalls(shop.id, 1);
  const cut = await callSpendCut(params);
  assert.equal(cut.reason, "demo_live_cap");
  assert.equal(cut.say, load.DEMO_OVERFLOW_SAY);
  assert.match(cut.say, /slash watch/);
  assert.doesNotMatch(cut.say, /team will/);

  assert.equal(await callSpendCut({ ...params, demo: false }), null, "a shop line is not held to the demo cap");
});

test("the webhook flags the demo line, pages once, and the site warns visitors", () => {
  const route = read("src/app/api/webhooks/vapi/route.ts");
  assert.match(route, /demo: isDemoPlatformLine\(/);
  assert.match(route, /pagePlatform\("demo_overflow"/);
  assert.match(read("src/lib/platform-pager.ts"), /demo_overflow: "/);
  const api = read("src/app/api/demo-line/route.ts");
  assert.match(api, /NextResponse\.json\(\{ busy \}/);
  assert.match(api, /s-maxage=15/);
  for (const p of ["src/components/home-line-hero.tsx", "src/components/home-call-demo.tsx", "src/app/try/page.tsx"]) {
    assert.match(read(p), /<DemoLineBusy \/>/, p);
  }
  assert.match(read("src/components/demo-line-busy.tsx"), /href="\/watch"/);
});
