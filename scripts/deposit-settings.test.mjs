/*
 * Two guards on the money path, both of which fail silently when they break.
 *
 * The settings guard: deposits on with no amount saved resolves to null, so
 * the Billing screen reads "on" while every deposit request is refused later,
 * at the moment an owner is on the phone with a customer.
 *
 * The webhook claim: Stripe retries for days on a non-2xx and also re-sends on
 * its own schedule, so the billing route has to be idempotent per event id.
 * The subtle half is the failure path — a row left in "processing" makes
 * Stripe's retry a no-op, which is how a paid deposit stays unfulfilled. This
 * exact mistake was already made once on the Vapi route, so it is pinned here.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import {
  MAX_DEPOSIT_CENTS,
  validateDepositSettingsChange,
} from "../src/lib/booking-deposit.ts";
import {
  claimWebhookEvent,
  completeWebhookEvent,
  hasProcessedWebhookEvent,
} from "../src/lib/webhook-events.ts";
import { STRIPE_MIN_CHARGE_CENTS } from "../src/lib/platform-fee.ts";

const prisma = new PrismaClient();

function unique(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

const OFF = { depositEnabled: false, depositAmountCents: null };
const ON = { depositEnabled: true, depositAmountCents: 4900 };

test("turning deposits on with no amount saved is refused", () => {
  const result = validateDepositSettingsChange({
    current: OFF,
    next: { depositEnabled: true },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /amount/i);
});

test("turning deposits on together with an amount is allowed", () => {
  const result = validateDepositSettingsChange({
    current: OFF,
    next: { depositEnabled: true, depositAmountCents: 4900 },
  });
  assert.equal(result.ok, true);
});

test("an amount already on file is enough to turn deposits on", () => {
  const result = validateDepositSettingsChange({
    current: { depositEnabled: false, depositAmountCents: 4900 },
    next: { depositEnabled: true },
  });
  assert.equal(result.ok, true);
});

test("clearing the amount while deposits stay on is refused", () => {
  /*
    The dangerous edit: the toggle is untouched and still reads "on", so
    without this the owner's screen keeps claiming deposits are being asked
    for after the amount behind them was deleted.
  */
  const result = validateDepositSettingsChange({
    current: ON,
    next: { depositAmountCents: null },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /amount/i);
});

test("clearing the amount is allowed when deposits are switched off too", () => {
  const result = validateDepositSettingsChange({
    current: ON,
    next: { depositEnabled: false, depositAmountCents: null },
  });
  assert.equal(result.ok, true);
});

test("amounts Stripe would reject are refused", () => {
  const tooSmall = validateDepositSettingsChange({
    current: OFF,
    next: { depositEnabled: true, depositAmountCents: STRIPE_MIN_CHARGE_CENTS - 1 },
  });
  assert.equal(tooSmall.ok, false);

  const typo = validateDepositSettingsChange({
    current: OFF,
    next: { depositEnabled: true, depositAmountCents: MAX_DEPOSIT_CENTS + 1 },
  });
  assert.equal(typo.ok, false);
});

test("a change touching neither field is left alone", () => {
  /*
    Every other Settings save goes through the same handler, so an unrelated
    edit to the owner's phone must not be judged against deposit rules.
  */
  const result = validateDepositSettingsChange({
    current: { depositEnabled: true, depositAmountCents: null },
    next: {},
  });
  assert.equal(result.ok, true);
});

test("a replayed Stripe event is refused a second claim", async () => {
  const eventId = unique("evt_test");
  const claim = {
    source: "stripe",
    externalId: eventId,
    eventType: "checkout.session.completed",
  };

  const first = await claimWebhookEvent(claim);
  assert.equal(first.claimed, true, "the first delivery should be handled");

  const concurrent = await claimWebhookEvent(claim);
  assert.equal(
    concurrent.claimed,
    false,
    "a second delivery arriving mid-flight must not fulfil again",
  );

  await completeWebhookEvent({ ...claim, status: "processed" });

  const afterSettled = await claimWebhookEvent(claim);
  assert.equal(
    afterSettled.claimed,
    false,
    "a replay after success must not fulfil again",
  );
  assert.equal(await hasProcessedWebhookEvent(claim), true);
});

test("a failed Stripe event is reclaimed so the retry does the work", async () => {
  const eventId = unique("evt_test_fail");
  const claim = {
    source: "stripe",
    externalId: eventId,
    eventType: "checkout.session.completed",
  };

  assert.equal((await claimWebhookEvent(claim)).claimed, true);

  /*
    What the route does when the handler throws: mark failed, answer 500, and
    let Stripe come back. Marked any other way, the retry is refused and the
    customer's payment is never fulfilled.
  */
  await completeWebhookEvent({
    ...claim,
    status: "failed",
    error: "database unavailable",
  });

  assert.equal(
    (await claimWebhookEvent(claim)).claimed,
    true,
    "Stripe's retry has to be allowed to run after a failure",
  );

  await completeWebhookEvent({ ...claim, status: "processed" });
  assert.equal(await hasProcessedWebhookEvent(claim), true);
});

test("the same Stripe event id on two event types is not one claim", async () => {
  /*
    Deduping on event id alone would let one delivery mask a different event
    type that legitimately needs its own handling.
  */
  const eventId = unique("evt_test_shared");
  const asCheckout = await claimWebhookEvent({
    source: "stripe",
    externalId: eventId,
    eventType: "checkout.session.completed",
  });
  const asAccount = await claimWebhookEvent({
    source: "stripe",
    externalId: eventId,
    eventType: "account.updated",
  });

  assert.equal(asCheckout.claimed, true);
  assert.equal(asAccount.claimed, true);
});

test("Stripe and Vapi do not collide on a shared external id", async () => {
  const sharedId = unique("shared");
  const stripe = await claimWebhookEvent({
    source: "stripe",
    externalId: sharedId,
    eventType: "checkout.session.completed",
  });
  const vapi = await claimWebhookEvent({
    source: "vapi",
    externalId: sharedId,
    eventType: "checkout.session.completed",
  });

  assert.equal(stripe.claimed, true);
  assert.equal(vapi.claimed, true);
});

test.after(async () => {
  await prisma.$disconnect();
});
