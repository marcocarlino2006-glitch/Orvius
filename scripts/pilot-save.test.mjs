/*
 * Pilot-save sequence: a pilot nobody pays for must not lapse in silence.
 * Its last week gets a text, its last days a sharper one, expiry names the
 * grace left, and a pilot that proved value pages a person once it goes
 * dark. Each milestone fires once, paid shops are left alone, and no message
 * ever claims calls that didn't happen.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { sendOwnerNudges } = await import("../src/lib/owner-nudges.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const DAY = 24 * 60 * 60 * 1000;

async function makeShop(extra = {}) {
  return prisma.business.create({
    data: {
      name: "Pilot Air",
      slug: `pilot-${stamp()}`,
      environment: "production",
      ownerPhone: "+15125550142",
      ownerEmail: `owner-${stamp()}@example.test`,
      billingStatus: "pilot",
      ...extra,
    },
  });
}

async function addCalls(shop, n) {
  for (let i = 0; i < n; i++) {
    await prisma.call.create({
      data: {
        businessId: shop.id,
        vapiCallId: `vapi-${stamp()}-${i}`,
        callerPhone: `+1512555${String(1000 + i).slice(-4)}`,
        direction: "inbound",
        durationSec: 60,
      },
    });
  }
}

async function drop(shop) {
  await prisma.call.deleteMany({ where: { businessId: shop.id } }).catch(() => {});
  await prisma.ownerNotification.deleteMany({ where: { businessId: shop.id } }).catch(() => {});
  await prisma.cronRun.deleteMany({ where: { name: { startsWith: `page:shop:pilot_lapsed:${shop.id}` } } }).catch(() => {});
  await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
}

const texts = (id) =>
  prisma.ownerNotification.findMany({ where: { businessId: id, channel: "sms" }, select: { dedupeKey: true, message: true } });
const pages = (id) => prisma.cronRun.count({ where: { name: `page:shop:pilot_lapsed:${id}` } });

test("a pilot ending in five days names the calls it took, once", async () => {
  const shop = await makeShop({ pilotEndsAt: new Date(Date.now() + 5 * DAY) });
  try {
    await addCalls(shop, 2);
    await sendOwnerNudges();
    await sendOwnerNudges();
    const sent = await texts(shop.id);
    assert.equal(sent.length, 1);
    assert.match(sent[0].dedupeKey, /:week$/);
    assert.match(sent[0].message, /took 2 calls/);
    assert.match(sent[0].message, /dashboard\/billing/);
  } finally {
    await drop(shop);
  }
});

test("a pilot ending tomorrow with no calls says to prove the line, not a count", async () => {
  const shop = await makeShop({ pilotEndsAt: new Date(Date.now() + 1 * DAY) });
  try {
    await sendOwnerNudges();
    const sent = await texts(shop.id);
    assert.equal(sent.length, 1);
    assert.match(sent[0].dedupeKey, /:urgent$/);
    assert.doesNotMatch(sent[0].message, /took \d/);
    assert.match(sent[0].message, /settings=phone/);
  } finally {
    await drop(shop);
  }
});

test("an ended pilot names the grace left", async () => {
  const shop = await makeShop({ pilotEndsAt: new Date(Date.now() - 12 * 3600 * 1000) });
  try {
    await sendOwnerNudges();
    const sent = await texts(shop.id);
    assert.equal(sent.length, 1);
    assert.match(sent[0].dedupeKey, /:ended$/);
    assert.match(sent[0].message, /keeps answering for 6 days/);
  } finally {
    await drop(shop);
  }
});

test("a dark pilot that proved value texts once and pages a person once", async () => {
  const shop = await makeShop({ pilotEndsAt: new Date(Date.now() - 11 * DAY) });
  try {
    await addCalls(shop, 3);
    await sendOwnerNudges();
    await sendOwnerNudges();
    const sent = await texts(shop.id);
    assert.equal(sent.length, 1);
    assert.match(sent[0].dedupeKey, /:dark$/);
    assert.match(sent[0].message, /stopped answering/);
    assert.equal(await pages(shop.id), 1);
  } finally {
    await drop(shop);
  }
});

test("a dark pilot with no calls texts but never pages", async () => {
  const shop = await makeShop({ pilotEndsAt: new Date(Date.now() - 11 * DAY) });
  try {
    await sendOwnerNudges();
    assert.equal((await texts(shop.id)).length, 1);
    assert.equal(await pages(shop.id), 0);
  } finally {
    await drop(shop);
  }
});

test("a paid shop, a far-out pilot, and a shop with no contact hear nothing", async () => {
  const paid = await makeShop({ billingStatus: "active", pilotEndsAt: new Date(Date.now() - 40 * DAY) });
  const early = await makeShop({ pilotEndsAt: new Date(Date.now() + 20 * DAY) });
  const quiet = await makeShop({ pilotEndsAt: new Date(Date.now() + 5 * DAY), ownerPhone: null, ownerEmail: null });
  try {
    await sendOwnerNudges();
    assert.equal((await texts(paid.id)).length, 0);
    assert.equal((await texts(early.id)).length, 0);
    assert.equal((await texts(quiet.id)).length, 0);
  } finally {
    await drop(paid);
    await drop(early);
    await drop(quiet);
  }
});
