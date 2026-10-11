/*
 * A shop leaving is never silent: the reason the owner gave Stripe is kept on
 * the shop, the founder is paged once with it, and the weekly scoreboard says
 * why shops are going. Taking the cancel back clears it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY", "ORVIUS_FOUNDER_PHONE"]) delete process.env[key];

const { cancelEvent, cancelReasonFrom, cancelReasonCounts, cancelReasonText, founderCancelText } = await import("../src/lib/cancel-signal.ts");
const { syncSubscriptionToBusiness } = await import("../src/lib/billing-sync.ts");
const { scoreboardLines } = await import("../src/lib/company-scoreboard.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const ends = new Date("2026-11-20T00:00:00Z");

test("only real changes count: scheduling, an unplanned stop of a paying plan, and taking it back", () => {
  const renewing = { billingStatus: "active", planEndsAt: null };
  const ending = { billingStatus: "active", planEndsAt: ends };
  assert.equal(cancelEvent(renewing, ending), "scheduled");
  assert.equal(cancelEvent(ending, ending), null, "a repeat sync doesn't page twice");
  assert.equal(cancelEvent(ending, { billingStatus: "canceled", planEndsAt: null }), null, "reaching the scheduled end was already signalled");
  assert.equal(cancelEvent(renewing, { billingStatus: "canceled", planEndsAt: null }), "ended_now");
  assert.equal(cancelEvent({ billingStatus: "past_due", planEndsAt: null }, { billingStatus: "canceled", planEndsAt: null }), "ended_now");
  assert.equal(cancelEvent({ billingStatus: "pilot", planEndsAt: null }, { billingStatus: "canceled", planEndsAt: null }), null, "an abandoned first checkout is not a shop leaving");
  assert.equal(cancelEvent(ending, renewing), "kept");
});

test("the owner's own answer wins over Stripe's mechanical reason", () => {
  assert.deepEqual(cancelReasonFrom({ feedback: "too_expensive", reason: "cancellation_requested", comment: "  slow season " }), {
    reason: "too_expensive",
    comment: "slow season",
  });
  assert.deepEqual(cancelReasonFrom({ feedback: null, reason: "payment_failed", comment: "" }), { reason: "payment_failed", comment: null });
  assert.deepEqual(cancelReasonFrom(null), { reason: null, comment: null });
});

test("the founder text says who, what it's worth, why, and how to reach them", () => {
  const text = founderCancelText({
    shopName: "Cold Front HVAC",
    event: "scheduled",
    reason: "missing_features",
    comment: "need ServiceTitan",
    planName: "Pro",
    monthlyCents: 39900,
    endsAt: ends,
    ownerEmail: "owner@coldfront.test",
  });
  assert.equal(text, 'Orvius: Cold Front HVAC set to cancel, ends Nov 20 · Pro · $399/mo. Why: Missing features · "need ServiceTitan" · owner@coldfront.test');
});

test("the scoreboard names the reasons, most common first", () => {
  const counts = cancelReasonCounts([{ reason: "too_expensive" }, { reason: "unused" }, { reason: "too_expensive" }, { reason: null }]);
  assert.equal(cancelReasonText(counts), "Too expensive 2 · Not using it 1 · No reason given 1");
  assert.equal(cancelReasonText([]), "none");
  const week = { start: "2026-10-04", newShops: 0, churnedShops: 0, calls: 0, failedCalls: 0, answeredCleanPct: null, leads: 0, leadsBooked: 0, bookingRate: null, jobsBooked: 0, collectedCents: 0 };
  const lines = scoreboardLines({
    payingShops: 0,
    activeShops: 0,
    thisWeek: week,
    lastWeek: week,
    signupToFirstJobMinutes: null,
    shopsWithoutFirstJob: 0,
    unitCost: null,
    revenue: { mrrCents: 0, byPlan: [], costCents: null, grossMarginPct: null },
    cancelReasons30d: counts,
  });
  assert.ok(lines.includes("Why shops asked to cancel, 30 days: Too expensive 2 · Not using it 1 · No reason given 1"), lines.join("\n"));
});

test("a Stripe sync keeps the reason, pages once, audits, and clears it when the owner keeps the plan", async () => {
  const subId = `sub_${stamp()}`;
  const shop = await prisma.business.create({
    data: {
      name: "Cold Front HVAC",
      slug: `cold-${stamp()}`,
      environment: "test",
      ownerEmail: `owner-${stamp()}@example.test`,
      billingStatus: "active",
      billingPlan: "pro",
      stripeSubscriptionId: subId,
      stripeCustomerId: "cus_cancel",
    },
  });
  const sub = (extra) => ({ id: subId, object: "subscription", status: "active", customer: "cus_cancel", metadata: { planId: "pro", businessId: shop.id }, items: { object: "list", data: [] }, cancel_at: null, cancel_at_period_end: false, cancellation_details: null, ...extra });
  try {
    await syncSubscriptionToBusiness(
      sub({ cancel_at: Math.floor(ends.getTime() / 1000), cancellation_details: { feedback: "too_expensive", reason: "cancellation_requested", comment: "slow season" } }),
      shop.ownerEmail,
    );
    let after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.planEndsAt?.toISOString(), ends.toISOString());
    assert.equal(after.cancelReason, "too_expensive");
    assert.equal(after.cancelComment, "slow season");
    assert.ok(after.cancelRequestedAt);

    const pages = await prisma.cronRun.findMany({ where: { name: { startsWith: "page:shop:cancel:" }, AND: { name: { endsWith: shop.id } } } });
    assert.equal(pages.length, 1, "the founder is paged");
    const scheduled = await prisma.auditEvent.findMany({ where: { businessId: shop.id, action: "billing.cancel_scheduled" } });
    assert.equal(scheduled.length, 1);
    assert.match(scheduled[0].summary, /Too expensive \("slow season"\)/);

    await syncSubscriptionToBusiness(sub({ cancel_at: Math.floor(ends.getTime() / 1000), cancellation_details: { feedback: "too_expensive" } }), shop.ownerEmail);
    assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, action: "billing.cancel_scheduled" } }), 1, "a repeat event doesn't double up");

    await syncSubscriptionToBusiness(sub({}), shop.ownerEmail);
    after = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(after.planEndsAt, null);
    assert.equal(after.cancelReason, null);
    assert.equal(after.cancelRequestedAt, null);
    assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, action: "billing.cancel_withdrawn" } }), 1);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { businessId: shop.id } }).catch(() => {});
    await prisma.cronRun.deleteMany({ where: { name: { startsWith: "page:shop:cancel:" }, AND: { name: { endsWith: shop.id } } } }).catch(() => {});
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
    await prisma.$disconnect();
  }
});
