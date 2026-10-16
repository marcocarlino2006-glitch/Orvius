import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { commercialTerms } from "../src/lib/commercial-terms.ts";
import { MONEY_BACK_DAYS, MONEY_BACK_MARK, moneyBackState } from "../src/lib/money-back.ts";
import { claimMoneyBack, readMoneyBack } from "../src/lib/money-back-claim.ts";
import { pricingFaq } from "../src/lib/pricing-faq.ts";
import { prisma } from "../src/lib/prisma.ts";
import { UncertainEffectError } from "../src/lib/provider-effect.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DAY = 86400;
const NOW = new Date("2026-10-09T12:00:00Z");
const sec = (d) => Math.floor(d.getTime() / 1000);
let account = { businessId: "biz_money_back_test", customerId: "cus_1", subscriptionId: "sub_1" };
test.beforeEach(() => {
  account = { ...account, subscriptionId: `sub_${Math.random().toString(16).slice(2, 10)}` };
});

function fakeStripe({ startedDaysAgo = 5, metadata = {}, charges, status = "active", failCancelOnce = false, history = [] } = {}) {
  const start = sec(NOW) - startedDaysAgo * DAY;
  const state = {
    metadata: { ...metadata },
    sub: { id: "sub_1", status, start_date: start, created: start },
    charges: charges ?? [ch("ch_default", { created: start })],
    refundCalls: [],
    refunds: [],
    byKey: new Map(),
    loseRefundReply: false,
    cancelCalls: 0,
    failCancel: failCancelOnce,
  };
  const stripe = {
    customers: {
      retrieve: async () => ({ metadata: { ...state.metadata } }),
      update: async (_id, { metadata }) => {
        for (const [k, v] of Object.entries(metadata)) {
          if (v === "") delete state.metadata[k];
          else state.metadata[k] = v;
        }
      },
    },
    subscriptions: {
      retrieve: async () => ({ ...state.sub }),
      list: async () => ({ data: [{ ...state.sub }, ...history] }),
      cancel: async () => {
        state.cancelCalls += 1;
        if (state.failCancel) {
          state.failCancel = false;
          throw new Error("stripe down");
        }
        state.sub.status = "canceled";
        return { ...state.sub };
      },
    },
    charges: { list: async () => ({ data: state.charges.map((c) => ({ ...c })) }) },
    refunds: {
      create: async ({ charge, amount, metadata }, { idempotencyKey }) => {
        state.refundCalls.push({ charge, amount, idempotencyKey });
        const seen = state.byKey.get(idempotencyKey);
        if (seen) return { ...seen };
        const c = state.charges.find((x) => x.id === charge);
        c.amount_refunded += amount;
        const refund = { id: `re_${state.refunds.length + 1}_${charge}`, charge, amount, metadata };
        state.refunds.push(refund);
        state.byKey.set(idempotencyKey, refund);
        if (state.loseRefundReply) {
          state.loseRefundReply = false;
          throw Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" });
        }
        return { ...refund };
      },
      retrieve: async (id) => ({ ...state.refunds.find((r) => r.id === id) }),
      list: async ({ charge }) => ({ data: state.refunds.filter((r) => r.charge === charge) }),
    },
  };
  return { stripe, state };
}

const uid = () => Math.random().toString(16).slice(2, 10);
const ch = (id, extra = {}) => ({ id: `${id}_${uid()}`, amount: 14900, amount_refunded: 0, paid: true, status: "succeeded", created: 1, ...extra });
test.after(async () => {
  await prisma.providerEffect.deleteMany({ where: { businessId: { in: [account.businessId, ...shops] } } });
  await prisma.reconciliationException.deleteMany({ where: { businessId: { in: shops } } });
  await prisma.business.deleteMany({ where: { id: { in: shops } } });
  await prisma.$disconnect();
});
const shops = [];

test("the window is the first 30 days of the first plan", () => {
  const base = { subscriptionStatus: "active", claimedAt: null, refundableCents: 100 };
  const day = (n) => new Date(NOW.getTime() - n * DAY * 1000);
  assert.equal(MONEY_BACK_DAYS, 30);
  assert.equal(moneyBackState({ ...base, firstStartedAt: day(29) }, NOW).eligible, true);
  assert.equal(moneyBackState({ ...base, firstStartedAt: day(31) }, NOW).reason, "window_closed");
  assert.equal(moneyBackState({ ...base, firstStartedAt: day(1), claimedAt: "x" }, NOW).reason, "already_used");
  assert.equal(moneyBackState({ ...base, firstStartedAt: day(1), subscriptionStatus: "canceled" }, NOW).reason, "no_plan");
  assert.equal(moneyBackState({ ...base, firstStartedAt: day(1), refundableCents: 0 }, NOW).reason, "nothing_paid");
});

test("an earlier canceled plan closes the window for a second one", async () => {
  const old = { id: "sub_0", status: "canceled", start_date: sec(NOW) - 90 * DAY, created: sec(NOW) - 90 * DAY };
  const { stripe } = fakeStripe({ startedDaysAgo: 3, history: [old] });
  assert.equal((await readMoneyBack(stripe, account, NOW)).reason, "window_closed");
});

test("claiming refunds every payment, cancels the plan, and marks the customer once", async () => {
  const charges = [ch("ch_1"), ch("ch_2", { amount: 900, amount_refunded: 400, created: 2 }), ch("ch_3", { amount: 500, paid: false, status: "failed", created: 3 })];
  const { stripe, state } = fakeStripe({ charges });
  const offer = await readMoneyBack(stripe, account, NOW);
  assert.equal(offer.eligible, true);
  assert.equal(offer.refundCents, 15400);

  const claim = await claimMoneyBack(stripe, account, NOW);
  assert.equal(claim.ok, true);
  assert.equal(claim.refundedCents, 15400);
  assert.deepEqual(
    state.refundCalls.map((r) => [r.charge, r.amount, r.idempotencyKey]),
    [
      [charges[0].id, 14900, `money-back:${charges[0].id}`],
      [charges[1].id, 500, `money-back:${charges[1].id}`],
    ],
  );
  assert.equal(state.sub.status, "canceled");
  assert.ok(state.metadata[MONEY_BACK_MARK]);
  assert.equal(Object.keys(state.metadata).length, 1, "pending marker cleared");

  const again = await claimMoneyBack(stripe, account, NOW);
  assert.deepEqual(again, { ok: false, reason: "already_used" });
  assert.equal(state.refundCalls.length, 2);
});

test("a claim that dies after refunding is finished by the retry, never paid twice", async () => {
  const { stripe, state } = fakeStripe({ failCancelOnce: true });
  await assert.rejects(claimMoneyBack(stripe, account, NOW));
  assert.equal(state.refundCalls.length, 1);
  assert.equal(state.sub.status, "active");

  const retry = await claimMoneyBack(stripe, account, NOW);
  assert.equal(retry.ok, true);
  assert.equal(retry.refundedCents, 14900);
  assert.equal(state.refundCalls.length, 1);
  assert.equal(state.sub.status, "canceled");
  assert.ok(state.metadata[MONEY_BACK_MARK]);
});

test("a refund whose reply is lost is recorded, flagged, and checked at Stripe before anything is sent again", async () => {
  const shop = await prisma.business.create({ data: { name: "Refund Heating", slug: `mb-${uid()}`, ownerEmail: `mb-${uid()}@example.test` } });
  shops.push(shop.id);
  account = { ...account, businessId: shop.id };
  const { stripe, state } = fakeStripe();
  state.loseRefundReply = true;
  const charge = state.charges[0].id;

  await assert.rejects(claimMoneyBack(stripe, account, NOW), UncertainEffectError);
  const effect = await prisma.providerEffect.findUniqueOrThrow({
    where: { provider_correlationKey: { provider: "stripe", correlationKey: `money-back:${charge}` } },
  });
  assert.equal(effect.status, "uncertain");
  assert.equal(effect.operation, "money_back.refund");
  assert.ok(effect.exceptionId, "a person can see it");
  assert.equal((await prisma.reconciliationException.findUniqueOrThrow({ where: { id: effect.exceptionId } })).status, "open");
  assert.equal(state.sub.status, "active", "the plan isn't canceled while the refund is unknown");

  /* Past Stripe's replay window the retry looks the refund up instead of sending a new one. */
  await prisma.providerEffect.update({ where: { id: effect.id }, data: { createdAt: new Date(Date.now() - 2 * 86400_000) } });
  const retry = await claimMoneyBack(stripe, account, NOW);
  assert.equal(retry.ok, true);
  assert.equal(retry.refundedCents, 14900);
  assert.equal(state.refundCalls.length, 1, "no second refund request");
  assert.equal(state.charges[0].amount_refunded, 14900, "paid back once");
  const landed = await prisma.providerEffect.findUniqueOrThrow({ where: { id: effect.id } });
  assert.equal(landed.status, "finalized");
  assert.equal((await prisma.reconciliationException.findUniqueOrThrow({ where: { id: effect.exceptionId } })).status, "resolved");
});

test("refused claims change nothing", async () => {
  const { stripe, state } = fakeStripe({ startedDaysAgo: 45 });
  assert.deepEqual(await claimMoneyBack(stripe, account, NOW), { ok: false, reason: "window_closed" });
  assert.equal(state.refundCalls.length, 0);
  assert.equal(state.cancelCalls, 0);
  assert.deepEqual(state.metadata, {});
});

test("only the owner can claim, and the offer is told the same way everywhere", () => {
  const route = read("src/app/api/billing/money-back/route.ts");
  assert.match(route, /requirePermission\("billing\.manage", \{ entitled: false \}\)/);
  assert.match(route, /recordAudit\(/);
  assert.doesNotMatch(route, /error: message/);

  const refunds = commercialTerms().find((g) => g.id === "terms").rows.find((r) => r.id === "refunds").detail;
  assert.match(refunds, /First 30 days/);
  assert.match(refunds, /Once per shop/);
  assert.doesNotMatch(refunds, /guarantee/i);
  const faq = Object.fromEntries(pricingFaq.map((f) => [f.id, f.answer]));
  assert.match(faq.cancel, /first 30 days/);
  assert.match(read("src/app/refunds/page.tsx"), /Cancel and refund/);
  assert.match(read("src/components/pricing-page-plans.tsx"), /MONEY_BACK_DAYS/);
  assert.match(read("src/components/billing-content.tsx"), /<MoneyBackPanel/);
});
