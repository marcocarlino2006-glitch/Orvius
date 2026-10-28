import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callToCash } from "../src/lib/call-to-cash.ts";

const states = (steps) => steps?.map((s) => `${s.key}:${s.state}`).join(" ");

test("a call with no lead and no job has no thread", () => {
  assert.equal(callToCash({}), null);
  assert.equal(callToCash({ hasLead: false, job: null }), null);
});

test("a live call shows no thread, and neither does a cancelled job", () => {
  assert.equal(callToCash({ live: true, hasLead: true }), null);
  assert.equal(callToCash({ hasLead: true, job: { status: "cancelled" } }), null);
});

test("a lead that was not booked is waiting on booking", () => {
  assert.equal(states(callToCash({ hasLead: true })), "answered:done booked:now confirmed:next done:next paid:next");
});

test("a booked job waits on the customer, then the work, then the money", () => {
  const job = { status: "scheduled" };
  assert.equal(states(callToCash({ hasLead: true, job })), "answered:done booked:done confirmed:now done:next paid:next");
  assert.equal(
    states(callToCash({ hasLead: true, job: { ...job, confirmedAt: "2026-10-28T12:00:00Z" } })),
    "answered:done booked:done confirmed:done done:now paid:next",
  );
  assert.equal(
    states(callToCash({ hasLead: true, job: { status: "completed", completedAt: "2026-10-28T12:00:00Z" } })),
    "answered:done booked:done confirmed:done done:done paid:now",
  );
});

test("a paid invoice closes the thread, and an unpaid one does not", () => {
  const done = { status: "completed", completedAt: "2026-10-28T12:00:00Z" };
  assert.equal(
    states(callToCash({ hasLead: true, job: { ...done, invoiceStatus: "paid", invoicePaidAt: "2026-10-29T12:00:00Z" } })),
    "answered:done booked:done confirmed:done done:done paid:done",
  );
  assert.equal(callToCash({ hasLead: true, job: { ...done, invoiceStatus: "sent" } }).at(-1).state, "now");
});

test("only one step is ever the next thing", () => {
  for (const job of [null, { status: "scheduled" }, { status: "completed" }]) {
    const steps = callToCash({ hasLead: true, job });
    assert.ok(steps.filter((s) => s.state === "now").length <= 1);
  }
});

test("Home draws the thread under the latest call from the records", () => {
  const command = readFileSync(new URL("../src/components/ring1-command-center.tsx", import.meta.url), "utf8");
  assert.match(command, /callToCash\(\{ live, hasLead: call\.hasLead, job: call\.job \}\)/);
  assert.match(command, /className="cmd-thread"/);
  const route = readFileSync(new URL("../src/app/api/ring1/route.ts", import.meta.url), "utf8");
  assert.match(route, /invoices: \{ orderBy: \{ createdAt: "desc" \}, take: 1, select: \{ status: true, paidAt: true \} \}/);
});
