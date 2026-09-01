#!/usr/bin/env node
/**
 * Stripe setup helper for Orvius Pro ($299/mo).
 * Creates product + price in your Stripe account and writes STRIPE_PRICE_ID to .env.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");
const PRO_PRICE_CENTS = 29900;

function loadEnvFile() {
  if (!existsSync(envPath)) return { env: {}, lines: [] };
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return { env, lines: raw.split("\n") };
}

function upsertEnv(key, value) {
  const { env, lines } = loadEnvFile();
  env[key] = value;

  let found = false;
  const nextLines = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    nextLines.push(`${key}=${value}`);
  }

  writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

const { env } = loadEnvFile();
const secretKey = env.STRIPE_SECRET_KEY?.trim();

console.log("\n💳 Orvius Stripe setup\n");

if (!secretKey) {
  console.log("❌ STRIPE_SECRET_KEY missing in .env\n");
  console.log("1. Create a Stripe account: https://dashboard.stripe.com/register");
  console.log("2. Developers → API keys → copy Secret key");
  console.log("3. Add to .env: STRIPE_SECRET_KEY=sk_test_...");
  console.log("4. Re-run: npm run stripe:setup\n");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(secretKey);

const existingProducts = await stripe.products.list({ limit: 20, active: true });
let product = existingProducts.data.find((p) => p.metadata?.orvius === "pro");

if (!product) {
  product = await stripe.products.create({
    name: "Orvius Pro",
    description:
      "AI receptionist for HVAC, plumbing, and electrical shops — calls, qualification, owner alerts.",
    metadata: { orvius: "pro" },
  });
  console.log(`✅ Created product: ${product.name} (${product.id})`);
} else {
  console.log(`✅ Using product: ${product.name} (${product.id})`);
}

const prices = await stripe.prices.list({
  product: product.id,
  active: true,
  limit: 20,
});
let price = prices.data.find(
  (p) => p.unit_amount === PRO_PRICE_CENTS && p.recurring?.interval === "month",
);

if (!price) {
  price = await stripe.prices.create({
    product: product.id,
    unit_amount: PRO_PRICE_CENTS,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { orvius: "pro" },
  });
  console.log(`✅ Created price: $299/mo (${price.id})`);
} else {
  console.log(`✅ Using price: $299/mo (${price.id})`);
}

upsertEnv("STRIPE_PRICE_ID", price.id);
console.log(`\n✅ Wrote STRIPE_PRICE_ID to .env`);

console.log("\nStill needed manually:\n");
console.log("STRIPE_WEBHOOK_SECRET=whsec_...  # Stripe → Webhooks → Add endpoint");
console.log("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...  # optional for now");
console.log("\nWebhook URL (after deploy):");
console.log("  https://api.orvius.im/api/billing/webhook");
console.log("\nEvents to enable:");
console.log("  checkout.session.completed");
console.log("  customer.subscription.updated");
console.log("  customer.subscription.deleted");
console.log("\nVerify: npm run billing:check\n");
