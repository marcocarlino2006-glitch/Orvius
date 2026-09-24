import test from "node:test";
import assert from "node:assert/strict";
import { leadNextAction } from "../src/lib/lead-next-action.ts";
import { jobRowFacts } from "../src/lib/job-row.ts";

const lead = (o = {}) => ({ status: "new", urgency: null, phone: "+13125550101", address: "1 Elm", jobId: null, ...o });

test("each inbox opportunity has exactly one next action", () => {
  assert.equal(leadNextAction(lead({ jobId: "j1" })).kind, "view_job");
  assert.equal(leadNextAction(lead({ urgency: "emergency" })).label, "Call now");
  assert.equal(leadNextAction(lead()).kind, "book");
  assert.equal(leadNextAction(lead({ address: null })).label, "Call back");
  assert.equal(leadNextAction(lead({ address: null, phone: null })).kind, "review");
  assert.equal(leadNextAction(lead({ status: "spam" })).kind, "review");
  assert.equal(leadNextAction(lead({ status: "contacted", urgency: "emergency" })).kind, "book");
});

const now = new Date("2026-09-24T15:00:00Z").getTime();
const job = (o = {}) => ({
  status: "scheduled",
  urgency: null,
  createdAt: "2026-09-24T09:00:00Z",
  scheduledAt: "2026-09-25T15:00:00Z",
  customerConfirmedAt: "2026-09-24T10:00:00Z",
  technician: { name: "Ana" },
  business: { avgTicketCents: 42000 },
  estimate: null,
  ...o,
});

test("job rows state owner, timing and value in words", () => {
  const f = jobRowFacts(job(), now);
  assert.equal(f.owner.label, "Ana");
  assert.equal(f.timing.label, "In 24h");
  assert.equal(f.money.label, "~$420 expected");
  assert.equal(f.attention, null);
});

test("overdue, unassigned and unpaid work is flagged and weighted", () => {
  const overdue = jobRowFacts(job({ scheduledAt: "2026-09-24T12:00:00Z" }), now);
  assert.equal(overdue.timing.label, "Overdue 3h");
  assert.equal(overdue.timing.tone, "risk");

  const emergency = jobRowFacts(job({ technician: null, urgency: "emergency" }), now);
  assert.equal(emergency.owner.missing, true);
  assert.ok(emergency.attention.weight > overdue.attention.weight);

  const due = jobRowFacts(
    job({
      status: "completed",
      estimate: {
        amountCents: 50000,
        status: "accepted",
        invoice: { amountCents: 50000, status: "sent", payments: [{ amountCents: 20000, status: "succeeded" }] },
      },
    }),
    now,
  );
  assert.equal(due.money.label, "$300 due");
  assert.match(due.attention.reason, /payment/);

  const paid = jobRowFacts(
    job({
      status: "completed",
      estimate: {
        amountCents: 50000,
        status: "accepted",
        invoice: { amountCents: 50000, status: "paid", payments: [{ amountCents: 50000, status: "succeeded" }] },
      },
    }),
    now,
  );
  assert.equal(paid.money.kind, "paid");
  assert.equal(paid.attention, null);

  const unconfirmed = jobRowFacts(job({ scheduledAt: "2026-09-24T18:00:00Z", customerConfirmedAt: null }), now);
  assert.match(unconfirmed.attention.reason, /not confirmed/);
});
