#!/usr/bin/env node
/**
 * Manus post runbook — ordered close sequence + current reds.
 * Does not invent secrets. After every paste: npm run manus:post
 *
 * Sequence mirrors src/lib/manus-post.ts (keep in sync).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const MANUS_POST_STEPS = [
  {
    id: "telephony",
    order: 1,
    title: "Telephony secrets on prod",
    action:
      "Paste TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, VAPI_API_KEY on Vercel + .env",
    command: "npm run standard:check",
  },
  {
    id: "wedge_line",
    order: 2,
    title: "Dedicated shop line",
    action: "Provision one exclusive Orvius number on the design-partner shop",
    command: "npm run wedge:ready",
  },
  {
    id: "wedge_verify",
    order: 3,
    title: "Line verified end-to-end",
    action: "Place a real call → stamp lineVerifiedAt (prove before confirm)",
    command: "npm run wedge:ready",
  },
  {
    id: "wedge_alert",
    order: 4,
    title: "Owner alert delivered",
    action: "Send a real owner SMS alert that lands on your cell (not the shop line)",
    command: "npm run wedge:ready",
  },
  {
    id: "phone_cert",
    order: 5,
    title: "Founder phone cert 5/5",
    action:
      "From your cell: emergency, wants-human, estimate, hang-up, inbound SMS — stamp Settings",
  },
  {
    id: "proof_video",
    order: 6,
    title: "60–90s proof recording",
    action: "Record call → SMS → dashboard → confirm. Keep it for the post.",
  },
  {
    id: "stripe_key",
    order: 7,
    title: "Stripe secret key",
    action: "Paste STRIPE_SECRET_KEY (+ publishable) on Vercel + .env",
    command: "npm run billing:check",
  },
  {
    id: "stripe_setup",
    order: 8,
    title: "Stripe price IDs",
    action: "Run npm run stripe:setup — Line / Pro / Fleet monthly IDs present",
    command: "npm run stripe:setup",
  },
  {
    id: "stripe_webhook",
    order: 9,
    title: "Stripe webhook",
    action:
      "Point Stripe webhook at api.orvius.im/api/billing/webhook → paste STRIPE_WEBHOOK_SECRET",
    command: "npm run billing:check",
  },
  {
    id: "formation",
    order: 10,
    title: "Formation state",
    action: "Counsel confirms LLC state → set formationStateConfirmed (never invent)",
  },
  {
    id: "bulletproof_green",
    order: 11,
    title: "Bulletproof clear",
    action: "npm run bulletproof exits 0 — then post wedge copy only",
    command: "npm run bulletproof",
  },
];

const MANUS_ALLOWED_FIRST_POST = `Orvius answers after-hours and overflow on a dedicated shop line — qualifies the job, proposes a window, and texts the owner before the competitor picks up.

Forward your missed / busy / after-hours calls (or publish the Orvius number). First ten shops · thirty days free · orvius.im/pilot`;

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

const fileEnv = loadEnv();
const env = { ...fileEnv, ...process.env };

function has(key) {
  const v = String(env[key] ?? "").trim();
  return Boolean(v) && !/YOUR_|changeme|placeholder/i.test(v);
}

function formationOk() {
  try {
    const src = readFileSync(join(root, "src/lib/company.ts"), "utf8");
    return /formationStateConfirmed:\s*"/.test(src);
  } catch {
    return false;
  }
}

console.log("\n◆ Manus post bar — ordered close sequence\n");
console.log("  Exit 0 on npm run bulletproof = allowed to post.\n");

const statusById = {
  telephony:
    has("TWILIO_ACCOUNT_SID") &&
    has("TWILIO_AUTH_TOKEN") &&
    has("TWILIO_PHONE_NUMBER") &&
    has("VAPI_API_KEY"),
  wedge_line: null,
  wedge_verify: null,
  wedge_alert: null,
  phone_cert: null,
  proof_video: null,
  stripe_key: has("STRIPE_SECRET_KEY"),
  stripe_setup:
    has("STRIPE_PRICE_ID_PRO") ||
    has("STRIPE_PRICE_ID_LINE") ||
    has("STRIPE_PRICE_ID"),
  stripe_webhook: has("STRIPE_WEBHOOK_SECRET"),
  formation: formationOk(),
  bulletproof_green: null,
};

const wedge = spawnSync("npm", ["run", "wedge:ready"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});
const wedgeOut = `${wedge.stdout ?? ""}${wedge.stderr ?? ""}`;
statusById.wedge_line = /✅ Dedicated shop line/.test(wedgeOut)
  ? true
  : /❌ Dedicated shop line/.test(wedgeOut)
    ? false
    : null;
statusById.wedge_verify = /✅ Line tested end-to-end/.test(wedgeOut)
  ? true
  : /❌ Line tested end-to-end/.test(wedgeOut)
    ? false
    : null;
statusById.wedge_alert = /✅ Owner alert delivered/.test(wedgeOut)
  ? true
  : /❌ Owner alert delivered/.test(wedgeOut)
    ? false
    : null;

for (const step of MANUS_POST_STEPS) {
  const st = statusById[step.id];
  let mark = "⬜";
  if (st === true) mark = "✅";
  else if (st === false) mark = "❌";
  console.log(`${mark} ${step.order}. ${step.title}`);
  console.log(`   ${step.action}`);
  if (step.command) console.log(`   cmd: ${step.command}`);
}

const next = MANUS_POST_STEPS.find((s) => statusById[s.id] !== true);

console.log("\n─────────────────────────────────────");
if (!next) {
  console.log(
    "Env + wedge probes green — run npm run bulletproof for the final Manus clear.\n",
  );
} else {
  console.log(`▶ NEXT: ${next.order}. ${next.title}`);
  console.log(`  ${next.action}`);
  if (next.command) console.log(`  ${next.command}`);
  console.log("");
}

console.log("Allowed first post (only after bulletproof exits 0):\n");
console.log(
  MANUS_ALLOWED_FIRST_POST.split("\n")
    .map((l) => `  ${l}`)
    .join("\n"),
);
console.log(
  "\nForbidden: never-miss · guaranteed · every call · Jobber sync · Connect bank · fake ARR\n",
);

process.exit(next ? 1 : 0);
