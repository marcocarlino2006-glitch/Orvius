import assert from "node:assert/strict";
import test from "node:test";

import { leadIsNotAJob } from "../src/lib/lead-not-a-job.ts";
import {
  attentionActionStrategy,
  attentionKindLabel,
  ATTENTION_KINDS,
} from "../src/lib/attention-types.ts";

test("detects spam / OOA / wrong trade as not a job", () => {
  assert.equal(leadIsNotAJob({ categoryCode: "other.non_service" }), true);
  assert.equal(leadIsNotAJob({ notes: "Out of service area — not a job" }), true);
  assert.equal(leadIsNotAJob({ notes: "Wrong trade for this shop — not a job" }), true);
  assert.equal(leadIsNotAJob({ notes: "Spam / sales — not a job" }), true);
  assert.equal(leadIsNotAJob({ serviceType: "AC repair", notes: null }), false);
});

test("not_a_job is a board kind with dismiss strategy", () => {
  assert.ok(ATTENTION_KINDS.includes("not_a_job"));
  assert.equal(attentionKindLabel("not_a_job"), "Not a job");
  assert.equal(attentionActionStrategy("not_a_job"), "dismiss");
});

test("a request flagged not a job has a one-tap clear on the card Command renders", async () => {
  const { readFileSync } = await import("node:fs");
  const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
  const card = read("src/components/work-card.tsx");
  assert.match(card, /kinds\.has\("not_a_job"\)/);
  assert.match(card, /<MarkNotAJobButton leadId=\{notAJob\}/);
  assert.match(read("src/components/mark-not-a-job-button.tsx"), /sendWrite\(`\/api\/leads\/\$\{leadId\}`, "PATCH", \{ status: "spam" \}\)/);
  assert.match(read("src/components/ring1-command-center.tsx"), /<WorkCard\b/);
  assert.match(read("src/app/api/leads/[id]/route.ts"), /z\.enum\(\["new", "contacted", "booked", "lost", "spam"\]\)/);
});
