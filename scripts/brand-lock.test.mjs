import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { logoSizes, typeScale } from "../src/lib/brand-typography.ts";
import { MARK_PATH, MARK_VIEWBOX, WORDMARK_PATH, WORDMARK_VIEWBOX } from "../src/lib/orvius-wordmark.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");

test("the symbol and the letters are the ones that were approved", () => {
  assert.equal(sha(WORDMARK_PATH), "745b3ffd034d9b662f1dff58f024f4e84147a0beb9acb3be7f473527062d190c");
  assert.equal(sha(MARK_PATH), "1866425f21081e8521b1f6dbe6650d498edbf2c77328ebc480ad5cf91992b96c");
  assert.equal(WORDMARK_VIEWBOX, "0 0 756.31 100.00");
  assert.equal(MARK_VIEWBOX, "0 0 100 100");
});

test("the lockup sizes and the type scale are the written ones", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(logoSizes).map(([k, v]) => [k, v.word])),
    { sm: "1.35rem", md: "1.65rem", lg: "1.9rem", xl: "3rem" },
  );
  assert.deepEqual(typeScale, {
    meta: "0.75rem",
    body: "0.875rem",
    lead: "1rem",
    name: "1.375rem",
    sentence: "1.625rem",
    section: "2.25rem",
    display: "3.25rem",
  });
});

test("the lockup is one ink with no plaque, on every stylesheet", () => {
  for (const file of ["src/app/globals.css", "src/app/public-v2.css", "src/app/public-surfaces.css", "src/app/public-polish.css", "src/app/dashboard/orvius.css"]) {
    const css = read(file);
    for (const block of css.matchAll(/([^{}]*\.orvius-logo[^{},]*)\{([^}]*)\}/g)) {
      assert.doesNotMatch(block[2], /background(-color)?:\s*(white|#fff\b|#ffffff)/i, `${file}: ${block[1].trim()} puts a plaque behind the lockup`);
    }
  }
});

test("the brand rules are written down next to the tests that hold them", () => {
  assert.ok(existsSync(join(root, "docs/BRAND.md")));
  const doc = read("docs/BRAND.md");
  assert.match(doc, /one ink/i);
  assert.match(doc, /Geist/);
  assert.match(doc, /brand-lock\.test\.mjs/);
});
