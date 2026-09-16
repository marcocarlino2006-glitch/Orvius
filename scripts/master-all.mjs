#!/usr/bin/env node
/**
 * Master-all — ordered multi-b close sequence.
 * Runs what code can verify, prints the single next gate, never vanity-greens founder work.
 *
 * Usage: npm run master:all
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] === undefined && typeof v === "string") process.env[k] = v;
}

function run(script, extraEnv = {}) {
  const result = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  return {
    ok: (result.status ?? 1) === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

function has(key) {
  return Boolean(String(process.env[key] ?? env[key] ?? "").trim());
}

function formationOk() {
  try {
    const src = readFileSync(join(root, "src/lib/company.ts"), "utf8");
    return /formationStateConfirmed:\s*"/.test(src);
  } catch {
    return false;
  }
}

console.log("\n◆ Orvius master-all — close every multi-b gate in order\n");
console.log("  No skipping. No vanity green. Founder gates stay founder.\n");

const checks = [];

function gate(step, title, ok, detail, owner) {
  checks.push({ step, title, ok, detail, owner });
  const mark = ok ? "✅" : "❌";
  console.log(`${mark} ${step}. ${title}`);
  console.log(`   ${detail}${owner === "founder" ? " · FOUNDER" : ""}`);
}

const beyond = run("beyond:check");
gate(0, "Beyond-bar laws", beyond.ok, beyond.ok ? "beyond:check green" : "Fix beyond:check reds first", "code");

const trust = run("test:trust");
gate(0.5, "Trust tests", trust.ok, trust.ok ? "test:trust green" : "Fix trust failures (need DATABASE_URL)", "code");

const stripe =
  has("STRIPE_SECRET_KEY") &&
  (has("STRIPE_PRICE_ID_PRO") || has("STRIPE_PRICE_ID")) &&
  has("STRIPE_WEBHOOK_SECRET");
gate(
  2,
  "Stripe SaaS configured",
  stripe,
  stripe ? "Keys + price + webhook present" : "Paste STRIPE_* → npm run stripe:setup → webhook",
  "founder",
);

gate(
  3,
  "Resend email failover",
  has("RESEND_API_KEY"),
  has("RESEND_API_KEY") ? "RESEND_API_KEY present" : "Paste RESEND_API_KEY on Vercel",
  "founder",
);

gate(
  6,
  "Formation state",
  formationOk(),
  formationOk() ? "formationStateConfirmed set" : "Counsel → set formationStateConfirmed — never invent",
  "founder",
);

const docs =
  existsSync(join(root, "docs/MULTI-B-STRICT.md")) &&
  existsSync(join(root, "docs/STANDINGS.md")) &&
  existsSync(join(root, "docs/BEYOND-BAR.md"));
gate(10, "Doctrine present", docs, docs ? "STRICT + STANDINGS + BEYOND-BAR" : "Missing mastery docs", "code");

/* Live shop gates — cannot fake from secrets alone */
console.log("\n⚠️  Live shop gates (must verify on prod / signed-in Admin Daily):\n");
console.log("   1. Wedge cert 5/5 + wedge:ready 8/8");
console.log("   4. Baseline + weekly proof fresh");
console.log("   5. Real outreach (no seeds) · 20 touches/day");
console.log("   7. External named proof");
console.log("   8. Connect shop onboarded + real card $");
console.log("   9. Ten paying/proving partners");
console.log("\n   Open: /admin/daily  ·  Run: npm run wedge:ready (prod DB)\n");

const codeFounder = checks.filter((c) => c.owner === "founder");
const codeCode = checks.filter((c) => c.owner === "code");
const founderOpen = codeFounder.filter((c) => !c.ok);
const codeOpen = codeCode.filter((c) => !c.ok);
const nextEnv = [...checks].sort((a, b) => a.step - b.step).find((c) => !c.ok);
const liveVerified = process.env.ORVIUS_WEDGE_MASTERED === "1";

console.log("─────────────────────────────────────");
console.log(
  `Code-verifiable: ${codeCode.filter((c) => c.ok).length}/${codeCode.length} · Env/founder secrets: ${codeFounder.filter((c) => c.ok).length}/${codeFounder.length}`,
);

console.log("\n▶ NEXT (do not skip):");
if (codeOpen.length) {
  console.log(`  Fix code: ${codeOpen.map((c) => c.title).join(", ")}`);
} else if (!liveVerified) {
  console.log("  1. Live wedge + founder phone cert (Settings 5/5 + npm run wedge:ready)");
  console.log("     Set ORVIUS_WEDGE_MASTERED=1 only after prod re-verify.");
  if (nextEnv) {
    console.log(`  Then env: ${nextEnv.step}. ${nextEnv.title} — ${nextEnv.detail}`);
  }
} else if (nextEnv) {
  console.log(`  ${nextEnv.step}. ${nextEnv.title}`);
  console.log(`  ${nextEnv.detail}`);
} else {
  console.log("  Env/code clear — finish live gates 4–9 on /admin/daily");
}
console.log("");

if (codeOpen.length) {
  console.log("❌ Code blockers remain — fix before claiming craft.\n");
  process.exit(1);
}

if (!liveVerified || founderOpen.length) {
  console.log("⚠️  Multi-b NOT mastered — close gates in order on /admin/daily.\n");
  process.exit(0);
}

console.log("✅ master:all env/code package green — keep live shop gates green.\n");
process.exit(0);
