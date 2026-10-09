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

const { checkTicket, endWebDemo, hashVisitor, isLineWebCall, joinLine, startWebDemo, WebDemoRefused } = await import("../src/lib/web-demo.ts");
const { createWebPreview } = await import("../src/lib/shop-preview.ts");

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
  await prisma.demoSlot.updateMany({ data: { ticketId: null, heldUntil: new Date(0) } });
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

test("a rush of visitors polling at once never gets more turns than the cap", async () => {
  await fresh(3);
  const joined = await Promise.all(Array.from({ length: 40 }, () => joinLine(ip())));
  for (let round = 0; round < 3; round++) {
    await Promise.all(joined.flatMap((t) => [checkTicket(t.ticketId), checkTicket(t.ticketId)]));
  }
  const granted = await prisma.demoTicket.count({ where: { status: "granted" } });
  const held = await prisma.demoSlot.count({ where: { id: { lt: 3 }, heldUntil: { gt: new Date() } } });
  assert.equal(granted, 3);
  assert.equal(held, 3, "each turn holds exactly one slot");
  const holders = await prisma.demoSlot.findMany({ where: { heldUntil: { gt: new Date() } } });
  assert.equal(new Set(holders.map((h) => h.ticketId)).size, holders.length, "no ticket holds two slots");
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
  const later = new Date(Date.now() + 2 * 60_000);
  await prisma.demoTicket.update({ where: { id: b.ticketId }, data: { lastSeenAt: later } });
  assert.equal((await checkTicket(b.ticketId, later)).state, "ready");
  await assert.rejects(startWebDemo(a.ticketId, fakeCreate, later), WebDemoRefused);
  assert.equal((await checkTicket(a.ticketId, later)).state, "done");
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

test("a visitor's own business answers in the browser, with the same two free calls", async () => {
  await fresh(5);
  calls.length = 0;
  const me = ip();
  const made = await createWebPreview({ shopName: "Ruiz Plumbing & Drain", trade: "Plumbing", serviceArea: "Tucson", visitorKey: hashVisitor(me) });
  assert.equal(made.ok, true);
  const preview = await prisma.shopPreview.findUnique({ where: { token: made.token } });
  assert.equal(preview.ownerPhone, "", "no phone number is asked for or stored");
  const again = await createWebPreview({ shopName: "Ruiz Plumbing", trade: "Plumbing", visitorKey: hashVisitor(me) });
  assert.equal(again.token, made.token, "one visitor keeps one preview");

  for (let n = 1; n <= 2; n++) {
    const t = await joinLine(me, new Date(), preview.id);
    assert.equal(t.state, "ready");
    const call = await startWebDemo(t.ticketId, fakeCreate);
    const body = calls.at(-1);
    assert.equal(body.assistantId, undefined, "answers as the visitor's business, not the demo shop");
    assert.match(JSON.stringify(body.assistant), /Ruiz Plumbing/);
    assert.equal(body.assistant.maxDurationSeconds, 180);
    assert.equal(body.assistant.metadata.demoTicketId, t.ticketId);
    const row = await prisma.shopPreview.findUnique({ where: { id: preview.id } });
    assert.equal(row.callsUsed, n);
    assert.equal(row.lastVapiCallId, call.id, "the end-of-call report finds this preview");
    await endWebDemo({ vapiCallId: call.id });
  }
  const third = await joinLine(me, new Date(), preview.id);
  await assert.rejects(startWebDemo(third.ticketId, fakeCreate), /used its free calls/);
  assert.equal((await prisma.demoSlot.count({ where: { ticketId: third.ticketId, heldUntil: { gt: new Date() } } })), 0, "the refused turn frees its slot");
  await prisma.shopPreview.delete({ where: { id: preview.id } });
});

test("web calls stay off the phone line's count, and web calls that skipped the line hang up", () => {
  const hook = read("src/app/api/webhooks/vapi/route.ts");
  assert.match(hook, /type === "webCall"/);
  assert.match(hook, /channel: WEB_DEMO_CHANNEL/);
  assert.match(hook, /isLineWebCall\(/, "a web call to the demo assistant must come through the line");
  assert.match(hook, /endWebDemo\(\{ vapiCallId/, "the end-of-call report frees the slot");
  assert.match(read("src/lib/demo-load.ts"), /channel: \{ not: "web_demo" \}/);
  assert.match(hook, /recordPreviewOutcome\(preview, message\);\s*if \(message\.call\?\.type === "webCall"\) after\(\(\) => endWebDemo/, "a browser preview frees its slot when it ends");
  assert.match(read("src/lib/shop-preview.ts"), /!preview\.ownerPhone\) return;/, "a browser preview never tries to text anyone");
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
