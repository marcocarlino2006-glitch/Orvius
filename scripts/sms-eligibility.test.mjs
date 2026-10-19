#!/usr/bin/env node
/*
 * Customer and technician texts are fail-closed: with a configured but
 * unverified shared sender and no approved shop campaign, nothing reaches the
 * provider, the customer path says "held, not sent", and no caller swaps in
 * email. A verified row for the exact sender in use, or the shop's own
 * approved campaign, lets it through. Owner alerts keep the shared sender.
 * Only a toll-free check of the sender in use, reporting TWILIO_APPROVED, can
 * record "verified".
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.TWILIO_ACCOUNT_SID = "AC_test_only";
process.env.TWILIO_AUTH_TOKEN = "test-only";
delete process.env.TWILIO_MESSAGING_SERVICE_SID;
process.env.TWILIO_PHONE_NUMBER = "+18885550100";

const calls = [];
let failNext = null;
mock.module(new URL("../src/lib/twilio-client.ts", import.meta.url).href, {
  namedExports: {
    getTwilioClient: () => ({
      messages: {
        create: async (p) => {
          calls.push(p);
          if (failNext) {
            const error = failNext;
            failNext = null;
            throw error;
          }
          return { sid: `SM${calls.length}${Date.now()}` };
        },
      },
    }),
  },
});

const { sendSms } = await import("../src/lib/twilio-sms.ts");
const { sendCustomerSms } = await import("../src/lib/customer-sms.ts");
const { issueTechAppLink } = await import("../src/lib/tech-app.ts");
const { textingEligibility, recordSharedSenderCheck, sharedSenderIdentity } = await import("../src/lib/sms-eligibility.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const phone = () => `+1312${7_000_000 + Math.floor(Math.random() * 2_000_000)}`;
const IDENTITY = "number:+18885550100";

async function shop() {
  return prisma.business.create({
    data: {
      name: "Held Heating",
      slug: `held-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      environment: "production",
      timezone: "America/Chicago",
      ownerPhone: phone(),
      ownerEmail: `owner-${stamp()}@example.test`,
    },
  });
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const unverify = () => prisma.messagingSender.deleteMany({ where: { identity: IDENTITY } });
const verify = () =>
  prisma.messagingSender.upsert({
    where: { identity: IDENTITY },
    create: { identity: IDENTITY, kind: "toll_free", status: "verified", evidence: "test", checkedAt: new Date(), recordedBy: "test" },
    update: { status: "verified" },
  });

test("an unverified shared sender holds customer and tech texts before the provider is called", async () => {
  await unverify();
  const business = await shop();
  try {
    calls.length = 0;
    const to = phone();
    const result = await sendCustomerSms({ businessId: business.id, to, body: "Your visit is Tuesday at 9" });
    assert.equal(result.sent, false);
    assert.equal(result.reason, "sender_not_verified");
    assert.match(result.detail, /held, not sent/);
    assert.equal(calls.length, 0, "nothing reached Twilio");
    const held = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "sms.held_sender_unverified" } });
    assert.ok(held, "the hold is on the record");
    assert.equal(await prisma.message.count({ where: { businessId: business.id } }), 0, "no outbound message is shown as sent");

    assert.equal(await sendSms({ to, body: "tech text", businessId: business.id, audience: "tech" }), null);
    assert.equal(calls.length, 0);

    const tech = await prisma.technician.create({ data: { businessId: business.id, name: "Ray", phone: phone(), isActive: true } });
    const link = await issueTechAppLink({ businessId: business.id, technicianId: tech.id, send: true, actorEmail: business.ownerEmail, actor: "owner" });
    assert.equal(link.sent, false);
    assert.ok(link.url, "the owner still gets the link to hand over another way");
    assert.equal(calls.length, 0);
  } finally {
    await drop(business.id);
  }
});

test("owner alerts keep the shared sender", async () => {
  await unverify();
  const business = await shop();
  try {
    calls.length = 0;
    const sent = await sendSms({ to: business.ownerPhone, body: "New call", businessId: business.id, audience: "owner" });
    assert.ok(sent?.sid);
    assert.equal(calls.length, 1);
  } finally {
    await drop(business.id);
  }
});

test("a verified row for the sender in use lets customer texts through; another sender's row does not", async () => {
  await unverify();
  await prisma.messagingSender.upsert({
    where: { identity: "number:+18885550199" },
    create: { identity: "number:+18885550199", kind: "toll_free", status: "verified", checkedAt: new Date(), recordedBy: "test" },
    update: { status: "verified" },
  });
  const business = await shop();
  try {
    calls.length = 0;
    assert.equal((await sendCustomerSms({ businessId: business.id, to: phone(), body: "hi" })).reason, "sender_not_verified");
    assert.equal(calls.length, 0);
    await verify();
    const ok = await sendCustomerSms({ businessId: business.id, to: phone(), body: "hi" });
    assert.equal(ok.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].from, "+18885550100");
  } finally {
    await unverify();
    await prisma.messagingSender.deleteMany({ where: { identity: "number:+18885550199" } });
    await drop(business.id);
  }
});

test("the shop's own approved campaign is enough on its own; a pending one is reported as pending", async () => {
  await unverify();
  const business = await shop();
  try {
    await prisma.shopTexting.create({ data: { businessId: business.id, status: "campaign_review", detailsJson: "{}" } });
    const pending = await textingEligibility(business.id);
    assert.deepEqual([pending.ok, pending.reason], [false, "own_campaign_pending"]);
    await prisma.shopTexting.update({ where: { businessId: business.id }, data: { status: "approved", messagingServiceSid: "MG_own" } });
    calls.length = 0;
    const ok = await sendCustomerSms({ businessId: business.id, to: phone(), body: "hi" });
    assert.equal(ok.sent, true);
    assert.equal(calls[0].messagingServiceSid, "MG_own");
  } finally {
    await drop(business.id);
  }
});

test("own campaign refused by the carrier does not fall back to an unverified shared sender", async () => {
  await unverify();
  const business = await shop();
  try {
    await prisma.shopTexting.create({ data: { businessId: business.id, status: "approved", messagingServiceSid: "MG_own", detailsJson: "{}" } });
    calls.length = 0;
    failNext = Object.assign(new Error("campaign suspended"), { status: 400, code: 21606 });
    await assert.rejects(sendSms({ to: phone(), body: "x", businessId: business.id, audience: "customer" }));
    assert.equal(calls.length, 1, "no second attempt on the unverified shared sender");
    assert.equal(calls[0].messagingServiceSid, "MG_own");
  } finally {
    await drop(business.id);
  }
});

test("only a toll-free TWILIO_APPROVED check of the sender in use records verified", async () => {
  await unverify();
  assert.deepEqual(sharedSenderIdentity(), { identity: IDENTITY, kind: "toll_free" });
  assert.deepEqual(
    await recordSharedSenderCheck({ number: "+18885550100", tollFree: true, checked: false, status: null }, "test"),
    { recorded: false },
    "a failed read records nothing",
  );
  assert.deepEqual(
    await recordSharedSenderCheck({ number: "+18885550111", tollFree: true, checked: true, status: "TWILIO_APPROVED" }, "test"),
    { recorded: false },
    "a different number's approval is not this sender's",
  );
  assert.equal((await recordSharedSenderCheck({ number: "+18885550100", tollFree: true, checked: true, status: "IN_REVIEW" }, "test")).status, "pending");
  assert.equal((await textingEligibility("none")).ok, false);
  assert.equal((await recordSharedSenderCheck({ number: "+18885550100", tollFree: true, checked: true, status: "TWILIO_APPROVED" }, "test")).status, "verified");
  assert.deepEqual(await textingEligibility("none"), { ok: true, via: "shared" });
  assert.equal((await recordSharedSenderCheck({ number: "+18885550100", tollFree: true, checked: true, status: "TWILIO_REJECTED" }, "test")).status, "rejected");
  assert.equal((await textingEligibility("none")).ok, false, "a later rejection withdraws it");

  const service = { ...process.env, TWILIO_MESSAGING_SERVICE_SID: "MG_pool" };
  assert.deepEqual(
    await recordSharedSenderCheck({ number: "+18885550100", tollFree: true, checked: true, status: "TWILIO_APPROVED" }, "test", service),
    { recorded: false },
    "a messaging-service sender is not proven by one number's toll-free check",
  );
  await unverify();
});

test.after(() => prisma.$disconnect());
