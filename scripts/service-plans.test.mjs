#!/usr/bin/env node
/*
 * Maintenance plans: a shop sells a recurring plan, the customer pays the shop
 * directly on its connected account, connected-account billing events never
 * touch the shop's own Orvius subscription, and members are texted once when
 * an included visit comes due.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "ORVIUS_PLATFORM_FEE_BPS"]) {
  delete process.env[key];
}

const plans = await import("../src/lib/service-plans.ts");
const {
  validatePlan,
  visitCycleMs,
  monthlyRecurringCents,
  publicPlansShop,
  createPlanCheckout,
  activatePlanMember,
  syncPlanSubscription,
  applyPlanInvoice,
  runVisitReminders,
  visitReminderBody,
} = plans;

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});
/* 2pm in Chicago. */
const AFTERNOON = new Date("2026-09-29T19:00:00Z");
const DAY = 86_400_000;

async function shop(overrides = {}) {
  const accountId = `acct_${stamp()}`;
  return prisma.business.create({
    data: {
      name: "Summit HVAC",
      slug: `sp-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      servicesJson: "[]",
      timezone: "America/Chicago",
      billingStatus: "active",
      stripeConnectAccountId: accountId,
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
      stripeConnectDetailsSubmitted: true,
      ...overrides,
    },
  });
}

const plan = (business, data = {}) =>
  prisma.servicePlan.create({
    data: { businessId: business.id, name: "Comfort Club", priceCents: 1900, interval: "month", visitsPerYear: 2, ...data },
  });

function fakeCheckout() {
  const calls = [];
  return {
    calls,
    createSession: async (params, options) => (calls.push({ params, options }), { id: `cs_${calls.length}`, url: `https://checkout.example/${calls.length}` }),
  };
}

test("plan rules: price floor, intervals, visit cadence, recurring revenue", () => {
  assert.equal(validatePlan({ name: "Club", priceCents: 1900, interval: "month", visitsPerYear: 2 }).ok, true);
  assert.equal(validatePlan({ name: "Club", priceCents: 10, interval: "month" }).ok, false, "under Stripe's minimum");
  assert.equal(validatePlan({ name: "Club", priceCents: 1900, interval: "week" }).ok, false);
  assert.equal(validatePlan({ name: "Club", priceCents: 1900, interval: "year", visitsPerYear: 13 }).ok, false);
  assert.equal(visitCycleMs(0), null);
  assert.equal(Math.round(visitCycleMs(2) / DAY), 183);
  assert.equal(monthlyRecurringCents([{ priceCents: 1900, interval: "month", active: 3 }, { priceCents: 24000, interval: "year", active: 1 }]), 7700);
  assert.equal(
    visitReminderBody({ first: "Ann", businessName: "Summit HVAC", planName: "Comfort Club", link: null }),
    "Hi Ann, it's Summit HVAC. Your included Comfort Club visit is coming due. Reply with a day that works and we'll get you scheduled. Reply STOP to opt out.",
  );
});

test("the public page needs card payments, a paid workspace, and a plan on sale", async () => {
  const ready = await shop();
  const noCards = await shop({ stripeConnectChargesEnabled: false });
  const lapsed = await shop({ billingStatus: "canceled" });
  const noPlans = await shop();
  try {
    await plan(ready);
    await plan(ready, { name: "Old plan", isActive: false });
    await plan(noCards);
    await plan(lapsed);
    const found = await publicPlansShop(ready.slug);
    assert.deepEqual(found.plans.map((p) => p.name), ["Comfort Club"]);
    assert.equal(await publicPlansShop(noCards.slug), null);
    assert.equal(await publicPlansShop(lapsed.slug), null);
    assert.equal(await publicPlansShop(noPlans.slug), null);
  } finally {
    await Promise.all([ready, noCards, lapsed, noPlans].map((b) => drop(b.id)));
  }
});

test("joining charges the shop's own account as a subscription, with Orvius' fee", async () => {
  const business = await shop();
  try {
    const p = await plan(business, { priceCents: 24000, interval: "year" });
    const stripe = fakeCheckout();
    const phone = randomPhone();
    const result = await createPlanCheckout(business.slug, { planId: p.id, name: "Ann Cole", phone, email: "ann@example.test" }, stripe);
    assert.equal(result.ok, true);
    const [{ params, options }] = stripe.calls;
    assert.deepEqual(options, { stripeAccount: business.stripeConnectAccountId });
    assert.equal(params.mode, "subscription");
    assert.equal(params.line_items[0].price_data.unit_amount, 24000);
    assert.equal(params.line_items[0].price_data.recurring.interval, "year");
    assert.equal(params.subscription_data.application_fee_percent, 1);
    assert.equal(params.metadata.kind, "plan_join");
    const pending = await prisma.planMember.findUnique({ where: { id: params.metadata.memberId } });
    assert.equal(pending.status, "pending");

    const failing = { createSession: async () => { throw new Error("stripe down"); } };
    const again = await createPlanCheckout(business.slug, { planId: p.id, name: "Bo Diaz", phone: randomPhone() }, failing);
    assert.equal(again.ok, false);
    assert.equal(await prisma.planMember.count({ where: { businessId: business.id } }), 1, "a failed checkout leaves no pending member");

    await prisma.planMember.update({ where: { id: pending.id }, data: { status: "active" } });
    const dup = await createPlanCheckout(business.slug, { planId: p.id, name: "Ann Cole", phone }, stripe);
    assert.equal(dup.ok, false, "already a member");
  } finally {
    await drop(business.id);
  }
});

test("checkout completes once: member active, customer linked, first visit scheduled", async () => {
  const business = await shop();
  try {
    const p = await plan(business);
    const stripe = fakeCheckout();
    await createPlanCheckout(business.slug, { planId: p.id, name: "Ann Cole", phone: randomPhone() }, stripe);
    const metadata = stripe.calls[0].params.metadata;
    const session = { mode: "subscription", metadata, subscription: `sub_${stamp()}`, customer: "cus_1", customer_details: { email: "ann@example.test" } };
    assert.equal((await activatePlanMember(session, AFTERNOON)).ok, true);
    const member = await prisma.planMember.findUnique({ where: { id: metadata.memberId } });
    assert.equal(member.status, "active");
    assert.equal(member.stripeSubscriptionId, session.subscription);
    assert.ok(member.customerId, "linked to the customer record");
    assert.equal(Math.round((member.nextVisitDueAt.getTime() - AFTERNOON.getTime()) / DAY), 183);
    const replay = await activatePlanMember(session, AFTERNOON);
    assert.equal(replay.reason, "already_active");
  } finally {
    await drop(business.id);
  }
});

test("connected-account billing events move the member, never the shop's own plan", async () => {
  const business = await shop();
  try {
    const p = await plan(business);
    const subId = `sub_${stamp()}`;
    const member = await prisma.planMember.create({
      data: { businessId: business.id, planId: p.id, phone: "+15550001111", phoneNormalized: "+15550001111", status: "active", stripeSubscriptionId: subId },
    });
    await applyPlanInvoice(subId, false);
    assert.equal((await prisma.planMember.findUnique({ where: { id: member.id } })).status, "past_due");
    await applyPlanInvoice(subId, true);
    assert.equal((await prisma.planMember.findUnique({ where: { id: member.id } })).status, "active");
    await syncPlanSubscription({ id: subId, status: "canceled", items: { data: [{ current_period_end: 1_800_000_000 }] } }, AFTERNOON);
    const after = await prisma.planMember.findUnique({ where: { id: member.id } });
    assert.equal(after.status, "canceled");
    assert.ok(after.canceledAt);
    assert.equal((await prisma.business.findUnique({ where: { id: business.id } })).billingStatus, "active");
    assert.deepEqual(await syncPlanSubscription({ id: "sub_unknown", status: "active" }), { matched: false });
  } finally {
    await drop(business.id);
  }
});

test("visit-due texts: once, daytime only, not when booked, rolled forward when already done", async () => {
  const business = await shop();
  try {
    const p = await plan(business);
    const soon = new Date(AFTERNOON.getTime() + 5 * DAY);
    const member = async (name, extra = {}) => {
      const phone = randomPhone();
      const customer = await prisma.customer.create({ data: { businessId: business.id, name, phone, phoneNormalized: phone } });
      const m = await prisma.planMember.create({
        data: { businessId: business.id, planId: p.id, customerId: customer.id, name, phone, phoneNormalized: phone, status: "active", nextVisitDueAt: soon, ...extra },
      });
      return { m, customer };
    };
    const due = await member("Ann Cole");
    const booked = await member("Bo Diaz");
    await prisma.job.create({
      data: { businessId: business.id, customerId: booked.customer.id, title: "Tune-up", status: "scheduled", scheduledAt: new Date(AFTERNOON.getTime() + 2 * DAY) },
    });
    const done = await member("Cy Park");
    const completedAt = new Date(AFTERNOON.getTime() - 20 * DAY);
    await prisma.job.create({ data: { businessId: business.id, customerId: done.customer.id, title: "Tune-up", status: "completed", completedAt } });
    await member("Later Lee", { nextVisitDueAt: new Date(AFTERNOON.getTime() + 60 * DAY) });
    await member("Past Due", { status: "past_due" });

    const sent = [];
    const send = async (msg) => (sent.push(msg), { sent: true, sid: `SM${sent.length}` });
    const night = new Date("2026-09-30T05:00:00Z");
    assert.equal((await runVisitReminders({ now: night, send })).sent, 0, "no texts at midnight");

    const tally = await runVisitReminders({ now: AFTERNOON, send });
    assert.equal(tally.sent, 1);
    assert.equal(sent[0].to, due.m.phone);
    assert.match(sent[0].body, /^Hi Ann, it's Summit HVAC\. Your included Comfort Club visit is coming due\./);
    const rolled = await prisma.planMember.findUnique({ where: { id: done.m.id } });
    assert.equal(rolled.nextVisitDueAt.getTime(), completedAt.getTime() + visitCycleMs(2));

    assert.equal((await runVisitReminders({ now: AFTERNOON, send })).sent, 0, "never texted twice for the same visit");
  } finally {
    await drop(business.id);
  }
});

test.after(() => prisma.$disconnect());
