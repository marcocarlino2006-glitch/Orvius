import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the customers list never shows fewer interactions than its own records prove", () => {
  const route = read("src/app/api/customers/route.ts");
  assert.match(route, /interactionCount: Math\.max\(\s*customer\.interactionCount,\s*customer\._count\.calls,\s*customer\._count\.leads,\s*customer\._count\.jobs,?\s*\)/);
  assert.match(route, /returning:\s*customer\.interactionCount > 1 \|\|/);
});
