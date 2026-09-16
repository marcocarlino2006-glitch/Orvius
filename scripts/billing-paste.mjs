#!/usr/bin/env node
/**
 * Billing paste — one founder command to land Stripe keys in .env,
 * then create prices. Does NOT fake webhook or claim first $.
 *
 * Usage:
 *   npm run billing:paste -- --secret sk_test_...
 *   npm run billing:paste -- --secret sk_live_... --publishable pk_... --webhook whsec_...
 *   npm run billing:paste -- --secret sk_test_... --setup
 *
 * After paste: npm run stripe:setup (or --setup) → npm run billing:check
 * Then mirror the same vars on Vercel and complete first Checkout.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

function arg(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  return process.argv[i + 1] ?? null;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function loadLines() {
  if (!existsSync(envPath)) return [];
  return readFileSync(envPath, "utf8").split("\n");
}

function upsertEnv(key, value) {
  const lines = loadLines();
  let found = false;
  const next = lines.map((line) => {
    if (line.trim().startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  writeFileSync(envPath, `${next.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

function mask(value) {
  if (!value || value.length < 12) return "(set)";
  return `${value.slice(0, 10)}…${value.slice(-4)}`;
}

const secret =
  arg("--secret")?.trim() || process.env.STRIPE_SECRET_KEY?.trim() || null;
const publishable =
  arg("--publishable")?.trim() ||
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
  null;
const webhook =
  arg("--webhook")?.trim() ||
  process.env.STRIPE_WEBHOOK_SECRET?.trim() ||
  null;
const runSetup = hasFlag("--setup");

console.log("\n💳 Orvius billing paste — founder keys → .env\n");

if (!secret) {
  console.log("Next unfinished step: paste the Stripe secret key.\n");
  console.log("  1. Stripe Dashboard → Developers → API keys → Secret key");
  console.log("  2. npm run billing:paste -- --secret sk_test_... --setup");
  console.log("  3. Stripe → Webhooks → endpoint api.orvius.im/api/billing/webhook");
  console.log("     npm run billing:paste -- --webhook whsec_...");
  console.log("  4. Mirror STRIPE_* on Vercel → npm run billing:check");
  console.log("  5. First Checkout on a pilot shop → first $\n");
  console.log("Optional flags: --publishable pk_... --webhook whsec_... --setup\n");
  process.exit(1);
}

if (!/^sk_(test|live)_/.test(secret)) {
  console.error("❌ --secret must look like sk_test_... or sk_live_...\n");
  process.exit(1);
}

upsertEnv("STRIPE_SECRET_KEY", secret);
console.log(`✅ Wrote STRIPE_SECRET_KEY=${mask(secret)}`);

if (publishable) {
  if (!/^pk_(test|live)_/.test(publishable)) {
    console.error("❌ --publishable must look like pk_test_... or pk_live_...\n");
    process.exit(1);
  }
  upsertEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", publishable);
  console.log(`✅ Wrote NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=${mask(publishable)}`);
}

if (webhook) {
  if (!webhook.startsWith("whsec_")) {
    console.error("❌ --webhook must look like whsec_...\n");
    process.exit(1);
  }
  upsertEnv("STRIPE_WEBHOOK_SECRET", webhook);
  console.log(`✅ Wrote STRIPE_WEBHOOK_SECRET=${mask(webhook)}`);
}

if (runSetup) {
  console.log("\n→ Running npm run stripe:setup …\n");
  const result = spawnSync("npm", ["run", "stripe:setup"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log("\nNext unfinished step: npm run stripe:setup");
  console.log("  (or re-run with --setup)\n");
}

console.log("Still founder-owned after prices exist:");
if (!webhook) {
  console.log("  • STRIPE_WEBHOOK_SECRET (Dashboard → Webhooks → api.orvius.im/api/billing/webhook)");
}
if (!publishable) {
  console.log("  • NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (optional for redirect Checkout)");
}
console.log("  • Same STRIPE_* vars on Vercel production");
console.log("  • First live Checkout → first $\n");
console.log("Verify: npm run billing:check\n");
process.exit(0);
