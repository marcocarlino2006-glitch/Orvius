/*
 * Charging without losing the shop: an off-season pause instead of a cancel,
 * a pause-or-cancel panel that opens on the shop's own numbers and never hides
 * cancel, and usage texts that name the cheapest plan for the shop's real pace.
 * Stripe is a local stand-in, as in billing-core.test.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

const subscriptions = new Map();
const posts = [];

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const url = new URL(req.url, "http://stripe.local");
    const send = (status, json) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(json));
    };
    const sub = url.pathname.match(/^\/v1\/subscriptions\/([^/]+)$/);
    if (sub && req.method === "GET") return send(200, subscriptions.get(sub[1]));
    if (sub && req.method === "POST") {
      const form = Object.fromEntries(new URLSearchParams(body));
      posts.push({ id: sub[1], form });
      const current = subscriptions.get(sub[1]);
      current.pause_collection =
        form["pause_collection[behavior]"] ? { behavior: "void", resumes_at: Number(form["pause_collection[resumes_at]"]) } : null;
      return send(200, current);
    }
    send(404, { error: { type: "invalid_request_error", message: `unhandled ${req.method} ${url.pathname}` } });
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

process.env.STRIPE_SECRET_KEY = "sk_test_keep_customers";
process.env.STRIPE_API_BASE = `http://127.0.0.1:${server.address().port}`;
for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "VAPI_API_KEY", "RESEND_API_KEY"]) delete process.env[key];

const { isBillingEntitled, isLineEntitled, billingLockReason, isPaused } = await import("../src/lib/billing-entitlement.ts");
const { billingLock } = await import("../src/lib/plan-gate.ts");
const { planAdvice, planAdviceLine, projectMonthCalls, monthCostCents } = await import("../src/lib/plan-advice.ts");
const { addMonthsUtc, pauseWindow, keepRows, keepHeadline, smallerPlan, isPauseMonths } = await import("../src/lib/plan-exit.ts");
const { pauseBlocker, pauseFieldsFromSubscription, pauseShopPlan, resumeShopPlan, sweepPausedPlans } = await import(
  "../src/lib/plan-pause.ts"
);
const { syncSubscriptionToBusiness } = await import("../src/lib/billing-sync.ts");

const prisma = new PrismaClient();
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

test.after(async () => {
  server.close();
  await prisma.$disconnect();
});

async function monthlyShop(extra = {}) {
  const id = stamp();
  const periodEnd = Math.floor((Date.now() + 10 * DAY) / 1000);
  const subId = `sub_keep_${id}`;
  subscriptions.set(subId, {
    id: subId,
    object: "subscription",
    customer: `cus_keep_${id}`,
    status: "active",
    metadata: {},
    cancel_at_period_end: false,
    cancel_at: null,
    pause_collection: null,
    items: { data: [{ current_period_end: periodEnd, price: { recurring: { interval: "month" } } }] },
  });
  const shop = await prisma.business.create({
    data: {
      name: "Season Air",
      slug: `season-${id}`,
      environment: "test",
      billingStatus: "active",
      billingPlan: "pro",
      billingInterval: "month",
      stripeCustomerId: `cus_keep_${id}`,
      stripeSubscriptionId: subId,
      ownerPhone: "+15125550142",
      ...extra,
    },
  });
  subscriptions.get(subId).metadata.businessId = shop.id;
  return { shop, subId, periodEnd: new Date(periodEnd * 1000) };
}
const drop = (id) => prisma.business.delete({ where: { id } }).catch(() => {});

test("advice names the cheapest plan for the shop's pace and never upsells on a hunch", () => {
  const mid = new Date(Date.UTC(2026, 3, 16, 0, 0)); // April 16: half the month gone
  assert.equal(projectMonthCalls(200, mid), 400);
  assert.equal(projectMonthCalls(40, new Date(Date.UTC(2026, 3, 2))), 40, "two days in is too early to project");

  const lineFine = planAdvice({ used: 140, planId: "line", now: mid });
  assert.equal(lineFine.switchTo, null);
  assert.match(planAdviceLine(lineFine, "Line"), /inside your allowance/);

  const lineOver = planAdvice({ used: 180, planId: "line", now: mid });
  assert.equal(lineOver.projected, 360);
  assert.equal(lineOver.projectedOverageCents, 60 * 50);
  assert.equal(lineOver.switchTo, null, "$30 of extra calls is cheaper than $200 more for Pro");
  assert.match(planAdviceLine(lineOver, "Line"), /about \$30 in extra calls\. Line is still your cheapest plan\./);

  const lineBusy = planAdvice({ used: 400, planId: "line", now: mid });
  assert.equal(lineBusy.switchTo?.id, "pro");
  assert.equal(lineBusy.switchTo.savesCents, monthCostCents("line", 800) - monthCostCents("pro", 800));
  assert.match(planAdviceLine(lineBusy, "Line"), /Pro would cost about \$\d+ less than Line plus extra calls\./);

  assert.equal(planAdvice({ used: 10, planId: "fleet", now: mid }).switchTo, null, "advice never pushes a smaller plan from a usage text");
  assert.equal(planAdvice({ used: 10, planId: "multi", now: mid }), null);
});

test("the usage texts carry the advice", () => {
  const nudges = read("src/lib/owner-nudges.ts");
  assert.match(nudges, /planAdvice\(\{ used, planId: shop\.billingPlan, now \}\)/);
  assert.match(nudges, /included calls this month\. Every call is still answered either way\.\$\{pace\}/);
  assert.match(read("src/app/api/account/route.ts"), /advice: usageAdvice/);
  assert.match(read("src/components/billing-content.tsx"), /billing-usage-advice/);
});

test("a pause runs from the end of the paid month and ends an hour before a renewal", () => {
  assert.equal(addMonthsUtc(new Date("2026-01-31T12:00:00Z"), 1).toISOString(), "2026-02-28T12:00:00.000Z");
  const end = new Date("2026-04-10T15:00:00Z");
  const w = pauseWindow(end, 2);
  assert.equal(w.startsAt.toISOString(), end.toISOString());
  assert.equal(w.until.toISOString(), "2026-06-10T14:00:00.000Z");
  assert.ok(isPauseMonths(3) && !isPauseMonths(4) && !isPauseMonths("2"));
});

test("paused means no line and no workspace, only inside the window", () => {
  const now = Date.now();
  const paused = { billingStatus: "active", pauseStartsAt: new Date(now - DAY), pausedUntil: new Date(now + 30 * DAY) };
  assert.equal(isPaused(paused), true);
  assert.equal(isBillingEntitled(paused), false);
  assert.equal(isLineEntitled(paused), false);
  assert.equal(billingLockReason(paused), "paused");
  assert.match(billingLock(paused).message, /^Orvius is paused until .+\. Resume on Billing/);

  const upcoming = { ...paused, pauseStartsAt: new Date(now + DAY) };
  assert.equal(isBillingEntitled(upcoming), true, "the month already paid for runs out first");
  assert.equal(isLineEntitled(upcoming), true);
  const over = { ...paused, pauseStartsAt: new Date(now - 60 * DAY), pausedUntil: new Date(now - HOUR) };
  assert.equal(isBillingEntitled(over), true);
  assert.equal(isLineEntitled(over), true);
});

test("only an active monthly plan can pause", () => {
  const base = { billingStatus: "active", billingInterval: "month", stripeSubscriptionId: "sub_x" };
  assert.equal(pauseBlocker(base), null);
  assert.match(pauseBlocker({ ...base, billingInterval: "year" }), /Annual plans are paid for the year/);
  assert.match(pauseBlocker({ ...base, billingStatus: "past_due" }), /Only an active plan/);
  assert.match(pauseBlocker({ ...base, pausedUntil: new Date(Date.now() + DAY) }), /already paused/);
});

test("pausing tells Stripe to void the paused invoices and resume on its own", async () => {
  const { shop, subId, periodEnd } = await monthlyShop();
  try {
    const result = await pauseShopPlan(shop.id, 2, "owner@season.test");
    assert.equal(result.ok, true);
    const call = posts.findLast((p) => p.id === subId);
    assert.equal(call.form["pause_collection[behavior]"], "void");
    const until = pauseWindow(periodEnd, 2).until;
    assert.equal(Number(call.form["pause_collection[resumes_at]"]), Math.floor(until.getTime() / 1000));

    const row = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(row.pauseStartsAt.getTime(), periodEnd.getTime());
    assert.equal(row.pausedUntil.getTime(), until.getTime());
    assert.equal(isBillingEntitled(row), true, "still inside the paid month");
    const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, action: "billing.paused" } });
    assert.match(audit.summary, /^Plan paused for 2 months: no charge from/);

    const again = await pauseShopPlan(shop.id, 1, null);
    assert.equal(again.ok, false);
    assert.equal(again.status, 409);
  } finally {
    await drop(shop.id);
  }
});

test("an annual plan or one already cancelling is not paused, and Stripe is not touched", async () => {
  const annual = await monthlyShop({ billingInterval: "year" });
  const cancelling = await monthlyShop();
  subscriptions.get(cancelling.subId).cancel_at_period_end = true;
  try {
    const before = posts.length;
    assert.equal((await pauseShopPlan(annual.shop.id, 1, null)).ok, false);
    const c = await pauseShopPlan(cancelling.shop.id, 1, null);
    assert.equal(c.ok, false);
    assert.match(c.error, /already set to cancel/);
    assert.equal(posts.length, before);
  } finally {
    await drop(annual.shop.id);
    await drop(cancelling.shop.id);
  }
});

test("resuming before the pause starts just calls it off; resuming inside it starts a paid month today", async () => {
  const early = await monthlyShop();
  const inside = await monthlyShop();
  try {
    await pauseShopPlan(early.shop.id, 1, null);
    const r1 = await resumeShopPlan(early.shop.id, null);
    assert.deepEqual(r1, { ok: true, chargedNow: false });
    const c1 = posts.findLast((p) => p.id === early.subId);
    assert.equal(c1.form.pause_collection, "");
    assert.equal(c1.form.billing_cycle_anchor, undefined);

    await prisma.business.update({
      where: { id: inside.shop.id },
      data: { pauseStartsAt: new Date(Date.now() - DAY), pausedUntil: new Date(Date.now() + 20 * DAY) },
    });
    const r2 = await resumeShopPlan(inside.shop.id, null);
    assert.deepEqual(r2, { ok: true, chargedNow: true });
    const c2 = posts.findLast((p) => p.id === inside.subId);
    assert.equal(c2.form.billing_cycle_anchor, "now");
    assert.equal(c2.form.proration_behavior, "none");
    const row = await prisma.business.findUnique({ where: { id: inside.shop.id } });
    assert.equal(row.pausedUntil, null);
    assert.equal(isBillingEntitled(row), true);
  } finally {
    await drop(early.shop.id);
    await drop(inside.shop.id);
  }
});

test("Stripe's webhook keeps the pause in step, and a paused shop's line is not switched back on", async () => {
  const { shop, subId } = await monthlyShop();
  try {
    const resumesAt = Math.floor((Date.now() + 40 * DAY) / 1000);
    subscriptions.get(subId).pause_collection = { behavior: "void", resumes_at: resumesAt };
    await syncSubscriptionToBusiness(subscriptions.get(subId));
    let row = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(row.pausedUntil.getTime(), resumesAt * 1000);
    assert.ok(row.pauseStartsAt);
    assert.equal(row.billingStatus, "active");

    subscriptions.get(subId).pause_collection = null;
    await syncSubscriptionToBusiness(subscriptions.get(subId));
    row = await prisma.business.findUnique({ where: { id: shop.id } });
    assert.equal(row.pausedUntil, null);
    assert.equal(row.pauseStartsAt, null);

    assert.deepEqual(pauseFieldsFromSubscription({ pause_collection: null, items: { data: [] } }, { pauseStartsAt: null }), {
      pauseStartsAt: null,
      pausedUntil: null,
    });
    assert.match(read("src/lib/billing-sync.ts"), /!updated\.lineReleasedAt &&\s+!isPaused\(updated, now\)/);
  } finally {
    await drop(shop.id);
  }
});

test("the daily sweep texts before the plan charges again and clears a pause that ended", async () => {
  const ending = await monthlyShop({
    environment: "production",
    pauseStartsAt: new Date(Date.now() - 50 * DAY),
    pausedUntil: new Date(Date.now() + 2 * DAY),
    lineSuspendedAt: new Date(Date.now() - 50 * DAY),
  });
  const done = await monthlyShop({
    environment: "production",
    pauseStartsAt: new Date(Date.now() - 50 * DAY),
    pausedUntil: new Date(Date.now() - HOUR),
  });
  try {
    await sweepPausedPlans();
    const note = await prisma.ownerNotification.findFirst({
      where: { businessId: ending.shop.id, dedupeKey: { startsWith: `billing:pause_ending:${ending.shop.id}:` } },
    });
    assert.ok(note, "a reminder before the charge");
    assert.match(note.message, /pause ends .+\. Your line answers again and your plan is charged again that day\./);
    const cleared = await prisma.business.findUnique({ where: { id: done.shop.id } });
    assert.equal(cleared.pausedUntil, null);
    assert.equal(cleared.pauseStartsAt, null);

    await sweepPausedPlans();
    assert.equal(
      await prisma.ownerNotification.count({ where: { businessId: ending.shop.id, dedupeKey: { startsWith: "billing:pause_ending:" } } }),
      1,
      "once per pause",
    );
  } finally {
    await drop(ending.shop.id);
    await drop(done.shop.id);
  }
  assert.match(read("src/app/api/cron/notifications/route.ts"), /step\("paused_plans", \(\) => sweepPausedPlans\(\)\)/);
});

test("the panel opens on the shop's own counts and is honest when there are none", () => {
  const rows = keepRows({ calls: 212, afterHoursLeads: 41, jobsBooked: 63, collectedCents: 0 });
  assert.deepEqual(rows.map((r) => r.label), ["Calls answered", "Requests after hours", "Jobs booked"]);
  assert.equal(keepRows({ calls: 1, afterHoursLeads: 0, jobsBooked: 0, collectedCents: 1_234_500 })[3].value, "$12,345");
  assert.equal(keepHeadline({ calls: 212, afterHoursLeads: 41, jobsBooked: 63, collectedCents: 0 }), "In the last 90 days Orvius answered 212 calls and booked 63 jobs for you.");
  assert.match(keepHeadline({ calls: 0, afterHoursLeads: 0, jobsBooked: 0, collectedCents: 0 }), /hasn't answered a customer call for you yet/);
  assert.equal(smallerPlan("fleet").id, "pro");
  assert.equal(smallerPlan("pro").id, "line");
  assert.equal(smallerPlan("line"), null);
});

test("cancel stays one tap away: the panel, Stripe's cancel step, and the terms all say how", () => {
  const panel = read("src/components/plan-exit-panel.tsx");
  assert.match(panel, />\s*Pause or cancel\s*</);
  assert.match(panel, /Continue to cancel/);
  assert.match(panel, /Keep my plan/);
  assert.match(panel, /Download my data/);
  assert.match(panel, /switch off call forwarding to Orvius/);
  const portal = read("src/app/api/billing/portal/route.ts");
  assert.match(portal, /type: "subscription_cancel"/);
  assert.match(portal, /type: "subscription_update"/);
  assert.match(portal, /stripe\.billingPortal\.sessions\.create\(base\)/, "falls back to the plain portal");
  assert.match(read("src/lib/commercial-terms.ts"), /id: "pause"/);
  assert.match(read("src/lib/pricing-faq.ts"), /pause for up to 3 months/);
  assert.match(read("src/components/ring1-command-center.tsx"), /Paused for the off-season\./);
  assert.match(read("prisma/turso-migrate.sql"), /ADD COLUMN "pausedUntil" DATETIME/);
});
