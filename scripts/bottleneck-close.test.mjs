#!/usr/bin/env node
/*
 * The gaps that let a booking go wrong after it was made: a technician who is
 * off or gone keeps their jobs, the final booking check ignores another live
 * caller's hold and the busy calendar, an owner double-books without knowing,
 * an unanswered confirm text waits until it is too late, and the automatic
 * follow-up talks over an owner who is already texting the customer.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

for (const key of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBER", "TWILIO_MESSAGING_SERVICE_SID", "RESEND_API_KEY"]) {
  delete process.env[key];
}

const { handOffTechnicianJobs } = await import("../src/lib/tech-handoff.ts");
const { createJobFromLead, createOwnerJob, OverrideRefusedError, OwnerClashError, SlotTakenError } = await import("../src/lib/job.ts");
const { COMMAND_POLICY_VERSION } = await import("../src/lib/command-authority.ts");
const { collectAttention } = await import("../src/lib/attention-queue.ts");
const { sendLeadFollowUp } = await import("../src/lib/lead-follow-up.ts");

const prisma = new PrismaClient();
const stamp = () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const randomPhone = () => `+1555${2_000_000 + Math.floor(Math.random() * 7.7e6)}`;
const actor = { actor: "owner", actorEmail: "owner@example.com" };

async function shop(extra = {}) {
  return prisma.business.create({
    data: {
      name: "Gap Air",
      slug: `gap-${stamp()}`,
      environment: "test",
      timezone: "America/Chicago",
      hoursJson: "{}",
      servicesJson: "[]",
      ...extra,
    },
  });
}

function futureHour(days) {
  const at = new Date(Date.now() + days * 86_400_000);
  at.setUTCMinutes(0, 0, 0);
  return at;
}

test("time off takes the technician's jobs off them and hands each to someone free", async () => {
  const business = await shop({ autopilot: true });
  try {
    const [ray, ben] = await Promise.all([
      prisma.technician.create({ data: { businessId: business.id, name: "Ray" } }),
      prisma.technician.create({ data: { businessId: business.id, name: "Ben" } }),
    ]);
    const at = futureHour(3);
    const job = await prisma.job.create({
      data: { businessId: business.id, technicianId: ray.id, title: "Tune-up", serviceType: "Tune-up", status: "scheduled", scheduledAt: at, durationMin: 60 },
    });
    const later = await prisma.job.create({
      data: { businessId: business.id, technicianId: ray.id, title: "Later", status: "scheduled", scheduledAt: futureHour(20), durationMin: 60 },
    });
    const startsAt = new Date(at.getTime() - 86_400_000);
    const endsAt = new Date(at.getTime() + 86_400_000);
    await prisma.technicianTimeOff.create({ data: { businessId: business.id, technicianId: ray.id, startsAt, endsAt } });

    const handed = await handOffTechnicianJobs({ businessId: business.id, technician: ray, from: startsAt, to: endsAt, why: "Ray is off", actor });
    assert.deepEqual(handed.map((j) => j.id), [job.id]);
    assert.equal(handed[0].technicianName, "Ben");
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).technicianId, ben.id);
    assert.equal((await prisma.job.findUnique({ where: { id: later.id } })).technicianId, ray.id, "jobs outside the window stay");
    assert.equal(await prisma.auditEvent.count({ where: { businessId: business.id, action: "technician.released", jobId: job.id } }), 1);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a job nobody clearly fits is left unassigned for the owner, not on the absent tech", async () => {
  const business = await shop({ autopilot: true });
  try {
    const ray = await prisma.technician.create({ data: { businessId: business.id, name: "Ray" } });
    const job = await prisma.job.create({
      data: { businessId: business.id, technicianId: ray.id, title: "Repair", status: "scheduled", scheduledAt: futureHour(2), durationMin: 60 },
    });
    await prisma.technician.update({ where: { id: ray.id }, data: { isActive: false } });
    const handed = await handOffTechnicianJobs({ businessId: business.id, technician: ray, from: new Date(), why: "Ray is off the team", actor });
    assert.equal(handed.length, 1);
    assert.equal(handed[0].technicianName, null);
    assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).technicianId, null);
    const items = await collectAttention(business.id);
    assert.ok(items.some((i) => i.id === `unassigned_job:${job.id}`), "shows as Needs a tech");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the final booking check counts another caller's live hold", async () => {
  const business = await shop();
  try {
    const at = futureHour(2);
    const other = await prisma.call.create({
      data: { businessId: business.id, vapiCallId: `hold-${stamp()}`, heldSlotAt: at, heldSlotDurationMin: 120, heldSeq: 1 },
    });
    const lead = await prisma.lead.create({ data: { businessId: business.id, phone: randomPhone(), status: "new" } });
    await assert.rejects(
      createJobFromLead({ leadId: lead.id, scheduledAt: at, enforceCapacity: true, skipAutoAssign: true }),
      (error) => error instanceof SlotTakenError,
    );
    await prisma.call.update({ where: { id: other.id }, data: { updatedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) } });
    const job = await createJobFromLead({ leadId: lead.id, scheduledAt: at, enforceCapacity: true, skipAutoAssign: true });
    assert.equal(job.scheduledAt.getTime(), at.getTime(), "an expired hold no longer blocks");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the caller who held first keeps the time; a later holder does not block them", async () => {
  const business = await shop();
  try {
    const at = futureHour(2);
    const mine = await prisma.call.create({
      data: { businessId: business.id, vapiCallId: `mine-${stamp()}`, heldSlotAt: at, heldSlotDurationMin: 120, heldSeq: 1 },
    });
    await prisma.call.create({
      data: { businessId: business.id, vapiCallId: `late-${stamp()}`, heldSlotAt: at, heldSlotDurationMin: 120, heldSeq: 2 },
    });
    const lead = await prisma.lead.create({ data: { businessId: business.id, phone: randomPhone(), status: "new", callId: mine.id } });
    const job = await createJobFromLead({ leadId: lead.id, scheduledAt: at, enforceCapacity: true, skipAutoAssign: true });
    assert.equal(job.scheduledAt.getTime(), at.getTime());
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a closed day refuses a promised time at the final check", async () => {
  const at = futureHour(4);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  const business = await shop({ closedDatesJson: JSON.stringify([{ date: day, label: "Holiday" }]) });
  try {
    const lead = await prisma.lead.create({ data: { businessId: business.id, phone: randomPhone(), status: "new" } });
    await assert.rejects(
      createJobFromLead({ leadId: lead.id, scheduledAt: at, enforceCapacity: true, skipAutoAssign: true }),
      (error) => error instanceof SlotTakenError,
    );
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("an owner booking on a technician who is busy is asked first, and can book anyway", async () => {
  const business = await shop();
  try {
    const ray = await prisma.technician.create({ data: { businessId: business.id, name: "Ray" } });
    const at = futureHour(2);
    await prisma.job.create({ data: { businessId: business.id, technicianId: ray.id, title: "Existing", status: "scheduled", scheduledAt: at, durationMin: 120 } });
    const booking = { businessId: business.id, phone: randomPhone(), serviceType: "AC repair", scheduledAt: at, technicianId: ray.id };
    await assert.rejects(createOwnerJob(booking), (error) => error instanceof OwnerClashError && /Ray already has a job/.test(error.message));
    assert.equal(await prisma.job.count({ where: { businessId: business.id } }), 1, "nothing booked before the owner decides");
    await assert.rejects(createOwnerJob({ ...booking, allowClash: true }), (error) => error instanceof OverrideRefusedError && error.status === 422, "an override needs a reason");
    const job = await createOwnerJob({ ...booking, allowClash: true, bookedBy: { actor: "owner", role: "owner", reason: "Ray finishes early on Fridays" } });
    assert.equal(job.technicianId, ray.id);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("an owner booking outside shop hours is asked first; a dispatcher needs a grant, and the override records who, why and which rules", async () => {
  const closed = { open: "08:00", close: "17:00", closed: true };
  const week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  const business = await shop({ hoursJson: JSON.stringify(Object.fromEntries(week.map((d) => [d, closed]))) });
  try {
    const booking = { businessId: business.id, phone: randomPhone(), serviceType: "AC repair", scheduledAt: futureHour(3) };
    await assert.rejects(createOwnerJob(booking), (error) => error instanceof OwnerClashError && /outside your shop hours/.test(error.message));
    const asDispatcher = { actor: "teammate", actorEmail: "disp@example.com", role: "dispatcher", reason: "Customer asked for after-hours" };
    await assert.rejects(
      createOwnerJob({ ...booking, allowClash: true, bookedBy: asDispatcher }),
      (error) => error instanceof OverrideRefusedError && error.status === 403,
      "a dispatcher without a grant cannot override",
    );
    const grant = await prisma.commandGrant.create({
      data: {
        businessId: business.id,
        granteeEmail: "disp@example.com",
        action: "schedule_override",
        effect: "books or moves work over a schedule conflict",
        expiresAt: new Date(Date.now() + 86_400_000),
        policyVersion: COMMAND_POLICY_VERSION,
        grantedByEmail: "owner@example.com",
      },
    });
    const job = await createOwnerJob({ ...booking, allowClash: true, bookedBy: asDispatcher });
    let override = null;
    for (let i = 0; i < 20 && !override; i++) {
      override = await prisma.auditEvent.findFirst({ where: { businessId: business.id, action: "job.schedule_override", entityId: job.id } });
      if (!override) await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(override, "the override is on the record");
    assert.equal(override.actor, "teammate");
    assert.equal(override.actorEmail, "disp@example.com");
    const detail = JSON.parse(override.detailJson);
    assert.equal(detail.policyVersion, "scheduling-policy-1");
    assert.equal(detail.policy.state, "legacy_no_travel_policy");
    assert.deepEqual(detail.actor, { role: "dispatcher", email: "disp@example.com" });
    assert.deepEqual(detail.authority, { kind: "grant", grantId: grant.id });
    assert.equal(detail.reason, "Customer asked for after-hours");
    assert.match(detail.clash, /outside your shop hours/);
    assert.equal(detail.after.at, booking.scheduledAt.toISOString());
    assert.ok("sourceFreshness" in detail && "notify" in detail && "adjacent" in detail);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("a confirm text with no reply for 12 hours asks for a call, well before the visit", async () => {
  const business = await shop({ autopilot: true });
  try {
    const job = await prisma.job.create({
      data: {
        businessId: business.id,
        title: "Furnace check",
        status: "scheduled",
        scheduledAt: futureHour(1.5),
        durationMin: 60,
        customerConfirmSentAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    });
    let items = await collectAttention(business.id);
    assert.ok(!items.some((i) => i.id === `needs_customer_confirm:${job.id}`), "still waiting on the customer");

    await prisma.job.update({ where: { id: job.id }, data: { customerConfirmSentAt: new Date(Date.now() - 13 * 60 * 60 * 1000) } });
    items = await collectAttention(business.id);
    const item = items.find((i) => i.id === `needs_customer_confirm:${job.id}`);
    assert.ok(item, "surfaced a day and a half out");
    assert.equal(item.recommendedAction, "Call customer");
    assert.match(item.detail, /No reply to the confirm text/);
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test("the automatic follow-up stays quiet while the owner is texting that customer", async () => {
  const business = await shop({ followUpMode: "auto", trade: "HVAC", environment: "live", vapiPhoneNumber: randomPhone() });
  try {
    const now = new Date("2026-09-29T19:00:00Z");
    const phone = randomPhone();
    const customer = await prisma.customer.create({ data: { businessId: business.id, name: "Ann Cole", phone, phoneNormalized: phone } });
    const lead = await prisma.lead.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        name: "Ann Cole",
        phone,
        serviceType: "AC not cooling",
        urgency: "this-week",
        status: "new",
        createdAt: new Date(now.getTime() - 4 * 3_600_000),
      },
    });
    await prisma.message.create({
      data: { businessId: business.id, phoneNormalized: phone, direction: "out", author: "owner", body: "Can do Friday", createdAt: new Date(now.getTime() - 3_600_000) },
    });
    const sent = [];
    const send = async (p) => (sent.push(p), { sent: true, sid: "SM1" });
    const auto = await sendLeadFollowUp({ businessId: business.id, leadId: lead.id, by: "orvius", now, send });
    assert.equal(auto.sent, false);
    assert.match(auto.reason, /already texting/);
    assert.equal(sent.length, 0);

    const manual = await sendLeadFollowUp({ businessId: business.id, leadId: lead.id, by: actor, now, send });
    assert.equal(manual.sent, true, "the owner can still send it themselves");
  } finally {
    await prisma.business.delete({ where: { id: business.id } }).catch(() => {});
  }
});

test.after(() => prisma.$disconnect());
