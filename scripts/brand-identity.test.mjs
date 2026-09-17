import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { brandWordmark, logoSizes } from "../src/lib/brand-typography.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the primary wordmark stays large, heavy, and lowercase", () => {
  assert.equal(brandWordmark, "orvius");
  assert.equal(logoSizes.lg.word, "1.9rem");
  const logo = read("src/components/orvius-logo.tsx");
  assert.match(logo, /className="orvius-logo-word">\{brandWordmark\}/);
  assert.match(logo, /wordmarkOnly = true/);
  const publicCss = read("src/app/public-v2.css");
  assert.match(publicCss, /font-weight: 800 !important/);
  assert.match(publicCss, /font-size: 1\.9rem !important/);
});

test("the split signal bridge stays simple at favicon scale", () => {
  const mark = read("src/lib/orvius-mark.tsx");
  assert.match(mark, /M11 7H9c-4\.5 0-7 3\.5-7 9/);
  assert.match(mark, /M21 7h2c4\.5 0 7 3\.5 7 9/);
  assert.match(mark, /M9\.5 16h13/);
  assert.doesNotMatch(mark, /fillRule="evenodd"/);
  assert.doesNotMatch(mark, /<circle|orvius-mark-core/);
  assert.doesNotMatch(mark, /aperture|rounded gate|plain V/i);
  assert.doesNotMatch(mark, /\bBARS\b|\.map\(/);
});

test("public surfaces use the word alone — no mark lockup", () => {
  const logo = read("src/components/orvius-logo.tsx");
  assert.match(logo, /wordmarkOnly = true/);
  assert.match(logo, /Stripe-style|the name is/i);
  const nav = read("src/components/premium-nav.tsx");
  assert.equal(
    (nav.match(/<OrviusLogo variant="void" size="lg" \/>/g) ?? []).length,
    2,
  );
  const og = read("src/app/opengraph-image.tsx");
  assert.match(og, /brandWordmark/);
  assert.doesNotMatch(og, /OrviusMarkGraphic/);
});
