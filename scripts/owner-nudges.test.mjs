/*
 * Owner nudges (docs/BACKLOG.md G4): a failed card, a line that isn't catching
 * the main number, and a month nearing its calls each reach the owner once,
 * through the owner-alert queue, and never claim more than is true.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { syncSubscriptionToBusiness } = await import("../src/lib/billing-sync.ts");
const { includedCallsForPlan } = await import("../src/lib/call-usage.ts");
const { sendOwnerNudges } = await import("../src/lib/owner-nudges.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const DAY = 24 * 60 * 60 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY);

async function makeShop(extra = {}) {
  return prisma.business.create({
    data: {
      name: "Nudge Air",
      slug: `nudge-${stamp()}`,
      environment: "production",
      ownerPhone: "+15125550142",
      ownerEmail: `owner-${stamp()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      ...extra,
    },
  });
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
const alerts = (businessId) =>
  prisma.ownerNotification.findMany({ where: { businessId, channel: "sms" }, select: { dedupeKey: true, message: true } });
const subscription = (businessId, status) => ({
  id: `sub_${businessId}`,
  customer: `cus_${businessId}`,
  status,
  metadata: { businessId },
  items: { data: [] },
});

test("a failed card texts the owner once, and says what still works", async () => {
  const shop = await makeShop();
  try {
    await syncSubscriptionToBusiness(subscription(shop.id, "past_due"));
    await syncSubscriptionToBusiness(subscription(shop.id, "past_due"));
    const sent = await alerts(shop.id);
    assert.equal(sent.length, 1);
    assert.match(sent[0].dedupeKey, /^billing:past_due:/);
    assert.match(sent[0].message, /keeps working for 7 days/);
    assert.match(sent[0].message, /settings=billing/);
  } finally {
    await drop(shop.id);
  }
});

test("the day-5 reminder says the dashboard locks, not that calls stop, and sends once", async () => {
  const shop = await makeShop({ billingStatus: "past_due", pastDueSince: ago(5.5) });
  try {
    await sendOwnerNudges();
    await sendOwnerNudges();
    const sent = (await alerts(shop.id)).filter((a) => a.dedupeKey.endsWith(":reminder"));
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, /dashboard locks in 2 days/);
    assert.match(sent[0].message, /if the plan cancels the line stops answering/);
  } finally {
    await drop(shop.id);
  }
});

test("a proved line that isn't forwarded after a day gets one nudge; a fresh or forwarded one gets none", async () => {
  const waiting = await makeShop({ lineVerifiedAt: ago(2) });
  const fresh = await makeShop({ lineVerifiedAt: ago(0.5) });
  const forwarded = await makeShop({ lineVerifiedAt: ago(2), overflowForwardConfirmedAt: ago(1) });
  try {
    await sendOwnerNudges();
    await sendOwnerNudges();
    const sent = (await alerts(waiting.id)).filter((a) => a.dedupeKey.startsWith("setup:forward:"));
    assert.equal(sent.length, 1);
    assert.match(sent[0].message, /main number don't reach it yet/);
    assert.equal((await alerts(fresh.id)).length, 0);
    assert.equal((await alerts(forwarded.id)).length, 0);
  } finally {
    await Promise.all([drop(waiting.id), drop(fresh.id), drop(forwarded.id)]);
  }
});

test("an unforwarded line escalates: a second text on day four, a person from Orvius at a week; a line already taking calls is left alone", async () => {
  const day4 = await makeShop({ lineVerifiedAt: ago(4.5) });
  const week = await makeShop({ lineVerifiedAt: ago(8) });
  const busy = await makeShop({ lineVerifiedAt: ago(8) });
  await prisma.call.create({
    data: { businessId: busy.id, vapiCallId: `nudge-${stamp()}`, direction: "inbound", callerPhone: "+15125553001", durationSec: 90, createdAt: ago(3) },
  });
  try {
    await sendOwnerNudges();
    await sendOwnerNudges();
    const reminder = (await alerts(day4.id)).filter((a) => a.dedupeKey.endsWith(":reminder"));
    assert.equal(reminder.length, 1);
    assert.match(reminder[0].message, /hasn't had a customer call yet/);
    assert.equal((await alerts(week.id)).filter((a) => a.dedupeKey.endsWith(":reminder")).length, 1);
    assert.ok(await prisma.cronRun.findUnique({ where: { name: `page:shop:no_forwarding:${week.id}` } }), "the founder is paged once for the week-old shop");
    assert.equal(await prisma.cronRun.count({ where: { name: `page:shop:no_forwarding:${day4.id}` } }), 0);
    assert.equal((await alerts(busy.id)).filter((a) => a.dedupeKey.startsWith("setup:forward:")).length, 0);
  } finally {
    await prisma.cronRun.deleteMany({ where: { name: { in: [day4.id, week.id].map((id) => `page:shop:no_forwarding:${id}`) } } });
    await prisma.call.deleteMany({ where: { businessId: busy.id } });
    await Promise.all([drop(day4.id), drop(week.id), drop(busy.id)]);
  }
});

test("usage alerts fire at 80% and at the allowance, once each, and say calls are still answered", async () => {
  const shop = await makeShop();
  try {
    const included = includedCallsForPlan("pro");
    const addCalls = (n, from) =>
      prisma.call.createMany({
        data: Array.from({ length: n }, (_, i) => ({
          businessId: shop.id,
          vapiCallId: `usage_${shop.id}_${from + i}`,
          status: "completed",
          direction: "inbound",
        })),
      });
    await addCalls(Math.ceil(included * 0.8), 0);
    await sendOwnerNudges();
    await sendOwnerNudges();
    let sent = (await alerts(shop.id)).filter((a) => a.dedupeKey.startsWith("usage:"));
    assert.equal(sent.length, 1);
    assert.match(sent[0].dedupeKey, /:80$/);
    assert.match(sent[0].message, /still answered/);

    await addCalls(included - Math.ceil(included * 0.8), Math.ceil(included * 0.8));
    await sendOwnerNudges();
    sent = (await alerts(shop.id)).filter((a) => a.dedupeKey.startsWith("usage:"));
    assert.equal(sent.length, 2);
    assert.ok(sent.some((a) => /:100$/.test(a.dedupeKey) && /used all/.test(a.message)));
  } finally {
    await drop(shop.id);
  }
});

test("test shops are never nudged", async () => {
  const shop = await makeShop({ environment: "test", lineVerifiedAt: ago(2) });
  try {
    await syncSubscriptionToBusiness(subscription(shop.id, "past_due"));
    await sendOwnerNudges();
    assert.equal((await alerts(shop.id)).length, 0);
  } finally {
    await drop(shop.id);
  }
});

test.after(() => prisma.$disconnect());
