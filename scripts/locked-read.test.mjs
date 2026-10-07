/*
 * A shop whose access ended signs in to its own records, not to a wall: a read
 * passes the billing gate, anything else is still refused with 402.
 */
import assert from "node:assert/strict";
import test from "node:test";

const { allowLockedRead, requireActiveBilling, requirePlanModule, billingLock } = await import("../src/lib/plan-gate.ts");

const canceled = () => ({ billingStatus: "canceled", billingPlan: "pro", createdAt: new Date("2026-01-01") });
const endedPilot = () => ({ billingStatus: "pilot", pilotEndsAt: new Date(Date.now() - 86_400_000) });

test("a locked shop is refused unless the request is a read", () => {
  const write = canceled();
  assert.equal(requireActiveBilling(write).error?.status, 402);
  assert.equal(requirePlanModule(write, "customers").error?.status, 402);

  const read = canceled();
  allowLockedRead(read);
  assert.deepEqual(requireActiveBilling(read), { ok: true });
  assert.equal(requirePlanModule(read, "customers").plan, "expired");
  assert.equal(requirePlanModule(read, "dispatch").plan, "expired");
});

test("the read mark belongs to one request's business object, not the shop", () => {
  const marked = endedPilot();
  allowLockedRead(marked);
  assert.equal(requireActiveBilling(endedPilot()).error?.status, 402);
});

test("the lock says why, in the owner's words", () => {
  assert.deepEqual(billingLock(endedPilot()), {
    reason: "trial_ended",
    message: "Your access ended. Pay with card to keep using Orvius.",
  });
  assert.equal(billingLock(canceled()).reason, "canceled");
});
