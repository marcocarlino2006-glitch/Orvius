#!/usr/bin/env node
/**
 * Stripe setup helper for Orvius Pro ($299/mo).
 * Creates product + price in your Stripe account when keys are set.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

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
const secretKey = env.STRIPE_SECRET_KEY?.trim();

console.log("\n💳 Orvius Stripe setup\n");

if (!secretKey) {
  console.log("❌ STRIPE_SECRET_KEY missing in .env\n");
  console.log("1. Create a Stripe account: https://dashboard.stripe.com/register");
  console.log("2. Developers → API keys → copy Secret key → STRIPE_SECRET_KEY");
  console.log("3. Re-run: npm run stripe:setup\n");
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
  (p) => p.unit_amount === 29900 && p.recurring?.interval === "month",
);

if (!price) {
  price = await stripe.prices.create({
    product: product.id,
    unit_amount: 29900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { orvius: "pro" },
  });
  console.log(`✅ Created price: $299/mo (${price.id})`);
} else {
  console.log(`✅ Using price: $299/mo (${price.id})`);
}

console.log("\nAdd to .env:\n");
console.log(`STRIPE_SECRET_KEY=${secretKey.slice(0, 12)}...`);
console.log(`STRIPE_PRICE_ID=${price.id}`);
console.log("STRIPE_WEBHOOK_SECRET=whsec_...  # from Stripe webhook endpoint");
console.log("\nWebhook URL (after deploy):");
console.log("  https://api.orvius.im/api/billing/webhook");
console.log("\nEvents to enable:");
console.log("  checkout.session.completed");
console.log("  customer.subscription.updated");
console.log("  customer.subscription.deleted\n");
