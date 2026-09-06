#!/usr/bin/env node
/**
 * Manus bar — bulletproof before public post.
 *
 * Usage:
 *   npm run bulletproof
 *   BULLETPROOF_SKIP_CASH=1 npm run bulletproof
 *   APP_URL=https://app.orvius.im npm run bulletproof
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipCash = process.env.BULLETPROOF_SKIP_CASH === "1";
const appUrl = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

const gates = [];

function ok(id, label, detail) {
  gates.push({ id, label, ok: true, detail });
  console.log(`✅ ${label}${detail ? ` — ${detail}` : ""}`);
}

function bad(id, label, detail) {
  gates.push({ id, label, ok: false, detail });
  console.log(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
}

function run(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: (result.status ?? 1) === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function fileHas(rel, needle) {
  try {
    return readFileSync(join(root, rel), "utf8").includes(needle);
  } catch {
    return false;
  }
}

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...loadEnv(), ...process.env };

console.log("\n◆ ORVIUS BULLETPROOF — Manus bar\n");
console.log("  Post only when every public claim has a working path.\n");
console.log(`  APP_URL=${appUrl}`);
console.log(`  Cash gates: ${skipCash ? "SKIPPED (product-only)" : "ON"}\n`);

const standard = run("standard:check");
if (standard.ok) ok("standard", "Institutional standard", "isolation + honesty");
else bad("standard", "Institutional standard", "npm run standard:check failed");

const trust = run("test:trust");
if (trust.ok) ok("trust", "Trust stack tests", "npm run test:trust");
else bad("trust", "Trust stack tests", "npm run test:trust failed");

const wedge = run("wedge:ready");
if (wedge.ok) ok("wedge", "Wedge production-grade", "line + owner alert + book");
else bad("wedge", "Wedge not ready", "npm run wedge:ready");

const confirmLib = fileHas("src/lib/customer-confirm.ts", "sendCustomerConfirmSms");
const confirmApi = existsSync(
  join(root, "src/app/api/jobs/[id]/confirm-sms/route.ts"),
);
const confirmPage = existsSync(join(root, "src/app/c/[token]/page.tsx"));
if (confirmLib && confirmApi && confirmPage) {
  ok("confirm", "Customer confirm loop", "SMS + /c/[token] + owner resend");
} else {
  bad(
    "confirm",
    "Customer confirm loop incomplete",
    `lib=${confirmLib} api=${confirmApi} page=${confirmPage}`,
  );
}

const overflowUi = fileHas(
  "src/app/dashboard/settings/page.tsx",
  "Copy forward-to number",
);
const overflowPage = existsSync(join(root, "src/app/pilot/forward/page.tsx"));
const overflowSheet = existsSync(join(root, "docs/SHOP-FORWARD-ONEPAGER.md"));
if (overflowUi && overflowPage && overflowSheet) {
  ok("overflow", "Overflow forward truth", "Settings + /pilot/forward + one-pager");
} else {
  bad(
    "overflow",
    "Overflow forward truth incomplete",
    `ui=${overflowUi} page=${overflowPage} doc=${overflowSheet}`,
  );
}

const attentionConfirm = fileHas(
  "src/components/attention-queue.tsx",
  "needs_customer_confirm",
);
const attentionAtRisk = fileHas(
  "src/components/attention-queue.tsx",
  "appointment_at_risk",
);
const attentionText = fileHas("src/components/attention-queue.tsx", "Text confirm");
if (attentionConfirm && attentionAtRisk && attentionText) {
  ok("attention", "Attention owner actions", "confirm + at-risk + Text confirm");
} else {
  bad("attention", "Attention missing owner actions", "confirm / at-risk");
}

const demoHonesty =
  fileHas("src/app/api/demo/call/route.ts", "proposed_awaiting_confirm") &&
  fileHas("src/app/demo/page.tsx", "honesty");
if (demoHonesty) {
  ok("demo", "Demo path honesty", "proposed ≠ confirmed on /demo");
} else {
  bad("demo", "Demo path overclaims booking", "wire honesty on /demo");
}

const prePost = readFileSync(join(root, "docs/PRE-POST-GATE.md"), "utf8");
const allowedPost = (prePost.split("## Allowed first post")[1] ?? "").split("## Forbidden")[0];
const softClaim =
  /answers every call/i.test(allowedPost) ||
  /never miss/i.test(allowedPost) ||
  /guaranteed/i.test(allowedPost);
if (!softClaim && /Orvius answers after-hours/i.test(allowedPost)) {
  ok("post_copy", "Pre-post copy honest", "allowed first post is wedge-true");
} else if (!softClaim) {
  ok("post_copy", "Pre-post copy honest", "no overclaim in allowed first post");
} else {
  bad("post_copy", "Pre-post copy overclaims", "edit Allowed first post in docs/PRE-POST-GATE.md");
}


const companySrc = readFileSync(join(root, "src/lib/company.ts"), "utf8");
const confirmed = /formationStateConfirmed:\s*"([A-Za-z ]+)"/.exec(companySrc);
const isNull = /formationStateConfirmed:\s*null/.test(companySrc);
if (confirmed && !skipCash) {
  ok("formation", "Formation state set", confirmed[1]);
} else if (isNull || !confirmed) {
  if (skipCash) {
    ok(
      "formation",
      "Formation deferred (product-only mode)",
      "counsel still required before legal claims",
    );
  } else {
    bad(
      "formation",
      "Formation state not counsel-confirmed",
      "do not invent — reply with state",
    );
  }
}

if (!skipCash) {
  const stripe = Boolean(env.STRIPE_SECRET_KEY?.trim());
  const price =
    Boolean(env.STRIPE_PRICE_ID_PRO?.trim()) ||
    Boolean(env.STRIPE_PRICE_ID_LINE?.trim()) ||
    Boolean(env.STRIPE_PRICE_ID?.trim());
  const wh = Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());
  if (stripe) ok("stripe_key", "Stripe secret key", "present");
  else bad("stripe_key", "Stripe secret key missing", "paste on Vercel + .env");
  if (price) ok("stripe_price", "Stripe price IDs", "Line/Pro present");
  else bad("stripe_price", "Stripe price IDs missing", "npm run stripe:setup");
  if (wh) ok("stripe_wh", "Stripe webhook secret", "present");
  else bad("stripe_wh", "Stripe webhook secret missing", "billing webhook");
} else {
  console.log(
    "⚠️  Cash gates skipped — do NOT claim self-serve paid checkout in public posts",
  );
}

try {
  const healthRes = await fetch(`${appUrl}/api/health`, {
    signal: AbortSignal.timeout(5000),
  });
  if (healthRes.ok) {
    const health = await healthRes.json();
    if (health.ok || health.configured) {
      ok("health", "Live health OK", appUrl);
    } else {
      bad("health", "Health reports not ready", JSON.stringify(health));
    }
  } else {
    bad("health", `Health HTTP ${healthRes.status}`, appUrl);
  }
} catch {
  bad(
    "health",
    "App not reachable for smoke",
    `Start the app or set APP_URL (tried ${appUrl})`,
  );
}

const failed = gates.filter((g) => !g.ok);
const passed = gates.length - failed.length;

console.log("\n─────────────────────────────────────");
console.log(`Score: ${passed}/${gates.length}`);

if (failed.length === 0) {
  console.log("✅ BULLETPROOF: CLEAR — Manus bar met. Safe to post the wedge.\n");
  console.log(
    "Post only: overflow/after-hours on the Orvius line → qualify → propose → owner alert.",
  );
  console.log("Do not claim Connect, Jobber sync, or 100% answer rate.\n");
  process.exit(0);
}

console.log(`❌ BULLETPROOF: ${failed.length} open gate(s) — DO NOT POST\n`);
for (const f of failed) {
  console.log(`   • ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
}
console.log("\nManus bar: fix every red before the public post.");
console.log("Product-only: BULLETPROOF_SKIP_CASH=1 npm run bulletproof\n");
process.exit(1);
