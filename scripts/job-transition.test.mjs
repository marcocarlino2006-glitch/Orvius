#!/usr/bin/env node
/*
 * Job truth and completion: one transition service. A physical job is done
 * from on site with what happened and a price or no-charge; remote work and
 * office corrections are explicit exceptions; Orvius never marks a job done;
 * reopening keeps completion and money facts and re-checks the schedule.
 * Disposable database, no providers.
 */
import assert from "node:assert/strict";
import { mock, test } from "node:test";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "RESEND_API_KEY"]) {
  delete process.env[key];
}
const nextServer = await import("next/server");
mock.module("next/server", { namedExports: { ...nextServer, after: () => {} } });

const { completionAmountCents, completionDecision, transitionJob, JOB_TRANSITION_POLICY_VERSION } = await import("../src/lib/job-transition.ts");
const { invoiceCompletedJob } = await import("../src/lib/invoice-pay.ts");
const { updateJobStatus, JobTransitionError } = await import("../src/lib/job.ts");
const { parseOwnerCommand, handleOwnerText } = await import("../src/lib/owner-text-commands.ts");
const { prisma } = await import("../src/lib/prisma.ts");

const uid = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const DAY = 24 * 60 * 60_000;
const owner = { kind: "owner", email: "owner@example.test" };

async function makeShop(policy) {
  const shop = await prisma.business.create({
    data: {
      name: "Truth HVAC",
      slug: `truth-${uid()}`,
      environment: "test",
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      ownerEmail: `owner-${uid()}@example.test`,
      ownerPhone: `+1312555${String(Math.floor(Math.random() * 9000) + 1000)}`,
      ...(policy ? { operatingPolicy: { create: policy } } : {}),
    },
  });
  made.push(shop.id);
  return shop;
}
const job = (shop, data = {}) => prisma.job.create({ data: { businessId: shop.id, title: "Visit", serviceType: "AC repair", status: "on_site", durationMin: 60, ...data } });
const rejects = (promise, status, re) =>
  assert.rejects(promise, (e) => e instanceof JobTransitionError && e.status === status && (!re || re.test(e.message)));

test.after(async () => {
  for (const id of made) await prisma.business.delete({ where: { id } }).catch(() => {});
});

const decide = (over) =>
  completionDecision({ from: "on_site", actor: owner, evidence: { resolutionCode: "repaired", finalAmountCents: 20_000 }, remoteCompletionAllowed: false, hasLineItems: false, ...over });

test("completion rules: who, from where, what happened, and the price or no charge", () => {
  assert.equal(decide({}).ok, true);
  for (const kind of ["ai", "system"]) assert.equal(decide({ actor: { kind } }).status, 403, `${kind} can't complete`);
  assert.equal(decide({ from: "en_route" }).status, 409, "a physical job is finished from on site");
  assert.equal(decide({ from: "cancelled" }).status, 409);
  assert.equal(decide({ evidence: { finalAmountCents: 100 } }).status, 422, "what happened is required");
  assert.equal(decide({ evidence: { resolutionCode: "repaired" } }).status, 422, "a price or no charge is required");
  assert.equal(decide({ evidence: { resolutionCode: "repaired" }, hasLineItems: true }).ok, true, "work lines price it");
  assert.equal(decide({ evidence: { resolutionCode: "repaired", noCharge: true } }).plan.noCharge, true);
  assert.equal(decide({ evidence: { resolutionCode: "repaired", finalAmountCents: -5 } }).status, 422);
});

test("remote completion only when the shop switched it on, and only for work that can be done remotely", () => {
  const remote = (code, allowed) => decide({ from: "scheduled", remoteCompletionAllowed: allowed, evidence: { path: "remote", resolutionCode: code, noCharge: true } });
  assert.equal(remote("repaired", false).status, 409);
  assert.equal(remote("installed", true).status, 422);
  const ok = remote("diagnostic_only", true);
  assert.equal(ok.ok, true);
  assert.equal(ok.plan.evidenceSource, "remote_service");
});

test("a correction is the owner's or a manager's, with a reason and how they know", () => {
  const correct = (over) => decide({ from: "scheduled", reason: "Customer called to say it's fixed", evidence: { path: "correction", evidenceSource: "customer_confirmed", resolutionCode: "repaired", noCharge: true }, ...over });
  assert.equal(correct({}).ok, true);
  assert.equal(correct({ actor: { kind: "manager", email: "m@x.test" } }).ok, true);
  assert.equal(correct({ actor: { kind: "dispatcher", email: "d@x.test" } }).status, 403);
  assert.equal(correct({ actor: { kind: "technician" } }).status, 403);
  assert.equal(correct({ reason: "" }).status, 422);
  assert.equal(correct({ evidence: { path: "correction", evidenceSource: "vibes", resolutionCode: "repaired", noCharge: true } }).status, 422);
});

test("Orvius can't mark a job done, and the old status writer refuses completion outright", async () => {
  const shop = await makeShop();
  const j = await job(shop);
  await rejects(transitionJob({ businessId: shop.id, jobId: j.id, to: "completed", actor: { kind: "ai" }, via: "system", completion: { resolutionCode: "repaired", noCharge: true } }), 403);
  await assert.rejects(updateJobStatus(j.id, "completed"), JobTransitionError);
  assert.equal((await prisma.job.findUnique({ where: { id: j.id } })).status, "on_site");
});

test("no-charge is $0 even when the job has priced lines, and those lines are the bill otherwise", () => {
  const lines = [
    { kind: "service", quantity: 1, unitCents: 18_000 },
    { kind: "discount", quantity: 1, unitCents: 3_000 },
  ];
  assert.equal(completionAmountCents({ noCharge: true, typedCents: 25_000, lines }), 0);
  assert.equal(completionAmountCents({ noCharge: false, typedCents: 25_000, lines }), 15_000);
  assert.equal(completionAmountCents({ noCharge: false, typedCents: 25_000, lines: [] }), 25_000);
});

test("marking a lined job no-charge does not leave a bill for the lines", async () => {
  const shop = await makeShop();
  const j = await job(shop);
  await prisma.jobLineItem.create({ data: { businessId: shop.id, jobId: j.id, name: "Capacitor", kind: "part", quantity: 1, unitCents: 18_000 } });
  await transitionJob({
    businessId: shop.id,
    jobId: j.id,
    to: "completed",
    actor: { kind: "technician" },
    via: "tech_app",
    completion: { resolutionCode: "repaired", noCharge: true },
  });
  const done = await prisma.job.findUnique({ where: { id: j.id } });
  assert.equal(done.finalAmountCents, 0);
  assert.deepEqual(await invoiceCompletedJob(j.id), { invoiced: false, reason: "no_amount" });
});

test("a lined job is billed the lines, not a stale or missing total", async () => {
  const shop = await makeShop();
  const j = await job(shop, { finalAmountCents: 1_00 });
  await prisma.jobLineItem.create({ data: { businessId: shop.id, jobId: j.id, name: "Diagnostic", kind: "service", quantity: 1, unitCents: 15_000 } });
  await transitionJob({
    businessId: shop.id,
    jobId: j.id,
    to: "completed",
    actor: { kind: "technician" },
    via: "tech_app",
    completion: { resolutionCode: "diagnostic_only" },
  });
  assert.equal((await prisma.job.findUnique({ where: { id: j.id } })).finalAmountCents, 15_000);
  const billed = await invoiceCompletedJob(j.id);
  assert.equal(billed.invoiced, true);
  assert.equal(billed.invoice.amountCents, 15_000);
  assert.equal(billed.invoice.status, "open");
});

test("a field completion records the path, disposition and policy version", async () => {
  const shop = await makeShop();
  const j = await job(shop);
  await transitionJob({ businessId: shop.id, jobId: j.id, to: "completed", actor: { kind: "technician" }, via: "tech_app", completion: { resolutionCode: "repaired", finalAmountCents: 25_000 } });
  const done = await prisma.job.findUnique({ where: { id: j.id } });
  assert.equal(done.status, "completed");
  assert.equal(done.finalAmountCents, 25_000);
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, entityId: j.id, action: "job.status_changed" } });
  const detail = JSON.parse(audit.detailJson);
  assert.equal(detail.policyVersion, JOB_TRANSITION_POLICY_VERSION);
  assert.equal(detail.path, "field");
  assert.equal(detail.disposition, "priced");
});

test("remote completion works for a shop that switched it on", async () => {
  const shop = await makeShop({ travelMode: "duration_only", remoteCompletionAllowed: true });
  const j = await job(shop, { status: "scheduled" });
  await transitionJob({ businessId: shop.id, jobId: j.id, to: "completed", actor: owner, via: "dashboard", completion: { path: "remote", resolutionCode: "diagnostic_only", finalAmountCents: 4_900 } });
  assert.equal((await prisma.job.findUnique({ where: { id: j.id } })).status, "completed");
});

test("an office correction lands as its own visible action", async () => {
  const shop = await makeShop();
  const j = await job(shop, { status: "scheduled" });
  await transitionJob({
    businessId: shop.id,
    jobId: j.id,
    to: "completed",
    actor: { kind: "manager", email: "mgr@example.test" },
    via: "dashboard",
    reason: "Tech forgot to tap arrived; paper ticket signed",
    completion: { path: "correction", evidenceSource: "paper_ticket", resolutionCode: "maintenance", finalAmountCents: 12_900 },
  });
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, entityId: j.id, action: "job.completion_corrected" } });
  assert.ok(audit);
  assert.equal(audit.actorEmail, "mgr@example.test");
  const detail = JSON.parse(audit.detailJson);
  assert.deepEqual([detail.from, detail.to, detail.evidenceSource, detail.reason], ["scheduled", "completed", "paper_ticket", "Tech forgot to tap arrived; paper ticket signed"]);
});

test("reopening keeps the completion and money facts, never touches the paid invoice, and needs a reason", async () => {
  const shop = await makeShop();
  const completedAt = new Date(Date.now() - DAY);
  const j = await job(shop, { status: "completed", completedAt, resolutionCode: "repaired", finalAmountCents: 30_000 });
  const invoice = await prisma.invoice.create({ data: { businessId: shop.id, jobId: j.id, amountCents: 30_000, status: "paid", paidAt: completedAt, publicToken: `tok-${uid()}` } });
  const payment = await prisma.payment.create({ data: { businessId: shop.id, invoiceId: invoice.id, amountCents: 30_000, status: "succeeded", method: "card" } });

  await rejects(transitionJob({ businessId: shop.id, jobId: j.id, to: "scheduled", actor: { kind: "technician" }, via: "tech_app", reason: "x" }), 403);
  await rejects(transitionJob({ businessId: shop.id, jobId: j.id, to: "scheduled", actor: owner, via: "dashboard" }), 422);
  await rejects(transitionJob({ businessId: shop.id, jobId: j.id, to: "cancelled", actor: owner, via: "dashboard", reason: "wrong job" }), 409, /paid invoice/);

  await transitionJob({ businessId: shop.id, jobId: j.id, to: "scheduled", actor: owner, via: "dashboard", reason: "Still dripping" });
  const reopened = await prisma.job.findUnique({ where: { id: j.id } });
  assert.equal(reopened.status, "scheduled");
  assert.equal(reopened.completedAt.getTime(), completedAt.getTime());
  assert.equal(reopened.resolutionCode, "repaired");
  assert.equal(reopened.finalAmountCents, 30_000);
  assert.equal((await prisma.invoice.findUnique({ where: { id: invoice.id } })).status, "paid");
  assert.ok(await prisma.payment.findUnique({ where: { id: payment.id } }));
  const detail = JSON.parse((await prisma.auditEvent.findFirst({ where: { businessId: shop.id, entityId: j.id, action: "job.reopened" } })).detailJson);
  assert.equal(detail.priorCompletion.resolutionCode, "repaired");
  assert.deepEqual(detail.moneyKept.invoices.map((i) => i.id), [invoice.id]);
  assert.deepEqual(detail.moneyKept.payments.map((p) => p.id), [payment.id]);
});

test("reopening into a slot that now clashes asks first, and an override is recorded", async () => {
  const shop = await makeShop();
  const ana = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
  const at = new Date(Date.now() + 2 * DAY);
  await job(shop, { status: "scheduled", technicianId: ana.id, scheduledAt: at });
  const j = await job(shop, { status: "cancelled", technicianId: ana.id, scheduledAt: at });
  await rejects(transitionJob({ businessId: shop.id, jobId: j.id, to: "scheduled", actor: owner, via: "dashboard", reason: "Customer still wants it" }), 409, /Ana already has a job/);
  await transitionJob({ businessId: shop.id, jobId: j.id, to: "scheduled", actor: owner, via: "dashboard", reason: "Customer still wants it", allowClash: true });
  const override = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, entityId: j.id, action: "job.schedule_override" } });
  assert.ok(override);
  assert.equal(JSON.parse(override.detailJson).reason, "Customer still wants it");
});

test("owner text: a bare DONE never completes; DONE <total|NO CHARGE> <what happened> does, on the record", async () => {
  assert.deepEqual(parseOwnerCommand("done no charge diagnosed"), { kind: "done", amountCents: null, noCharge: true, outcome: "diagnostic_only" });
  assert.deepEqual(parseOwnerCommand("DONE 450 FIXED"), { kind: "done", amountCents: 45000, outcome: "repaired" });
  assert.equal(parseOwnerCommand("done 450 because reasons"), null);

  const shop = await makeShop();
  const j = await job(shop, { status: "en_route" });
  const ref = { id: shop.id, name: shop.name, timezone: shop.timezone, ownerPhone: shop.ownerPhone };
  assert.match(await handleOwnerText({ shop: ref, body: "done", now: new Date() }), /say the total and what happened/);
  assert.equal((await prisma.job.findUnique({ where: { id: j.id } })).status, "en_route");
  await handleOwnerText({ shop: ref, body: "done no charge diagnosed", now: new Date() });
  const done = await prisma.job.findUnique({ where: { id: j.id } });
  assert.equal(done.status, "completed");
  assert.equal(done.resolutionCode, "diagnostic_only");
  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, entityId: j.id, action: "job.completion_corrected" } });
  assert.equal(JSON.parse(audit.detailJson).evidenceSource, "owner_report");
});
