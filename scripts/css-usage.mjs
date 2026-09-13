#!/usr/bin/env node
/**
 * Report CSS classes that nothing renders.
 *
 * Usage: node scripts/css-usage.mjs [--all] [class-name ...]
 */
import { analyzeCssUsage } from "./lib/css-usage.mjs";

const args = process.argv.slice(2);
const requested = args.filter((a) => !a.startsWith("--"));
const showAll = args.includes("--all");

const { verdicts, dynamicPrefixes } = analyzeCssUsage();

const rows = [...verdicts.values()]
  .filter((v) => (requested.length ? requested.includes(v.name) : showAll || v.verdict === "dead"))
  .sort((a, b) => a.name.localeCompare(b.name));

for (const row of rows) {
  const label =
    row.verdict === "dead"
      ? "UNUSED"
      : row.verdict === "dynamic"
        ? `dynamic (${row.dynamicPrefix}\${…})`
        : "used";
  console.log(`${label.padEnd(26)} .${row.name.padEnd(38)} ${row.files.join(", ")}`);
}

const dead = [...verdicts.values()].filter((v) => v.verdict === "dead").length;
console.log(
  `\n${verdicts.size} classes declared · ${dead} never rendered · ` +
    `${dynamicPrefixes.size} dynamic prefixes protect the rest`,
);
