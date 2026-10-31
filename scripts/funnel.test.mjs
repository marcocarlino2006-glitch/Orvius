#!/usr/bin/env node
/*
 * Every step from pricing to a paid shop is counted without cookies. A
 * browser can only report page views; the steps that mean money (shop named,
 * heard it, checkout, paid) are recorded by the server where they happen.
 * Bots, Do Not Track and Global Privacy Control are never counted.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.AUTH_SECRET = "funnel-test-secret";
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { FUNNEL_STEPS, funnelRows, isBot, ownerWho, readFunnel, recordFunnel, visitorWho } = await import("../src/lib/funnel.ts");
const { POST } = await import("../src/app/api/funnel/route.ts");

const prisma = new PrismaClient();
const tag = `t${Math.random().toString(36).slice(2, 8)}`;
test.after(async () => {
  await prisma.funnelEvent.deleteMany({ where: { OR: [{ who: { contains: tag } }, { detail: tag }] } });
  await prisma.$disconnect();
});

const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";

function beacon(body, headers = {}) {
  return POST(
    new Request("https://orvius.im/api/funnel", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": BROWSER, "x-real-ip": `203.0.113.${Math.floor(Math.random() * 200)}`, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

test("an owner is the same code on every device and day; a visitor is a stranger tomorrow", () => {
  assert.equal(ownerWho("Dana@Shop.com "), ownerWho("dana@shop.com"));
  assert.match(ownerWho("dana@shop.com"), /^o:/);
  assert.doesNotMatch(ownerWho("dana@shop.com"), /dana/);
  const today = visitorWho("203.0.113.9", BROWSER, new Date("2026-10-31T12:00:00Z"));
  assert.equal(today, visitorWho("203.0.113.9", BROWSER, new Date("2026-10-31T23:00:00Z")));
  assert.notEqual(today, visitorWho("203.0.113.9", BROWSER, new Date("2026-11-01T01:00:00Z")));
  assert.doesNotMatch(today, /203/);
});

test("crawlers and scripts are not people", () => {
  assert.equal(isBot(BROWSER), false);
  for (const agent of [null, "", "Googlebot/2.1", "curl/8.4", "HeadlessChrome", "Vercelbot"]) assert.equal(isBot(agent), true, String(agent));
});

test("each step shows how many of the step before reached it", () => {
  const rows = funnelRows({ pricing: 200, signup: 50, setup: 40, shop_named: 30, heard: 15, pay: 10, checkout: 6, paid: 3 });
  assert.deepEqual(rows.map((r) => r.event), FUNNEL_STEPS.map((s) => s.event));
  assert.equal(rows[0].fromPrevious, null);
  assert.equal(rows[1].fromPrevious, 25);
  assert.equal(rows.at(-1).fromPrevious, 50);
  assert.equal(funnelRows({ signup: 4 })[1].fromPrevious, null);
});

test("the browser can report page views, never money steps, and nothing under DNT or GPC", async () => {
  const before = await prisma.funnelEvent.count();
  assert.equal((await beacon({ event: "pricing", detail: tag })).status, 204);
  assert.equal((await beacon({ event: "paid", detail: tag })).status, 204);
  assert.equal((await beacon({ event: "checkout", detail: tag })).status, 204);
  assert.equal((await beacon({ event: "made_up", detail: tag })).status, 204);
  assert.equal((await beacon({ event: "pricing", detail: tag }, { dnt: "1" })).status, 204);
  assert.equal((await beacon({ event: "pricing", detail: tag }, { "sec-gpc": "1" })).status, 204);
  assert.equal((await beacon({ event: "pricing", detail: tag }, { "user-agent": "Googlebot/2.1" })).status, 204);
  const rows = await prisma.funnelEvent.findMany({ where: { detail: tag } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].event, "pricing");
  assert.match(rows[0].who, /^v:/);
  assert.equal(await prisma.funnelEvent.count(), before + 1);
});

test("a signed-in owner's steps join up under their account code", async () => {
  signedInAs = `${tag}@shop.com`;
  try {
    await beacon({ event: "setup", detail: tag });
    await beacon({ event: "pay", detail: tag });
  } finally {
    signedInAs = null;
  }
  const rows = await prisma.funnelEvent.findMany({ where: { detail: tag, event: { in: ["setup", "pay"] } } });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.who === ownerWho(`${tag}@shop.com`)));
});

test("people are counted once per step however often they come back", async () => {
  const who = `o:${tag}-counted`;
  const baseline = await readFunnel(7);
  await recordFunnel("heard", who);
  await recordFunnel("heard", who);
  await recordFunnel("heard", `o:${tag}-other`);
  const after = await readFunnel(7);
  assert.equal(after.ready, true);
  const heard = (view) => view.rows.find((r) => r.event === "heard").people;
  assert.equal(heard(after) - heard(baseline), 2);
});
