/*
 * One form, then the card: the shop details ride on the Stripe checkout, and
 * either the webhook or the owner's return builds the line from them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "VAPI_API_KEY"]) delete process.env[key];

const { CheckoutNotPaidError, provisionFromCheckout, shopDraftFromMetadata, shopDraftMetadata, shopDraftSchema } =
  await import("../src/lib/checkout-shop.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const draft = shopDraftSchema.parse({
  name: "  Fresh Air Co ",
  trade: "HVAC",
  ownerPhone: "+15125550141",
  areaCode: "512",
  timezone: "America/Chicago",
});

function fakeStripe({ email, metadata, status = "active", livemode }) {
  const subscription = {
    id: "sub_1",
    status,
    customer: "cus_1",
    metadata: { planId: "pro" },
    items: { data: [] },
  };
  return {
    checkout: {
      sessions: {
        retrieve: async () => ({ id: "cs_1", mode: "subscription", livemode, customer_email: email, metadata, subscription }),
      },
    },
    subscriptions: { retrieve: async () => subscription },
  };
}

test("shop details survive the trip through Stripe metadata, and junk is not a shop", () => {
  const metadata = shopDraftMetadata(draft, new Date("2026-10-02T12:00:00Z"));
  assert.ok(Object.values(metadata).every((v) => typeof v === "string" && v.length <= 500), "Stripe metadata limits");
  assert.equal(metadata.shop_consent_at, "2026-10-02T12:00:00.000Z");
  const back = shopDraftFromMetadata(metadata);
  for (const key of ["name", "trade", "ownerPhone", "areaCode", "timezone"]) assert.equal(back[key], draft[key], key);
  assert.equal(back.name, "Fresh Air Co");
  assert.equal(back.phoneNumber, undefined);

  assert.equal(shopDraftFromMetadata({}), null);
  assert.equal(shopDraftFromMetadata(null), null);
  assert.equal(shopDraftFromMetadata({ ...metadata, shop_trade: "Rocket science" }), null);
  const noLine = shopDraftFromMetadata({ ...metadata, shop_area_code: "", shop_phone_number: "" });
  assert.equal(noLine.areaCode, undefined);
});

test("a checkout without details asks for them instead of guessing", async () => {
  const email = `nodetails-${stamp()}@example.test`;
  const result = await provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email, metadata: {} }) });
  assert.deepEqual(result, { status: "needs_details" });
});

test("someone else's checkout, or an unpaid one, builds nothing", async () => {
  const email = `owner-${stamp()}@example.test`;
  const metadata = shopDraftMetadata(draft, new Date());
  await assert.rejects(
    provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email: "other@example.test", metadata }) }),
    CheckoutNotPaidError,
  );
  await assert.rejects(
    provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email, metadata, status: "incomplete" }) }),
    CheckoutNotPaidError,
  );
  assert.equal(await prisma.business.count({ where: { ownerEmail: email } }), 0);
});

test("a shop that already exists is returned, so the webhook and the browser can both try", async () => {
  const email = `exists-${stamp()}@example.test`;
  const shop = await prisma.business.create({ data: { name: "Already Here", slug: `here-${stamp()}`, ownerEmail: email } });
  try {
    let touched = false;
    const stripe = { checkout: { sessions: { retrieve: async () => ((touched = true), {}) } }, subscriptions: {} };
    const result = await provisionFromCheckout({ sessionId: "cs_1", email: email.toUpperCase(), stripe });
    assert.equal(result.status, "exists");
    assert.equal(result.business.id, shop.id);
    assert.equal(touched, false, "no Stripe call once the shop exists");
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("a paid checkout with details goes straight to building the line", async () => {
  const email = `build-${stamp()}@example.test`;
  const metadata = shopDraftMetadata(draft, new Date());
  await assert.rejects(
    provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email, metadata }) }),
    /Voice AI is not configured/,
    "with voice unset here, reaching the build step is the proof the details were used",
  );
});

test("on the production deployment a test-mode checkout builds nothing, so the public test card cannot buy a line", async () => {
  const email = `testmode-${stamp()}@example.test`;
  const metadata = shopDraftMetadata(draft, new Date());
  const before = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "production";
  try {
    await assert.rejects(
      provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email, metadata, livemode: false }) }),
      (error) => error instanceof CheckoutNotPaidError && /Test-mode checkout/.test(error.message),
    );
    await assert.rejects(
      provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email, metadata, livemode: true }) }),
      /Voice AI is not configured/,
      "a live checkout still reaches the build step",
    );
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
  assert.equal(await prisma.business.count({ where: { ownerEmail: email } }), 0);
});

test("previews and local runs still accept test-mode checkouts", async () => {
  const email = `preview-${stamp()}@example.test`;
  const metadata = shopDraftMetadata(draft, new Date());
  const before = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = "preview";
  try {
    await assert.rejects(
      provisionFromCheckout({ sessionId: "cs_1", email, stripe: fakeStripe({ email, metadata, livemode: false }) }),
      /Voice AI is not configured/,
    );
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});
