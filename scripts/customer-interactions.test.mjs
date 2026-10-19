import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const { interactionFloor } = await import("../src/lib/customer.ts");

test("the interaction floor never shows fewer interactions than the records prove", () => {
  assert.equal(interactionFloor(1, { calls: 3, leads: 1, jobs: 2 }), 3);
  assert.equal(interactionFloor(9, { calls: 3, leads: 1, jobs: 2 }), 9, "the maintained count can only be raised, never lowered");
  assert.match(read("src/app/api/customers/route.ts"), /interactionCount: interactionFloor\(customer\.interactionCount, customer\._count\)/);
  assert.match(read("src/app/api/jobs/[id]/route.ts"), /interactionFloor\(serialized\.customer\.interactionCount, counts\._count\)/);
});
