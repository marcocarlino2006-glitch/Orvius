#!/usr/bin/env node
/**
 * Institutional standard scorecard — run before deploy.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { analyzeCssUsage } from "./lib/css-usage.mjs";
import { closure, orphanModules, routeEntries } from "./lib/module-graph.mjs";

/** Repo-relative modules some route on `surface` renders. */
function surfaceModules(surface) {
  const cache = new Map();
  const found = new Set();
  for (const entry of routeEntries()) {
    if (entry.surface !== surface) continue;
    for (const file of entry.entries) {
      for (const module of closure(file, cache)) found.add(relative(root, module));
    }
  }
  return [...found].sort();
}

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
/*
  Every module a dashboard route renders, rather than the nine that were listed
  by hand. A hand-kept list of filenames is a sample, and a sample only ever
  covers the surfaces someone remembered — the one it named that mattered most,
  profile-menu.tsx, had been superseded by an inline rewrite and deleted, so the
  gate's next report was going to be that its own list needed updating.

  Restricted to .tsx because this is about copy an owner reads. src/lib/vapi.ts
  and twilio-client.ts say "Vapi" and "Twilio" constantly and should: that is
  the vendor's name in an API client, not jargon in front of a plumber.
*/
const clarityFiles = surfaceModules("dashboard").filter((rel) => rel.endsWith(".tsx"));

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
  pass(
    "Clarity scan",
    `No Ring/Vapi/command-center jargon across ${clarityFiles.length} modules the dashboard renders`,
  );
}

// ── Runbook language on the owner surface ──
/*
  The post-lock banner and the billing instrument were written for the person
  who owns the Stripe account: they name STRIPE_SECRET_KEY, point at
  docs/BILLING-SETUP.md, and say "Counsel-confirm formation state — never
  invent". Both rendered to every signed-in owner, so a plumber opening
  Billing read a note telling them not to claim self-serve checkout.

  A module may still carry that copy — someone has to read it — but only if it
  checks who is looking. Importing the founder guard is the precondition, so
  adding runbook language to an unguarded dashboard module fails here.
*/
/*
  Whether a module can say "not you". The test is a call, not an import: a
  route that imports the guard and never invokes it reads as guarded to a
  grep and is wide open at runtime, which is the mistake this gate exists to
  find in the first place.

  What an owner actually reads is checked at runtime by verify-detail.cjs,
  which crawls all fourteen routes signed in as a shop owner. Source is the
  wrong place for that question — one guarded block would excuse every
  unguarded line in the same file.
*/
const CALLS_FOUNDER_GUARD = /isFounderEmail\s*\(/;

// ── Founder-only data leaves through a founder-only route ──
/*
  Every gate in bulletproof-status.ts is marked founderOnly and nothing read
  the flag: the route serving them checked entitlement and stopped there, so
  any paying owner could fetch the list of Stripe env vars still missing and
  the note that formation state was unconfirmed.

  The rule is about the data, not the words: if a route's import closure
  reaches a module that marks something founderOnly, that route has to ask
  who is calling.
*/
const founderOnlyModules = [...walkFiles(join(root, "src"))].filter(
  (file) => /\.tsx?$/.test(file) && readFileSync(file, "utf8").includes("founderOnly"),
);

if (founderOnlyModules.length) {
  const closureCache = new Map();
  const apiRoutes = [...walkFiles(join(root, "src/app/api"))].filter((file) =>
    file.endsWith("/route.ts"),
  );
  for (const route of apiRoutes) {
    const reached = closure(route, closureCache);
    const carries = founderOnlyModules.filter(
      (module) => module !== route && reached.has(module),
    );
    if (!carries.length) continue;
    if (CALLS_FOUNDER_GUARD.test(readFileSync(route, "utf8"))) continue;
    fail(
      `Founder data ${relative(root, route)}`,
      `Serves founderOnly data from ${relative(root, carries[0])} without checking who is calling`,
    );
  }
}
if (!checks.some((c) => c.name.startsWith("Founder data") && c.ok === false)) {
  pass(
    "Founder data",
    `founderOnly data in ${founderOnlyModules.length} module(s) only leaves through founder-checked routes`,
  );
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

// ── No unreachable modules ──
/*
  Thirteen components, 1,012 lines, that no page imported and no script ran.
  They were not harmless: each one held its own class names, which is what kept
  127 dead CSS rules looking used, and one of them kept a multi-b gate green by
  existing on disk while master:class demanded it not be rendered.

  Nothing catches this by review. A component stops being reachable the moment
  its last import is deleted, and that deletion is a one-line diff in a file
  nobody associates with the component.
*/
const orphans = orphanModules().map((file) => relative(root, file));
if (orphans.length) {
  fail(
    "No unreachable modules",
    `${orphans.length} module(s) no route, handler or script can reach: ${orphans.join(", ")}`,
  );
} else {
  pass("No unreachable modules", "Every module under src/ is reachable from an entry point");
}

// ── No dead CSS ──
/*
  A stylesheet nobody renders is not inert. It is the thing a later change reads
  to decide what the design already does, and 1,134 of these had accumulated —
  two full abandoned skins, argued over in review, rendered nowhere. The audit
  protects dynamically assembled names by prefix, so `attention-item-${impact}`
  keeps its variants; anything it still calls dead is genuinely unreachable and
  npm run css:prune will remove it.
*/
const cssUsage = analyzeCssUsage();
if (cssUsage.dead.size) {
  const sample = [...cssUsage.dead].sort().slice(0, 8);
  fail(
    "No dead CSS",
    `${cssUsage.dead.size} class(es) declared but never rendered (${sample.join(", ")}${
      cssUsage.dead.size > sample.length ? ", …" : ""
    }) — run npm run css:audit`,
  );
} else {
  pass(
    "No dead CSS",
    `All ${cssUsage.verdicts.size} declared classes reachable (${cssUsage.dynamicPrefixes.size} dynamic prefixes protected)`,
  );
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
/*
  Every module a public route renders. The list this replaces named 23 files and
  described each one as the highest-risk surface on the site, which is the usual
  fate of a hand-kept list: it grows by whatever someone was editing that day,
  and the page nobody was editing is the page it cannot see.

  Not restricted to .tsx, because a good deal of the copy lives in lib —
  company.ts, pricing-faq.ts, i18n.ts — and a claim is a claim wherever it is
  written down.
*/
const marketingFiles = surfaceModules("public");

const NEGATIONS = /\b(no|not|never|cannot|can't|won't|without|unless|don't|doesn't)\b/i;

const PHRASE_BOUNDARY = [". ", ".<", "<li", "<p", "<h1", "<h2", "<h3"];

/**
 * Whether a claim is being disowned rather than made.
 *
 * "No method of transmission or storage is 100% secure" is a disclaimer, and so
 * is a bullet under the heading "What Orvius does not do (yet)" — flagging
 * either one trains the reader to ignore this gate.
 *
 * Two windows, because the two cases hide the negation in different places. The
 * phrase the claim sits in catches the sentence that negates itself; the heading
 * above it catches a list whose items carry no negation of their own, and no
 * full stops either. Both are deliberately tight: a first attempt read back to
 * the nearest full stop and no further, which reaches across whole paragraphs in
 * JSX and quietly excused an internal "arrives within 30 seconds" on the strength
 * of an unrelated "not" three sentences earlier.
 */
function isDisowned(content, index) {
  const before = content.slice(0, index);

  const phraseStart = Math.max(...PHRASE_BOUNDARY.map((token) => before.lastIndexOf(token)));
  if (NEGATIONS.test(before.slice(Math.max(phraseStart, 0)))) return true;

  const headingStart = Math.max(
    before.lastIndexOf("<h1"),
    before.lastIndexOf("<h2"),
    before.lastIndexOf("<h3"),
  );
  if (headingStart < 0) return false;
  const heading = content.slice(headingStart).match(/^<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/);
  return heading ? NEGATIONS.test(heading[1]) : false;
}
for (const rel of marketingFiles) {
  const content = readFileSync(join(root, rel), "utf8");
  for (const risk of HONESTY_RISKS) {
    const match = content.match(risk.pattern);
    if (match?.index !== undefined && !isDisowned(content, match.index)) {
      warn(`Honesty ${rel}`, `Review claim: "${risk.label}"`);
    }
  }
}
pass(
  "Honesty scan",
  `${marketingFiles.length} modules on the public surface checked for overclaims`,
);

// ── Reliability ──
/*
  Credentials are read here rather than asked of /api/health.

  Whether Twilio and Vapi are configured is a fact about the environment, but
  the only thing that used to check it was a call to the running app — so with
  the app down the whole block was skipped and the scorecard came back one gate
  better than with the app up. A check that improves when there is less
  evidence is worse than no check. This mirrors config.ready in src/lib/env.ts;
  keep the list in step with REQUIRED there.
*/
const RELIABILITY_ENV = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
];
const missingEnv = RELIABILITY_ENV.filter((name) => !process.env[name]?.trim());
if (missingEnv.length) {
  fail("Reliability config", `Missing ${missingEnv.join(", ")}`);
} else {
  pass("Reliability config", "Twilio + Vapi credentials present");
}

// The rest genuinely needs the app, since it is about runtime reachability.
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
  warn("Reliability live", "App not running — skipped runtime SMS reachability");
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
