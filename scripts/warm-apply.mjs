#!/usr/bin/env node
/**
 * Recolour the cool neutrals onto the product's warm axis.
 *
 * Mapping comes from scripts/warm-map.mjs, which holds each colour's relative
 * luminance and changes only its hue — so this is a recolour, not a redesign,
 * and the contrast ratios the audits enforce move by under five percent.
 *
 * Usage: node scripts/warm-apply.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./lib/module-graph.mjs";

const WRITE = process.argv.includes("--write");
const FILES = ["src/app/globals.css", "src/app/dashboard/dashboard.css"];

const { stdout } = await import("node:process");
const map = JSON.parse(
  (await import("node:child_process")).execFileSync(
    process.execPath,
    [join(repoRoot, "scripts/warm-map.mjs"), "--json"],
    { encoding: "utf8" },
  ),
);

let total = 0;
for (const rel of FILES) {
  const path = join(repoRoot, rel);
  let css = readFileSync(path, "utf8");
  let count = 0;

  /* Case-insensitive on the literal, but only on whole hex tokens, so #22252a
     is never matched inside a longer value such as an 8-digit hex with alpha. */
  for (const [cool, warm] of Object.entries(map)) {
    const re = new RegExp(`${cool}\\b`, "gi");
    css = css.replace(re, () => {
      count += 1;
      return warm;
    });
  }

  total += count;
  stdout.write(`${rel}: ${count} literal(s)\n`);
  if (WRITE) writeFileSync(path, css);
}

stdout.write(
  `\n${Object.keys(map).length} cool neutrals → warm · ${total} literals` +
    `${WRITE ? " written" : "  (dry run — pass --write to apply)"}\n`,
);
