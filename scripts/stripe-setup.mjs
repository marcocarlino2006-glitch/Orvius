#!/usr/bin/env node
/**
 * Stripe setup — creates Line ($149), Pro ($299), and Fleet ($499) prices.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const PLANS = [
  {
    id: "line",
    name: "Orvius Line",
    amount: 14900,
    envKey: "STRIPE_PRICE_ID_LINE",
    metadata: { orvius: "line" },
    description: "AI receptionist, lead inbox, and owner SMS alerts.",
  },
  {
    id: "pro",
    name: "Orvius Pro",
    amount: 29900,
    envKey: "STRIPE_PRICE_ID_PRO",
    metadata: { orvius: "pro" },
    description: "Full shop workspace — customers, jobs, dispatch, and Ask.",
  },
  {
    id: "fleet",
    name: "Orvius Fleet",
    amount: 49900,
    envKey: "STRIPE_PRICE_ID_FLEET",
    metadata: { orvius: "fleet" },
    description: "For shops running 6+ trucks with priority support.",
  },
];

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
  const { lines } = loadEnvFile();
  let found = false;
  const nextLines = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) nextLines.push(`${key}=${value}`);
  writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

const { env } = loadEnvFile();
const secretKey = env.STRIPE_SECRET_KEY?.trim();

console.log("\n💳 Orvius Stripe setup — Line, Pro, Fleet\n");

if (!secretKey) {
  console.log("❌ STRIPE_SECRET_KEY missing in .env\n");
  console.log("1. Stripe Dashboard → Developers → API keys → copy Secret key");
  console.log("2. Add to .env: STRIPE_SECRET_KEY=sk_test_...");
  console.log("3. Re-run: npm run stripe:setup\n");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(secretKey);

for (const plan of PLANS) {
  const existingProducts = await stripe.products.list({ limit: 20, active: true });
  let product = existingProducts.data.find((p) => p.metadata?.orvius === plan.id);

  if (!product) {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: plan.metadata,
    });
    console.log(`✅ Created product: ${plan.name} (${product.id})`);
  } else {
    console.log(`✅ Using product: ${plan.name} (${product.id})`);
  }

  const prices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 20,
  });
  let price = prices.data.find(
    (p) => p.unit_amount === plan.amount && p.recurring?.interval === "month",
  );

  if (!price) {
    price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amount,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: plan.metadata,
    });
    console.log(`✅ Created price: $${plan.amount / 100}/mo (${price.id})`);
  } else {
    console.log(`✅ Using price: $${plan.amount / 100}/mo (${price.id})`);
  }

  upsertEnv(plan.envKey, price.id);
  console.log(`   → ${plan.envKey}=${price.id}`);
}

// Legacy alias for Pro
const { env: refreshed } = loadEnvFile();
if (refreshed.STRIPE_PRICE_ID_PRO) {
  upsertEnv("STRIPE_PRICE_ID", refreshed.STRIPE_PRICE_ID_PRO);
  console.log(`\n✅ Wrote STRIPE_PRICE_ID (Pro alias)`);
}

console.log("\nStill needed manually:");
console.log("STRIPE_WEBHOOK_SECRET=whsec_...");
console.log("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...");
console.log("\nWebhook URL: https://api.orvius.im/api/billing/webhook");
console.log("Verify: npm run billing:check\n");
