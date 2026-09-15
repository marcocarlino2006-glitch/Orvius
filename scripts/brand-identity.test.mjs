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
  assert.equal(logoSizes.lg.word, "1.75rem");
  const logo = read("src/components/orvius-logo.tsx");
  assert.match(logo, /className="orvius-logo-word">\{brandWordmark\}/);
  const publicCss = read("src/app/public-v2.css");
  assert.match(publicCss, /font-weight: 800 !important/);
  assert.match(publicCss, /font-size: 1\.65rem !important/);
});

test("the split signal bridge stays simple at favicon scale", () => {
  const mark = read("src/lib/orvius-mark.tsx");
  assert.match(mark, /M14 7h-3c-5\.5 0-9 3\.5-9 9/);
  assert.match(mark, /M18 7h3c5\.5 0 9 3\.5 9 9/);
  assert.match(mark, /M11\.5 16h9/);
  assert.doesNotMatch(mark, /fillRule="evenodd"/);
  assert.doesNotMatch(mark, /<circle|orvius-mark-core/);
  assert.doesNotMatch(mark, /aperture|rounded gate|plain V/i);
  assert.doesNotMatch(mark, /\bBARS\b|\.map\(/);
});

test("the public navigation uses the complete trademark lockup", () => {
  const nav = read("src/components/premium-nav.tsx");
  assert.equal(
    (nav.match(/<OrviusLogo variant="void" size="lg" \/>/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(nav, /wordmarkOnly/);
});

