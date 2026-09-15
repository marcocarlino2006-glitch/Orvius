import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { brandWordmark, logoSizes } from "../src/lib/brand-typography.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the primary wordmark uses one engineered display identity", () => {
  assert.equal(brandWordmark, "ORVIUS");
  assert.equal(logoSizes.lg.word, "1.75rem");
  const wordmark = read("src/lib/orvius-wordmark.tsx");
  assert.match(wordmark, /viewBox="0 0 170 32"/);
  assert.equal((wordmark.match(/<path/g) ?? []).length, 6);
  assert.match(read("src/app/public-v2.css"), /height: 1\.65rem !important/);
});

test("the open orbit stays simple and distinct at favicon scale", () => {
  const mark = read("src/lib/orvius-mark.tsx");
  assert.match(mark, /M23\.5 5\.8A12 12 0 1 0 27\.2 21/);
  assert.match(mark, /m22\.75 9\.25-9\.5 9\.5/);
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

