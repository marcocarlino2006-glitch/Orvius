#!/usr/bin/env node
/**
 * Find the cool neutrals in the stylesheets and propose warm equivalents.
 *
 * The product's palette is warm — #14120b page, #201e18 surface, #26241e line
 * — and the app shell was built in a cool blue-grey, #22252a paper on #292d33
 * panels. Both are readable; together they look like two products sharing a
 * window. 359 distinct declarations carry it.
 *
 * The replacement holds lightness and changes only hue. A shell raised off pure
 * black is a deliberate choice and every contrast ratio in the product depends
 * on it, so matching relative luminance is what makes this a recolour rather
 * than a redesign.
 *
 * Usage: node scripts/warm-map.mjs [--json]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { repoRoot } from "./lib/module-graph.mjs";

const FILES = ["src/app/globals.css", "src/app/dashboard/dashboard.css"];

const parse = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
};

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

/*
  The warm axis, read off the tokens the rest of the product already uses:
  #14120b, #201e18, #26241e and #8a8880 all sit at roughly red = blue + 9 and
  green = blue + 6 in the shadows, easing to neutral as they approach white.
  Generating replacements along that line is what keeps a recoloured shell in
  the same family as the surfaces beside it rather than merely less blue.
*/
function warmAt(targetLuminance) {
  let best = null;
  for (let b = 0; b <= 255; b++) {
    const ease = Math.max(0, 1 - b / 200);
    const candidate = [
      Math.min(255, Math.round(b + 9 * ease)),
      Math.min(255, Math.round(b + 6 * ease)),
      b,
    ];
    const delta = Math.abs(luminance(candidate) - targetLuminance);
    if (!best || delta < best.delta) best = { rgb: candidate, delta };
  }
  return best.rgb;
}

const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

const counts = new Map();
for (const rel of FILES) {
  const css = readFileSync(join(repoRoot, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
    const hex = `#${match[1].toLowerCase()}`;
    const [r, g, b] = parse(hex);
    /* Chromatic colours are brand accents and are left alone; this is only
       about neutrals that lean blue where every other neutral leans red. */
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) continue;
    if (b - r < 3) continue;
    if (!counts.has(hex)) counts.set(hex, { hex, rgb: [r, g, b], files: new Set(), n: 0 });
    const entry = counts.get(hex);
    entry.n += 1;
    entry.files.add(rel);
  }
}

const rows = [...counts.values()]
  .map((entry) => ({
    ...entry,
    warm: toHex(warmAt(luminance(entry.rgb))),
    lum: luminance(entry.rgb),
  }))
  .sort((a, b) => b.n - a.n);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(Object.fromEntries(rows.map((r) => [r.hex, r.warm])), null, 2));
} else {
  for (const row of rows) {
    const shift = (luminance(parse(row.warm)) - row.lum) / (row.lum || 1);
    console.log(
      `${row.hex} → ${row.warm}   ×${String(row.n).padStart(3)}   ` +
        `blue+${row.rgb[2] - row.rgb[0]}  luminance ${(shift * 100).toFixed(1)}% shift`,
    );
  }
  console.log(`\n${rows.length} cool neutrals, ${rows.reduce((s, r) => s + r.n, 0)} declarations`);
}
