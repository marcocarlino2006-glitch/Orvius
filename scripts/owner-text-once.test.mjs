#!/usr/bin/env node
/*
 * A text typed in Inbox goes out at most once per operation key: a second
 * press, a retry after a lost reply and a twin request read the first send
 * back from the intent ledger instead of calling the provider again. A reply
 * the provider never gave reads as "may have gone out", not "didn't send".
 * Mocked Twilio client, disposable database, no real texts.
 */
import assert from "node:assert/strict";
import { after, mock, test } from "node:test";

process.env.TWILIO_ACCOUNT_SID = "AC_test_only";
process.env.TWILIO_AUTH_TOKEN = "test-only";
process.env.TWILIO_MESSAGING_SERVICE_SID = "MG_shared_test";
delete process.env.TWILIO_PHONE_NUMBER;

const calls = [];
let script = [];
mock.module(new URL("../src/lib/twilio-client.ts", import.meta.url).href, {
  namedExports: {
    getTwilioClient: () => ({
      messages: {
        create: async (p) => {
          calls.push(p);
          await new Promise((resolve) => setTimeout(resolve, 20));
          const next = script.shift() ?? { sid: `SM${calls.length}${Date.now()}` };
          if (next instanceof Error) throw next;
          return next;
        },
      },
    }),
  },
});
let signedInAs = null;
mock.module(new URL("../src/auth.ts", import.meta.url).href, {
  namedExports: { auth: async () => (signedInAs ? { user: { email: signedInAs } } : null), signIn: async () => {}, signOut: async () => {}, handlers: {} },
});

const { prisma } = await import("../src/lib/prisma.ts");
const route = await import("../src/app/api/messages/thread/route.ts");

await prisma.messagingSender.upsert({
  where: { identity: "service:MG_shared_test" },
  create: { identity: "service:MG_shared_test", kind: "messaging_service", status: "verified", checkedAt: new Date(), recordedBy: "test" },
  update: { status: "verified" },
});

const created = [];
after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const phone = () => `+1312${7_000_000 + Math.floor(Math.random() * 2_000_000)}`;
const fail = (status, code) => Object.assign(new Error("twilio said no"), { status, code });

async function shop() {
  const ownerEmail = `once-${uid()}@example.test`;
  const row = await prisma.business.create({
    data: {
      name: "Once Heating",
      slug: `once-${uid()}`,
      trade: "HVAC",
      environment: "production",
      timezone: "America/Chicago",
      billingStatus: "active",
      billingPlan: "pro",
      ownerEmail,
      ownerPhone: phone(),
      hoursJson: "{}",
    },
  });
  await prisma.shopTexting.create({ data: { businessId: row.id, status: "approved", messagingServiceSid: "MG_own_test", detailsJson: "{}" } });
  created.push(row.id);
  signedInAs = ownerEmail;
  return row;
}

function reset(next = []) {
  calls.length = 0;
  script = next;
}

async function send(body) {
  const res = await route.POST(new Request("http://local.test/api/messages/thread", { method: "POST", body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json().catch(() => null) };
}

const sentAudits = (businessId) => prisma.auditEvent.count({ where: { businessId, action: "message.sent" } });
const outbound = (businessId, to) => prisma.message.count({ where: { businessId, phoneNormalized: to, direction: "out" } });

test("one press sends once and says so; a second press with the same key reads it back", async () => {
  const s = await shop();
  const to = phone();
  reset([{ sid: "SM_first" }]);
  const operationKey = `op-${uid()}`;

  const first = await send({ phone: to, body: "Running 10 min late", operationKey });
  assert.equal(first.status, 200);
  assert.equal(first.body.sent, true);
  assert.equal(first.body.sid, "SM_first");

  const again = await send({ phone: to, body: "Running 10 min late", operationKey });
  assert.equal(again.status, 200);
  assert.equal(again.body.sent, true);
  assert.equal(again.body.duplicate, true, "the second press is told it already went");
  assert.equal(again.body.sid, "SM_first");
  assert.ok(again.body.thread, "and gets the thread to show it");

  assert.equal(calls.length, 1, "one provider call");
  assert.equal(await sentAudits(s.id), 1, "one history row");
  assert.equal(await outbound(s.id, to), 1, "one message in the thread");
  const intent = await prisma.smsIntent.findFirst({ where: { businessId: s.id, eventType: "owner.text", eventId: operationKey } });
  assert.equal(intent.status, "submitted");
  assert.equal(intent.authorizedBy, s.ownerEmail);
});

test("two presses at the same moment make one provider call", async () => {
  const s = await shop();
  const to = phone();
  reset();
  const operationKey = `op-${uid()}`;

  const [a, b] = await Promise.all([
    send({ phone: to, body: "On my way", operationKey }),
    send({ phone: to, body: "On my way", operationKey }),
  ]);

  assert.equal(calls.length, 1, "one provider call for both presses");
  assert.equal(await outbound(s.id, to), 1);
  for (const r of [a, b]) {
    assert.ok(r.body.sent === true || r.body.pending === true, `each press reads sent or still sending, got ${JSON.stringify(r.body)}`);
    assert.notEqual(r.body.reason, "sms_not_configured", "the losing twin is not told texting isn't set up");
  }
});

test("a lost provider reply reads as maybe sent and is never resent under its key", async () => {
  const s = await shop();
  const to = phone();
  reset([fail(503, 20500)]);
  const operationKey = `op-${uid()}`;

  const first = await send({ phone: to, body: "Can you send a photo?", operationKey });
  assert.equal(first.status, 202);
  assert.equal(first.body.unknown, true);
  assert.match(first.body.error, /may have gone out/);
  assert.match(first.body.error, /won't send it again/);

  const retry = await send({ phone: to, body: "Can you send a photo?", operationKey });
  assert.equal(retry.status, 202);
  assert.equal(retry.body.unknown, true);
  assert.equal(calls.length, 1, "the retry did not call the provider");
  assert.equal(await sentAudits(s.id), 0, "nothing recorded as sent");
});

test("a refused text says it wasn't sent, and stays refused under its key", async () => {
  const s = await shop();
  const to = phone();
  reset([fail(400, 21606), fail(400, 21606)]);
  const operationKey = `op-${uid()}`;

  const first = await send({ phone: to, body: "Hi", operationKey });
  assert.equal(first.status, 502);
  assert.equal(first.body.refused, true);
  assert.match(first.body.error, /wasn't sent/);
  const providerCalls = calls.length;

  const retry = await send({ phone: to, body: "Hi", operationKey });
  assert.equal(retry.status, 502);
  assert.equal(calls.length, providerCalls, "the same key is not tried again");

  reset([{ sid: "SM_new_key" }]);
  const fresh = await send({ phone: to, body: "Hi", operationKey: `op-${uid()}` });
  assert.equal(fresh.body.sent, true, "a new key is a new attempt");
  assert.equal(calls.length, 1);
  assert.equal(await sentAudits(s.id), 1);
});

test("a malformed key is refused before anything is sent; signed out is refused", async () => {
  await shop();
  reset();
  const bad = await send({ phone: phone(), body: "Hi", operationKey: "x y" });
  assert.equal(bad.status, 400);
  signedInAs = null;
  const out = await send({ phone: phone(), body: "Hi", operationKey: `op-${uid()}` });
  assert.equal(out.status, 401);
  assert.equal(calls.length, 0);
});

test("another shop using the same key gets its own send, not the first shop's", async () => {
  const a = await shop();
  const to = phone();
  const operationKey = `op-${uid()}`;
  reset([{ sid: "SM_shop_a" }, { sid: "SM_shop_b" }]);
  const first = await send({ phone: to, body: "Hi", operationKey });
  assert.equal(first.body.sid, "SM_shop_a");

  const b = await shop();
  const second = await send({ phone: to, body: "Hi", operationKey });
  assert.equal(second.body.sent, true);
  assert.equal(second.body.duplicate, undefined, "shop B is not shown shop A's send");
  assert.equal(second.body.sid, "SM_shop_b");
  assert.equal(calls.length, 2);
  assert.equal(await outbound(a.id, to), 1);
  assert.equal(await outbound(b.id, to), 1);
});

test("a request without a key still sends, as before", async () => {
  const s = await shop();
  const to = phone();
  reset([{ sid: "SM_legacy" }]);
  const r = await send({ phone: to, body: "Hi" });
  assert.equal(r.body.sent, true);
  assert.equal(calls.length, 1);
  assert.equal(await prisma.smsIntent.count({ where: { businessId: s.id } }), 0);
});
