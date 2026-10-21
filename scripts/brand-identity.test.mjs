import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { brandWordmark, logoSizes } from "../src/lib/brand-typography.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

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
  assert.match(css, /\.os-sidebar-brand \.orvius-logo-mark \{[^}]*color: inherit !important;/);
  assert.match(read("src/app/public-v2.css"), /\.ov-public \.orvius-logo-mark \{[^}]*color: inherit !important;/);
  assert.doesNotMatch(read("src/app/public-v2.css"), /\.orvius-logo-mark \{[^}]*--ov-copper/);
});

test("the symbol is its own mark, and the favicon stays black", async () => {
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
    assert.match(read(file), /background: "#000000"/, `${file} matches the black master artwork`);
  }
});

test("public surfaces use the lockup, and the social card carries the artwork", () => {
  const nav = read("src/components/premium-nav.tsx");
  assert.equal(
    (nav.match(/<OrviusLogo variant="void" size="lg" \/>/g) ?? []).length,
    2,
  );
  const og = read("src/app/opengraph-image.tsx");
  assert.match(og, /<OrviusMarkGraphic size=\{84\} variant="dark" \/>/);
  assert.match(og, /<OrviusWordmarkGraphic width=\{300\} \/>/);
  for (const name of ["orvius-wordmark-white.svg", "orvius-wordmark-black.svg", "orvius-mark.svg"]) {
    const svg = read(`public/brand/${name}`);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/);
    assert.match(svg, /fill-rule="evenodd"/);
  }
  assert.match(read("public/brand/orvius-mark.svg"), /viewBox="0 0 100 100"/);
  assert.match(read("public/brand/orvius-wordmark-black.svg"), /viewBox="0 0 756\.31 100\.00"/);
});
