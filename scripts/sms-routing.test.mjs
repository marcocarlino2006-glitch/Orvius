/*
 * Every text Orvius sends leaves from one shared sender, so the number a reply
 * arrives on says nothing about which shop it is for. Before OutboundSms, a
 * homeowner answering a real shop's confirmation text landed in the demo
 * shop's inbox. These drive the real resolver against the real database.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { recordOutboundSms, smsSender } from "../src/lib/twilio-sms.ts";
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}
const { namedCandidate, resolveBusinessForInboundSms, resolveInboundSmsOwner } = await import("../src/lib/resolve-shop-line.ts");

const prisma = new PrismaClient();
const PLATFORM_LINE = "+18446439170";
const CUSTOMER = "+15555550177";

async function makeShop(name, line, ownerPhone = null) {
  return prisma.business.create({
    data: {
      name,
      ownerPhone,
      slug: `sms-route-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      billingStatus: "pilot",
      twilioPhone: line,
      vapiPhoneNumber: line,
    },
  });
}

const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("a reply to the shared sender goes to the one shop that texted that phone", async () => {
  const prev = process.env.TWILIO_PHONE_NUMBER;
  process.env.TWILIO_PHONE_NUMBER = PLATFORM_LINE;
  const demo = await prisma.business.findFirst({
    where: { OR: [{ twilioPhone: PLATFORM_LINE }, { vapiPhoneNumber: PLATFORM_LINE }] },
  });
  const a = await makeShop("Route Proof Air A", "+15555550901");
  const b = await makeShop("Route Proof Air B", "+15555550902");
  try {
    await recordOutboundSms({ businessId: a.id, to: CUSTOMER, audience: "customer" });
    let hit = await resolveBusinessForInboundSms({ to: PLATFORM_LINE, from: CUSTOMER });
    assert.equal(hit?.id, a.id);

    const pooled = await resolveBusinessForInboundSms({ to: "+15555550999", from: CUSTOMER });
    assert.equal(pooled?.id, a.id, "a messaging-service pool number no shop owns routes the same way");

    const stranger = await resolveBusinessForInboundSms({ to: PLATFORM_LINE, from: "+15555550178" });
    assert.equal(stranger?.id ?? null, demo?.id ?? null, "no history falls back to the line's owner");
  } finally {
    await drop(a.id);
    await drop(b.id);
    if (prev === undefined) delete process.env.TWILIO_PHONE_NUMBER;
    else process.env.TWILIO_PHONE_NUMBER = prev;
  }
});

test("a text to a shop's own line stays with that shop", async () => {
  const a = await makeShop("Route Proof Air C", "+15555550903");
  const b = await makeShop("Route Proof Air D", "+15555550904");
  try {
    await recordOutboundSms({ businessId: b.id, to: CUSTOMER, audience: "customer" });
    const hit = await resolveBusinessForInboundSms({ to: "+15555550903", from: CUSTOMER });
    assert.equal(hit?.id, a.id);
  } finally {
    await drop(a.id);
    await drop(b.id);
  }
});

test("replies older than the window start a new conversation", async () => {
  const a = await makeShop("Route Proof Air E", "+15555550905");
  try {
    await recordOutboundSms({ businessId: a.id, to: "+15555550179", audience: "customer" });
    const later = new Date(Date.now() + 31 * 86_400_000);
    const hit = await resolveBusinessForInboundSms({ to: "+15555550999", from: "+15555550179", now: later });
    assert.equal(hit, null);
  } finally {
    await drop(a.id);
  }
});

test("the messaging service pool is preferred over the single number", () => {
  const prevSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const prevNum = process.env.TWILIO_PHONE_NUMBER;
  try {
    process.env.TWILIO_PHONE_NUMBER = PLATFORM_LINE;
    delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    assert.deepEqual(smsSender(), { from: PLATFORM_LINE });
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MG0000000000000000000000000000test";
    assert.deepEqual(smsSender(), { messagingServiceSid: "MG0000000000000000000000000000test" });
  } finally {
    if (prevSid === undefined) delete process.env.TWILIO_MESSAGING_SERVICE_SID;
    else process.env.TWILIO_MESSAGING_SERVICE_SID = prevSid;
    if (prevNum === undefined) delete process.env.TWILIO_PHONE_NUMBER;
    else process.env.TWILIO_PHONE_NUMBER = prevNum;
  }
});

test("two shops texted that phone: the reply is held unless it names one or comes from an owner", async () => {
  const phone = "+15555550181";
  const a = await makeShop("Hold Proof Cooling LLC", "+15555550911", "+15555550961");
  const b = await makeShop("Hold Proof Plumbing", "+15555550912", "+15555550962");
  try {
    await recordOutboundSms({ businessId: a.id, to: phone, audience: "customer" });
    await new Promise((r) => setTimeout(r, 5));
    await recordOutboundSms({ businessId: b.id, to: phone, audience: "customer" });

    const held = await resolveInboundSmsOwner({ to: "+15555550999", from: phone, body: "Is Tuesday still ok?" });
    assert.equal(held.kind, "ambiguous", "the latest sender no longer wins by default");
    assert.deepEqual(held.candidates.map((c) => c.id).sort(), [a.id, b.id].sort());
    assert.equal(await resolveBusinessForInboundSms({ to: "+15555550999", from: phone }), null);

    const named = await resolveInboundSmsOwner({ to: "+15555550999", from: phone, body: "hold proof cooling" });
    assert.equal(named.kind, "shop");
    assert.equal(named.business.id, a.id, "naming the older shop routes to it, legal suffix optional");
    assert.equal(named.clarified, true);

    await recordOutboundSms({ businessId: a.id, to: b.ownerPhone, audience: "customer" });
    await recordOutboundSms({ businessId: b.id, to: b.ownerPhone, audience: "owner" });
    const owner = await resolveInboundSmsOwner({ to: "+15555550999", from: b.ownerPhone, body: "BOOK" });
    assert.equal(owner.kind, "shop");
    assert.equal(owner.business.id, b.id, "an owner's own control text is never held");

    const own = await resolveInboundSmsOwner({ to: a.twilioPhone, from: phone, body: "hi" });
    assert.equal(own.business.id, a.id, "a shop's own line is never ambiguous");
  } finally {
    await drop(a.id);
    await drop(b.id);
  }
});

test("a reply names a shop only when exactly one name appears whole", () => {
  const shops = [{ name: "Cool Air LLC" }, { name: "Cool Air Pros" }, { name: "Smith & Sons Plumbing" }];
  assert.equal(namedCandidate("This is for Cool Air LLC", shops)?.name, "Cool Air LLC");
  assert.equal(namedCandidate("cool air pros!", shops)?.name, "Cool Air Pros");
  assert.equal(namedCandidate("smith and sons plumbing", shops)?.name, "Smith & Sons Plumbing");
  assert.equal(namedCandidate("cool", shops), null, "a fragment names nobody");
  assert.equal(namedCandidate("Cool Air", shops)?.name, "Cool Air LLC", "a name without its legal suffix still counts");
  assert.equal(namedCandidate("Cool Air LLC or Cool Air Pros", shops), null, "two names is still ambiguous");
  assert.equal(namedCandidate(undefined, shops), null);
});

test("the webhook holds an ambiguous reply, warns both owners without the text, and releases it to the shop the customer names", async () => {
  const phone = "+15555550182";
  const a = await makeShop("Release Proof Heating", "+15555550913", "+15555550963");
  const b = await makeShop("Release Proof Electric", "+15555550914", "+15555550964");
  const { POST } = await import("../src/app/api/webhooks/twilio/sms/route.ts");
  const { NextRequest } = await import("next/server");
  const text = (Body, MessageSid) =>
    POST(
      new NextRequest("http://localhost/api/webhooks/twilio/sms", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ From: phone, To: "+15555550999", Body, MessageSid }),
      }),
    );
  const sid = (n) => `SMhold${n}${Date.now()}`;
  try {
    await recordOutboundSms({ businessId: a.id, to: phone, audience: "customer" });
    await recordOutboundSms({ businessId: b.id, to: phone, audience: "customer" });

    const first = sid(1);
    const ask = await (await text("The basement is leaking again, can someone come today?", first)).text();
    assert.match(ask, /more than one business/i);
    assert.match(ask, /Release Proof Heating/);
    assert.match(ask, /Release Proof Electric/);
    await text("The basement is leaking again, can someone come today?", first);

    assert.equal(await prisma.lead.count({ where: { businessId: { in: [a.id, b.id] } } }), 0, "no shop gets the text by guess");
    const heldRows = await prisma.webhookEvent.findMany({ where: { source: "twilio-sms", externalId: first, eventType: "inbound-held" } });
    assert.equal(heldRows.length, 1);
    assert.equal(heldRows[0].status, "held");
    assert.equal(heldRows[0].businessId, null);

    const alerts = await prisma.ownerNotification.findMany({ where: { businessId: { in: [a.id, b.id] }, dedupeKey: { startsWith: `sms-held:${first}` } } });
    assert.deepEqual([...new Set(alerts.map((n) => n.businessId))].sort(), [a.id, b.id].sort(), "each candidate owner hears once per channel");
    assert.ok(alerts.every((n) => n.message.includes(phone) && !/basement/i.test(n.message)), "neither owner sees a text that may be for the other");

    const { heldTextsText } = await import("../src/lib/company-scoreboard.ts");
    const heldNow = await prisma.webhookEvent.count({ where: { source: "twilio-sms", eventType: "inbound-held", status: "held" } });
    assert.ok(heldNow >= 1);
    assert.match(heldTextsText({ count: heldNow, oldestAt: heldRows[0].createdAt.toISOString() }), /Texts held because two shops could own them: \d+, oldest \d{4}-\d{2}-\d{2}/, "the founder's weekly board names the backlog");
    assert.equal(heldTextsText({ count: 0, oldestAt: null }), "Texts held because two shops could own them: none");

    const pick = sid(2);
    await text("Release Proof Heating", pick);
    await text("Release Proof Heating", pick);
    const leads = await prisma.lead.findMany({ where: { businessId: { in: [a.id, b.id] } } });
    assert.equal(leads.length, 1, "one lead, once, even when the answer is redelivered");
    assert.equal(leads[0].businessId, a.id);
    assert.match(leads[0].notes, /basement is leaking/, "the held words reach the shop the customer named");
    const released = await prisma.webhookEvent.findUnique({ where: { id: heldRows[0].id } });
    assert.equal(released.status, "released");
    assert.equal(released.businessId, a.id);

    const stop = await (await text("STOP", sid(3))).text();
    assert.match(stop, /unsubscribed/i);
    const optOuts = await prisma.smsOptOut.findMany({ where: { businessId: { in: [a.id, b.id] }, clearedAt: null } });
    assert.deepEqual(optOuts.map((o) => o.businessId).sort(), [a.id, b.id].sort(), "STOP to the shared sender stops every shop that texted");

    const bare = await (await text("START", sid(4))).text();
    assert.match(bare, /reply START and the business name/i);
    assert.equal(
      await prisma.smsOptOut.count({ where: { businessId: { in: [a.id, b.id] }, clearedAt: null } }),
      2,
      "a START that names no business restarts none of them",
    );
    await text("START Release Proof Electric", sid(5));
    const still = await prisma.smsOptOut.findMany({ where: { businessId: { in: [a.id, b.id] }, clearedAt: null } });
    assert.deepEqual(still.map((o) => o.businessId), [a.id], "naming one business restarts only that one");
  } finally {
    await drop(a.id);
    await drop(b.id);
  }
});

test.after(() => prisma.$disconnect());
