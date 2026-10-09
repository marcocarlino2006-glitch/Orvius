#!/usr/bin/env node
/*
 * Talking to the receptionist from the browser: visitors wait in a real line
 * for a fixed number of slots on the Vapi account paying shops depend on,
 * one visitor can't hog the line, the day has a ceiling, a slot is claimed
 * before a call is made, and web calls that skipped the line are hung up.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { mock } from "node:test";
import { PrismaClient } from "@prisma/client";

const assistant = { id: "asst-demo" };
mock.module(new URL("../src/lib/resolve-shop-line.ts", import.meta.url).href, {
  namedExports: { resolveBusinessByInboundPhone: async () => (assistant.id ? { vapiAssistantId: assistant.id } : null) },
});

const { checkTicket, endWebDemo, isLineWebCall, joinLine, startWebDemo, WebDemoRefused } = await import("../src/lib/web-demo.ts");

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
let ipSeq = 0;
const ip = () => `198.51.100.${++ipSeq % 250}-${Date.now()}`;
const calls = [];
const fakeCreate = async (body) => {
  calls.push(body);
  return { id: `call-${calls.length}-${Date.now()}`, webCallUrl: "https://example.daily.co/room", transport: { callToken: "t" } };
};

async function fresh(cap = 2, daily = 2000) {
  await prisma.demoTicket.deleteMany({});
  process.env.ORVIUS_DEMO_WEB_MAX_LIVE = String(cap);
  process.env.ORVIUS_DEMO_WEB_DAILY_CEILING = String(daily);
}

test.after(async () => {
  await prisma.demoTicket.deleteMany({});
  await prisma.$disconnect();
});

test("visitors past the cap wait in order and move up when a call ends", async () => {
  await fresh(2);
  const a = await joinLine(ip());
  const b = await joinLine(ip());
  const c = await joinLine(ip());
  const d = await joinLine(ip());
  assert.equal(a.state, "ready");
  assert.equal(b.state, "ready");
  assert.equal(c.state, "waiting");
  assert.equal(c.position, 1);
  assert.equal(c.talkingNow, 2);
  assert.equal(d.position, 2, "the later visitor is behind");

  await startWebDemo(a.ticketId, fakeCreate);
  assert.equal((await checkTicket(c.ticketId)).state, "waiting", "a call in progress still holds its slot");
  assert.equal((await checkTicket(d.ticketId)).state, "waiting", "nobody jumps the visitor ahead of them");

  await endWebDemo({ ticketId: a.ticketId });
  assert.equal((await checkTicket(d.ticketId)).state, "waiting", "the freed slot goes to whoever was first");
  assert.equal((await checkTicket(c.ticketId)).state, "ready");
});

test("a visitor who closed the tab stops holding up the line", async () => {
  await fresh(1);
  const a = await joinLine(ip());
  const gone = await joinLine(ip());
  const later = await joinLine(ip());
  assert.equal(a.state, "ready");
  assert.equal(later.position, 2);
  await prisma.demoTicket.update({ where: { id: gone.ticketId }, data: { lastSeenAt: new Date(Date.now() - 120_000) } });
  await endWebDemo({ ticketId: a.ticketId });
  assert.equal((await checkTicket(later.ticketId)).state, "ready");
});

test("an unused turn is handed back after its window", async () => {
  await fresh(1);
  const a = await joinLine(ip());
  const b = await joinLine(ip());
  assert.equal(b.state, "waiting");
  await prisma.demoTicket.update({ where: { id: a.ticketId }, data: { grantedAt: new Date(Date.now() - 5 * 60_000) } });
  assert.equal((await checkTicket(b.ticketId)).state, "ready");
  await assert.rejects(startWebDemo(a.ticketId, fakeCreate), WebDemoRefused);
  assert.equal((await checkTicket(a.ticketId)).state, "done");
});

test("one visitor keeps their place on refresh and can't take the line all hour", async () => {
  await fresh(10);
  const me = ip();
  const first = await joinLine(me);
  const again = await joinLine(me);
  assert.equal(again.ticketId, first.ticketId, "refreshing keeps the same place");
  for (let i = 0; i < 4; i++) {
    const t = await joinLine(me);
    await endWebDemo({ ticketId: t.ticketId });
  }
  assert.deepEqual(await joinLine(me), { state: "closed", reason: "limit" });
  assert.equal((await joinLine(ip())).state, "ready", "someone else still gets in");
});

test("the day has a ceiling on browser calls", async () => {
  await fresh(10, 1);
  const a = await joinLine(ip());
  await startWebDemo(a.ticketId, fakeCreate);
  assert.deepEqual(await joinLine(ip()), { state: "closed", reason: "daily" });
});

test("the slot is claimed before the call is made, and given back if Vapi refuses", async () => {
  await fresh(1);
  calls.length = 0;
  const a = await joinLine(ip());
  const call = await startWebDemo(a.ticketId, fakeCreate);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].assistantId, "asst-demo");
  assert.equal(calls[0].assistantOverrides.maxDurationSeconds, 180, "every browser call ends itself at 3 minutes");
  assert.equal(calls[0].assistantOverrides.metadata.demoTicketId, a.ticketId);
  assert.ok(call.webCallUrl);
  await assert.rejects(startWebDemo(a.ticketId, fakeCreate), WebDemoRefused, "a double click opens one call");
  assert.equal(calls.length, 1);
  assert.equal(await isLineWebCall(call.id), true);
  assert.equal(await isLineWebCall("call-from-somewhere-else"), false);
  await endWebDemo({ vapiCallId: call.id });
  assert.equal((await checkTicket(a.ticketId)).state, "done");

  const b = await joinLine(ip());
  const waiting = await joinLine(ip());
  assert.equal(b.state, "ready");
  assert.equal(waiting.state, "waiting");
  await assert.rejects(startWebDemo(b.ticketId, async () => { throw new Error("vapi 500"); }));
  assert.equal((await checkTicket(waiting.ticketId)).state, "ready", "a failed call frees the slot");

  assistant.id = null;
  await assert.rejects(startWebDemo(waiting.ticketId, fakeCreate));
  assistant.id = "asst-demo";
  assert.equal((await checkTicket(waiting.ticketId)).state, "done");
});

test("web calls stay off the phone line's count, and web calls that skipped the line hang up", () => {
  const hook = read("src/app/api/webhooks/vapi/route.ts");
  assert.match(hook, /type === "webCall"/);
  assert.match(hook, /channel: WEB_DEMO_CHANNEL/);
  assert.match(hook, /isLineWebCall\(/, "a web call to the demo assistant must come through the line");
  assert.match(hook, /endWebDemo\(\{ vapiCallId/, "the end-of-call report frees the slot");
  assert.match(read("src/lib/demo-load.ts"), /channel: \{ not: "web_demo" \}/);
});

test("the browser never holds a key and errors read as plain words", () => {
  const client = read("src/components/talk-in-browser.tsx");
  assert.doesNotMatch(client, /VAPI_API_KEY|NEXT_PUBLIC_VAPI|vapi\.start\(/, "calls are only made by the server");
  assert.match(client, /reconnect\(/);
  const route = read("src/app/api/demo-web/route.ts");
  assert.doesNotMatch(route, /error: error\.message \}, \{ status: 5/);
  assert.match(route, /sharedRateLimit/);
  assert.match(route, /VAPI_API_KEY/, "the demo stays hidden until Vapi is configured");
});
