import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { PORTAL_ORDER, portalSequence } = await import("../src/lib/launch-gate.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the portal opens slowest-first and the signup switch is always last", () => {
  assert.equal(PORTAL_ORDER[0].key, "textDelivery", "toll-free verification takes business days, so it is filed first");
  assert.equal(PORTAL_ORDER.at(-1).key, "selfServeEnabled", "the switch flips only when everything it depends on is green");
  const gate = {
    items: PORTAL_ORDER.map((step) => ({ key: step.key, ready: step.key === "authReady" })),
  };
  const sequence = portalSequence(gate);
  assert.deepEqual(
    sequence.map((step) => step.key),
    PORTAL_ORDER.map((step) => step.key).filter((key) => key !== "authReady"),
    "ready steps drop out, pending steps keep portal order",
  );
});

test("the sequence reaches the founder through the gate route, card and runbook", () => {
  assert.match(read("src/app/api/admin/launch-gate/route.ts"), /sequence: portalSequence\(gate\)/);
  assert.match(read("src/app/admin/page.tsx"), /Open the portal, in this order/);
  const runbook = read("docs/OPEN-THE-PORTAL.md");
  assert.match(runbook, /File toll-free verification/);
  assert.match(runbook, /ORVIUS_SELF_SERVE_SIGNUP=1/);
  assert.ok(runbook.indexOf("File toll-free") < runbook.indexOf("Flip"), "runbook keeps slowest first");
});
