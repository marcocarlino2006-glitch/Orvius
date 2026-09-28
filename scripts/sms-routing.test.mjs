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
import { resolveBusinessForInboundSms } from "../src/lib/resolve-shop-line.ts";

const prisma = new PrismaClient();
const PLATFORM_LINE = "+18446439170";
const CUSTOMER = "+15555550177";

async function makeShop(name, line) {
  return prisma.business.create({
    data: {
      name,
      slug: `sms-route-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      billingStatus: "pilot",
      twilioPhone: line,
      vapiPhoneNumber: line,
    },
  });
}

const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("a reply to the shared sender goes to the shop that last texted that phone", async () => {
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

    await new Promise((r) => setTimeout(r, 5));
    await recordOutboundSms({ businessId: b.id, to: CUSTOMER, audience: "customer" });
    hit = await resolveBusinessForInboundSms({ to: PLATFORM_LINE, from: CUSTOMER });
    assert.equal(hit?.id, b.id, "most recent sender wins");

    const pooled = await resolveBusinessForInboundSms({ to: "+15555550999", from: CUSTOMER });
    assert.equal(pooled?.id, b.id, "a messaging-service pool number no shop owns routes the same way");

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

test.after(() => prisma.$disconnect());
