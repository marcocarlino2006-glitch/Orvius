/*
 * Money reads against a database that is behind the release (the refund
 * columns not yet migrated) must pause — flagged and absent — never throw
 * a 500 and never present $0 as measured fact. Counts stay exact.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { isMoneySchemaDrift, degradedOutcomes } = await import("../src/lib/command-degraded.ts");
const { monthValueLine } = await import("../src/lib/month-value.ts");
const { reportCsv } = await import("../src/lib/owner-report.ts");

test("schema drift is recognised by Prisma code and by message", () => {
  assert.equal(isMoneySchemaDrift(Object.assign(new Error("x"), { code: "P2022" })), true);
  assert.equal(
    isMoneySchemaDrift(new Error("The column `main.Payment.refundedCents` does not exist in the current database.")),
    true,
  );
  assert.equal(isMoneySchemaDrift(new Error("connection refused")), false);
  assert.equal(isMoneySchemaDrift(Object.assign(new Error("x"), { code: "P2025" })), false);
  assert.equal(isMoneySchemaDrift(null), false);
  assert.equal(isMoneySchemaDrift("P2022"), false);
  assert.equal(isMoneySchemaDrift(undefined), false);
});

test("a paused month value still reports the work, with no money claim", () => {
  const line = monthValueLine({ callsAnswered: 4, leadsCaptured: 3, jobsBooked: 2, collectedCents: null, moneyPaused: true });
  assert.match(line, /answered 4 calls/);
  assert.match(line, /booked 2 jobs/);
  assert.doesNotMatch(line, /collected|\$/);
});

test("a read month value keeps its money line", () => {
  const line = monthValueLine({ callsAnswered: 4, leadsCaptured: 3, jobsBooked: 2, collectedCents: 125_00 });
  assert.match(line, /collected \$125 by card/);
});

test("the degraded Command outcomes carry no money at all", () => {
  const outcomes = degradedOutcomes(new Date());
  assert.equal(outcomes.money, undefined);
  assert.equal(outcomes.collectedCents, 0);
});

const emptyReport = {
  collectedCents: 0,
  previousCollectedCents: 0,
  payments: 0,
  averageInvoiceCents: null,
  jobsCompleted: 0,
  estimates: { sent: 0, won: 0, sentCents: 0, wonCents: 0, closeRate: null },
  calls: { leads: 0, booked: 0, bookedRate: null },
  stillToCollect: { totalCents: 0, count: 0, invoices: [] },
  byTechnician: [],
  bySource: [],
};

test("a paused CSV says so instead of quietly totalling $0", () => {
  assert.match(reportCsv(emptyReport, [], undefined, true), /Money numbers are paused/);
  assert.doesNotMatch(reportCsv(emptyReport, [], undefined, false), /Money numbers are paused/);
});
