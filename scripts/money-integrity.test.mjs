/*
 * Money in and value out: Stripe and Orvius are compared every day so nobody is
 * charged without service or served without paying, and every paying shop is
 * checked for whether it got more than it paid.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

delete process.env.STRIPE_SECRET_KEY;

const { reconcileBilling, runBillingReconcile } = await import("../src/lib/billing-reconcile.ts");
const { judgeShopValue, planMonthlyCents, VALUE_GRACE_DAYS } = await import("../src/lib/value-check.ts");
const { revenueFrom } = await import("../src/lib/company-scoreboard.ts");
const { revenueLines, valueLines } = await import("../src/lib/revenue-lines.ts");

const shop = (over = {}) => ({
  id: "shop_1",
  name: "Cool Air",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  billingStatus: "active",
  billingPlan: "pro",
  ...over,
});
const sub = (over = {}) => ({ id: "sub_1", customerId: "cus_1", status: "active", planId: "pro", ...over });
const kinds = (list) => list.map((m) => m.kind).sort();

test("a shop billed and served the same way has nothing to fix", () => {
  assert.deepEqual(reconcileBilling([sub()], [shop()]), []);
  assert.deepEqual(reconcileBilling([sub({ status: "canceled" })], [shop({ billingStatus: "canceled" })]), []);
});

test("a paying shop locked out of its line is caught", () => {
  const [m] = reconcileBilling([sub()], [shop({ billingStatus: "canceled" })]);
  assert.equal(m.kind, "status_drift");
  assert.match(m.detail, /paying shop may be locked out/);
});

test("a shop served on a dead card is caught", () => {
  const [m] = reconcileBilling([sub({ status: "canceled" })], [shop()]);
  assert.equal(m.kind, "service_without_payment");
  assert.match(m.detail, /canceled in Stripe/);
  assert.equal(reconcileBilling([], [shop()])[0].kind, "service_without_payment");
});

test("a card charged with no shop behind it is caught", () => {
  const [m] = reconcileBilling([sub({ id: "sub_9", customerId: "cus_9" })], []);
  assert.equal(m.kind, "charged_without_shop");
  assert.match(m.detail, /cancel and refund/);
});

test("a customer charged twice is caught once, not as two other problems", () => {
  const found = reconcileBilling([sub(), sub({ id: "sub_2" })], [shop()]);
  assert.deepEqual(kinds(found), ["charged_twice"]);
  assert.match(found[0].detail, /2 Orvius subscriptions/);
});

test("a plan changed in Stripe but not in Orvius is caught both ways", () => {
  assert.equal(reconcileBilling([sub({ planId: "fleet" })], [shop()])[0].kind, "plan_drift");
  assert.match(reconcileBilling([sub({ planId: "line" })], [shop()])[0].detail, /pays for line but Orvius gives it pro/);
});

test("a shop charged on a different subscription than it points at is caught", () => {
  const found = reconcileBilling([sub({ id: "sub_new" })], [shop()]);
  assert.deepEqual(kinds(found), ["link_drift", "service_without_payment"]);
});

test("without a Stripe key the check says so instead of reporting clean", async () => {
  assert.deepEqual(await runBillingReconcile(), { checked: false, reason: "stripe not configured" });
});

test("the daily cron runs the billing check and reports how many need fixing", () => {
  const cron = readFileSync("src/app/api/cron/notifications/route.ts", "utf8");
  assert.match(cron, /step\("billing_reconcile", \(\) => runBillingReconcile\(\)\)/);
  assert.match(cron, /billingMismatches/);
  const admin = readFileSync("src/app/api/admin/billing-reconcile/route.ts", "utf8");
  assert.match(admin, /isPrivilegedRequest/);
});

const now = new Date("2026-10-09T12:00:00Z");
const facts = (over = {}) => ({
  shopId: "s",
  name: "Bright Electric",
  planId: "pro",
  createdAt: new Date(now.getTime() - 60 * 86_400_000),
  avgTicketCents: null,
  callsAnswered: 40,
  jobsBooked: 0,
  collectedCents: 0,
  ...over,
});

test("a shop whose booked work beats its price is earning", () => {
  const v = judgeShopValue(facts({ avgTicketCents: 35_000, jobsBooked: 6 }), now);
  assert.equal(v.verdict, "earning");
  assert.equal(v.bookedValueCents, 210_000);
  assert.equal(judgeShopValue(facts({ collectedCents: 90_000 }), now).verdict, "earning");
});

test("a shop getting less than it pays is named, with the numbers", () => {
  const v = judgeShopValue(facts({ avgTicketCents: 10_000, jobsBooked: 2 }), now);
  assert.equal(v.verdict, "short");
  assert.equal(v.reason, `2 jobs booked from 40 calls ($200 at their $100 average ticket) against a $${planMonthlyCents("pro") / 100} plan`);
  assert.match(judgeShopValue(facts({ jobsBooked: 9 }), now).reason, /no average ticket set and nothing collected/);
});

test("no calls at all points at forwarding, and a new shop gets a fair month first", () => {
  assert.equal(judgeShopValue(facts({ callsAnswered: 0 }), now).verdict, "idle");
  assert.match(judgeShopValue(facts({ callsAnswered: 0 }), now).reason, /forwarding/);
  const young = facts({ callsAnswered: 0, createdAt: new Date(now.getTime() - (VALUE_GRACE_DAYS - 1) * 86_400_000) });
  assert.equal(judgeShopValue(young, now).verdict, "too_new");
});

test("revenue and gross margin come from plan prices and measured call cost", () => {
  const unitCost = { costPerCallCents: 40, plans: [{ id: "pro", fixedCents: 1_500 }, { id: "line", fixedCents: 900 }] };
  const r = revenueFrom({ byPlan: [{ planId: "pro", shops: 10 }, { planId: "line", shops: 5 }, { planId: null, shops: 2 }], calls30d: 3_000, unitCost });
  const mrr = 10 * planMonthlyCents("pro") + 5 * planMonthlyCents("line");
  assert.equal(r.mrrCents, mrr);
  assert.equal(r.costCents, 3_000 * 40 + 10 * 1_500 + 5 * 900);
  assert.equal(r.grossMarginPct, Math.round(((mrr - r.costCents) / mrr) * 100));
  assert.equal(revenueFrom({ byPlan: [], calls30d: 0, unitCost: null }).grossMarginPct, null);
  assert.match(revenueLines(r)[0], /Monthly recurring revenue: \$[\d,]+ at list price \(ARR/);
  assert.match(revenueLines(revenueFrom({ byPlan: [], calls30d: 0, unitCost: null }))[1], /not measurable/);
});

test("the founders' board lists shops at risk by name", () => {
  const short = judgeShopValue(facts({ avgTicketCents: 10_000, jobsBooked: 1 }), now);
  assert.deepEqual(valueLines([]), ["Shops getting less than they pay for: none"]);
  assert.match(valueLines([short])[1], /Bright Electric: 1 job booked/);
});
