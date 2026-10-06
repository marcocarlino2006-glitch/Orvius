#!/usr/bin/env node
/*
 * The scale audit, item by item: each test pins one way the business could
 * have failed at scale — a takeover, a silent line, a cost leak — so it stays
 * fixed.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

delete process.env.RESEND_API_KEY;

const nextServer = await import("next/server");
const deferred = [];
mock.module("next/server", {
  namedExports: { ...nextServer, after: (task) => deferred.push(task) },
});

let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: {
    auth: async () => (signedInAs ? { user: { email: signedInAs } } : null),
    signIn: async () => {},
    signOut: async () => {},
    handlers: {},
  },
});

const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => Math.random().toString(36).slice(2, 10);
const made = [];

async function makeShop(overrides = {}) {
  const shop = await prisma.business.create({
    data: {
      name: `Audit ${uid()}`,
      slug: `audit-${Date.now()}-${uid()}`,
      environment: "test",
      trade: "HVAC",
      ownerEmail: `owner-${uid()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...overrides,
    },
  });
  made.push(shop.id);
  return shop;
}

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

function patch(body) {
  return new Request("http://localhost/api/account", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("1. a manager cannot take the shop by changing the owner email; the owner still can", async () => {
  const { PATCH } = await import("../src/app/api/account/route.ts");
  const shop = await makeShop();
  const manager = `mgr-${uid()}@example.test`;
  await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });

  signedInAs = manager;
  const takeover = await PATCH(patch({ ownerEmail: manager }));
  assert.equal(takeover.status, 403);
  assert.match((await takeover.json()).error, /owns the shop/);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).ownerEmail, shop.ownerEmail);

  // The settings form sends the unchanged owner email on every save; that must keep working for managers.
  const save = await PATCH(patch({ ownerEmail: shop.ownerEmail.toUpperCase(), name: "Renamed by manager" }));
  assert.equal(save.status, 200);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).name, "Renamed by manager");

  signedInAs = shop.ownerEmail;
  const next = `new-owner-${uid()}@example.test`;
  const transfer = await PATCH(patch({ ownerEmail: next }));
  assert.equal(transfer.status, 200);
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).ownerEmail, next);
  signedInAs = null;
});

function twilioForm(fields) {
  const form = new URLSearchParams(fields);
  return new Request("http://localhost/api/webhooks/twilio/voice-fallback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

test("2. AI down: the owner's phone rings live first, voicemail if nobody answers, and a database outage still gets the recorder", async () => {
  const { POST } = await import("../src/app/api/webhooks/twilio/voice-fallback/route.ts");
  const line = `+1720555${String(Math.floor(Math.random() * 9000) + 1000)}`;
  const shop = await makeShop({ name: "Fallback Air", twilioPhone: line, ownerPhone: "+13035550101" });
  const sid = `CA${uid()}`;
  const caller = `+1303555${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const first = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid }))).text();
  assert.match(first, /<Dial [^>]*timeout="18"/);
  assert.match(first, /<Number>\+13035550101<\/Number>/);
  const lead = await prisma.lead.findFirst({ where: { businessId: shop.id, externalId: `voice-fallback:${sid}` } });
  assert.ok(lead, "the missed call is a lead before anyone answers");
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, leadId: lead.id } });
  assert.match(alert.message, /ringing your phone now/);

  const noAnswer = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid, DialCallStatus: "no-answer" }))).text();
  assert.match(noAnswer, /<Record /);
  assert.match(noAnswer, /Thanks for calling Fallback Air/);

  const answered = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid, DialCallStatus: "completed" }))).text();
  assert.match(answered, /<Hangup \/>/);
  assert.match((await prisma.lead.findUnique({ where: { id: lead.id } })).notes, /answered live/);

  // The owner's phone bounced the ring back to this line: straight to the recorder, no second ring.
  const bounced = await (await POST(twilioForm({ From: caller, To: line, CallSid: `CA${uid()}`, ForwardedFrom: "+13035550101" }))).text();
  assert.doesNotMatch(bounced, /<Dial/);
  assert.match(bounced, /<Record /);
  const bouncedNoHeader = await (await POST(twilioForm({ From: caller, To: line, CallSid: `CA${uid()}` }))).text();
  assert.doesNotMatch(bouncedNoHeader, /<Dial/, "a repeat within two minutes is a bounce even without ForwardedFrom");

  const findMany = prisma.business.findMany;
  prisma.business.findMany = async () => {
    throw new Error("SQLITE_BUSY: database is locked");
  };
  try {
    const dbDown = await POST(twilioForm({ From: caller, To: line, CallSid: `CA${uid()}` }));
    assert.equal(dbDown.status, 200);
    const twiml = await dbDown.text();
    assert.match(twiml, /Thanks for calling\. We can&apos;t take your call live/);
    assert.match(twiml, /<Record /);
    const recDown = await (await POST(twilioForm({ From: caller, To: line, CallSid: sid, RecordingUrl: "https://api.twilio.com/rec/RE1", RecordingDuration: "12" }))).text();
    assert.match(recDown, /we&apos;ve got your message/);
  } finally {
    prisma.business.findMany = findMany;
  }
});
