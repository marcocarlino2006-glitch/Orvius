#!/usr/bin/env node
/**
 * Multi-billion status scorecard — one command, one exit code.
 * Product can be green while cash/distribution stay red. That is honest.
 *
 * Usage: npm run multi-b:check
 * Soft product-only: MULTI_B_SKIP_CASH=1 npm run multi-b:check
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipCash = process.env.MULTI_B_SKIP_CASH === "1";
const ciMode = process.env.MULTI_B_CI === "1";

function runNpm(script) {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  return {
    ok: (result.status ?? 1) === 0,
    status: result.status ?? 1,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function fileOk(rel) {
  return existsSync(join(root, rel));
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

console.log("\n◆ Orvius multi-billion status\n");
console.log("  Category OS for trades. Gates fail loudly. No vanity green.\n");

const gates = [];

function gate(id, label, ok, detail) {
  gates.push({ id, label, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

gate(
  "docs_battles",
  "Battles + roadmap docs",
  fileOk("docs/MULTI-BILLION-BATTLES.md") && fileOk("docs/ROADMAP.md"),
  "docs present",
);

gate(
  "hard_paywall",
  "Hard monetization code",
  fileOk("src/lib/billing-entitlement.ts") &&
    fileOk("src/components/billing-lock-screen.tsx"),
  "pilotEndsAt + BillingLockScreen",
);

gate(
  "trust",
  "Trust tests",
  runNpm("test:trust").ok,
  "npm run test:trust",
);

gate(
  "economics",
  "Economics surfaces",
  runNpm("economics:check").ok,
  "recovered $ / weekly proof",
);

if (!ciMode) {
  const wedge = runNpm("wedge:ready");
  gate("wedge", "Wedge readiness (Summit)", wedge.ok, "8/8 shop line");

  const standard = runNpm("standard:check");
  gate("standard", "Institutional standard", standard.ok, "isolation + honesty");
} else {
  console.log("⚠️  Live shop gates skipped (MULTI_B_CI=1) — run full check on agent/prod");
}

gate(
  "cron",
  "Notification cron scheduled",
  (() => {
    try {
      const v = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
      return Boolean(v.crons?.some((c) => String(c.path).includes("cron/notifications")));
    } catch {
      return false;
    }
  })(),
  "vercel.json → /api/cron/notifications",
);

gate(
  "outreach",
  "Outreach machine assets",
  fileOk("docs/OUTREACH-PLAYBOOK.md") && fileOk("src/lib/outreach-templates.ts"),
  "playbook + copy templates",
);

gate(
  "launch_gates_ui",
  "Launch gates + cert persistence",
  fileOk("src/components/launch-gates-strip.tsx") &&
    readFileSync(join(root, "prisma/schema.prisma"), "utf8").includes("founderCertJson"),
  "Settings cockpit",
);

gate(
  "sms_email_failover",
  "SMS→email failover",
  (() => {
    try {
      const src = readFileSync(join(root, "src/lib/notification-queue.ts"), "utf8");
      return src.includes("escalateSmsFailureToEmail") && src.includes("sms-failover");
    } catch {
      return false;
    }
  })(),
  "exhausted SMS enqueues email backup",
);

gate(
  "war_repair_script",
  "War-ready repair script",
  fileOk("scripts/war-ready-repair.mjs"),
  "npm run war:repair",
);

const stripeKey = Boolean(env.STRIPE_SECRET_KEY?.trim());
const stripePro =
  Boolean(env.STRIPE_PRICE_ID_PRO?.trim()) || Boolean(env.STRIPE_PRICE_ID?.trim());
const stripeWh = Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());

if (!skipCash && !ciMode) {
  gate("stripe_secret", "Stripe secret key", stripeKey, "founder paste on Vercel");
  gate("stripe_prices", "Stripe Pro price ID", stripePro, "npm run stripe:setup");
  gate("stripe_webhook", "Stripe webhook secret", stripeWh, "api.orvius.im webhook");
} else if (skipCash || ciMode) {
  console.log("⚠️  Cash gates skipped (secrets live on Vercel / founder)");
}

if (!ciMode) {
  gate(
    "formation",
    "Legal formation state confirmed",
    (() => {
      try {
        const src = readFileSync(join(root, "src/lib/company.ts"), "utf8");
        return /formationStateConfirmed:\s*"/.test(src);
      } catch {
        return false;
      }
    })(),
    "counsel gate — do not invent",
  );
}

const passed = gates.filter((g) => g.ok).length;
const total = gates.length;
const failed = gates.filter((g) => !g.ok);

console.log("\n─────────────────────────────────────");
console.log(`Score: ${passed}/${total}`);

if (failed.length === 0) {
  console.log("✅ MULTI-B STATUS: all gates green\n");
  process.exit(0);
}

console.log(`❌ MULTI-B STATUS: ${failed.length} open gate(s)\n`);
for (const f of failed) {
  console.log(`   • ${f.label}`);
}
console.log("\nFounder-critical usually: Stripe → first $ · phone cert · outreach volume.");
console.log("See docs/ROADMAP.md\n");
process.exit(1);
