/*
 * The system's written rules (orvius-system.css header): nothing smaller than
 * 12px, one motion scale, and motion that respects the OS setting. These fail
 * the build when a new rule slips under them.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

const toPx = (v, unit) => (unit === "px" ? Number(v) : Number(v) * 16);

test("no text anywhere is set below 12px", () => {
  const offenders = [];
  for (const file of walk("src", [".css"])) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/font-size:\s*([0-9.]+)(rem|px)\b/g)) if (toPx(m[1], m[2]) < 12) offenders.push(`${file}: ${m[0]}`);
  }
  for (const file of walk("src", [".tsx"])) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/text-\[([0-9.]+)(px|rem)\]/g)) if (toPx(m[1], m[2]) < 12) offenders.push(`${file}: ${m[0]}`);
    for (const m of src.matchAll(/fontSize:\s*["']?([0-9.]+)(px|rem)/g)) if (toPx(m[1], m[2]) < 12) offenders.push(`${file}: ${m[0]}`);
  }
  assert.deepEqual(offenders, []);
});

test("app transitions use the motion scale", () => {
  const allowed = new Set(["280ms", "400ms", "0.01ms"]);
  const raw = [];
  for (const file of walk("src/app/dashboard", [".css"])) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/transition(?:-duration)?:[^;{}]+/g)) {
      for (const d of m[0].matchAll(/\b[0-9.]+m?s\b/g)) if (!allowed.has(d[0])) raw.push(`${file}: ${m[0].trim()}`);
    }
  }
  assert.deepEqual(raw, []);
  const system = readFileSync("src/app/dashboard/orvius-system.css", "utf8");
  for (const token of ["--ox-dur-fast", "--ox-dur:", "--ox-dur-slow"]) assert.ok(system.includes(token), token);
});

test("the app honors reduced motion", () => {
  const system = readFileSync("src/app/dashboard/orvius-system.css", "utf8");
  assert.match(system, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.os-shell \*,/);
  assert.match(system, /transition-duration: 0\.01ms !important/);
});

test("corner radii stay on the scale (scripts/radius-scale.mjs)", () => {
  /* The scale: 2px chips, 4px controls, 8px cards, 12px large surfaces, 20px
     hero surfaces, 999px pills. Anything else is drift, not a decision. */
  const keep = new Set(["0.125rem", "0.25rem", "0.5rem", "0.75rem", "1.25rem", "2rem", "999px"]);
  const offenders = [];
  for (const file of walk("src/app", [".css"])) {
    const css = readFileSync(file, "utf8");
    for (const m of css.matchAll(/border-(?:(?:top|bottom)-(?:left|right)-)?radius:\s*([0-9.]+(?:rem|px))\b/g)) {
      if (keep.has(m[1])) continue;
      if (/^9+px$/.test(m[1])) {
        offenders.push(`${file}: pill written as ${m[1]}, use 999px`);
        continue;
      }
      const px = m[1].endsWith("rem") ? Number.parseFloat(m[1]) * 16 : Number.parseFloat(m[1]);
      if (px >= 100) {
        offenders.push(`${file}: ${m[1]} was always a pill, use 999px`);
        continue;
      }
      offenders.push(`${file}: ${m[1]} is off the radius scale`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("hardcoded colors never grow (migrate to tokens, don't add hex)", () => {
  /* The palette migration replaces hardcoded hexes with tokens file by file.
     Until it lands, no file may gain a new one. To move the ceiling down,
     migrate a file and lower its number here. */
  const ceiling = {
    "src/app/b/[slug]/book.css": 0,
    "src/app/dashboard/dashboard.css": 121,
    "src/app/dashboard/inbox/messages/messages.css": 0,
    "src/app/dashboard/onboarding/turn-on.css": 1,
    "src/app/dashboard/orvius-calm.css": 0,
    "src/app/dashboard/orvius-craft.css": 11,
    "src/app/dashboard/orvius-depth.css": 16,
    "src/app/dashboard/orvius-finish.css": 0,
    "src/app/dashboard/orvius-instant.css": 0,
    "src/app/dashboard/orvius-modern.css": 2,
    "src/app/dashboard/orvius-scale.css": 0,
    "src/app/dashboard/orvius-system.css": 56,
    "src/app/dashboard/orvius-texture.css": 21,
    "src/app/dashboard/pages.css": 0,
    "src/app/dashboard/settings-center.css": 14,
    "src/app/dashboard/work.css": 0,
    "src/app/globals.css": 132,
    "src/app/home-sections.css": 0,
    "src/app/m/[slug]/plans.css": 0,
    "src/app/p/[id]/replay.css": 0,
    "src/app/public-field.css": 0,
    "src/app/public-polish.css": 6,
    "src/app/public-v2.css": 111,
    "src/app/tech/tech-app.css": 0,
    "src/app/theme-tokens.css": 0,
    "src/app/w/[slug]/chat.css": 0,
  };
  const count = (file) =>
    (readFileSync(file, "utf8").match(/[^-][a-z-]*: *#[0-9a-fA-F]{3,8}/g) ?? []).filter((m) => !m.trimStart().startsWith("--")).length;
  const grown = [];
  const seen = new Set();
  for (const file of walk("src/app", [".css"])) {
    seen.add(file);
    if (!(file in ceiling)) {
      grown.push(`${file}: new stylesheet with hardcoded colors — read from tokens`);
      continue;
    }
    const n = count(file);
    if (n > ceiling[file]) grown.push(`${file}: ${n} hardcoded colors, ceiling is ${ceiling[file]}`);
  }
  assert.deepEqual(grown, []);
});
