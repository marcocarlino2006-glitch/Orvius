import assert from "node:assert/strict";
import test from "node:test";
import { commandCallActions, commandCallOutcomeLine, commandCallPhone, commandCallSummary } from "../src/lib/command-call.ts";
import { commandSentence } from "../src/lib/command-sentence.ts";
import { commandNow } from "../src/lib/command-now.ts";
import { connectedLine } from "../src/lib/connected-line.ts";
import { customerOpening } from "../src/lib/customer-opening.ts";

const clear = { loaded: true, brief: null, live: null, approval: null, item: null, lastSummary: null };

test("a decision names itself, ahead of any tally", () => {
  assert.equal(
    commandSentence({
      ...clear,
      brief: "Today: 0 jobs booked, 0 completed.",
      item: { title: "AC not cooling", customer: "Maria Lopez", nextAction: "Call Maria Lopez back now — emergency" },
    }),
    "Call Maria Lopez back now.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      brief: "Today: 5 jobs booked, 4 completed.",
      approval: { title: "Book Pam Thursday at 1", needsCheck: false },
      item: { title: "AC not cooling", customer: "Maria Lopez", nextAction: "Call Maria Lopez" },
    }),
    "Book Pam Thursday at 1.",
  );
  assert.equal(
    commandSentence({ ...clear, approval: { title: "The visit may not have happened", needsCheck: true } }),
    "Check this. The visit may not have happened.",
  );
});

test("with nobody waiting, a real day stands and a zero day does not", () => {
  assert.equal(commandSentence({ ...clear, brief: "Today: 5 jobs booked, 4 completed." }), "Today: 5 jobs booked, 4 completed.");
  assert.equal(commandSentence({ ...clear, brief: "Today: 0 jobs booked, 0 completed." }), "The line is clear.");
  assert.equal(commandSentence({ ...clear, brief: "Nothing on the board yet today." }), "The line is clear.");
  assert.equal(commandSentence({ ...clear, brief: "No jobs on the board today." }), "The line is clear.");
  assert.equal(commandSentence({ ...clear, brief: "Quiet since you looked 3 hours ago — nothing needs you." }), "Quiet since you looked 3 hours ago — nothing needs you.");
});

test("a live call leads, ahead of the decision waiting", () => {
  assert.equal(
    commandSentence({
      ...clear,
      live: { who: "Maria Lopez" },
      approval: { title: "Book Pam Thursday at 1", needsCheck: false },
      item: { title: "AC not cooling", customer: "Maria Lopez", nextAction: "Call Maria Lopez back now" },
    }),
    "Maria Lopez is on the line.",
  );
  assert.equal(commandSentence({ ...clear, live: { who: "  " } }), "The line is clear.");
});

test("the last thing that happened speaks when nothing is waiting", () => {
  assert.equal(commandSentence({ ...clear, lastSummary: "Booked Dana Cole for Thursday" }), "Booked Dana Cole for Thursday.");
  assert.equal(commandSentence({ ...clear, loaded: false, brief: "Today: 5 jobs booked, 4 completed." }), "Reading the shop…");
});

test("a visit that does not need you is the day, and money still speaks", () => {
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Waiting on Ray to accept", needsYou: false, when: "Oct 23, 10:00 AM", tech: "Ray" },
    }),
    "Oct 23, 10:00 AM. Water heater. Waiting on Ray to accept.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: null, needsYou: false, when: "Oct 23, 10:00 AM", tech: "Ray" },
    }),
    "Oct 23, 10:00 AM. Water heater. Ray. You're clear.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Mark arrived", needsYou: false, when: "Oct 23, 10:00 AM", tech: "Ray" },
    }),
    "Oct 23, 10:00 AM. Water heater. Ray is on the way.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Waiting on Dana to pay $1", needsYou: false, when: "Oct 23, 10:00 AM", tech: "Ray" },
    }),
    "Waiting on Dana to pay $1.",
  );
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "Water heater", customer: "Dana", nextAction: "Assign a technician", needsYou: true, when: "Oct 23, 10:00 AM", tech: null },
    }),
    "Assign a technician.",
  );
});

test("a Spanish call is said in the sentence", () => {
  assert.equal(
    commandSentence({
      ...clear,
      item: { title: "No water", customer: "Maria", nextAction: "Call Maria back", needsYou: true, spanish: true },
    }),
    "Call Maria back. They called in Spanish.",
  );
});

test("a customer opens on the money, the visit, or the last thing", () => {
  const usd = (cents) => `$${cents / 100}`;
  assert.equal(
    customerOpening([{ type: "invoice", at: "2026-10-21T12:00:00Z", title: "Invoice", status: "sent", amountCents: 100 }], usd),
    "$1 waiting.",
  );
  assert.equal(
    customerOpening([{ type: "invoice", at: "2026-10-21T12:00:00Z", title: "Invoice", status: "draft", amountCents: 100 }], usd),
    "Send the $1 invoice.",
  );
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const visit = customerOpening([{ type: "job", at: future, title: "Water heater", status: "scheduled" }], usd);
  assert.match(visit, /Water heater\.$/);
  const past = new Date(Date.now() - 2 * 86_400_000).toISOString();
  assert.equal(
    customerOpening([{ type: "job", at: past, title: "Furnace quote", status: "scheduled" }], usd),
    "Late. Furnace quote.",
  );
  assert.equal(
    customerOpening([{ type: "call", at: "2026-10-01T12:00:00Z", title: "Inbound call", status: "ended" }], usd),
    "Last call: Inbound call.",
  );
  assert.equal(
    customerOpening([{ type: "invoice", at: "2026-10-01T12:00:00Z", title: "Invoice · $385", status: "paid", amountCents: 38500 }], usd),
    "$385 paid.",
  );
});

test("connections open as one sentence", () => {
  assert.equal(connectedLine([]), "Nothing is connected yet.");
  assert.equal(connectedLine(["Stripe"]), "Stripe is connected.");
  assert.equal(connectedLine(["Stripe", "Jobber"]), "Stripe and Jobber are connected.");
  assert.equal(connectedLine(["Stripe", "Jobber", "QuickBooks", "Housecall Pro"]), "Stripe, Jobber, and 2 more are connected.");
});

test("a shop with no line hears that one next step when the day is empty", () => {
  assert.equal(commandSentence({ ...clear, lineOff: true }), "Connect the line. Orvius answers once it is on.");
  assert.equal(commandSentence({ ...clear, lineOff: true, brief: "Today: 0 jobs booked, 0 completed." }), "Connect the line. Orvius answers once it is on.");
  assert.equal(commandSentence({ ...clear, lineOff: true, brief: "Today: 5 jobs booked, 4 completed." }), "Today: 5 jobs booked, 4 completed.");
  assert.equal(
    commandSentence({ ...clear, lineOff: true, item: { title: "AC not cooling", customer: "Maria", nextAction: "Call Maria back", needsYou: true } }),
    "Call Maria back.",
  );
});

test("Ask and Home open on the same sentence", () => {
  assert.equal(commandNow(null), "Reading the shop…");
  const shop = {
    business: { line: "+15551212" },
    recentCalls: [{ id: "c1", status: "in-progress", createdAt: new Date().toISOString(), leadName: "Dana Cole", callerPhone: null }],
    work: { items: [{ approvalId: null, needsYou: true, title: "AC", customer: "Dana", nextAction: "Call Dana back", scheduledAt: null }], approvals: [] },
  };
  assert.equal(commandNow(shop), "Dana Cole is on the line.");
  assert.equal(commandNow({ ...shop, recentCalls: [] }), "Call Dana back.");
});

test("the desk shows the call: a booked one opens the job, an open one calls back", () => {
  const booked = {
    id: "c1",
    status: "ended",
    booked: true,
    hasLead: true,
    durationSec: 180,
    callerPhone: "+13125550100",
    leadPhone: "+13125550194",
    summary: "  No heat since last night.   She can do Thursday morning.  ",
    job: { id: "j1", title: "No heat", status: "scheduled", scheduledAt: "2026-10-23T14:00:00Z" },
  };
  assert.equal(commandCallSummary(booked.summary), "No heat since last night. She can do Thursday morning.");
  assert.equal(commandCallOutcomeLine(booked, false), "Booked");
  assert.equal(commandCallOutcomeLine(booked, true), null);
  assert.deepEqual(commandCallActions(booked, false), {
    primary: { href: "/dashboard/jobs/j1", label: "Open the job" },
    secondary: { href: "tel:+13125550194", label: "Call back" },
  });
  assert.equal(commandCallPhone(booked), "+1 312 555 0194");
  assert.deepEqual(commandCallActions(booked, true).primary, { href: "/dashboard/calls/c1", label: "Open the call" });

  const open = { id: "c2", status: "ended", booked: false, hasLead: true, durationSec: 90, callerPhone: "+13125550100", summary: null, job: null };
  assert.equal(commandCallOutcomeLine(open, false), "Held for review");
  assert.deepEqual(commandCallActions(open, false), {
    primary: { href: "tel:+13125550100", label: "Call back" },
    secondary: { href: "/dashboard/calls/c2", label: "Open the call" },
  });
  const long = commandCallSummary(`${"word ".repeat(80)}`);
  assert.ok(long && long.endsWith("…") && long.length <= 280);
});
