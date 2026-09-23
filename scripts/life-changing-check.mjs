#!/usr/bin/env node
/**
 * Life-changing / multi-b HARD check.
 *
 * One exit code. No vanity green. Soft skips never count as pass.
 *
 * Layers:
 *   A  Code floor          — beyond / master:class / trust / economics
 *   B  Life-changing wedge — product must complete call→cash for a shop owner
 *   C  Live one-shop       — wedge:ready + secrets that keep the night alive
 *   D  Multi-b scale       — money, distribution, formation, density
 *   E  Forbidden           — claims that are illegal until earned
 *
 * Usage: npm run life:check
 * Docs:  docs/MULTI-B-STRICT.md · docs/WEDGE-MISSION.md
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { probeProdTelephonySync } from "./lib/prod-telephony.mjs";
import { probeProdBillingSync } from "./lib/prod-billing.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
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
for (const [k, v] of Object.entries(env)) {
  if (process.env[k] === undefined && typeof v === "string") process.env[k] = v;
}

const prodTelephony = probeProdTelephonySync();
const prodBilling = probeProdBillingSync();

function has(key) {
  return Boolean(String(process.env[key] ?? "").trim());
}

function runNpm(script, extraEnv = {}) {
  const result = spawnSync("npm", ["run", "-s", script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  return {
    ok: (result.status ?? 1) === 0,
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/** @type {{ layer: string, id: string, label: string, ok: boolean, detail: string, owner: string }[]} */
const gates = [];

function gate(layer, id, label, ok, detail, owner = "code") {
  gates.push({ layer, id, label, ok, detail, owner });
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

function printLayer(layer) {
  for (const g of gates.filter((x) => x.layer === layer)) {
    const who = g.owner === "founder" ? " · FOUNDER" : "";
    console.log(
      `${g.ok ? "✅" : "❌"} ${g.label}${g.detail ? ` — ${g.detail}` : ""}${who}`,
    );
  }
}

console.log("\n◆ Orvius LIFE-CHANGING / MULTI-B hard check\n");
console.log("  Fail loud. Soft skips never count as pass.");
console.log("  Life-changing = one shop pays because missed calls became paid jobs.\n");

/* ═══════════════════════════════════════════════════════════════════════════
   A — Code floor
   ═══════════════════════════════════════════════════════════════════════════ */
section("A · Code floor");

const beyond = runNpm("beyond:check");
gate("A", "beyond", "Beyond-bar laws", beyond.ok, beyond.ok ? "17/17" : "beyond:check red");

const masterClass = runNpm("master:class");
gate(
  "A",
  "master_class",
  "Master-class craft",
  masterClass.ok,
  masterClass.ok ? "40/40" : "master:class red",
);

const trust = runNpm("test:trust");
gate("A", "trust", "Trust suite", trust.ok, "npm run test:trust");

const economics = runNpm("economics:check");
gate("A", "economics", "Economics surfaces", economics.ok, "call→cash / weekly proof");

printLayer("A");

/* ═══════════════════════════════════════════════════════════════════════════
   B — Life-changing wedge PRODUCT (must be true in code)
   ═══════════════════════════════════════════════════════════════════════════ */
section("B · Life-changing wedge product");

const autoJob = fileOk("src/lib/auto-job.ts") ? read("src/lib/auto-job.ts") : "";
const serviceArea = fileOk("src/lib/service-area.ts") ? read("src/lib/service-area.ts") : "";
const capture = fileOk("src/components/capture-setup-panel.tsx")
  ? read("src/components/capture-setup-panel.tsx")
  : "";
const accountApi = fileOk("src/app/api/account/route.ts")
  ? read("src/app/api/account/route.ts")
  : "";
const outcomes = fileOk("src/lib/shop-outcomes.ts") ? read("src/lib/shop-outcomes.ts") : "";
const pulse = fileOk("src/components/pro-command-outcomes.tsx")
  ? read("src/components/pro-command-outcomes.tsx")
  : "";
const settings = fileOk("src/app/dashboard/settings/page.tsx")
  ? read("src/app/dashboard/settings/page.tsx")
  : "";
const company = fileOk("src/lib/company.ts") ? read("src/lib/company.ts") : "";
const confirm = fileOk("src/lib/customer-confirm.ts")
  ? read("src/lib/customer-confirm.ts")
  : "";
const alerts = fileOk("src/lib/owner-alert-queue.ts")
  ? read("src/lib/owner-alert-queue.ts")
  : fileOk("src/lib/owner-alerts.ts")
    ? read("src/lib/owner-alerts.ts")
    : "";
const connect = fileOk("src/lib/stripe-connect.ts") ? read("src/lib/stripe-connect.ts") : "";
const wantsHuman = fileOk("src/lib/lead-wants-human.ts")
  ? read("src/lib/lead-wants-human.ts")
  : "";
const attention = fileOk("src/lib/attention-queue.ts")
  ? read("src/lib/attention-queue.ts")
  : "";
const schema = fileOk("prisma/schema.prisma") ? read("prisma/schema.prisma") : "";

// B1 — Answer + qualify + demand capture
gate(
  "B",
  "demand_capture",
  "Demand capture on inbound",
  fileOk("src/lib/demand-capture.ts"),
  "inbound writes through demand-capture",
);

gate(
  "B",
  "qualify_gate",
  "Qualify before book",
  /isLeadQualifiedForBooking/.test(autoJob),
  "phone + service/address gate",
);

// B2 — Book ALL qualified (life-changing) — Line plan_blocked is a hard fail
const lineOnlyPriority =
  /plan_blocked/.test(autoJob) &&
  /!hasJobs && !priority/.test(autoJob);
gate(
  "B",
  "book_all_qualified",
  "Book every qualified lead (not Line-priority-only)",
  !lineOnlyPriority,
  lineOnlyPriority
    ? "Line still plan_blocks non-emergency — wedge mission requires book"
    : "all qualified auto-book",
);

// B3 — Service area hard check (not ZIP parse theater)
const hasAreaAllowlist =
  /serviceZips|allowedZips|serviceAreaZips|inServiceArea|isInServiceArea/.test(
    `${serviceArea}${schema}${settings}`,
  );
gate(
  "B",
  "service_area",
  "Service-area allowlist enforced",
  hasAreaAllowlist,
  hasAreaAllowlist
    ? "allowlist present"
    : "only ZIP extract — no owner allowlist / hard reject",
);

// B4 — Overflow prove beyond honor checkbox
const overflowHard =
  /carrierForwardProof|overflowProvedAt|forwardVerifiedAt|carrierVerified/.test(
    `${capture}${accountApi}${schema}`,
  );
gate(
  "B",
  "overflow_proof",
  "Overflow prove beyond self-attest checkbox",
  overflowHard,
  overflowHard
    ? "carrier/forward proof stamped"
    : "honor-system overflowForwardConfirmedAt only",
);

// B5 — Escalate = real path (transfer OR explicit board-only product truth)
const hasTransfer =
  /warmTransfer|coldTransfer|transferCall|vapi.*transfer|twilio.*call\.update/.test(
    `${wantsHuman}${attention}${read("src/lib/company.ts")}`,
  ) || fileOk("src/lib/call-transfer.ts");
const honestEscalate =
  /callback board|owner must dial|no live transfer/i.test(company);
gate(
  "B",
  "escalate",
  "Human escalate is real (transfer) or claim is honest",
  hasTransfer || honestEscalate,
  hasTransfer
    ? "transfer path present"
    : honestEscalate
      ? "claim admits board-only escalate"
      : "wants-human → note only; mission still says escalate",
);

// B6 — Customer confirm loop
gate(
  "B",
  "customer_confirm",
  "Customer confirm SMS + /c token",
  /confirm|token/.test(confirm) && fileOk("src/app/c"),
  "customer-confirm + public /c route",
);

// B7 — Owner alert path
gate(
  "B",
  "owner_alerts",
  "Owner alert queue + drain",
  Boolean(alerts) || /drainOwnerAlerts|owner-alert/.test(attention),
  "night alert delivery path",
);

// B8 — Call→cash includes completed work
const pulseHasCompleted =
  /Completed|jobsCompleted|completedJobs/.test(pulse) &&
  /jobsCompleted|completedAt|status:\s*[\"']completed[\"']/.test(outcomes);
gate(
  "B",
  "cash_completed",
  "Call→cash pulse includes completed jobs",
  pulseHasCompleted,
  pulseHasCompleted
    ? "Completed on pulse"
    : "pulse skips completed — mission requires jobs completed",
);

// B9 — Owner can set hours / services (not admin-only theater)
const ownerHoursUi =
  /hoursJson|businessHours|openingHours|servicesJson|service list/i.test(
    settings,
  );
gate(
  "B",
  "owner_hours",
  "Owner Settings controls hours/services",
  ownerHoursUi,
  ownerHoursUi
    ? "Settings exposes hours/services"
    : "hours/services not on owner Settings — Line claim oversells",
);

// B10 — Money rail code (Connect)
gate(
  "B",
  "connect_code",
  "Shop money rail coded (Connect)",
  /canAcceptPayments|Express/.test(connect),
  "stripe-connect Express path",
);

// B11 — Prove before confirm overflow
gate(
  "B",
  "prove_before_confirm",
  "Prove line before overflow confirm",
  /lineVerifiedAt/.test(accountApi),
  "account API gates overflow on lineVerifiedAt",
);

printLayer("B");

/* ═══════════════════════════════════════════════════════════════════════════
   C — Live one-shop
   ═══════════════════════════════════════════════════════════════════════════ */
section("C · Live one-shop");

const wedge = runNpm("wedge:ready");
gate(
  "C",
  "wedge_ready",
  "Wedge readiness 8/8",
  wedge.ok,
  wedge.ok ? "shop line undefeated" : "wedge:ready red — dedicated line / E2E / owner cell",
  "founder",
);

gate(
  "C",
  "twilio_or_vapi",
  "Live telephony secrets",
  has("TWILIO_ACCOUNT_SID") ||
    has("VAPI_API_KEY") ||
    has("VAPI_PRIVATE_KEY") ||
    prodTelephony.ok,
  prodTelephony.ok && !(has("TWILIO_ACCOUNT_SID") || has("VAPI_API_KEY"))
    ? `prod live${prodTelephony.phone ? ` on ${prodTelephony.phone}` : ""} (local .env empty)`
    : "Twilio or Vapi credentials present",
  "founder",
);

gate(
  "C",
  "resend",
  "Resend email failover live",
  has("RESEND_API_KEY"),
  has("RESEND_API_KEY") ? "RESEND_API_KEY set" : "paste RESEND_API_KEY",
  "founder",
);

gate(
  "C",
  "wedge_mastered_flag",
  "Prod re-cert stamped (ORVIUS_WEDGE_MASTERED)",
  process.env.ORVIUS_WEDGE_MASTERED === "1",
  "set only after Settings 5/5 + wedge:ready on prod",
  "founder",
);

printLayer("C");

/* ═══════════════════════════════════════════════════════════════════════════
   D — Multi-b scale
   ═══════════════════════════════════════════════════════════════════════════ */
section("D · Multi-b scale");

const stripeOk =
  (has("STRIPE_SECRET_KEY") &&
    (has("STRIPE_PRICE_ID_PRO") || has("STRIPE_PRICE_ID_LINE")) &&
    has("STRIPE_WEBHOOK_SECRET")) ||
  prodBilling.ok;
gate(
  "D",
  "stripe",
  "Stripe SaaS live (secret + price + webhook)",
  stripeOk,
  prodBilling.ok && !has("STRIPE_SECRET_KEY")
    ? "prod configured (local .env empty)"
    : stripeOk
      ? "billing keys present"
      : "billing:check blockers",
  "founder",
);

gate(
  "D",
  "formation",
  "Formation counsel-confirmed",
  /formationStateConfirmed:\s*"/.test(company),
  /formationStateConfirmed:\s*"/.test(company)
    ? "formationStateConfirmed set"
    : "counsel → set — never invent",
  "founder",
);

const bulletproof = runNpm("bulletproof");
gate(
  "D",
  "bulletproof",
  "Manus / bulletproof post bar",
  bulletproof.ok,
  bulletproof.ok ? "full green" : "DO NOT POST — bulletproof red",
  "founder",
);

// Distribution: seed detector must exist AND mastery must not claim density without proof
const prospects = fileOk("src/lib/prospects.ts")
  ? read("src/lib/prospects.ts")
  : fileOk("src/lib/distribution.ts")
    ? read("src/lib/distribution.ts")
    : "";
gate(
  "D",
  "seed_guard",
  "Seed prospects cannot count as distribution",
  /looksLikeSeedProspect|example\.com|seed/.test(prospects) ||
    fileOk("scripts/distribution-funnel.test.mjs"),
  "seed guard / distribution tests present",
);

gate(
  "D",
  "external_proof",
  "External named proof (not Summit self-ref)",
  process.env.ORVIUS_EXTERNAL_PROOF === "1",
  "set ORVIUS_EXTERNAL_PROOF=1 only after a named non-Summit chapter exists",
  "founder",
);

gate(
  "D",
  "ten_shops",
  "Ten paying/proving partners",
  process.env.ORVIUS_TEN_SHOPS === "1",
  "set ORVIUS_TEN_SHOPS=1 only after 10 live partners",
  "founder",
);

gate(
  "D",
  "connect_live",
  "Connect live card $ to a shop bank",
  process.env.ORVIUS_CONNECT_LIVE === "1",
  "set ORVIUS_CONNECT_LIVE=1 only after real payout",
  "founder",
);

printLayer("D");

/* ═══════════════════════════════════════════════════════════════════════════
   E — Forbidden until earned
   ═══════════════════════════════════════════════════════════════════════════ */
section("E · Forbidden until earned");

const publicCopy = [
  "src/lib/company.ts",
  "src/components/home-line-hero.tsx",
  "src/app/page.tsx",
  "src/app/product/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/about/page.tsx",
]
  .filter(fileOk)
  .map(read)
  .join("\n");

const banned =
  /never miss|never-miss|answers every call|guaranteed jobs|guaranteed revenue|100%\s*answer|always.?answers/i.test(
    publicCopy,
  );
gate(
  "E",
  "no_absolutist",
  "No absolutist public claims",
  !banned,
  banned ? "banned never-miss / every-call / guaranteed copy found" : "clean",
);

const fakeArr =
  /\$\d+(\.\d+)?[mk]\b[^\n.]{0,40}ARR|\binvented ARR\b|\bfake case stud/i.test(
    publicCopy,
  );
gate(
  "E",
  "no_fake_arr",
  "No invented ARR / fake cases in product copy",
  !fakeArr,
  fakeArr ? "vanity ARR / fake case language found" : "clean",
);

printLayer("E");

/* ═══════════════════════════════════════════════════════════════════════════
   Scoreboard
   ═══════════════════════════════════════════════════════════════════════════ */
const byLayer = (L) => gates.filter((g) => g.layer === L);
const score = (L) => {
  const rows = byLayer(L);
  return { ok: rows.filter((g) => g.ok).length, n: rows.length };
};

const A = score("A");
const B = score("B");
const C = score("C");
const D = score("D");
const E = score("E");

const layerPass = {
  A: A.ok === A.n,
  B: B.ok === B.n,
  C: C.ok === C.n,
  D: D.ok === D.n,
  E: E.ok === E.n,
};

console.log("\n─────────────────────────────────────");
console.log("SCOREBOARD");
console.log(
  `  A Code floor              ${A.ok}/${A.n} ${layerPass.A ? "PASS" : "FAIL"}`,
);
console.log(
  `  B Life-changing product   ${B.ok}/${B.n} ${layerPass.B ? "PASS" : "FAIL"}`,
);
console.log(
  `  C Live one-shop           ${C.ok}/${C.n} ${layerPass.C ? "PASS" : "FAIL"}`,
);
console.log(
  `  D Multi-b scale           ${D.ok}/${D.n} ${layerPass.D ? "PASS" : "FAIL"}`,
);
console.log(
  `  E Forbidden clean         ${E.ok}/${E.n} ${layerPass.E ? "PASS" : "FAIL"}`,
);

const lifeChanging = layerPass.A && layerPass.B && layerPass.C;
const multiB = lifeChanging && layerPass.D && layerPass.E;

console.log("\nVERDICT");
console.log(
  `  Life-changing (one shop pays on call→cash): ${lifeChanging ? "✅ YES" : "❌ NO"}`,
);
console.log(
  `  Multi-b standard (density + money + legal): ${multiB ? "✅ YES" : "❌ NO"}`,
);

const next = gates.find((g) => !g.ok);
console.log("\n▶ NEXT (do not skip):");
if (next) {
  console.log(`  [${next.layer}] ${next.label}`);
  console.log(`  ${next.detail}${next.owner === "founder" ? " · FOUNDER" : ""}`);
} else {
  console.log("  All hard gates green — keep weekly proof + cadence.");
}
console.log("");

if (!multiB) {
  console.log("❌ LIFE-CHANGING / MULTI-B HARD CHECK FAILED\n");
  process.exit(1);
}

console.log("✅ LIFE-CHANGING + MULTI-B HARD CHECK PASSED\n");
process.exit(0);
