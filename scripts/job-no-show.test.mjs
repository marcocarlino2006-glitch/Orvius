import assert from "node:assert/strict";
import test from "node:test";

import {
  jobIsCustomerNoShow,
  jobIsTechNoShow,
} from "../src/lib/job-no-show.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

const now = new Date("2026-09-17T18:00:00.000Z");
const past = new Date("2026-09-17T17:00:00.000Z");
const recent = new Date("2026-09-17T17:50:00.000Z");

test("confirmed customer past the grace window is a customer no-show", () => {
  assert.equal(
    jobIsCustomerNoShow({
      scheduledAt: past,
      status: "confirmed",
      customerConfirmedAt: past,
      now,
    }),
    true,
  );
  assert.equal(
    jobIsCustomerNoShow({
      scheduledAt: recent,
      status: "confirmed",
      customerConfirmedAt: recent,
      now,
    }),
    false,
  );
  assert.equal(
    jobIsCustomerNoShow({
      scheduledAt: past,
      status: "scheduled",
      customerConfirmedAt: null,
      now,
    }),
    false,
  );
});

test("assigned tech who never rolls past the window is a tech no-show", () => {
  assert.equal(
    jobIsTechNoShow({
      scheduledAt: past,
      status: "scheduled",
      technicianId: "tech_1",
      now,
    }),
    true,
  );
  assert.equal(
    jobIsTechNoShow({
      scheduledAt: past,
      status: "en_route",
      technicianId: "tech_1",
      dispatchedAt: new Date("2026-09-17T16:00:00.000Z"),
      now,
    }),
    true,
  );
  assert.equal(
    jobIsTechNoShow({
      scheduledAt: past,
      status: "confirmed",
      technicianId: "tech_1",
      customerConfirmedAt: past,
      now,
    }),
    false,
  );
});

test("no_show kinds are board kinds with Call strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("customer_no_show"));
  assert.ok(ATTENTION_KINDS.includes("tech_no_show"));
  assert.equal(attentionKindLabel("customer_no_show"), "No-show");
  assert.equal(attentionKindLabel("tech_no_show"), "Tech late");
  assert.equal(attentionActionStrategy("customer_no_show"), "call");
  assert.equal(attentionActionStrategy("tech_no_show"), "call");
});
