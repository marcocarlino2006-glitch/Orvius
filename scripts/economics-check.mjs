#!/usr/bin/env node
/**
 * Economics mastery check — multi-billion money layer readiness.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function pass(msg) {
  console.log(`✅ ${msg}`);
  return true;
}
function fail(msg) {
  console.log(`❌ ${msg}`);
  return false;
}
function warn(msg) {
  console.log(`⚠️  ${msg}`);
  return null;
}

console.log("\n💰 Orvius economics mastery check\n");

const requiredFiles = [
  "src/lib/money.ts",
  "src/lib/shop-outcomes.ts",
  "src/components/pro-shop-outcomes.tsx",
  "src/components/pro-economics-panel.tsx",
  "src/app/api/shop/weekly-proof/route.ts",
  "src/app/api/account/export/route.ts",
];

const results = [];

for (const rel of requiredFiles) {
  results.push(
    existsSync(resolve(root, rel))
      ? pass(`${rel} present`)
      : fail(`${rel} missing`),
  );
}

const outcomesSrc = readFileSync(resolve(root, "src/lib/shop-outcomes.ts"), "utf8");
for (const token of [
  "recoveredRevenueCents",
  "recoveredJobsEstimate",
  "collectedCents",
  "formatWeeklyProof",
  "economicsReady",
]) {
  results.push(
    outcomesSrc.includes(token)
      ? pass(`shop-outcomes exports ${token}`)
      : fail(`shop-outcomes missing ${token}`),
  );
}

const honestyRisks = [
  { pattern: /guaranteed revenue/i, label: "guaranteed revenue" },
  { pattern: /never miss a dollar/i, label: "never miss a dollar" },
];
for (const risk of honestyRisks) {
  if (risk.pattern.test(outcomesSrc)) {
    results.push(fail(`Honesty: ${risk.label}`));
  }
}

const billingCheck = resolve(root, "scripts/billing-check.mjs");
results.push(
  existsSync(billingCheck)
    ? pass("billing:check script present (SaaS billing separate from shop economics)")
    : warn("billing:check missing"),
);

const blockers = results.filter((r) => r === false).length;
console.log("\n─────────────────────────────────────");
if (blockers > 0) {
  console.log(`❌ ECONOMICS: ${blockers} blocker(s)\n`);
  process.exit(1);
}
console.log("✅ ECONOMICS: mastery surfaces ready\n");
console.log("Owner next: set avg ticket + baseline in Settings, then Copy weekly proof on Today.\n");
