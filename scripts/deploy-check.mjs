#!/usr/bin/env node
/**
 * Pre-deploy checklist — run before pushing to Vercel.
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
    env[trimmed.slice(0, eq)] = trimmed
      .slice(eq + 1)
      .replace(/^["']|["']$/g, "");
  }
  return env;
}

function pass(msg) {
  console.log(`✅ ${msg}`);
  return true;
}

function fail(msg) {
  console.log(`❌ ${msg}`);
  return false;
}

function warn(msg) {
  console.log(`⚠️  ${msg}`);
  return null;
}

console.log("\n🚀 Orvius deploy check\n");

const env = loadEnv();
const results = [];

const required = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
  "NEXT_PUBLIC_APP_URL",
  "DATABASE_URL",
];

for (const key of required) {
  results.push(
    env[key]?.trim()
      ? pass(`${key} set`)
      : fail(`${key} missing — add before Vercel deploy`),
  );
}

const appUrl = env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
  results.push(
    warn("NEXT_PUBLIC_APP_URL is localhost — set to https://api.orvius.im before production"),
  );
} else if (appUrl.includes("orvius.im")) {
  results.push(pass("NEXT_PUBLIC_APP_URL points at production domain"));
}

if (env.DATABASE_URL?.startsWith("file:")) {
  results.push(
    warn(
      "DATABASE_URL is SQLite — use Turso/Neon on Vercel for persistence",
    ),
  );
}

if (
  env.ORVIUS_OWNER_PHONE &&
  env.TWILIO_PHONE_NUMBER &&
  env.ORVIUS_OWNER_PHONE === env.TWILIO_PHONE_NUMBER
) {
  results.push(
    warn("ORVIUS_OWNER_PHONE equals Twilio line — use your personal cell"),
  );
} else if (env.ORVIUS_OWNER_PHONE) {
  results.push(pass("ORVIUS_OWNER_PHONE set to personal number"));
} else {
  results.push(warn("ORVIUS_OWNER_PHONE not set — owner SMS won't work"));
}

if (env.ENABLE_OWNER_SMS === "true") {
  results.push(pass("ENABLE_OWNER_SMS=true"));
} else {
  results.push(warn("ENABLE_OWNER_SMS not true"));
}

const stripeReady =
  env.STRIPE_SECRET_KEY?.trim() &&
  env.STRIPE_PRICE_ID?.trim() &&
  env.STRIPE_WEBHOOK_SECRET?.trim();

if (stripeReady) {
  results.push(pass("Stripe billing configured"));
} else {
  results.push(
    warn("Stripe not fully configured — run npm run stripe:setup after deploy"),
  );
}

for (const page of ["pricing", "terms", "privacy"]) {
  const pagePath = resolve(root, "src/app", page, "page.tsx");
  results.push(
    existsSync(pagePath)
      ? pass(`/${page} page present`)
      : fail(`/${page} page missing`),
  );
}

try {
  const res = await fetch("http://127.0.0.1:3000/api/health");
  if (res.ok) {
    const health = await res.json();
    results.push(pass(`Local health OK — ${health.stats.leadCount} leads`));
    if (health.ownerPhoneIsTwilioLine) {
      results.push(warn("Business owner phone = Twilio line in database"));
    }
  } else {
    results.push(warn("Dev server not responding — start with npm run dev"));
  }
} catch {
  results.push(warn("Dev server not running"));
}

try {
  const res = await fetch("https://orvius.im", { redirect: "follow" });
  if (res.ok) {
    results.push(pass("orvius.im responds — DNS may be live"));
  } else {
    results.push(
      warn(`orvius.im returns ${res.status} — update DNS (remove Manus CNAME)`),
    );
  }
} catch {
  results.push(warn("Could not reach orvius.im"));
}

console.log("\n📋 Deploy sequence:");
console.log("   1. git push → import on Vercel (docs/DEPLOY-VERCEL.md)");
console.log("   2. Add env vars + Turso/Neon DATABASE_URL");
console.log("   3. Domains: orvius.im, app.orvius.im, api.orvius.im");
console.log("   4. Namecheap DNS — docs/DNS-ORVIUS-IM.md");
console.log("   5. npm run stripe:setup → add STRIPE_* to Vercel");
console.log("   6. WEBHOOK_BASE_URL=https://api.orvius.im npm run vapi:webhook");
console.log("   7. Call Twilio line → verify /dashboard + owner SMS\n");

const blockers = results.filter((r) => r === false);
if (blockers.length) {
  console.log(`❌ ${blockers.length} blocker(s) — fix before deploy\n`);
  process.exit(1);
}

console.log("✅ Ready to deploy (review warnings above)\n");
