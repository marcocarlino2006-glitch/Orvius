/*
 * Growth loops: every new shop records where it came from, a shop that sends
 * another is credited a month of its plan once that shop pays, and the pages
 * customers see link back to Orvius.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER"]) delete process.env[key];

const { acquisitionChannel, countChannels, nextAcquisition, parseAcquisition } = await import("../src/lib/acquisition.ts");
const { acquisitionMetadata, attachAcquisition, creditReferralOnPayment, referralSummary } = await import(
  "../src/lib/referrals.ts"
);

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const own = ["orvius.im", "app.orvius.im", "api.orvius.im"];
const visit = (path, { referer = null, existing = null } = {}) =>
  nextAcquisition({ url: new URL(`https://orvius.im${path}`), referer, existing, ownHosts: own, now: new Date("2031-01-01T00:00:00Z") });

test("first touch wins the channel, a referral link always wins the referrer", () => {
  assert.equal(visit("/"), null, "a direct visit sets nothing");
  assert.equal(visit("/pricing", { referer: "https://app.orvius.im/x" }), null, "our own pages are not a source");

  const tiktok = visit("/?utm_source=TikTok&utm_campaign=11pm-call", { referer: "https://www.tiktok.com/" });
  assert.equal(tiktok.src, "tiktok");
  assert.equal(tiktok.cmp, "11pm-call");
  assert.equal(tiktok.host, "tiktok.com");
  assert.equal(acquisitionChannel(tiktok), "tiktok");

  assert.equal(visit("/?utm_source=reddit", { existing: tiktok }), null, "a later post does not take the credit");

  const referred = visit("/r/rays-heating?via=booking", { existing: tiktok });
  assert.equal(referred.ref, "rays-heating");
  assert.equal(referred.via, "booking");
  assert.equal(referred.src, "tiktok", "the original channel is kept");
  assert.equal(acquisitionChannel(referred), "referral");

  assert.equal(visit("/?ref=Rays-Heating").ref, "rays-heating");
  assert.equal(visit("/?ref=<script>").ref, "script", "codes are reduced to safe characters");
  assert.equal(parseAcquisition("not json"), null);
});

test("channels read as one word on the scoreboard", () => {
  assert.equal(acquisitionChannel(null), "direct");
  assert.equal(acquisitionChannel({ host: "l.facebook.com", at: "x" }), "facebook");
  assert.equal(acquisitionChannel({ host: "google.com", at: "x" }), "google");
  assert.equal(acquisitionChannel({ host: "t.co", at: "x" }), "x");
  assert.equal(acquisitionChannel({ host: "hvac-talk.com", at: "x" }), "hvac-talk.com");
  const rows = countChannels([JSON.stringify({ ref: "a", at: "x" }), null, JSON.stringify({ ref: "b", at: "x" }), "{}"]);
  assert.deepEqual(rows, [
    { channel: "direct", count: 2 },
    { channel: "referral", count: 2 },
  ]);
  const long = acquisitionMetadata({ ref: "a", land: "/".repeat(80), cmp: "c".repeat(60), host: "h".repeat(80), at: "x".repeat(400) });
  assert.ok(long.acq.length <= 480, "Stripe metadata stays under its 500-character cap");
});

async function shop(overrides = {}) {
  const id = stamp();
  return prisma.business.create({
    data: { name: `Shop ${id}`, slug: `growth-${id}`, ownerEmail: `owner-${id}@growth.invalid`, ...overrides },
  });
}

function fakeStripe() {
  const calls = [];
  return {
    calls,
    customers: {
      createBalanceTransaction: async (customer, params, options) => {
        calls.push({ customer, params, options });
        return { id: `cbtxn_${calls.length}` };
      },
    },
  };
}

test("a referred shop's first payment credits the referrer one month of its plan, once", async () => {
  const referrer = await shop({
    stripeCustomerId: `cus_ref_${stamp()}`,
    stripeSubscriptionId: `sub_${stamp()}`,
    billingStatus: "active",
    billingPlan: "pro",
  });
  const referred = await shop({ stripeCustomerId: `cus_new_${stamp()}` });
  const attached = await attachAcquisition(referred, { ref: referrer.slug, via: "link", src: "tiktok", at: "2031-01-01" });
  assert.equal(attached.referred, true);
  const row = await prisma.business.findUnique({ where: { id: referred.id } });
  assert.equal(row.referredById, referrer.id);
  assert.equal(JSON.parse(row.acquisitionJson).src, "tiktok");

  const stripe = fakeStripe();
  const texts = [];
  const notify = async (msg) => {
    texts.push(msg);
    return null;
  };
  assert.equal(
    (await creditReferralOnPayment({ customerId: referred.stripeCustomerId, amountPaidCents: 0 }, { stripe, notify })).status,
    "skipped",
    "a free invoice credits nothing",
  );
  const first = await creditReferralOnPayment({ customerId: referred.stripeCustomerId, amountPaidCents: 39900 }, { stripe, notify });
  assert.equal(first.status, "credited");
  assert.equal(first.creditCents, 39900, "one month of the referrer's own plan");
  assert.equal(stripe.calls.length, 1);
  assert.equal(stripe.calls[0].customer, referrer.stripeCustomerId);
  assert.equal(stripe.calls[0].params.amount, -39900);
  assert.match(stripe.calls[0].options.idempotencyKey, /^referral-credit:/);

  const again = await creditReferralOnPayment({ customerId: referred.stripeCustomerId, amountPaidCents: 39900 }, { stripe, notify });
  assert.equal(again.status, "skipped", "the second invoice does not credit again");
  assert.equal(stripe.calls.length, 1);
  assert.deepEqual(await referralSummary(referrer.id), { pending: 0, credited: 1, creditedCents: 39900 });
});

test("no credit for a self-referral, an unknown code, or a referrer that stopped paying", async () => {
  const owner = await shop();
  const sameOwner = await shop({ ownerEmail: owner.ownerEmail.toUpperCase() });
  assert.equal((await attachAcquisition(sameOwner, { ref: owner.slug, at: "x" })).referred, false);
  assert.equal((await attachAcquisition(owner, { ref: "no-such-shop-anywhere", at: "x" })).referred, false);
  const kept = await prisma.business.findUnique({ where: { id: owner.id } });
  assert.equal(kept.referredById, null);
  assert.equal(JSON.parse(kept.acquisitionJson).ref, "no-such-shop-anywhere", "the source is still recorded");

  const lapsed = await shop({ stripeCustomerId: `cus_lapsed_${stamp()}`, billingStatus: "canceled" });
  const referred = await shop({ stripeCustomerId: `cus_r_${stamp()}` });
  await attachAcquisition(referred, { ref: lapsed.slug, at: "x" });
  const stripe = fakeStripe();
  const result = await creditReferralOnPayment({ customerId: referred.stripeCustomerId, amountPaidCents: 19900 }, { stripe });
  assert.equal(result.status, "void");
  assert.equal(stripe.calls.length, 0);
});

test("a failed Stripe credit leaves the referral pending to retry", async () => {
  const referrer = await shop({
    stripeCustomerId: `cus_f_${stamp()}`,
    stripeSubscriptionId: `sub_f_${stamp()}`,
    billingStatus: "active",
    billingPlan: "line",
  });
  const referred = await shop({ stripeCustomerId: `cus_fr_${stamp()}` });
  await attachAcquisition(referred, { ref: referrer.slug, at: "x" });
  const failing = { customers: { createBalanceTransaction: async () => Promise.reject(new Error("stripe down")) } };
  await assert.rejects(creditReferralOnPayment({ customerId: referred.stripeCustomerId, amountPaidCents: 19900 }, { stripe: failing }));
  const row = await prisma.referral.findUnique({ where: { referredId: referred.id } });
  assert.equal(row.status, "pending");
});

test("attribution is wired end to end", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.match(read("src/middleware.ts"), /nextAcquisition\(/);
  assert.match(read("src/app/api/billing/checkout/route.ts"), /acquisitionMetadata\(acquisition\)/);
  assert.match(read("src/lib/checkout-shop.ts"), /attachAcquisition\(business, parseAcquisition\(session\.metadata\?\.acq\)\)/);
  assert.match(read("src/app/api/billing/webhook/route.ts"), /creditReferralOnPayment\(/);
  assert.match(read("src/app/b/[slug]/page.tsx"), /\/r\/\$\{encodeURIComponent\(slug\)\}\?via=booking/);
  assert.match(read("src/app/c/[token]/page.tsx"), /\?via=confirm/);
  assert.match(read("src/lib/company-scoreboard.ts"), /signupChannels: countChannels/);
});
