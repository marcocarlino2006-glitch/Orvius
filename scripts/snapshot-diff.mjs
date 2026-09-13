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

/* Field order must match COLLECT in snapshot-computed.cjs. */
const FIELDS = [
  "index", "tag", "class",
  "color", "background", "borderTop", "borderBottom",
  "display", "position", "fontSize", "fontWeight",
  "x", "y", "width", "height",
  "text",
];
const SIZE_ONLY = new Set(["width", "height", "x", "y"]);

/**
 * Classify a changed element as a style difference or as content drift.
 *
 * Geometry is not purely a function of style: a relative timestamp reading
 * "15h ago" is a pixel narrower an hour later, and calling that a styling
 * regression is how a clean refactor looks broken. So when the only fields that
 * moved are geometric and the text behind them also changed, the data moved and
 * the stylesheet did not. Anything touching colour, display, position or type
 * is a style difference no matter what the text says.
 */
function classify(a, b) {
  const av = a.split("|");
  const bv = b.split("|");
  const changed = FIELDS.filter((_, i) => av[i] !== bv[i]);
  const textChanged = changed.includes("text");
  const styleChanged = changed.some((f) => f !== "text" && !SIZE_ONLY.has(f));
  if (styleChanged) return "style";
  return textChanged ? "content" : "style";
}

const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
let compared = 0;
let contentDrift = 0;
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
    if (a[i] === b[i]) continue;
    if (classify(a[i], b[i]) === "content") {
      contentDrift += 1;
      continue;
    }
    differences.push(`${key} #${i}\n    before ${a[i]}\n    after  ${b[i]}`);
  }
}

for (const line of differences.slice(0, 40)) console.log(line);
if (differences.length > 40) console.log(`… and ${differences.length - 40} more`);

console.log(
  `\n${compared} elements compared across ${keys.size} renders · ` +
    `${differences.length} style differences` +
    (contentDrift ? ` · ${contentDrift} ignored as content drift (text changed too)` : ""),
);
process.exit(differences.length ? 1 : 0);
