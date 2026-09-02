#!/usr/bin/env node
/**
 * Print env vars formatted for Vercel → Settings → Environment Variables.
 * Run locally: node scripts/export-vercel-env.mjs
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env");

const VERCEL_KEYS = [
  "DATABASE_URL",
  "NEXT_PUBLIC_APP_URL",
  "ORVIUS_PRIMARY_DOMAIN",
  "ORVIUS_MARKETING_DOMAIN",
  "ORVIUS_APP_DOMAIN",
  "ORVIUS_API_DOMAIN",
  "ORVIUS_DEPLOY_TARGET",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
  "VAPI_WEBHOOK_SECRET",
  "ENABLE_OWNER_SMS",
  "ORVIUS_OWNER_PHONE",
  "ORVIUS_ADMIN_KEY",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ORVIUS_AUTH_ALLOWED_EMAILS",
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_ID_LINE",
  "STRIPE_PRICE_ID_PRO",
  "STRIPE_PRICE_ID_FLEET",
  "STRIPE_PRICE_ID_LINE_ANNUAL",
  "STRIPE_PRICE_ID_PRO_ANNUAL",
  "STRIPE_PRICE_ID_FLEET_ANNUAL",
  "STRIPE_PRICE_ID",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

function loadEnv() {
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const env = loadEnv();

console.log("\n📋 Vercel environment variables\n");
console.log("Paste each row into Vercel → Project → Settings → Environment Variables\n");

for (const key of VERCEL_KEYS) {
  const value = env[key]?.trim() ?? "";
  const status = value ? "✓" : "— ADD";
  console.log(`${status}  ${key}`);
  if (value) {
    console.log(`    ${value.length > 60 ? value.slice(0, 57) + "..." : value}`);
  }
}

console.log("\n⚠️  Before deploy:");
console.log("   • DATABASE_URL → Turso or Neon (not file:./dev.db)");
console.log("   • GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET → Google Cloud Console");
console.log("   • STRIPE_* → npm run stripe:setup (optional until billing)\n");
