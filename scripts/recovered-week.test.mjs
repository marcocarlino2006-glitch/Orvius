/*
 * The Command card that shows an owner what the line brought in this week.
 * Real payments lead; any other dollar figure is the owner's own average
 * ticket × captured jobs and says so; nothing is shown as money otherwise.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { buildRecoveredWeek } = await import("../src/lib/recovered-week.ts");

const base = {
  leads: 0,
  capturedDemandJobs: 0,
  capturedDemandEstimatedValueCents: null,
  avgTicketCents: null,
  afterHoursLeads: 0,
  afterHoursBooked: 0,
  collectedCents: 0,
};

test("collected money leads, as real dollars", () => {
  const week = buildRecoveredWeek({ ...base, leads: 9, capturedDemandJobs: 4, avgTicketCents: 42_000, capturedDemandEstimatedValueCents: 168_000, collectedCents: 221_100, afterHoursLeads: 3, afterHoursBooked: 2 });
  assert.deepEqual(week.headline, { value: "$2,211", label: "collected this week", estimate: false });
  assert.equal(week.rows[0].value, "4 jobs");
  assert.equal(week.rows[0].detail, "≈$1,680 at your $420 average ticket");
  assert.equal(week.rows[1].value, "3 callers");
  assert.equal(week.rows[1].detail, "2 jobs booked from them");
  assert.equal(week.needsTicket, false);
  assert.equal(week.rows.length, 2, "the headline already says what was collected");
});

test("with no payments yet, the booked value is shown and marked as an estimate", () => {
  const week = buildRecoveredWeek({ ...base, leads: 5, capturedDemandJobs: 2, avgTicketCents: 35_000, capturedDemandEstimatedValueCents: 70_000 });
  assert.deepEqual(week.headline, { value: "≈$700", label: "booked from Orvius calls", estimate: true });
  assert.equal(week.rows[2].value, "$0");
  assert.equal(week.rows[2].label, "Collected");
});

test("without an average ticket there are no invented dollars, and it asks for one", () => {
  const week = buildRecoveredWeek({ ...base, leads: 3, capturedDemandJobs: 1 });
  assert.deepEqual(week.headline, { value: "1 job", label: "booked from Orvius calls", estimate: false });
  assert.equal(week.rows[0].detail, undefined);
  assert.equal(week.needsTicket, true);
  assert.ok(!JSON.stringify(week).includes("≈"), "no estimate anywhere");
});

test("an empty week has no headline, and callers alone still count", () => {
  assert.equal(buildRecoveredWeek(base).headline, null);
  assert.equal(buildRecoveredWeek(base).needsTicket, false);
  assert.deepEqual(buildRecoveredWeek({ ...base, leads: 1 }).headline, { value: "1 caller", label: "captured this week", estimate: false });
});

test("Command shows the card between the signals and System", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/ring1-command-center.tsx", import.meta.url), "utf8");
  assert.match(src, /<CommandSignals[\s\S]{0,80}<CommandRecovered outcomes=\{data\?\.outcomes\} \/>[\s\S]{0,40}<OrviusPulse/);
});
