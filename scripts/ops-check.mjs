#!/usr/bin/env node
/**
 * Institutional ops check — one command for "are we operating at scale discipline?"
 * Runs ship gates and reports gaps honestly.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderedModules } from "./lib/module-graph.mjs";

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

/*
  The question is whether the owner ever sees these standards, and this asked
  whether one file exists. pro-owner-standards.tsx was deleted on purpose — the
  import graph showed nothing rendered it — so the check has been failing ever
  since while three live components carried the standards to the screen. A file
  name is not the behaviour; ask the graph which rendered modules read them.
*/
const standardsReaders = [...renderedModules()].filter(
  (file) =>
    file.includes("/src/components/") &&
    /institutional-standards|institutionalStandards/.test(
      readFileSync(file, "utf8"),
    ),
);

results.push(
  standardsReaders.length > 0
    ? pass(
        `Owner-facing standards reach the screen — ${standardsReaders
          .map((file) => file.split("/").pop())
          .join(", ")}`,
      )
    : fail(
        "Owner SLAs are codified but no rendered component reads them — the owner never sees them",
      ),
);

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
