#!/usr/bin/env node
/**
 * Stripe setup — creates monthly + annual prices for Line, Pro, Fleet.
 * Annual = monthly equivalent × 12 (e.g. Pro $249/mo → $2988/yr).
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
    monthlyAmount: 14900,
    annualAmount: 148800, // $124/mo × 12
    envKey: "STRIPE_PRICE_ID_LINE",
    envKeyAnnual: "STRIPE_PRICE_ID_LINE_ANNUAL",
    metadata: { orvius: "line" },
    description: "AI receptionist, lead inbox, and owner SMS alerts.",
  },
  {
    id: "pro",
    name: "Orvius Pro",
    monthlyAmount: 29900,
    annualAmount: 298800, // $249/mo × 12
    envKey: "STRIPE_PRICE_ID_PRO",
    envKeyAnnual: "STRIPE_PRICE_ID_PRO_ANNUAL",
    metadata: { orvius: "pro" },
    description: "Full shop workspace — customers, jobs, dispatch, and Ask.",
  },
  {
    id: "fleet",
    name: "Orvius Fleet",
    monthlyAmount: 49900,
    annualAmount: 514800, // $429/mo × 12
    envKey: "STRIPE_PRICE_ID_FLEET",
    envKeyAnnual: "STRIPE_PRICE_ID_FLEET_ANNUAL",
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

console.log("\n💳 Orvius Stripe setup — Line, Pro, Fleet (monthly + annual)\n");

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
    limit: 40,
  });

  let monthly = prices.data.find(
    (p) => p.unit_amount === plan.monthlyAmount && p.recurring?.interval === "month",
  );
  if (!monthly) {
    monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.monthlyAmount,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { ...plan.metadata, interval: "month" },
    });
    console.log(`✅ Created monthly: $${plan.monthlyAmount / 100}/mo (${monthly.id})`);
  } else {
    console.log(`✅ Using monthly: $${plan.monthlyAmount / 100}/mo (${monthly.id})`);
  }
  upsertEnv(plan.envKey, monthly.id);
  console.log(`   → ${plan.envKey}=${monthly.id}`);

  let annual = prices.data.find(
    (p) => p.unit_amount === plan.annualAmount && p.recurring?.interval === "year",
  );
  if (!annual) {
    annual = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.annualAmount,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { ...plan.metadata, interval: "year" },
    });
    console.log(
      `✅ Created annual: $${plan.annualAmount / 100}/yr (~$${Math.round(plan.annualAmount / 12) / 100}/mo) (${annual.id})`,
    );
  } else {
    console.log(`✅ Using annual: $${plan.annualAmount / 100}/yr (${annual.id})`);
  }
  upsertEnv(plan.envKeyAnnual, annual.id);
  console.log(`   → ${plan.envKeyAnnual}=${annual.id}`);
}

const { env: refreshed } = loadEnvFile();
if (refreshed.STRIPE_PRICE_ID_PRO) {
  upsertEnv("STRIPE_PRICE_ID", refreshed.STRIPE_PRICE_ID_PRO);
  console.log(`\n✅ Wrote STRIPE_PRICE_ID (Pro monthly alias)`);
}

console.log("\nStill needed manually:");
console.log("STRIPE_WEBHOOK_SECRET=whsec_...");
console.log("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...");
console.log("\nWebhook URL: https://api.orvius.im/api/billing/webhook");
console.log("Verify: npm run billing:check\n");
