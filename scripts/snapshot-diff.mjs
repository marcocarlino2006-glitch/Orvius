#!/usr/bin/env node
/**
 * Compare two computed-style snapshots.
 *
 * "The audits still pass" is not evidence that a stylesheet refactor changed
 * nothing — an audit checks thresholds, and a rule can move a colour a long
 * way inside one. This asserts equality instead, element by element.
 *
 *   node scripts/snapshot-diff.mjs <before.json> <after.json>
 */
import { readFileSync } from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.error("usage: node scripts/snapshot-diff.mjs <before.json> <after.json>");
  process.exit(2);
}

const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
let compared = 0;
const differences = [];

for (const key of [...keys].sort()) {
  const a = before[key];
  const b = after[key];

  if (!a || !b) {
    differences.push(`${key}: render present in only one snapshot`);
    continue;
  }
  if (a.length !== b.length) {
    differences.push(`${key}: ${a.length} elements before, ${b.length} after`);
    continue;
  }

  for (let i = 0; i < a.length; i++) {
    compared += 1;
    if (a[i] !== b[i]) differences.push(`${key} #${i}\n    before ${a[i]}\n    after  ${b[i]}`);
  }
}

for (const line of differences.slice(0, 40)) console.log(line);
if (differences.length > 40) console.log(`… and ${differences.length - 40} more`);

console.log(
  `\n${compared} elements compared across ${keys.size} renders · ` +
    `${differences.length} differences`,
);
process.exit(differences.length ? 1 : 0);
