import assert from "node:assert/strict";
import test from "node:test";

import { isEmergency, notableUrgency } from "../src/lib/urgency.ts";

/*
  These two functions decide whether a row shouts. The rails disagreed about
  the first one for a while — one tested equality, another tested
  includes("emergency") — so the same lead was an alarm on /jobs and routine on
  /inbox. The cases below are the ones that disagreement turned on.
*/

test("an emergency is an emergency however the intake model wrote it down", () => {
  for (const value of [
    "emergency",
    "EMERGENCY",
    "  Emergency  ",
    "emergency - no heat",
    "emergency-same-day",
    "emergency_callback",
  ]) {
    assert.equal(isEmergency(value), true, value);
  }
});

test("a negation is not an alarm", () => {
  /* The reason this is a prefix test and not includes(): substring matching
     turns "non-emergency" into a 3am siren. */
  for (const value of ["non-emergency", "not an emergency", "nonemergency"]) {
    assert.equal(isEmergency(value), false, value);
  }
});

test("no urgency at all is not an emergency", () => {
  assert.equal(isEmergency(null), false);
  assert.equal(isEmergency(undefined), false);
  assert.equal(isEmergency(""), false);
  assert.equal(isEmergency("   "), false);
});

test("the default urgencies print nothing", () => {
  for (const value of [
    "routine",
    "Routine",
    "flexible",
    "normal",
    "standard",
    "low",
    "none",
    null,
    undefined,
    "",
  ]) {
    assert.equal(notableUrgency(value), null, String(value));
  }
});

test("emergency is withheld from the pill, because the row already says it", () => {
  /* The kicker and the row's left edge carry it. A third copy in a pill is
     what put "EMERGENCY · RETURNING" above an EMERGENCY badge. */
  assert.equal(notableUrgency("emergency"), null);
  assert.equal(notableUrgency("emergency - no heat"), null);
});

test("an urgency worth printing comes back readable", () => {
  assert.equal(notableUrgency("urgent"), "urgent");
  assert.equal(notableUrgency("same-day"), "same day");
  assert.equal(notableUrgency("next_day"), "next day");
  assert.equal(notableUrgency("  Urgent "), "urgent");
});
