#!/usr/bin/env node
/**
 * Pre-post gate checker — run before any public post of orvius.im
 */
import { spawnSync } from "node:child_process";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";

const checks = [];

async function fetchJson(path) {
  const res = await fetch(`${APP_URL}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`✅ ${name}: ${detail}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`❌ ${name}: ${detail}`);
}

function warn(name, detail) {
  checks.push({ name, ok: null, detail });
  console.log(`⚠️  ${name}: ${detail}`);
}

console.log("\n🚦 Orvius pre-post gate\n");
console.log(`   App URL: ${APP_URL}\n`);

try {
  const health = await fetchJson("/api/health");

  if (health.configured) {
    pass("Credentials", "Twilio + Vapi configured");
  } else {
    fail("Credentials", "Missing Twilio or Vapi secrets");
  }

  if (health.stats.businessCount > 0) {
    pass("Business", `${health.stats.businessCount} business provisioned`);
  } else {
    fail("Business", "No business — run /admin or npm run onboard");
  }

  if (health.stats.leadCount > 0) {
    pass("Leads", `${health.stats.leadCount} leads in database`);
  } else {
    warn("Leads", "No leads yet — run demo or place a test call");
  }

  if (health.ownerSmsEnabled) {
    pass("Owner SMS", "ENABLE_OWNER_SMS=true");
  } else {
    warn("Owner SMS", "Set ENABLE_OWNER_SMS=true and owner phone in /admin");
  }

  if (health.twilioPhone) {
    pass("Live line", health.twilioPhone);
  } else {
    fail("Live line", "TWILIO_PHONE_NUMBER not set");
  }

  const appUrl = health.appUrl ?? "";
  if (appUrl.includes("localhost") || appUrl.includes("127.0.0.1")) {
    warn("Production URL", `App URL is local (${appUrl}) — deploy before posting`);
  } else if (appUrl.includes("trycloudflare.com")) {
    warn("Production URL", "Using tunnel — deploy to Vercel before posting");
  } else {
    pass("Production URL", appUrl);
  }
} catch (err) {
  fail("Health check", err instanceof Error ? err.message : String(err));
}

console.log("\n🧪 Running internal E2E...\n");
const e2e = spawnSync("npm", ["run", "e2e:dogfood"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: { ...process.env, APP_URL },
  stdio: "inherit",
});

if (e2e.status === 0) {
  pass("E2E dogfood", "Internal wedge loop passed");
} else {
  fail("E2E dogfood", "Internal tests failed");
}

const blockers = checks.filter((c) => c.ok === false);
const warnings = checks.filter((c) => c.ok === null);

console.log("\n─────────────────────────────────────");
if (blockers.length === 0 && warnings.length === 0) {
  console.log("✅ PRE-POST GATE: CLEAR — safe to deploy and post");
  process.exit(0);
}

if (blockers.length === 0) {
  console.log(`⚠️  PRE-POST GATE: ${warnings.length} warning(s) — review before posting`);
  process.exit(0);
}

console.log(`❌ PRE-POST GATE: ${blockers.length} blocker(s) — do not post yet`);
process.exit(1);
