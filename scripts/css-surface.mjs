#!/usr/bin/env node
/**
 * Report how much of each stylesheet only one surface can reach.
 *
 * Usage: node scripts/css-surface.mjs
 */
import { readFileSync } from "node:fs";

import postcss from "postcss";

import { analyzeCssUsage, requiredClasses } from "./lib/css-usage.mjs";
import { analyzeSurfaces } from "./lib/css-surface.mjs";
import { repoRoot } from "./lib/module-graph.mjs";

const surfaces = analyzeSurfaces();
const { verdicts } = analyzeCssUsage();
const names = [...surfaces.keys()].sort();

/** Which surfaces can render a given class. */
const owners = (classes) => names.filter((name) => classes.some((c) => surfaces.get(name).has(c)));

const byClass = new Map();
for (const name of verdicts.keys()) {
  const who = owners([name]);
  const key = who.length === 0 ? "unreachable" : who.join("+");
  byClass.set(key, (byClass.get(key) ?? 0) + 1);
}
console.log("classes by surface:");
for (const [key, count] of [...byClass].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${key.padEnd(24)} ${String(count).padStart(5)}`);
}

for (const rel of ["src/app/globals.css", "src/app/public-v2.css"]) {
  const root = postcss.parse(readFileSync(`${repoRoot}/${rel}`, "utf8"));
  const bytes = new Map();
  const rules = new Map();

  root.walkRules((rule) => {
    const classes = rule.selectors.flatMap(requiredClasses);
    /* A rule with no class in it — a bare element or :root — belongs to every
       surface by definition, so it can never be moved out of the shared file. */
    const key = classes.length === 0 ? "element/token" : (owners(classes).join("+") || "unreachable");
    bytes.set(key, (bytes.get(key) ?? 0) + rule.toString().length);
    rules.set(key, (rules.get(key) ?? 0) + 1);
  });

  console.log(`\n${rel}`);
  for (const [key, count] of [...bytes].sort((a, b) => b[1] - a[1])) {
    console.log(
      `  ${key.padEnd(24)} ${String(rules.get(key)).padStart(5)} rules  ${(count / 1024).toFixed(1).padStart(8)}kb`,
    );
  }
}
