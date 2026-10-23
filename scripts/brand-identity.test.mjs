import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { brandWordmark, logoSizes } from "../src/lib/brand-typography.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the words use Cursor's sentence: 26px, weight 400, tracking -0.0125em", () => {
  const tokens = read("src/app/theme-tokens.css");
  assert.match(tokens, /--type-sentence:\s*1\.625rem;/);
  assert.match(tokens, /--type-sentence-leading:\s*1\.25;/);
  assert.match(tokens, /--type-sentence-tracking:\s*-0\.0125em;/);
  assert.match(tokens, /--type-lead:\s*1rem;/);
  assert.match(tokens, /--type-lead-tracking:\s*0\.005em;/);
  assert.match(tokens, /--type-body:\s*0\.875rem;/);
  assert.match(tokens, /--type-meta:\s*0\.75rem;/);
  assert.match(tokens, /--type-section:\s*2\.25rem;/);
  const hero = read("src/app/home-sections.css");
  assert.match(hero, /\.ov-hero-title \{[^}]*font-size: var\(--type-sentence\);[^}]*font-weight: 400;/);
  const desk = read("src/app/dashboard/orvius.css");
  assert.match(desk, /\.cmd-headline \{[^}]*font-size: var\(--type-sentence\);[^}]*font-weight: 400;/);
});

test("the logo is the symbol beside the ORVIUS wordmark, in one ink", () => {
  assert.equal(brandWordmark, "orvius");
  assert.equal(logoSizes.lg.word, "1.9rem");
  const logo = read("src/components/orvius-logo.tsx");
  assert.match(logo, /className="orvius-logo-svg" viewBox=\{WORDMARK_VIEWBOX\}/);
  assert.match(logo, /<path d=\{WORDMARK_PATH\} fill="currentColor" fillRule="evenodd" \/>/);
  assert.match(logo, /role="img"\s+aria-label="Orvius"/);
  assert.match(logo, /wordmarkOnly = false/);
  assert.match(logo, /<span className="orvius-logo-word">[\s\S]*<OrviusMarkSvg className="orvius-logo-mark" \/>/);
  const css = read("src/app/globals.css");
  assert.match(css, /\.orvius-logo-svg \{[^}]*height: 0\.78em;/);
  assert.match(css, /\.orvius-logo-word \.orvius-logo-mark \{[^}]*width: 1\.63em;/);
  assert.match(css, /aspect-ratio: 756\.31 \/ 100/);
  assert.match(css, /\.os-sidebar-brand \.orvius-logo-mark \{[^}]*color: black !important;/);
  assert.match(css, /\.orvius-logo-mark \{[^}]*background: white !important;/);
  assert.match(css, /\.orvius-logo-word,\s*\.orvius-logo-svg \{\s*color: black !important;/);
  assert.match(read("src/app/public-v2.css"), /\.ov-public \.orvius-logo-mark \{[^}]*color: black !important;/);
  assert.match(read("src/app/public-v2.css"), /\.ov-public \.orvius-logo-word \{[^}]*color: black !important;/);
  assert.doesNotMatch(read("src/app/public-v2.css"), /\.orvius-logo-mark \{[^}]*--ov-copper/);
});

test("the symbol is its own mark, and the favicon is a black mark on white", async () => {
  const { MARK_PATH, MARK_VIEWBOX, WORDMARK_PATH, WORDMARK_VIEWBOX, WORDMARK_ASPECT } = await import(
    "../src/lib/orvius-wordmark.ts"
  );
  assert.equal(MARK_VIEWBOX, "0 0 100 100");
  assert.equal(WORDMARK_VIEWBOX, "0 0 756.31 100.00");
  assert.ok(Math.abs(WORDMARK_ASPECT - 756.31 / 100) < 0.0001);
  assert.notEqual(MARK_PATH, WORDMARK_PATH);
  assert.equal(WORDMARK_PATH.startsWith(MARK_PATH), false);
  assert.match(MARK_PATH, /\bC[\d.]+ /, "the symbol is the traced sheet, drawn with curves");
  assert.equal((MARK_PATH.match(/\bM/g) ?? []).length, 4, "four blades from the sheet");
  assert.equal(MARK_PATH.startsWith("M95.99"), false, "the simplified star is gone");
  for (const file of ["src/lib/orvius-mark.tsx", "src/lib/orvius-mark-graphic.tsx"]) {
    assert.match(read(file), /MARK_PATH/);
    assert.match(read(file), /fillRule="evenodd"/);
    assert.doesNotMatch(read(file), /M11 7H9c-4\.5/, "the old signal-bridge mark is gone");
  }
  for (const file of ["src/app/icon.tsx", "src/app/apple-icon.tsx", "src/app/app-icon/[size]/route.tsx"]) {
    assert.match(read(file), /background: "#ffffff"/, `${file} is a white tile`);
    assert.match(read(file), /variant="light"/, `${file} draws the mark in black`);
  }
});

test("public surfaces use the lockup, and the social card carries the artwork", () => {
  const nav = read("src/components/premium-nav.tsx");
  assert.equal(
    (nav.match(/<OrviusLogo variant="void" size="lg" \/>/g) ?? []).length,
    2,
  );
  const og = read("src/app/opengraph-image.tsx");
  assert.match(og, /<OrviusMarkGraphic size=\{84\} variant="light" \/>/);
  assert.match(og, /background: "#ffffff"/);
  assert.match(og, /<OrviusWordmarkGraphic width=\{300\} color="#000000" \/>/);
  for (const name of ["orvius-wordmark-white.svg", "orvius-wordmark-black.svg", "orvius-mark.svg"]) {
    const svg = read(`public/brand/${name}`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/);
    assert.match(svg, /fill-rule="evenodd"/);
  }
  assert.match(read("public/brand/orvius-mark.svg"), /viewBox="0 0 100 100"/);
  assert.match(read("public/brand/orvius-wordmark-black.svg"), /viewBox="0 0 756\.31 100\.00"/);
});
