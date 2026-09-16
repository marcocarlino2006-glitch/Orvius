#!/usr/bin/env node
/**
 * Snap corner radii to a scale.
 *
 * The two stylesheets carry twenty-two distinct border-radius values and the
 * board renders eleven of them at once, five at fractional pixels — 3.2, 2.4,
 * 5.6, 6.4, 4.8 — because they were written in rem against a 16px root. Nobody
 * chose 3.2px. It is what 0.2rem happens to be, and the reason two cards side
 * by side never quite agree.
 *
 * Four steps for boxes and one for pills:
 *
 *   2px   chips, code, the tightest inline things
 *   4px   controls — inputs, buttons, small tiles
 *   8px   cards and panels
 *   12px  the large surfaces a card sits inside
 *   999px pills
 *
 * Each value moves to its nearest step, so the largest change is 2px. The one
 * 2rem radius is a single decorative surface and is left alone.
 *
 * Usage: node scripts/radius-scale.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./lib/module-graph.mjs";

const WRITE = process.argv.includes("--write");
const FILES = ["src/app/globals.css", "src/app/dashboard/dashboard.css"];

/** Kept as authored, either because it is already on scale or is a one-off. */
const KEEP = new Set(["0.125rem", "0.25rem", "0.5rem", "0.75rem", "2rem", "999px"]);

const STEPS_PX = [2, 4, 8, 12];

const toPx = (value) =>
  value.endsWith("rem") ? parseFloat(value) * 16 : parseFloat(value);

function snap(value) {
  if (KEEP.has(value)) return null;
  if (/^9+px$/.test(value)) return "999px";
  const px = toPx(value);
  if (!Number.isFinite(px) || px === 0) return null;
  if (px > 16) return null;
  const nearest = STEPS_PX.reduce((best, step) =>
    Math.abs(step - px) < Math.abs(best - px) ? step : best,
  );
  const rem = `${nearest / 16}rem`;
  return rem === value ? null : rem;
}

/** The shorthand and the four corner longhands, which drift independently. */
const RADIUS_PROP = "border-(?:(?:top|bottom)-(?:left|right)-)?radius";
const RADIUS_DECL = new RegExp(`${RADIUS_PROP}:\\s*([0-9.]+(?:rem|px))\\b`, "g");

const seen = new Map();
for (const rel of FILES) {
  const css = readFileSync(join(repoRoot, rel), "utf8");
  for (const m of css.matchAll(RADIUS_DECL)) {
    seen.set(m[1], (seen.get(m[1]) ?? 0) + 1);
  }
}

const moves = [...seen.entries()]
  .map(([value, count]) => ({ value, count, to: snap(value) }))
  .filter((row) => row.to)
  .sort((a, b) => b.count - a.count);

let total = 0;
for (const rel of FILES) {
  const path = join(repoRoot, rel);
  let css = readFileSync(path, "utf8");
  let count = 0;
  for (const { value, to } of moves) {
    css = css.replace(
      new RegExp(`(${RADIUS_PROP}):\\s*${value}\\b`, "g"),
      (_match, prop) => {
        count += 1;
        return `${prop}: ${to}`;
      },
    );
  }
  total += count;
  if (WRITE) writeFileSync(path, css);
}

for (const { value, count, to } of moves) {
  console.log(
    `${value.padStart(9)} (${String(toPx(value)).padStart(4)}px) → ${to.padEnd(8)} ×${count}`,
  );
}
const kept = [...seen.keys()].filter((v) => !snap(v)).sort();
console.log(`\nkept as authored: ${kept.join(", ")}`);
console.log(
  `${moves.length} value(s) snapped · ${total} declaration(s)` +
    `${WRITE ? " written" : "  (dry run — pass --write to apply)"}`,
);
