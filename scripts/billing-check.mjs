#!/usr/bin/env node
/**
 * Billing readiness check — all three paid plans + webhook.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const PLANS = [
  { id: "line", name: "Orvius Line", price: 149, envKey: "STRIPE_PRICE_ID_LINE" },
  { id: "pro", name: "Orvius Pro", price: 299, envKey: "STRIPE_PRICE_ID_PRO", legacyKey: "STRIPE_PRICE_ID" },
  { id: "fleet", name: "Orvius Fleet", price: 499, envKey: "STRIPE_PRICE_ID_FLEET" },
];

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
const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

if (secretKey) pass("STRIPE_SECRET_KEY", `${secretKey.slice(0, 12)}…`);
else fail("STRIPE_SECRET_KEY", "Missing — Stripe Dashboard → Developers → API keys");

for (const plan of PLANS) {
  const priceId = env[plan.envKey]?.trim() || (plan.legacyKey ? env[plan.legacyKey]?.trim() : null);
  if (priceId) {
    pass(plan.envKey, priceId);
  } else {
    fail(plan.envKey, `Missing — run npm run stripe:setup ($${plan.price}/mo ${plan.name})`);
  }
}

if (webhookSecret) pass("STRIPE_WEBHOOK_SECRET", `${webhookSecret.slice(0, 10)}…`);
else fail("STRIPE_WEBHOOK_SECRET", "Missing — webhook at api.orvius.im/api/billing/webhook");

if (publishableKey) pass("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", `${publishableKey.slice(0, 12)}…`);
else warn("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "Optional for Checkout redirect");

if (secretKey) {
  const Stripe = (await import("stripe")).default;
  const stripe = new Stripe(secretKey);

  for (const plan of PLANS) {
    const priceId =
      env[plan.envKey]?.trim() || (plan.legacyKey ? env[plan.legacyKey]?.trim() : null);
    if (!priceId) continue;

    try {
      const price = await stripe.prices.retrieve(priceId);
      const amount = price.unit_amount ?? 0;
      const interval = price.recurring?.interval;
      if (amount === plan.price * 100 && interval === "month") {
        pass(`${plan.name} price`, `$${plan.price}/mo verified in Stripe`);
      } else {
        fail(`${plan.name} price`, `Expected $${plan.price}/mo, got $${amount / 100}/${interval ?? "?"}`);
      }
    } catch (error) {
      fail(`${plan.name} price`, error instanceof Error ? error.message : "Stripe lookup failed");
    }
  }
}

console.log("\n─────────────────────────────────────");
const blockers = checks.filter((c) => c.ok === false);
if (blockers.length === 0) {
  console.log("✅ BILLING: All plans ready for checkout\n");
  process.exit(0);
}

console.log(`❌ BILLING: ${blockers.length} blocker(s)\n`);
console.log("Run: npm run stripe:setup (after STRIPE_SECRET_KEY is set)\n");
process.exit(1);
