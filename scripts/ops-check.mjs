#!/usr/bin/env node
/**
 * Institutional ops check — one command for "are we operating at scale discipline?"
 * Runs ship gates and reports gaps honestly.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function run(label, cmd, args = []) {
  console.log(`\n── ${label} ──\n`);
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  return result.status ?? 1;
}

function pass(msg) {
  console.log(`✅ ${msg}`);
  return true;
}

function fail(msg) {
  console.log(`❌ ${msg}`);
  return false;
}

console.log("\n🏛  Orvius institutional ops check\n");
console.log("   Practices adapted from operators at scale — measured on this codebase.\n");

const results = [];

results.push(
  existsSync(join(root, "docs/INSTITUTIONAL-PLAYBOOK.md"))
    ? pass("Institutional playbook documented")
    : fail("docs/INSTITUTIONAL-PLAYBOOK.md missing"),
);

results.push(
  existsSync(join(root, "src/lib/institutional-standards.ts"))
    ? pass("Owner SLAs codified in code")
    : fail("src/lib/institutional-standards.ts missing"),
);

try {
  readFileSync(join(root, "src/components/pro-owner-standards.tsx"), "utf8");
  results.push(pass("Owner-facing standards UI present"));
} catch {
  results.push(fail("pro-owner-standards.tsx missing"));
}

results.push(run("Trust tests", "npm", ["run", "test:trust"]) === 0);

results.push(run("Billing readiness", "npm", ["run", "billing:check"]) === 0);

const standardExit = run("Standard check", "npm", ["run", "standard:check"]);
results.push(standardExit === 0);

console.log("\n─────────────────────────────────────\n");

const failed = results.filter((r) => !r).length;
if (failed === 0) {
  console.log("✅ INSTITUTIONAL OPS: All gates passed\n");
  console.log("Next: npm run wedge:ready for each live shop\n");
  process.exit(0);
}

console.log(`⚠️  INSTITUTIONAL OPS: ${failed} gate(s) need attention\n`);
console.log("See docs/INSTITUTIONAL-PLAYBOOK.md for the full operating model.\n");
process.exit(1);
