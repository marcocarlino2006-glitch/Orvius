import assert from "node:assert/strict";
import test from "node:test";

import { resolveFormationStateConfirmed } from "../src/lib/formation-state.ts";

test("formation state rejects theater and empty", () => {
  assert.equal(resolveFormationStateConfirmed({}), null);
  assert.equal(resolveFormationStateConfirmed({ ORVIUS_FORMATION_STATE: "" }), null);
  assert.equal(
    resolveFormationStateConfirmed({ ORVIUS_FORMATION_STATE: "YOUR_STATE" }),
    null,
  );
  assert.equal(
    resolveFormationStateConfirmed({ ORVIUS_FORMATION_STATE: "placeholder" }),
    null,
  );
});

test("formation state accepts counsel-confirmed names", () => {
  assert.equal(
    resolveFormationStateConfirmed({ ORVIUS_FORMATION_STATE: "Delaware" }),
    "Delaware",
  );
  assert.equal(
    resolveFormationStateConfirmed({ ORVIUS_FORMATION_STATE: "New York" }),
    "New York",
  );
});
