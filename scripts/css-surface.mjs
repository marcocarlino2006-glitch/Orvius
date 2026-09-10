#!/usr/bin/env node
/**
 * Report how much of each stylesheet belongs to one surface only.
 *
 * Usage: node scripts/css-surface.mjs
 */
import { readFileSync } from "node:fs";

import { analyzeCssUsage, repoRoot, requiredClasses } from "./lib/css-usage.mjs";
import { analyzeSurfaces } from "./lib/css-surface.mjs";

const surfaces = analyzeSurfaces();
const { verdicts } = analyzeCssUsage();

const dashboard = surfaces.get("dashboard") ?? new Set();
const pub = surfaces.get("public") ?? new Set();

const tally = { dashboard: 0, public: 0, shared: 0, neither: 0 };
for (const name of verdicts.keys()) {
  const inDash = dashboard.has(name);
  const inPub = pub.has(name);
  if (inDash && inPub) tally.shared += 1;
  else if (inDash) tally.dashboard += 1;
  else if (inPub) tally.public += 1;
  else tally.neither += 1;
}

console.log("classes by surface:", tally);

/* Rule-level weight, since a class count says nothing about bytes. */
const postcss = (await import("postcss")).default;

for (const rel of ["src/app/globals.css", "src/app/public-v2.css"]) {
  const css = readFileSync(`${repoRoot}/${rel}`, "utf8");
  const root = postcss.parse(css);
  const bytes = { dashboard: 0, public: 0, shared: 0, unclassed: 0 };
  const rules = { dashboard: 0, public: 0, shared: 0, unclassed: 0 };

  root.walkRules((rule) => {
    const classes = rule.selectors.flatMap(requiredClasses);
    if (!classes.length) {
      bytes.unclassed += rule.toString().length;
      rules.unclassed += 1;
      return;
    }
    const inDash = classes.some((c) => dashboard.has(c));
    const inPub = classes.some((c) => pub.has(c));
    const key = inDash && inPub ? "shared" : inDash ? "dashboard" : inPub ? "public" : "unclassed";
    bytes[key] += rule.toString().length;
    rules[key] += 1;
  });

  console.log(`\n${rel}`);
  for (const key of ["dashboard", "public", "shared", "unclassed"]) {
    console.log(
      `  ${key.padEnd(10)} ${String(rules[key]).padStart(5)} rules  ${(bytes[key] / 1024).toFixed(1).padStart(8)}kb`,
    );
  }
}
