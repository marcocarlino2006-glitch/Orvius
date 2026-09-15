import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { brandWordmark, logoSizes } from "../src/lib/brand-typography.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("the primary wordmark is one disciplined lowercase identity", () => {
  assert.equal(brandWordmark, "orvius");
  for (const size of Object.values(logoSizes)) {
    assert.match(size.tracking, /^-/, "every lockup keeps the same tight rhythm");
  }
});

test("the mark stays simple enough for favicon scale", () => {
  const mark = read("src/lib/orvius-mark.tsx");
  assert.match(mark, /fillRule="evenodd"/);
  assert.match(mark, /M12\.25 16h7\.5/);
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

