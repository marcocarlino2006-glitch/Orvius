#!/usr/bin/env node
/**
 * Billing readiness check — Stripe keys, price id, webhook.
 * Run: npm run billing:check
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const PRO_PRICE = 299;

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const checks = [];

function pass(name, detail) {
  checks.push({ ok: true, name, detail });
  console.log(`✅ ${name}: ${detail}`);
}

function fail(name, detail) {
  checks.push({ ok: false, name, detail });
  console.log(`❌ ${name}: ${detail}`);
}

function warn(name, detail) {
  checks.push({ ok: null, name, detail });
  console.log(`⚠️  ${name}: ${detail}`);
}

console.log("\n💳 Orvius billing readiness\n");

const secretKey = env.STRIPE_SECRET_KEY?.trim();
const priceId = env.STRIPE_PRICE_ID?.trim();
const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

if (secretKey) {
  pass("STRIPE_SECRET_KEY", `${secretKey.slice(0, 12)}…`);
} else {
  fail("STRIPE_SECRET_KEY", "Missing — get from Stripe Dashboard → Developers → API keys");
}

if (priceId) {
  pass("STRIPE_PRICE_ID", priceId);
} else {
  fail("STRIPE_PRICE_ID", `Missing — run npm run stripe:setup after adding secret key ($${PRO_PRICE}/mo)`);
}

if (webhookSecret) {
  pass("STRIPE_WEBHOOK_SECRET", `${webhookSecret.slice(0, 10)}…`);
} else {
  fail(
    "STRIPE_WEBHOOK_SECRET",
    "Missing — create webhook at https://api.orvius.im/api/billing/webhook",
  );
}

if (publishableKey) {
  pass("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `${publishableKey.slice(0, 12)}…`);
} else {
  warn("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "Optional for Checkout redirect — add when ready");
}

if (secretKey && priceId) {
  try {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey);
    const price = await stripe.prices.retrieve(priceId);
    const amount = price.unit_amount ?? 0;
    const interval = price.recurring?.interval;

    if (amount === PRO_PRICE * 100 && interval === "month") {
      pass("Price validation", `$${PRO_PRICE}/mo recurring price matches Orvius Pro`);
    } else {
      fail(
        "Price validation",
        `Price is $${amount / 100}/${interval ?? "?"} — expected $${PRO_PRICE}/month`,
      );
    }

    const productId =
      typeof price.product === "string" ? price.product : price.product?.id;
    if (productId) {
      const product = await stripe.products.retrieve(productId);
      pass("Stripe product", `${product.name} (${product.id})`);
    }
  } catch (error) {
    fail(
      "Stripe API",
      error instanceof Error ? error.message : "Could not verify price in Stripe",
    );
  }
} else {
  warn("Stripe API", "Skipped — need STRIPE_SECRET_KEY + STRIPE_PRICE_ID first");
}

console.log("\n─────────────────────────────────────");

const blockers = checks.filter((c) => c.ok === false);
if (blockers.length === 0) {
  console.log("✅ BILLING: Ready for self-serve checkout\n");
  process.exit(0);
}

console.log(`❌ BILLING: ${blockers.length} blocker(s)\n`);
console.log("Next steps:");
if (!secretKey) console.log("  1. Stripe Dashboard → Developers → API keys → copy Secret key");
if (!priceId) console.log("  2. npm run stripe:setup");
if (!webhookSecret) {
  console.log("  3. Stripe → Webhooks → Add endpoint:");
  console.log("       URL: https://api.orvius.im/api/billing/webhook");
  console.log("       Events: checkout.session.completed, customer.subscription.updated, customer.subscription.deleted");
}
console.log("  4. Add vars to Vercel → npm run billing:check again\n");
process.exit(1);
