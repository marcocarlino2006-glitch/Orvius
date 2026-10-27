import assert from "node:assert/strict";
import test from "node:test";

import { deskFacts, moneyBrief } from "../src/lib/desk-status.ts";

const quiet = { calls: 0, booked: 0, assigned: 0, confirmations: 0, escalated: 0 };

test("a quiet shop adds no status row", () => {
  assert.equal(deskFacts({ needsYou: 0, approvals: 0, handled: quiet }), null);
  assert.equal(deskFacts({ needsYou: 0, approvals: 0, handled: null }), null);
});

test("attention, an approval, and real Orvius work stay separate sentences", () => {
  assert.deepEqual(
    deskFacts({
      needsYou: 1,
      approvals: 2,
      handled: { calls: 3, booked: 1, assigned: 0, confirmations: 2, escalated: 1 },
    }),
    {
      you: "1 thing needs you.",
      ok: "2 changes are waiting on your OK.",
      orvius: "Orvius today answered 3 calls, booked 1 job, sent 2 confirmations, and held 1 call for a person.",
    },
  );
  assert.equal(deskFacts({ needsYou: 4, approvals: 0, handled: quiet })?.you, "4 things need you.");
  assert.equal(deskFacts({ needsYou: 4, approvals: 0, handled: quiet })?.orvius, null);
  assert.equal(
    deskFacts({ needsYou: 0, approvals: 0, handled: { ...quiet, collected: 1 } })?.orvius,
    "Orvius today collected 1 payment.",
  );
});

test("money is one sentence, and owed or unbilled appears only when it is true", () => {
  const clear = moneyBrief({
    windowDays: 7,
    invoicedCents: 40_000,
    invoices: 1,
    collectedCents: 40_000,
    payments: 1,
    outstandingCents: 0,
    outstandingInvoices: 0,
    doneNotBilled: 0,
  });
  assert.equal(clear.summary, "In the last 7 days: collected $400, billed $400.");
  assert.equal(clear.owed, null);
  assert.equal(clear.unbilled, null);

  const open = moneyBrief({
    windowDays: 7,
    invoicedCents: 25_050,
    invoices: 1,
    collectedCents: 0,
    payments: 0,
    outstandingCents: 20_000,
    outstandingInvoices: 1,
    doneNotBilled: 2,
  });
  assert.equal(open.summary, "In the last 7 days: collected nothing, billed $250.50.");
  assert.equal(open.owed, "$200 is still owed on 1 invoice.");
  assert.equal(open.unbilled, "2 finished jobs have no bill.");
});
