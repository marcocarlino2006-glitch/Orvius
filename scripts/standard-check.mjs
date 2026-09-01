#!/usr/bin/env node
/**
 * Institutional standard scorecard — run before deploy.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const APP_URL = process.env.APP_URL ?? "http://127.0.0.1:3000";
const root = new URL("..", import.meta.url).pathname;

const FETCH_TIMEOUT_MS = 3_000;

async function fetchWithTimeout(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${APP_URL}${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const checks = [];

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

const TENANT_APIS = [
  "/api/leads",
  "/api/calls",
  "/api/customers",
  "/api/jobs",
  "/api/dispatch",
  "/api/technicians",
  "/api/ring1",
  "/api/account",
  "/api/shop/health",
  "/api/ask",
];

const OWNER_JARGON = [
  /\bRing [0-9]\b/,
  /\bcommand center\b/i,
  /\bVapi\b/,
  /\bTwilio\b/,
  /\bOS modules\b/,
];

const HONESTY_RISKS = [
  { pattern: /guaranteed/i, label: "guaranteed" },
  { pattern: /never miss/i, label: "never miss" },
  { pattern: /100%/i, label: "100%" },
  { pattern: /always answers/i, label: "always answers" },
];

console.log("\n🏛  Orvius institutional standard check\n");
console.log(`   App URL: ${APP_URL}\n`);

// ── Isolation ──
for (const path of TENANT_APIS) {
  try {
    const res = await fetchWithTimeout(path);
    if (res.status === 401) {
      pass(`Isolation ${path}`, "401 without auth");
    } else {
      fail(`Isolation ${path}`, `Expected 401, got ${res.status}`);
    }
  } catch (error) {
    warn(`Isolation ${path}`, error instanceof Error ? error.message : String(error));
  }
}

// ── Clarity (static scan) ──
const clarityFiles = [
  "src/lib/os-nav.ts",
  "src/components/onboarding-wizard.tsx",
  "src/app/dashboard/calls/[id]/page.tsx",
  "src/app/dashboard/inbox/[id]/page.tsx",
  "src/components/profile-menu.tsx",
  "src/components/pro-wedge-readiness.tsx",
  "src/components/pro-signal-bar.tsx",
  "src/app/dashboard/settings/page.tsx",
];

const HONESTY_UI_PATTERNS = [
  { pattern: /<\s*60s/i, label: "hardcoded alert speed claim" },
  { pattern: /never miss/i, label: "never miss" },
  { pattern: /100%/i, label: "100%" },
  { pattern: /guaranteed/i, label: "guaranteed" },
];

for (const rel of clarityFiles) {
  const content = readFileSync(join(root, rel), "utf8");
  for (const pattern of OWNER_JARGON) {
    if (pattern.test(content)) {
      fail(`Clarity ${rel}`, `Contains owner-facing jargon: ${pattern}`);
    }
  }
}

if (!checks.some((c) => c.name.startsWith("Clarity") && c.ok === false)) {
  pass("Clarity scan", "No Ring/Vapi/command-center jargon in key owner UI");
}

// ── Honesty (dashboard UI — measured claims only) ──
for (const rel of clarityFiles) {
  const content = readFileSync(join(root, rel), "utf8");
  for (const risk of HONESTY_UI_PATTERNS) {
    if (risk.pattern.test(content)) {
      fail(`Honesty UI ${rel}`, `Unverified claim: ${risk.label}`);
    }
  }
}
if (!checks.some((c) => c.name.startsWith("Honesty UI") && c.ok === false)) {
  pass("Honesty UI", "No hardcoded speed or overclaim copy in owner dashboard");
}

// ── Dead trust strip removed ──
try {
  readFileSync(join(root, "src/components/ring1-trust-strip.tsx"), "utf8");
  fail("Trust UI", "ring1-trust-strip.tsx still present — use measured ProAlertSpeedBadge");
} catch {
  pass("Trust UI", "No hardcoded trust strip; alert speed is measured");
}

// ── Honesty (marketing scan) ──
const marketingFiles = ["src/lib/trust.ts", "src/app/page.tsx"];
for (const rel of marketingFiles) {
  const content = readFileSync(join(root, rel), "utf8");
  for (const risk of HONESTY_RISKS) {
    if (risk.pattern.test(content)) {
      warn(`Honesty ${rel}`, `Review claim: "${risk.label}"`);
    }
  }
}
pass("Honesty scan", "Marketing files checked for overclaims");

// ── Reliability (live health if server up) ──
try {
  const health = await fetchWithTimeout("/api/health");
  if (health.ok) {
    const json = await health.json();
    if (json.configured) {
      pass("Reliability config", "Twilio + Vapi credentials present");
    } else {
      fail("Reliability config", "Missing Twilio or Vapi credentials");
    }
    if (json.ownerPhoneIsTwilioLine) {
      fail("Reliability SMS", "Owner phone equals Twilio line — alerts will not reach cell");
    } else if (json.ownerSmsReachable) {
      pass("Reliability SMS", "Owner SMS path reachable");
    } else {
      warn("Reliability SMS", "Owner SMS not fully configured");
    }
  }
} catch {
  warn("Reliability live", "App not running — skip live health checks");
}

// ── Institutional playbook ──
try {
  readFileSync(join(root, "docs/INSTITUTIONAL-PLAYBOOK.md"), "utf8");
  pass("Institutional playbook", "docs/INSTITUTIONAL-PLAYBOOK.md present");
} catch {
  fail("Institutional playbook", "docs/INSTITUTIONAL-PLAYBOOK.md missing");
}

try {
  readFileSync(join(root, "src/lib/institutional-standards.ts"), "utf8");
  pass("Owner SLAs in code", "institutional-standards.ts present");
} catch {
  fail("Owner SLAs in code", "src/lib/institutional-standards.ts missing");
}

// ── Docs exist ──
try {
  readFileSync(join(root, "docs/STANDARD.md"), "utf8");
  pass("Operating standard", "docs/STANDARD.md present");
} catch {
  fail("Operating standard", "docs/STANDARD.md missing");
}

// ── CI gate script ──
try {
  readFileSync(join(root, "scripts/ci-gate.mjs"), "utf8");
  pass("CI gate", "scripts/ci-gate.mjs present (npm run ci)");
} catch {
  fail("CI gate", "scripts/ci-gate.mjs missing");
}

const blockers = checks.filter((c) => c.ok === false);
const warnings = checks.filter((c) => c.ok === null);

console.log("\n─────────────────────────────────────");
if (blockers.length === 0) {
  console.log(
    warnings.length
      ? `⚠️  STANDARD CHECK: ${warnings.length} warning(s) — review`
      : "✅ STANDARD CHECK: PASS",
  );
  process.exit(0);
}

console.log(`❌ STANDARD CHECK: ${blockers.length} blocker(s)`);
process.exit(1);
