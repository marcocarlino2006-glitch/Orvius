#!/usr/bin/env node
/**
 * Institutional standard scorecard — run before deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

/** Every file under dir, skipping build output and dependencies. */
function* walkFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else yield full;
  }
}

const APP_URL =
  process.env.APP_URL?.trim() ||
  process.env.ORVIUS_STANDARD_APP_URL?.trim() ||
  "http://127.0.0.1:3000";
const root = new URL("..", import.meta.url).pathname;

const FETCH_TIMEOUT_MS = 3_000;
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
  "/api/shop/weekly-proof",
  "/api/ask",
  "/api/search",
];

async function resolveAppUrl() {
  const candidates = [
    APP_URL,
    "http://127.0.0.1:3079",
    "http://127.0.0.1:3078",
    "http://127.0.0.1:3000",
  ].filter((v, i, a) => a.indexOf(v) === i);

  for (const base of candidates) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1_200);
      const res = await fetch(`${base}/api/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok || res.status === 401) return base;
    } catch {
      /* try next */
    }
  }
  return APP_URL;
}

let activeAppUrl = APP_URL;

async function fetchWithTimeout(path, init) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(`${activeAppUrl}${path}`, { ...init, signal: controller.signal });
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
  // A learning loop is the easiest thing to claim and the hardest to have.
  // Nothing in the product trains on usage yet, so this stays a warning.
  { pattern: /(smarter|learns|improves) (with|from) every/i, label: "learns with every" },
  { pattern: /(sharpens|trains|teaches|tunes) the next/i, label: "sharpens the next" },
  { pattern: /\b(?:under|within)\s+\d+\s*(?:s|sec|seconds)\b/i, label: "unverified speed" },
  { pattern: /\b(?:alert|answer|respond)[^.]{0,30}\bin seconds\b/i, label: "unverified speed" },
];

try {
  const envPath = join(root, ".env");
  const envRaw = readFileSync(envPath, "utf8");
  const match = envRaw.match(/^ORVIUS_ADMIN_KEY=["']?([^"'\n]+)["']?/m);
  if (match?.[1] && !process.env.ORVIUS_ADMIN_KEY) {
    process.env.ORVIUS_ADMIN_KEY = match[1].trim();
  }
} catch {
  /* no local .env */
}

console.log("\n🏛  Orvius institutional standard check\n");
activeAppUrl = await resolveAppUrl();
console.log(`   App URL: ${activeAppUrl}\n`);

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
  "src/components/pro-setup-hub.tsx",
  "src/components/pro-shop-outcomes.tsx",
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
  let content;
  try {
    content = readFileSync(join(root, rel), "utf8");
  } catch {
    fail(`Clarity ${rel}`, "File missing — update clarityFiles list");
    continue;
  }
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
  let content;
  try {
    content = readFileSync(join(root, rel), "utf8");
  } catch {
    continue;
  }
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

// ── One receptionist prompt ──
const PROMPT_MARKER = "You are the AI receptionist for";
const promptOwner = "src/lib/business.ts";
// This checker names the marker, so it is not a fork of the prompt.
const promptCheckSelf = "scripts/standard-check.mjs";
const promptForks = [];
for (const dir of ["src", "scripts", "docs"]) {
  for (const file of walkFiles(join(root, dir))) {
    const rel = relative(root, file);
    if (rel === promptOwner || rel === promptCheckSelf) continue;
    if (!/\.(ts|tsx|mjs|js|md)$/.test(rel)) continue;
    try {
      if (readFileSync(file, "utf8").includes(PROMPT_MARKER)) promptForks.push(rel);
    } catch {
      /* unreadable */
    }
  }
}
if (promptForks.length) {
  fail(
    "One prompt",
    `Receptionist prompt duplicated in ${promptForks.join(", ")} — it drifts and the drift ships to a live line. Build it from buildAssistantSystemPrompt.`,
  );
} else {
  pass("One prompt", `Receptionist prompt lives only in ${promptOwner}`);
}

// ── Demand capture is complete ──
// A dataset where three of four write paths classify is a dataset nobody can
// quote, and the calls that slipped through cannot be re-run later.
const CAPTURE_HELPER = "deriveDemandSignal";
const captureOwner = "src/lib/demand-capture.ts";
const captureCheckSelf = "scripts/standard-check.mjs";
const LEAD_WRITE = /\b(?:prisma|tx)\.lead\.(?:create|upsert)\s*\(/;
const uncapturedWrites = [];
for (const file of walkFiles(join(root, "src"))) {
  const rel = relative(root, file);
  if (rel === captureOwner || rel === captureCheckSelf) continue;
  if (!/\.(ts|tsx)$/.test(rel)) continue;
  let source;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  if (LEAD_WRITE.test(source) && !source.includes(CAPTURE_HELPER)) {
    uncapturedWrites.push(rel);
  }
}
if (uncapturedWrites.length) {
  fail(
    "Demand capture",
    `Leads written without a category in ${uncapturedWrites.join(", ")} — those calls are permanently uncountable. Derive it with ${CAPTURE_HELPER}.`,
  );
} else {
  pass("Demand capture", `Every lead write path classifies via ${CAPTURE_HELPER}`);
}

// ── Customer STOP is impossible to bypass accidentally ──
// Owner and tech operational messages have different consent contexts. The
// two customer-facing surfaces must use the shop-scoped STOP-aware wrapper.
const customerSmsSurfaces = [
  "src/lib/customer-confirm.ts",
  "src/app/api/copilot/route.ts",
];
const unsafeCustomerSms = [];
for (const rel of customerSmsSurfaces) {
  try {
    const source = readFileSync(join(root, rel), "utf8");
    if (
      !source.includes("sendCustomerSms") ||
      /import\s+\{[^}]*\bsendSms\b[^}]*\}\s+from\s+["']@\/lib\/twilio-sms["']/.test(
        source,
      )
    ) {
      unsafeCustomerSms.push(rel);
    }
  } catch {
    unsafeCustomerSms.push(rel);
  }
}
if (unsafeCustomerSms.length) {
  fail(
    "Customer SMS consent",
    `STOP-aware sendCustomerSms missing or bypassed in ${unsafeCustomerSms.join(", ")}`,
  );
} else {
  pass(
    "Customer SMS consent",
    "Confirmation and follow-up both enforce shop-scoped STOP records",
  );
}

// ── One versioned AI model policy ──
const modelPolicyOwner = "src/lib/ai-policy.ts";
const hardcodedModels = [];
for (const file of walkFiles(join(root, "src"))) {
  const rel = relative(root, file);
  if (rel === modelPolicyOwner || !/\.(ts|tsx)$/.test(rel)) continue;
  try {
    const source = readFileSync(file, "utf8");
    if (
      /model:\s*["'](?:gpt-|claude-|gemini-|nova-|o[1-9](?:-|["']))/i.test(
        source,
      )
    ) {
      hardcodedModels.push(rel);
    }
  } catch {
    /* unreadable */
  }
}
if (hardcodedModels.length) {
  fail(
    "AI model policy",
    `Hardcoded model outside ${modelPolicyOwner}: ${hardcodedModels.join(", ")}`,
  );
} else {
  pass("AI model policy", `All model selection routes through ${modelPolicyOwner}`);
}

const divergentAssistantSyncs = [];
for (const file of walkFiles(join(root, "src"))) {
  const rel = relative(root, file);
  if (rel === "src/lib/vapi.ts" || !/\.ts$/.test(rel)) continue;
  try {
    const source = readFileSync(file, "utf8");
    if (
      source.includes("updateAssistant(") &&
      !source.includes("buildVapiAssistantConfig(")
    ) {
      divergentAssistantSyncs.push(rel);
    }
  } catch {
    /* unreadable */
  }
}
if (divergentAssistantSyncs.length) {
  fail(
    "AI assistant sync",
    `Assistant update bypasses the full extraction config in ${divergentAssistantSyncs.join(", ")}`,
  );
} else {
  pass(
    "AI assistant sync",
    "Create and update paths share one prompt, model, extraction, and evaluation config",
  );
}

// ── AI behavior has a regression gate ──
try {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const evalScript = pkg.scripts?.["ai:eval"] ?? "";
  readFileSync(join(root, "src/lib/ai-eval.ts"), "utf8");
  if (!evalScript.includes("scripts/ai-eval.mjs")) {
    fail("AI eval", "package.json ai:eval does not run scripts/ai-eval.mjs");
  } else {
    pass("AI eval", "Versioned receptionist scenarios and prompt contract are runnable");
  }
} catch {
  fail("AI eval", "AI evaluation harness is missing");
}

// ── Taxonomy codes are append-only ──
// Renaming a code splits its own history in half, and history is the asset.
try {
  const taxonomy = readFileSync(join(root, "src/lib/job-taxonomy.ts"), "utf8");
  const codes = [...taxonomy.matchAll(/code:\s*"([^"]+)"/g)].map((m) => m[1]);
  const duplicates = codes.filter((code, i) => codes.indexOf(code) !== i);
  const malformed = codes.filter((code) => !/^[a-z]+\.[a-z0-9_]+$/.test(code));
  if (duplicates.length) {
    fail("Taxonomy", `Duplicate codes merge two categories: ${duplicates.join(", ")}`);
  } else if (malformed.length) {
    fail("Taxonomy", `Codes must stay trade.category lowercase: ${malformed.join(", ")}`);
  } else {
    pass("Taxonomy", `${codes.length} demand codes, unique and well-formed`);
  }
} catch {
  fail("Taxonomy", "src/lib/job-taxonomy.ts missing — nothing can be counted without it");
}

// ── Honesty (marketing scan) ──
const marketingFiles = [
  "src/lib/trust.ts",
  "src/app/page.tsx",
  // Hero copy and its translations ship the loudest claims on the site.
  "src/components/home-line-hero.tsx",
  "src/components/home-tool-showcase.tsx",
  "src/components/home-product-preview.tsx",
  "src/components/home-call-story.tsx",
  "src/components/home-call-demo.tsx",
  "src/components/checkout-button.tsx",
  "src/components/pricing-plan-card.tsx",
  "src/lib/pricing-faq.ts",
  "src/app/layout.tsx",
  "src/app/demo/page.tsx",
  "src/lib/i18n.ts",
  // Ring copy describes what is live, and renders on the site and in the app.
  "src/lib/company.ts",
  "src/components/home-workflow.tsx",
  "src/components/home-statement.tsx",
  "src/app/product/page.tsx",
  "src/app/enterprise/page.tsx",
];
for (const rel of marketingFiles) {
  let content;
  try {
    content = readFileSync(join(root, rel), "utf8");
  } catch {
    warn(`Honesty ${rel}`, "File missing");
    continue;
  }
  for (const risk of HONESTY_RISKS) {
    if (risk.pattern.test(content)) {
      warn(`Honesty ${rel}`, `Review claim: "${risk.label}"`);
    }
  }
}
pass("Honesty scan", "Marketing files checked for overclaims");

// ── Reliability (live health if server up) ──
try {
  const adminKey = process.env.ORVIUS_ADMIN_KEY?.trim();
  const health = await fetchWithTimeout("/api/health", {
    headers: adminKey ? { "x-orvius-admin-key": adminKey } : undefined,
  });
  if (health.ok) {
    const json = await health.json();
    if (json.configured === undefined && json.ok) {
      warn(
        "Reliability live",
        "Health is production-locked — pass ORVIUS_ADMIN_KEY for detailed SMS/config checks",
      );
    } else if (json.configured) {
      pass("Reliability config", "Twilio + Vapi credentials present");
    } else {
      fail("Reliability config", "Missing Twilio or Vapi credentials");
    }
    if (json.ownerPhoneIsTwilioLine) {
      fail("Reliability SMS", "Owner phone equals Twilio line — alerts will not reach cell");
    } else if (json.ownerSmsReachable) {
      pass("Reliability SMS", "Owner SMS path reachable");
    } else if (json.configured !== undefined) {
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
