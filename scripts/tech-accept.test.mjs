#!/usr/bin/env node
/*
 * A technician on a job is its own fact. Assigning someone asks them; they
 * answer "I'll take it" or "I can't". Their yes never reads as the
 * customer's, a no takes them off and tells the owner, and the owner sees a
 * job nobody has said yes to before the visit, not after.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

import { buildCommandBoard, techIssue } from "../src/lib/command-board.ts";
import { jobLifecycle, jobSteps } from "../src/lib/job-lifecycle.ts";
import { notifyTechOnAssign, notifyTechPendingJobs } from "../src/lib/notify-tech-assign.ts";
import { techDay, techForToken, techJobDetail, techUpdateJob } from "../src/lib/tech-app.ts";
import { listWork } from "../src/lib/work.ts";

const prisma = new PrismaClient();
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const made = [];
const HOUR = 60 * 60_000;

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: made } } });
  await prisma.$disconnect();
});

async function shopWithJob(job = {}) {
  const shop = await prisma.business.create({
    data: {
      name: "Answer Air",
      slug: `aa-${stamp()}`,
      trade: "HVAC",
      hoursJson: "{}",
      timezone: "America/Chicago",
      servicesJson: "[]",
      environment: "test",
      ownerEmail: `owner-${stamp()}@shop.test`,
    },
  });
  made.push(shop.id);
  const token = `tok-${stamp()}-abcdefghijklmnop`;
  const tech = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana Ruiz", appToken: token, isActive: true } });
  const phone = `+1555${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`;
  const customer = await prisma.customer.create({ data: { businessId: shop.id, name: "Dana Cole", phone, phoneNormalized: phone } });
  const row = await prisma.job.create({
    data: {
      businessId: shop.id,
      customerId: customer.id,
      technicianId: tech.id,
      title: "AC not cooling",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 26 * HOUR),
      techAssignedAt: new Date(),
      techNotifiedAt: new Date(),
      ...job,
    },
  });
  return { shop, tech, token, job: row, session: await techForToken(token) };
}

test("the technician's yes is recorded once and never marks the customer as confirmed", async () => {
  const { shop, job, session } = await shopWithJob();
  const before = await techDay(session);
  assert.equal(before.days.flatMap((d) => d.jobs).find((j) => j.id === job.id).needsAnswer, true);

  const detail = await techUpdateJob(session, job.id, { accept: true });
  assert.equal(detail.job.accepted, true);
  await techUpdateJob(session, job.id, { accept: true });
  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.ok(row.techAcceptedAt);
  assert.equal(row.status, "scheduled", "accepting is not the customer's confirmation");
  assert.equal(row.customerConfirmedAt, null);
  assert.equal(await prisma.auditEvent.count({ where: { businessId: shop.id, jobId: job.id, action: "job.tech_accepted" } }), 1);

  const after = await techDay(session);
  assert.equal(after.days.flatMap((d) => d.jobs).find((j) => j.id === job.id).needsAnswer, false);
});

test("an old 'confirm job' tap from the field counts as the technician's yes, not a status change", async () => {
  const { job, session } = await shopWithJob();
  await techUpdateJob(session, job.id, { status: "confirmed" });
  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(row.status, "scheduled");
  assert.ok(row.techAcceptedAt);
});

test("leaving for the job without tapping accept still records who took it", async () => {
  const { job, session } = await shopWithJob();
  await techUpdateJob(session, job.id, { status: "en_route" });
  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(row.status, "en_route");
  assert.ok(row.techAcceptedAt);
});

test("a no takes the technician off, keeps why, tells the owner, and puts the job in front of them", async () => {
  const { shop, job, session } = await shopWithJob();
  const out = await techUpdateJob(session, job.id, { decline: true, reason: "  Still on the Miller job  " });
  assert.deepEqual(out, { declined: true });

  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(row.technicianId, null);
  assert.equal(row.techDeclinedBy, "Ana Ruiz");
  assert.equal(row.techDeclineReason, "Still on the Miller job");
  assert.equal(row.techAcceptedAt, null);
  assert.equal(row.status, "scheduled", "the visit stays booked; it just needs a technician");

  const audit = await prisma.auditEvent.findFirst({ where: { businessId: shop.id, jobId: job.id, action: "job.tech_declined" } });
  assert.match(audit.summary, /Ana Ruiz can't take the job: "Still on the Miller job"/);
  const alert = await prisma.ownerNotification.findFirst({ where: { businessId: shop.id, dedupeKey: { startsWith: `tech_declined:${job.id}:` } } });
  assert.ok(alert, "the owner is told");
  assert.match(alert.message, /Ana Ruiz can't take Dana Cole's AC not cooling job/);
  assert.match(alert.message, /Assign someone/);

  await assert.rejects(techJobDetail(session, job.id), /isn't on your list anymore/);

  const board = await buildCommandBoard(shop.id);
  const ex = board.lanes.exceptions.find((e) => e.jobId === job.id && e.exception === "tech_declined");
  assert.ok(ex, "Command shows the decline");
  assert.match(ex.title, /Ana Ruiz can't take it/);

  const work = await listWork(shop.id);
  const item = work.items.find((i) => i.key === `job:${job.id}`);
  assert.equal(item.needsYou, true);
  assert.match(item.nextAction, /Assign someone else — Ana Ruiz can't take it/);
  assert.ok(item.problems.some((p) => p.kind === "tech_declined" && p.severity === "critical"));
});

test("a technician who never answered is what Work tells the owner to fix, not the customer", async () => {
  const { shop, tech, job } = await shopWithJob({
    scheduledAt: new Date(Date.now() + 3 * HOUR),
    techAssignedAt: new Date(Date.now() - 3 * HOUR),
    techNotifiedAt: new Date(Date.now() - 3 * HOUR),
    customerConfirmSentAt: new Date(),
  });
  await prisma.technician.update({ where: { id: tech.id }, data: { phone: "+15555550140" } });
  const item = (await listWork(shop.id)).items.find((i) => i.key === `job:${job.id}`);
  assert.ok(item.problems.some((p) => p.kind === "tech_unanswered"));
  assert.equal(item.nextAction, "Call Ana Ruiz");
  assert.equal(item.waitingOn, "you");
});

test("a technician with no number gets a Team fix, not a call that can't happen", async () => {
  const { shop, job } = await shopWithJob({
    scheduledAt: new Date(Date.now() + 3 * HOUR),
    techAssignedAt: new Date(Date.now() - 3 * HOUR),
    techNotifiedAt: null,
    customerConfirmSentAt: new Date(),
  });
  const item = (await listWork(shop.id)).items.find((i) => i.key === `job:${job.id}`);
  assert.ok(item.problems.some((p) => p.kind === "tech_unanswered"));
  assert.equal(item.nextAction, "Add Ana Ruiz's mobile number in Team");
  assert.equal(item.waitingOn, "you");

  const board = await buildCommandBoard(shop.id);
  const ex = board.lanes.exceptions.find((e) => e.jobId === job.id && e.exception === "tech_unanswered");
  assert.ok(ex, "Command shows the missing number");
  assert.match(ex.title, /has no number/);
  assert.match(ex.detail, /add Ana Ruiz's mobile number in Team/);

  const steps = jobSteps({ status: "scheduled", createdAt: new Date(), technician: { name: "Ana" }, techAssignedAt: new Date(Date.now() - HOUR), techNotifiedAt: null });
  assert.match(steps.find((s) => s.key === "technician").detail, /Add it in Team/);
});

test("adding the number sends the job texts that were waiting on it", async () => {
  const { shop, tech, job } = await shopWithJob({
    scheduledAt: new Date(Date.now() + 5 * HOUR),
    techAssignedAt: new Date(Date.now() - HOUR),
    techNotifiedAt: null,
  });
  /* A demo shop with no real line simulates its texts, so the send is recorded without Twilio. */
  await prisma.business.update({ where: { id: shop.id }, data: { environment: "demo" } });
  const answered = await prisma.job.create({
    data: {
      businessId: shop.id,
      technicianId: tech.id,
      title: "Already answered",
      status: "scheduled",
      scheduledAt: new Date(Date.now() + 6 * HOUR),
      techAssignedAt: new Date(Date.now() - HOUR),
      techNotifiedAt: new Date(Date.now() - HOUR),
      techAcceptedAt: new Date(Date.now() - 30 * 60_000),
    },
  });
  await prisma.technician.update({ where: { id: tech.id }, data: { phone: "+15555550141" } });

  const flush = await notifyTechPendingJobs({ businessId: shop.id, technicianId: tech.id });
  assert.equal(flush.sent, 1, "the waiting job text goes out");
  assert.equal(flush.skipped, 0);
  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.ok(row.techNotifiedAt, "the send is recorded");
  assert.equal(row.techAssignedAt.getTime(), job.techAssignedAt.getTime(), "the assignment time is untouched");
  const text = await prisma.outboundSms.findFirst({ where: { businessId: shop.id, audience: "tech", jobId: job.id } });
  assert.ok(text, "a tech text is logged against the job");
  assert.match(text.body, /new job assigned/);

  const again = await notifyTechPendingJobs({ businessId: shop.id, technicianId: tech.id });
  assert.deepEqual(again, { sent: 0, skipped: 0 }, "nothing waits twice");
  const untouched = await prisma.job.findUnique({ where: { id: answered.id } });
  assert.equal(untouched.techNotifiedAt.getTime(), answered.techNotifiedAt.getTime());
});

test("a job already under way can't be declined from the field", async () => {
  const { job, session } = await shopWithJob({ status: "en_route", dispatchedAt: new Date() });
  await assert.rejects(techUpdateJob(session, job.id, { decline: true }), /already started/);
  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.ok(row.technicianId, "still on it");
});

test("assigning someone new clears the last answer and the last decline", async () => {
  const { shop, tech, job } = await shopWithJob({ techAcceptedAt: new Date() });
  const other = await prisma.technician.create({ data: { businessId: shop.id, name: "Ben Ito", isActive: true } });
  await prisma.job.update({ where: { id: job.id }, data: { technicianId: other.id, techDeclinedAt: new Date(), techDeclinedBy: "Ana Ruiz" } });
  const sms = await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: tech.id, nextTechnicianId: other.id });
  assert.equal(sms.sent, false, "Ben has no phone on file");
  const row = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(row.techAcceptedAt, null, "Ana's yes isn't Ben's");
  assert.equal(row.techDeclinedAt, null);
  assert.equal(row.techDeclinedBy, null);
  assert.ok(row.techAssignedAt);
  assert.equal(row.techNotifiedAt, null, "no text went out, so none is recorded");
});

test("the owner sees an assignment nobody answered: no text out, a long wait, or a visit coming up", () => {
  const now = new Date("2026-10-13T15:00:00Z");
  const tech = { name: "Ana Ruiz", phone: "+15555550100" };
  const base = { technician: tech, techAcceptedAt: null, techDeclinedAt: null, techDeclinedBy: null, techDeclineReason: null };
  const ago = (ms) => new Date(now.getTime() - ms);
  const ahead = (ms) => new Date(now.getTime() + ms);

  assert.equal(techIssue({ ...base, scheduledAt: ahead(48 * HOUR), techAssignedAt: ago(60_000), techNotifiedAt: null }, now), null, "the text gets a moment to go out");
  assert.match(techIssue({ ...base, scheduledAt: ahead(48 * HOUR), techAssignedAt: ago(5 * 60_000), techNotifiedAt: null }, now).title, /wasn't told/);
  assert.equal(techIssue({ ...base, scheduledAt: ahead(48 * HOUR), techAssignedAt: ago(30 * 60_000), techNotifiedAt: ago(30 * 60_000) }, now), null);
  assert.match(techIssue({ ...base, scheduledAt: ahead(48 * HOUR), techAssignedAt: ago(3 * HOUR), techNotifiedAt: ago(3 * HOUR) }, now).title, /hasn't accepted/);
  assert.match(techIssue({ ...base, scheduledAt: ahead(2 * HOUR), techAssignedAt: ago(10 * 60_000), techNotifiedAt: ago(10 * 60_000) }, now).title, /hasn't accepted/);
  assert.equal(techIssue({ ...base, scheduledAt: ahead(2 * HOUR), techAssignedAt: ago(3 * HOUR), techNotifiedAt: ago(3 * HOUR), techAcceptedAt: ago(HOUR) }, now), null);
  assert.equal(techIssue({ ...base, scheduledAt: ahead(HOUR), techAssignedAt: null, techNotifiedAt: null }, now), null, "jobs assigned before answers existed aren't flagged");
  assert.equal(techIssue({ ...base, technician: null, scheduledAt: ahead(HOUR), techAssignedAt: null, techNotifiedAt: null }, now), null);

  const noNumber = { ...base, technician: { name: "Ana Ruiz", phone: null } };
  const missing = techIssue({ ...noNumber, scheduledAt: ahead(48 * HOUR), techAssignedAt: ago(5 * 60_000), techNotifiedAt: null }, now);
  assert.match(missing.title, /has no number/);
  assert.match(missing.detail, /add Ana Ruiz's mobile number in Team/);
  const silent = techIssue({ ...noNumber, scheduledAt: ahead(48 * HOUR), techAssignedAt: ago(3 * HOUR), techNotifiedAt: ago(3 * HOUR) }, now);
  assert.match(silent.title, /has no number/);
  assert.match(silent.detail, /add their mobile number in Team/);
  const declined = techIssue({ ...base, technician: null, scheduledAt: ahead(HOUR), techAssignedAt: null, techNotifiedAt: null, techDeclinedAt: ago(60_000), techDeclinedBy: "Ana Ruiz", techDeclineReason: "Sick" }, now);
  assert.equal(declined.kind, "tech_declined");
  assert.match(declined.detail, /"Sick"/);
});

test("the job's steps are separate facts, and a later one never fills in an earlier one", () => {
  const now = new Date("2026-10-13T15:00:00Z");
  const created = new Date("2026-10-12T15:00:00Z");
  const at = (key, steps) => steps.find((s) => s.key === key);

  const fresh = jobSteps({ status: "scheduled", createdAt: created, scheduledAt: now, technician: { name: "Ana" }, techAssignedAt: new Date(now.getTime() - HOUR), techNotifiedAt: new Date(now.getTime() - HOUR) }, now);
  assert.deepEqual(fresh.map((s) => s.key), ["booked", "customer", "technician", "en_route", "on_site", "done"]);
  assert.deepEqual(fresh.map((s) => s.state), ["done", "waiting", "waiting", "waiting", "waiting", "waiting"]);
  assert.match(at("technician", fresh).detail, /Ana assigned, hasn't answered yet/);

  const noText = jobSteps({ status: "scheduled", createdAt: created, technician: { name: "Ana" }, techAssignedAt: new Date(now.getTime() - HOUR), techNotifiedAt: null }, now);
  assert.equal(at("technician", noText).state, "problem");

  const failedConfirm = jobSteps({ status: "scheduled", createdAt: created, customerConfirmSentAt: created, customerConfirmFailedAt: created, technician: null }, now);
  assert.equal(at("customer", failedConfirm).state, "problem");
  assert.match(at("customer", failedConfirm).detail, /didn't go through/);

  const rolled = jobSteps({ status: "en_route", createdAt: created, dispatchedAt: now, technician: { name: "Ana" } }, now);
  assert.equal(at("customer", rolled).state, "waiting", "rolling out doesn't mean the customer confirmed");
  assert.match(at("customer", rolled).detail, /Never confirmed/);
  assert.match(at("technician", rolled).detail, /started without tapping accept/);
  assert.equal(at("on_site", rolled).state, "waiting");

  const done = jobSteps({ status: "completed", createdAt: created, customerConfirmedAt: created, techAcceptedAt: created, dispatchedAt: now, onSiteAt: now, completedAt: now, technician: { name: "Ana" } }, now);
  assert.ok(done.every((s) => s.state === "done"));
  assert.match(at("done", done).detail, /outcome not recorded/);

  assert.equal(jobLifecycle({ status: "scheduled", customerConfirmedAt: created, technician: { name: "Ana" } }).tone, "attention");
  assert.match(jobLifecycle({ status: "scheduled", customerConfirmedAt: created, technician: { name: "Ana" } }).detail, /hasn't accepted/);
  assert.match(jobLifecycle({ status: "scheduled", customerConfirmedAt: created, techAcceptedAt: created, technician: { name: "Ana" } }).detail, /Ana accepted/);
});

test("every way the time moves takes back the technician's yes, and both field screens ask instead of confirming", () => {
  assert.match(read("src/app/api/jobs/[id]/route.ts"), /customerConfirmedAt: null, techAcceptedAt: null/);
  assert.match(read("src/lib/copilot-execute.ts"), /customerConfirmedAt: null,\n\s+techAcceptedAt: null/);
  assert.match(read("src/lib/owner-text-commands.ts"), /customerConfirmedAt: null, techAcceptedAt: null/);
  const field = read("src/components/tech-field-client.tsx");
  assert.doesNotMatch(field, /label: "Confirm job"/);
  assert.match(field, /I'll take it/);
  assert.match(field, /I can&apos;t take it/);
  assert.match(read("src/components/tech-app/job.tsx"), /Can you take this job\?/);
  assert.match(read("src/app/api/public/tech/[token]/route.ts"), /body\.status === "confirmed"\) \{[\s\S]*acceptJob/);
  assert.match(read("src/app/dashboard/jobs/[id]/page.tsx"), /jobSteps\(job\)/);
});
