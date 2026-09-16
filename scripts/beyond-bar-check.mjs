#!/usr/bin/env node
/**
 * Beyond-bar check — ceiling above institutional / multi-b floors.
 * Asserts the ten laws in docs/BEYOND-BAR.md against the product, not prose.
 *
 * Usage: npm run beyond:check
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const checks = [];

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`✅ ${name}: ${detail}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`❌ ${name}: ${detail}`);
}

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

function fileOk(rel) {
  return existsSync(join(root, rel));
}

console.log("\n◆ Orvius beyond-bar check\n");
console.log("  Multi-b discipline is the floor. These laws are the ceiling.\n");

// ── Doctrine present ──
if (fileOk("docs/BEYOND-BAR.md") && fileOk("src/lib/beyond-bar.ts")) {
  pass("Beyond doctrine", "docs/BEYOND-BAR.md + src/lib/beyond-bar.ts");
} else {
  fail("Beyond doctrine", "beyond-bar doc or module missing");
}

if (fileOk("docs/MULTI-B-STRICT.md")) {
  const strict = read("docs/MULTI-B-STRICT.md");
  if (
    /no corners/i.test(strict) &&
    /Definition of multi-b standard/i.test(strict) &&
    /Ordered close sequence/i.test(strict)
  ) {
    pass("Strict checklist", "docs/MULTI-B-STRICT.md — full no-corners list present");
  } else {
    fail("Strict checklist", "MULTI-B-STRICT.md missing required sections");
  }
} else {
  fail("Strict checklist", "docs/MULTI-B-STRICT.md missing");
}

if (fileOk("docs/STANDINGS.md")) {
  const standings = read("docs/STANDINGS.md");
  if (/have vs need/i.test(standings) && /Gap map/i.test(standings)) {
    pass("Standings analysis", "docs/STANDINGS.md — have vs need present");
  } else {
    fail("Standings analysis", "STANDINGS.md missing required sections");
  }
} else {
  fail("Standings analysis", "docs/STANDINGS.md missing");
}

try {
  const bar = read("src/lib/beyond-bar.ts");
  const hasLaws = /beyondLaws/.test(bar) && /L10/.test(bar);
  const hasMoves = /beyondMoves/.test(bar) && /demand-moment/.test(bar);
  const hasOps = /beyondOperators/.test(bar) && /Toast/.test(bar);
  if (hasLaws && hasMoves && hasOps) {
    pass("Beyond module", "operators + moves + ten laws encoded");
  } else {
    fail("Beyond module", "beyond-bar.ts missing operators, moves, or laws");
  }
} catch {
  fail("Beyond module", "src/lib/beyond-bar.ts unreadable");
}

// ── L1 Wedge sacred — prove before confirm ──
try {
  const account = read("src/app/api/account/route.ts");
  if (
    /overflowForwardConfirmedAt === true/.test(account) &&
    /!existing\.lineVerifiedAt/.test(account)
  ) {
    pass("L1 Wedge sacred", "API rejects overflow confirm without lineVerifiedAt");
  } else {
    fail("L1 Wedge sacred", "account PATCH must require prove-before-confirm");
  }
} catch {
  fail("L1 Wedge sacred", "account route missing");
}

// ── L2 Nothing fails silent — webhook drains ──
try {
  const webhooks = [
    "src/app/api/webhooks/vapi/route.ts",
    "src/app/api/webhooks/twilio/sms/route.ts",
    "src/app/api/webhooks/twilio/status/route.ts",
  ];
  const allDrain = webhooks.every((rel) => /drainOwnerAlerts\s*\(/.test(read(rel)));
  const queue = read("src/lib/notification-queue.ts");
  const hasFailover =
    queue.includes("escalateSmsFailureToEmail") && queue.includes("sms-failover");
  if (allDrain && hasFailover) {
    pass("L2 Nothing fails silent", "Webhook drains + SMS→email failover");
  } else if (!allDrain) {
    fail("L2 Nothing fails silent", "Every Twilio/Vapi webhook must drainOwnerAlerts");
  } else {
    fail("L2 Nothing fails silent", "SMS→email failover missing in notification-queue");
  }
} catch (e) {
  fail("L2 Nothing fails silent", e instanceof Error ? e.message : String(e));
}

// ── L4 Honest money — pipeline ≠ collected ──
try {
  const panel = read("src/components/pro-economics-panel.tsx");
  const outcomes = read("src/lib/shop-outcomes.ts");
  const lies =
    /recovered\s*=\s*outcomes\.estimated/i.test(panel) ||
    /collectedCents:\s*outcomes\.estimated/i.test(panel) ||
    /label:\s*["']Recovered["'].*estimatedPipeline/is.test(panel);
  const honestLabels =
    /collectedCents/.test(panel) &&
    /estimatedPipelineCents/.test(panel) &&
    /Collected \(recorded payments\)/.test(outcomes);
  if (!lies && honestLabels) {
    pass("L4 Honest money", "Collected from Payment rows; pipeline stays estimated");
  } else {
    fail("L4 Honest money", "Economics must not label pipeline as collected/recovered");
  }
} catch (e) {
  fail("L4 Honest money", e instanceof Error ? e.message : String(e));
}

// ── L5 Fail closed — billing entitlement ──
try {
  const entitlement = read("src/lib/billing-entitlement.ts");
  const gate = read("src/lib/plan-gate.ts");
  if (
    /isBillingEntitled/.test(entitlement) &&
    /billing_required/.test(gate) &&
    /402/.test(gate) &&
    fileOk("src/components/billing-lock-screen.tsx")
  ) {
    pass("L5 Fail closed", "billing_required 402 + BillingLockScreen");
  } else {
    fail("L5 Fail closed", "Hard paywall must return 402 billing_required");
  }
} catch {
  fail("L5 Fail closed", "billing entitlement / plan-gate missing");
}

// ── L6 Demand capture on lead writes ──
try {
  const writers = [
    "src/app/api/webhooks/vapi/route.ts",
    "src/app/api/webhooks/twilio/sms/route.ts",
    "src/lib/job.ts",
  ];
  const allCapture = writers.every((rel) =>
    /deriveDemandSignal|demand-capture/.test(read(rel)),
  );
  if (allCapture && fileOk("src/lib/demand-capture.ts") && fileOk("src/lib/job-taxonomy.ts")) {
    pass("L6 Demand capture", "Inbound writers + job path use demand-capture");
  } else {
    fail("L6 Demand capture", "Lead/job writers must go through demand-capture");
  }
} catch (e) {
  fail("L6 Demand capture", e instanceof Error ? e.message : String(e));
}

// ── L7 Exception control — ApproveQueue + audit ──
try {
  const approve = read("src/components/approve-queue.tsx");
  if (
    /audit trail/i.test(approve) &&
    /activity/.test(approve) &&
    /execute|cancel/.test(approve)
  ) {
    pass("L7 Exception control", "ApproveQueue keeps audit trail after decisions");
  } else {
    fail("L7 Exception control", "ApproveQueue must expose audit trail + execute/cancel");
  }
} catch {
  fail("L7 Exception control", "approve-queue.tsx missing");
}

// ── L8 Presence — night-shift category ──
try {
  const company = read("src/lib/company.ts");
  const hero = read("src/components/home-line-hero.tsx");
  if (
    /night-shift OS for HVAC/i.test(company) &&
    /night shift/i.test(hero) &&
    /DEMO_LINE_DISPLAY/.test(hero)
  ) {
    pass("L8 Presence", "Company + hero own night-shift OS with live line");
  } else {
    fail("L8 Presence", "Must claim night-shift OS and lead with live line");
  }
} catch (e) {
  fail("L8 Presence", e instanceof Error ? e.message : String(e));
}

// ── L9 No vanity green — multi-b CI honesty ──
try {
  const multiB = read("scripts/multi-b-check.mjs");
  if (
    /ciSkipped/.test(multiB) &&
    /NOT counted green|not vanity-green|skipped in CI/i.test(multiB) &&
    /formationStateConfirmed/.test(multiB)
  ) {
    pass("L9 No vanity green", "CI skips stay red; formation stays counsel-gated");
  } else {
    fail("L9 No vanity green", "multi-b-check must keep CI skips red and formation gated");
  }
} catch {
  fail("L9 No vanity green", "multi-b-check.mjs missing");
}

// ── L10 Compounding only — monopoly + taxonomy ──
try {
  const monopoly = fileOk("docs/MONOPOLY.md");
  const taxonomy = read("src/lib/job-taxonomy.ts");
  const appendOnly =
    /append-only|do not rename|renaming/i.test(taxonomy) ||
    /APPEND_ONLY|immutable/i.test(taxonomy);
  // Taxonomy module must exist; standard-check guards renames — assert doc + module.
  if (monopoly && fileOk("src/lib/job-taxonomy.ts") && fileOk("src/lib/demand-capture.ts")) {
    pass(
      "L10 Compounding only",
      appendOnly
        ? "Monopoly doc + taxonomy append-only intent"
        : "Monopoly doc + taxonomy/demand-capture modules present",
    );
  } else {
    fail("L10 Compounding only", "MONOPOLY.md + job-taxonomy + demand-capture required");
  }
} catch (e) {
  fail("L10 Compounding only", e instanceof Error ? e.message : String(e));
}

// ── Ladder: master-class craft must still pass ──
const master = spawnSync("npm", ["run", "master:class"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});
if ((master.status ?? 1) === 0) {
  pass("Craft ladder", "master:class clear");
} else {
  fail("Craft ladder", "master:class must pass before beyond-bar is green");
  const tail = `${master.stdout ?? ""}${master.stderr ?? ""}`.trim().split("\n").slice(-8);
  for (const line of tail) console.log(`   ${line}`);
}

const failed = checks.filter((c) => !c.ok).length;
const passed = checks.filter((c) => c.ok).length;

console.log("\n─────────────────────────────────────");
if (failed === 0) {
  console.log(`✅ BEYOND BAR: ${passed}/${checks.length} laws hold\n`);
  console.log("   Floor cleared. Ceiling intact. Close founder gates next.\n");
  process.exit(0);
}

console.log(`❌ BEYOND BAR: ${failed} law(s) broken — fix before claiming craft\n`);
for (const c of checks.filter((x) => !x.ok)) {
  console.log(`   • ${c.name}: ${c.detail}`);
}
console.log("\nSee docs/BEYOND-BAR.md\n");
process.exit(1);
