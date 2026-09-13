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

/*
  Ask production before judging the local .env.

  This script used to read .env alone and print "TWILIO_ACCOUNT_SID missing —
  add before Vercel deploy" for keys Vercel has had for weeks, then exit 1. The
  effect was to report a live deployment as unshippable, which is worse than no
  check: the founder reasonably concluded the line was not up. Vercel's
  environment is the one that serves calls, so it is the one that decides, and
  a gap in .env is a local-development note.
*/
const PROD_HEALTH = process.env.PROD_URL ?? "https://orvius.im";
let prodConfigured = null;

try {
  const res = await fetch(`${PROD_HEALTH}/api/health`, {
    signal: AbortSignal.timeout(8000),
  });
  if (res.ok) {
    const health = await res.json();
    prodConfigured = Boolean(health.configured);
    results.push(
      prodConfigured
        ? pass(
            `Production credentials live — Twilio + Vapi configured on ${PROD_HEALTH}${
              health.twilioPhone ? ` (${health.twilioPhone})` : ""
            }`,
          )
        : fail(`Production reachable but not configured — ${PROD_HEALTH}`),
    );
  } else {
    results.push(warn(`Production health returned ${res.status} — cannot confirm live credentials`));
  }
} catch {
  results.push(warn(`Could not reach ${PROD_HEALTH}/api/health — judging .env alone`));
}

/* Covered by /api/health's `configured`, so production can settle these. */
const CALL_KEYS = new Set([
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
]);

const required = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
  "NEXT_PUBLIC_APP_URL",
  "DATABASE_URL",
  /* Vercel only sends the bearer header when this is set, and the cron route
     refuses to drain without it. Missing means the owner alert queue stops.
     Health cannot report it, so npm run prod:verify probes the route instead. */
  "CRON_SECRET",
];

console.log("\n   Local .env (what npm run dev uses):");
for (const key of required) {
  if (env[key]?.trim()) {
    results.push(pass(`${key} set`));
  } else if (CALL_KEYS.has(key) && prodConfigured) {
    results.push(warn(`${key} not in local .env — production has it; only npm run dev is affected`));
  } else {
    results.push(fail(`${key} missing — add before Vercel deploy`));
  }
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
  env.STRIPE_PRICE_ID_LINE?.trim() &&
  env.STRIPE_PRICE_ID_PRO?.trim() &&
  env.STRIPE_PRICE_ID_FLEET?.trim() &&
  env.STRIPE_WEBHOOK_SECRET?.trim();

if (stripeReady) {
  results.push(pass("Stripe billing configured"));
} else {
  results.push(
    warn("Stripe not fully configured — run npm run stripe:setup after deploy"),
  );
}

const googleId =
  env.AUTH_GOOGLE_ID?.trim() || env.GOOGLE_CLIENT_ID?.trim() || "";
const googleSecret =
  env.AUTH_GOOGLE_SECRET?.trim() || env.GOOGLE_CLIENT_SECRET?.trim() || "";
const authSecret = env.AUTH_SECRET?.trim() || "";
const googleKeysPresentButEmpty =
  Object.prototype.hasOwnProperty.call(env, "GOOGLE_CLIENT_ID") &&
  !googleId;

if (authSecret && googleId && googleSecret) {
  results.push(pass("Google sign-in configured (local .env)"));
} else if (googleKeysPresentButEmpty || (!googleId && authSecret)) {
  results.push(
    warn(
      "Google OAuth empty in local .env — OK if set on Vercel (AUTH_GOOGLE_* or GOOGLE_CLIENT_*). Login on orvius.im is source of truth.",
    ),
  );
} else {
  results.push(
    fail(
      "Google sign-in missing — add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (or AUTH_GOOGLE_*) — docs/AUTH-GOOGLE.md",
    ),
  );
}

for (const page of ["pricing", "terms", "privacy", "legal", "about", "cookies", "sms-terms", "refunds", "security"]) {
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
    results.push(pass("orvius.im serves the marketing site"));
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
console.log("   5. npm run stripe:setup → npm run billing:check → add STRIPE_* to Vercel (docs/BILLING-SETUP.md)");
console.log("   6. WEBHOOK_BASE_URL=https://api.orvius.im npm run vapi:webhook");
console.log("   7. Call Twilio line → verify /dashboard + owner SMS\n");
console.log(
  "   This checks what you are about to ship. To check what is already\n" +
    "   serving traffic — TLS, closed doors, code drift — run npm run prod:verify\n",
);

const blockers = results.filter((r) => r === false);
if (blockers.length) {
  console.log(`❌ ${blockers.length} blocker(s) — fix before deploy\n`);
  process.exit(1);
}

console.log("✅ Ready to deploy (review warnings above)\n");
