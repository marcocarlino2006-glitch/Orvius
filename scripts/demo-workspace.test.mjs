#!/usr/bin/env node
/*
 * A prospect's demo has to be alive the day they open it. The audit found an
 * expired pilot that disabled "Plan it", fifteen sample jobs all overdue and
 * waiting on confirmation, and nothing on today's schedule. The demo is now a
 * separate shop with a sample week dated from the moment it is seeded, every
 * stage of the job loop present once, a plan that can be approved and run,
 * and a reset that never reaches a real shop.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { ensureDemoWorkspace, resetDemoWorkspace } = await import("../src/lib/demo-workspace.ts");
const { seedDemoDataset, DEMO_SAMPLE } = await import("../src/lib/demo-dataset.ts");
const { DEMO_SCENARIOS } = await import("../src/lib/demo-workspace.ts");
const { executeProposal } = await import("../src/lib/copilot-execute.ts");
const { isBillingEntitled, isLineEntitled } = await import("../src/lib/billing-entitlement.ts");
const { getEffectivePlanId } = await import("../src/lib/plan-features.ts");
const { getPayPromptDecision } = await import("../src/lib/pay-prompt.ts");
const { jobPastDue } = await import("../src/lib/job-status.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const H = 3_600_000;
const cleanup = [];

test.after(async () => {
  for (const id of cleanup) {
    await prisma.lead.deleteMany({ where: { businessId: id } }).catch(() => {});
    await prisma.business.delete({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
});

test("a demo shop never locks, however old its pilot date; a real expired pilot still does", () => {
  const expired = { billingStatus: "pilot", pilotEndsAt: new Date(Date.now() - 30 * 86_400_000) };
  assert.equal(isBillingEntitled({ ...expired, environment: "demo" }), true);
  assert.equal(isLineEntitled({ ...expired, environment: "demo" }), true);
  assert.notEqual(getEffectivePlanId({ ...expired, environment: "demo" }), "expired", "Plan it stays usable");
  assert.equal(getPayPromptDecision({ ...expired, environment: "demo" }), null, "no pay prompt in a demo");
  assert.equal(isBillingEntitled({ ...expired, environment: "production" }), false);
  assert.equal(getEffectivePlanId({ ...expired, environment: "production" }), "expired");
});

test("sample customers never collide with the simulated-call scenarios", () => {
  const scenarioPhones = new Set(DEMO_SCENARIOS.map((s) => s.phone));
  for (const s of DEMO_SAMPLE) assert.ok(!scenarioPhones.has(s.phone), `${s.name} shares a scenario number`);
  assert.equal(new Set(DEMO_SAMPLE.map((s) => s.phone)).size, DEMO_SAMPLE.length);
});

test("a seeded demo is dated today and has every stage of the job loop", async () => {
  const email = `demo-${stamp()}@orvius.test`;
  const { business, seeded } = await ensureDemoWorkspace(email, { seed: true });
  cleanup.push(business.id);
  assert.equal(seeded, true);
  assert.equal(business.environment, "demo");

  const now = Date.now();
  const jobs = await prisma.job.findMany({ where: { businessId: business.id }, include: { invoices: true, estimate: true } });
  const statuses = new Set(jobs.map((j) => j.status));
  for (const s of ["scheduled", "confirmed", "en_route", "on_site", "completed"]) assert.ok(statuses.has(s), `missing ${s}`);

  const today = jobs.filter((j) => j.scheduledAt && Math.abs(j.scheduledAt.getTime() - now) < 8 * H && j.status !== "completed");
  assert.ok(today.length >= 4, `today's schedule has ${today.length} open jobs`);

  const overdue = jobs.filter((j) => jobPastDue(j, now));
  assert.equal(overdue.length, 1, "exactly one visit passed without starting, to try recovery on");
  const waitingOnCustomer = jobs.filter((j) => j.status === "scheduled" && j.customerConfirmSentAt && !j.customerConfirmedAt && !jobPastDue(j, now));
  assert.ok(waitingOnCustomer.length >= 1 && waitingOnCustomer.length < jobs.length / 2, "a few wait on the customer, not all");
  assert.ok(jobs.some((j) => !j.technicianId && j.status === "scheduled" && j.scheduledAt > new Date(now)), "one needs a technician");

  const done = jobs.filter((j) => j.status === "completed");
  assert.ok(done.some((j) => j.invoices.some((i) => i.status === "paid")), "paid");
  assert.ok(done.some((j) => j.invoices.some((i) => i.status === "sent")), "billed, not paid");
  assert.ok(done.some((j) => j.invoices.length === 0), "done, not billed");
  assert.ok(jobs.some((j) => j.estimate?.status === "sent"), "an estimate waiting for a yes");

  const unbooked = await prisma.lead.findMany({ where: { businessId: business.id, job: null } });
  assert.ok(unbooked.some((l) => l.address), "a request ready to plan");
  assert.ok(unbooked.some((l) => !l.address), "a request that needs a callback");

  const alerts = await prisma.ownerNotification.count({ where: { businessId: business.id, status: "sent" } });
  assert.ok(alerts > 0, "alert delivery has recent proof");
});

test("plan → approval → execution runs on the seeded plan", async () => {
  const { business } = await ensureDemoWorkspace(`plan-${stamp()}@orvius.test`, { seed: true });
  cleanup.push(business.id);
  const proposal = await prisma.copilotAction.findFirst({ where: { businessId: business.id, status: "proposed", action: "book_window" } });
  assert.ok(proposal, "a plan waits for approval");
  const { leadId } = JSON.parse(proposal.paramsJson);
  const run = await executeProposal({ business, proposalId: proposal.id, by: { role: "owner", email: business.ownerEmail } });
  assert.equal(run.ok, true, JSON.stringify(run));
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { job: true } });
  assert.ok(lead.job, "approving the plan booked the job");
  assert.ok(lead.job.scheduledAt > new Date(), "for a time that is still ahead");
});

test("an old empty demo is filled on open; reset starts over at today and never touches the real shop", async () => {
  const email = `owner-${stamp()}@orvius.test`;
  const real = await prisma.business.create({
    data: { name: "Real Shop", slug: `real-${stamp()}`, environment: "production", ownerEmail: email, hoursJson: "{}", servicesJson: "[]" },
  });
  cleanup.push(real.id);
  const realLead = await prisma.lead.create({ data: { businessId: real.id, name: "Real Customer", phone: "+13125550999", status: "new" } });

  const { business: empty } = await ensureDemoWorkspace(email);
  cleanup.push(empty.id);
  assert.equal(await prisma.job.count({ where: { businessId: empty.id } }), 0, "visitor-style demos start empty");
  const opened = await ensureDemoWorkspace(email, { seed: true });
  assert.equal(opened.business.id, empty.id);
  assert.equal(opened.seeded, true);
  assert.ok((await prisma.job.count({ where: { businessId: empty.id } })) > 0);
  assert.equal((await ensureDemoWorkspace(email, { seed: true })).seeded, false, "an in-use demo is not re-seeded behind the person's back");

  await prisma.business.update({ where: { id: empty.id }, data: { createdAt: new Date(Date.now() - 10 * 86_400_000) } });
  const reset = await resetDemoWorkspace(email);
  cleanup.push(reset.business.id);
  assert.notEqual(reset.business.id, empty.id);
  assert.equal(await prisma.business.findUnique({ where: { id: empty.id } }), null, "the old demo is gone");
  assert.ok(Date.now() - reset.business.createdAt.getTime() < 60_000, "the new sample week is dated now");

  assert.ok(await prisma.business.findUnique({ where: { id: real.id } }), "the real shop is untouched");
  assert.ok(await prisma.lead.findUnique({ where: { id: realLead.id } }), "its customers are untouched");
  await assert.rejects(() => seedDemoDataset(real), /only goes into a demo workspace/);
});

test("Command shows the demo bar with a reset, and the demo is reachable from any real shop", () => {
  const cc = readFileSync(new URL("../src/components/ring1-command-center.tsx", import.meta.url), "utf8");
  assert.match(cc, /data\?\.business\?\.demoWorkspace \? <DemoWorkspaceBar/);
  assert.match(cc, /<TryDemo empty=\{!data\.metrics\.totalCalls\} \/>/);
  const board = readFileSync(new URL("../src/components/command-board.tsx", import.meta.url), "utf8");
  assert.match(board, /Reset to today/);
  assert.match(board, /<DemoPanel onChange=\{onChange\} \/>/);
  const route = readFileSync(new URL("../src/app/api/demo/workspace/route.ts", import.meta.url), "utf8");
  assert.match(route, /ensureDemoWorkspace\(email, \{ seed: true, timezone \}\)/);
});
