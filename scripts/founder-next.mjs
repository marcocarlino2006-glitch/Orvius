#!/usr/bin/env node
/**
 * Founder next gates — honest remaining multi-b blockers.
 * Does not invent secrets, formation state, proof, or density.
 *
 * Usage: npm run founder:next
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeProdTelephony } from "./lib/prod-telephony.mjs";
import { probeProdBilling } from "./lib/prod-billing.mjs";
import { resolveFormationStateConfirmed } from "./lib/formation-state.mjs";

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
function has(key) {
  const v = String(env[key] ?? "").trim();
  return Boolean(v) && !/YOUR_|changeme|placeholder|^$/i.test(v);
}

const prodTel = await probeProdTelephony();
const prodBilling = await probeProdBilling();
const formation = resolveFormationStateConfirmed(env);

const gates = [
  {
    id: "resend",
    title: "Resend email failover",
    ok: has("RESEND_API_KEY"),
    action: "Paste RESEND_API_KEY (+ RESEND_FROM) on Vercel, redeploy, Send test alert",
  },
  {
    id: "formation",
    title: "Formation counsel state",
    ok: Boolean(formation),
    action:
      "Counsel confirms LLC state → set ORVIUS_FORMATION_STATE on Vercel (never invent)",
  },
  {
    id: "wedge_recert",
    title: "Prod wedge re-cert",
    ok: env.ORVIUS_WEDGE_MASTERED === "1",
    action:
      "DATABASE_URL=<prod> npm run wedge:ready → Settings cert 5/5 → set ORVIUS_WEDGE_MASTERED=1",
  },
  {
    id: "outreach",
    title: "Real outreach (not seeds)",
    ok: false,
    action:
      "POST /api/admin/purge-seeds → import real CSV on /admin → 20 touches/day on /admin/daily",
    note: "Cannot auto-green — needs your real prospect list",
  },
  {
    id: "external_proof",
    title: "External named proof",
    ok: env.ORVIUS_EXTERNAL_PROOF === "1",
    action:
      "Land one non-Summit shop chapter → set ORVIUS_EXTERNAL_PROOF=1 only then",
  },
  {
    id: "connect_live",
    title: "Connect card $ → shop bank",
    ok: env.ORVIUS_CONNECT_LIVE === "1",
    action:
      "Onboard shop Connect in Billing → real card settlement → ORVIUS_CONNECT_LIVE=1",
  },
  {
    id: "ten_shops",
    title: "Ten paying/proving partners",
    ok: env.ORVIUS_TEN_SHOPS === "1",
    action: "Reach 10 live partners → set ORVIUS_TEN_SHOPS=1 only then",
  },
];

console.log("\n◆ Founder next — remaining multi-b gates\n");
console.log(
  `  Prod telephony: ${prodTel.ok ? `live${prodTel.phone ? ` on ${prodTel.phone}` : ""}` : "dark"}`,
);
console.log(
  `  Prod Stripe: ${prodBilling.ok ? "configured" : "not configured"} (selfServe=${prodBilling.selfServeAvailable ?? false})`,
);
console.log("");

let next = null;
for (const g of gates) {
  const mark = g.ok ? "✅" : "❌";
  console.log(`${mark} ${g.title}`);
  console.log(`   ${g.action}`);
  if (g.note) console.log(`   ${g.note}`);
  if (!g.ok && !next) next = g;
}

const open = gates.filter((g) => !g.ok).length;
console.log("\n─────────────────────────────────────");
console.log(`Open: ${open}/${gates.length}`);
if (next) {
  console.log(`\n▶ NEXT: ${next.title}`);
  console.log(`  ${next.action}\n`);
} else {
  console.log("\n✅ Founder env stamps set — still prove density live on /admin/daily\n");
}

process.exit(open === 0 ? 0 : 1);
