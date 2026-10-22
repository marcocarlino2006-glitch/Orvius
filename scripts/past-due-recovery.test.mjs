#!/usr/bin/env node
/*
 * A job whose visit time passed and never started needs a decision —
 * contact the customer, reschedule, or close it — not "Mark confirmed".
 * The audit found an expired job's call record recommending exactly that,
 * and a funnel saying "Nothing stuck" beside 24 items in the action queue.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const { jobPastDue, PAST_DUE_LABEL, PAST_DUE_GRACE_MS, pastDueDetail, nextJobStatus } = await import("../src/lib/job-status.ts");
const work = await import("../src/lib/work.ts");
const { jobRowFacts } = await import("../src/lib/job-row.ts");
const { summarizeFlow } = await import("../src/lib/command-depth.ts");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-14T15:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000);

test("past due means the visit time plus an hour passed and the job never started", () => {
  assert.equal(PAST_DUE_GRACE_MS, 3_600_000);
  assert.equal(jobPastDue({ status: "scheduled", scheduledAt: hoursAgo(0.5) }, NOW), false, "half an hour late is lateness");
  assert.equal(jobPastDue({ status: "scheduled", scheduledAt: hoursAgo(2) }, NOW), true);
  assert.equal(jobPastDue({ status: "confirmed", scheduledAt: hoursAgo(72) }, NOW), true);
  for (const status of ["en_route", "on_site", "completed", "cancelled"]) {
    assert.equal(jobPastDue({ status, scheduledAt: hoursAgo(72) }, NOW), false, status);
  }
  assert.equal(jobPastDue({ status: "scheduled", scheduledAt: null }, NOW), false);
  assert.match(pastDueDetail(hoursAgo(72), NOW), /due 3 days ago and never started\. Call the customer, move it to a new time, or close it\./);
  assert.equal(PAST_DUE_LABEL, "Call them, move the visit, or close it");
  assert.equal(nextJobStatus("scheduled").label, "Mark confirmed", "an on-time job still confirms");
});

const job = (over = {}) => ({
  id: "j1",
  leadId: null,
  title: "No heat",
  serviceType: null,
  urgency: null,
  address: null,
  status: "scheduled",
  scheduledAt: hoursAgo(72),
  customerConfirmedAt: null,
  customerConfirmSentAt: null,
  techAcceptedAt: null,
  techDeclinedBy: null,
  assigneeEmail: null,
  createdAt: hoursAgo(100),
  updatedAt: hoursAgo(72),
  technician: null,
  customer: { name: "Dana Ruiz", phone: "+13125550142" },
  invoices: [],
  ...over,
});

test("the work queue asks for a recovery decision on an expired job, whatever it was waiting on", () => {
  assert.equal(work.jobWorkItem(job(), NOW).nextAction, "Call Dana Ruiz, move the visit, or close it");
  assert.equal(work.jobWorkItem(job({ technician: { id: "t", name: "Luis", phone: null } }), NOW).nextAction, "Call Dana Ruiz, move the visit, or close it");
  assert.equal(work.jobWorkItem(job({ status: "confirmed" }), NOW).nextAction, "Call Dana Ruiz, move the visit, or close it");
  assert.equal(work.jobWorkItem(job({ customer: { name: null, phone: null } }), NOW).nextAction, PAST_DUE_LABEL);
  assert.equal(work.jobWorkItem(job({ scheduledAt: new Date(NOW + 3_600_000) }), NOW).nextAction, "Assign a technician");
});

test("the job list calls it overdue on the same rule", () => {
  const facts = (scheduledAt) => jobRowFacts({ ...job(), scheduledAt: scheduledAt.toISOString(), createdAt: hoursAgo(100).toISOString() }, NOW).timing;
  assert.equal(facts(hoursAgo(72)).tone, "risk");
  assert.match(facts(hoursAgo(72)).label, /^Overdue/);
  assert.match(facts(hoursAgo(0.5)).label, /^Due \d+[mh] ago$/);
  assert.equal(facts(hoursAgo(0.5)).tone, "attention");
});

test("every surface that recommends a job step recovers instead of confirming", () => {
  assert.match(read("src/lib/record-view.ts"), /jobPastDue\(g\.job\)[\s\S]{0,120}PAST_DUE_LABEL/);
  const record = read("src/lib/record-view.ts");
  assert.ok(record.indexOf("jobPastDue(g.job)") < record.indexOf('"Assign technician"'), "no assigning a tech to a time that passed");

  const page = read("src/app/dashboard/jobs/[id]/page.tsx");
  assert.match(page, /const next = pastDue \? null : nextJobStatus/);
  for (const action of ["Call the customer", "Reschedule", "Close the job"]) assert.match(page, new RegExp(action));

  const card = read("src/components/work-card.tsx");
  assert.match(card, /const unconfirmed = isJob && !pastDue/);
  assert.match(card, /const late = pastDue \|\|/, "no status advance on an expired job");
  assert.match(card, /Close the job/);

  const queue = read("src/lib/attention-queue.ts");
  assert.match(queue, /recommendedAction: recover \? PAST_DUE_LABEL : "Update status"/);
  assert.match(queue, /const unassigned = !job\.technicianId && !recover/);
});

test("the funnel is scoped to its week and names past-due work instead of saying nothing is stuck", () => {
  const flow = summarizeFlow({ windowDays: 7, requests: 0, jobs: [], pastDue: 15 });
  assert.equal(flow.pastDue, 15);
  const strip = read("src/components/command-depth.tsx");
  assert.doesNotMatch(strip, /Nothing stuck/);
  assert.match(strip, /None waiting this week/);
  assert.match(strip, /passed the visit time without starting — contact, reschedule or close/);
  assert.match(strip, /also covers older work, calls, bills and setup/);
  const command = read("src/components/ring1-command-center.tsx");
  assert.doesNotMatch(command, /<FlowStrip/);
  assert.match(command, /<WorkCard/);
  assert.doesNotMatch(command, /The rest is in Work/);
});
