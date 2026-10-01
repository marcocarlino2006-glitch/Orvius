import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { brandWordmark, logoSizes } from "../src/lib/brand-typography.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the logo is the traced wordmark artwork, scaled by the surface's font-size", () => {
  assert.equal(brandWordmark, "orvius");
  assert.equal(logoSizes.lg.word, "1.9rem");
  const logo = read("src/components/orvius-logo.tsx");
  assert.match(logo, /className="orvius-logo-svg" viewBox=\{WORDMARK_VIEWBOX\}/);
  assert.match(logo, /<path d=\{WORDMARK_PATH\} fill="currentColor" \/>/);
  assert.match(logo, /role="img"\s+aria-label="Orvius"/);
  assert.match(logo, /wordmarkOnly = true/);
  assert.match(read("src/app/globals.css"), /\.orvius-logo-svg \{[^}]*height: 0\.7em;/);
});

test("the wordmark has six letters and the O stands alone as the icon", async () => {
  const { WORDMARK_LETTERS, MARK_PATH, WORDMARK_PATH } = await import("../src/lib/orvius-wordmark.ts");
  assert.equal(WORDMARK_LETTERS.length, 6);
  assert.equal(MARK_PATH, WORDMARK_LETTERS[0]);
  assert.ok(WORDMARK_PATH.startsWith(MARK_PATH));
  for (const file of ["src/lib/orvius-mark.tsx", "src/lib/orvius-mark-graphic.tsx"]) {
    assert.match(read(file), /MARK_PATH/);
    assert.doesNotMatch(read(file), /M11 7H9c-4\.5/, "the old signal-bridge mark is gone");
  }
  for (const file of ["src/app/icon.tsx", "src/app/apple-icon.tsx", "src/app/app-icon/[size]/route.tsx"]) {
    assert.match(read(file), /background: "#000000"/, `${file} matches the black master artwork`);
  }
});

test("public surfaces use the wordmark alone, and the social card carries the artwork", () => {
  const nav = read("src/components/premium-nav.tsx");
  assert.equal(
    (nav.match(/<OrviusLogo variant="void" size="lg" \/>/g) ?? []).length,
    2,
  );
  const og = read("src/app/opengraph-image.tsx");
  assert.match(og, /<OrviusWordmarkGraphic width=\{300\} \/>/);
  for (const name of ["orvius-wordmark-white.svg", "orvius-wordmark-black.svg", "orvius-mark.svg"]) {
    assert.match(read(`public/brand/${name}`), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox=/);
  }
});
