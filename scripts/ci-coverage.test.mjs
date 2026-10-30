#!/usr/bin/env node
/*
 * CI runs every test file, lints, and refuses a critical advisory. A
 * hand-typed list of test files had fallen 14 behind, including the alarms
 * that page the founder, so they could break with CI green.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the trust suite runs every test file by glob, not a hand-kept list", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  assert.match(scripts["test:trust"], /--test --test-concurrency=1 scripts\/\*\.test\.mjs$/);
});

test("CI lints and fails on a critical advisory; infrastructure packages are pinned", () => {
  const ci = readFileSync(".github/workflows/perfect-standards.yml", "utf8");
  assert.match(ci, /- run: npm run lint/);
  assert.match(ci, /npm audit --omit=dev --audit-level=critical/);
  const deps = JSON.parse(readFileSync("package.json", "utf8")).dependencies;
  for (const name of ["next", "@prisma/client", "@prisma/adapter-libsql", "@libsql/client"]) {
    assert.match(deps[name], /^\d+\.\d+\.\d+$/, `${name} is pinned to an exact version`);
  }
  assert.match(readFileSync(".github/dependabot.yml", "utf8"), /package-ecosystem: npm/);
});
