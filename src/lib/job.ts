import { afterResponse } from "@/lib/after-response";
import { linkTouchToCustomer } from "@/lib/customer";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import {
  DEFAULT_JOB_DURATION_MIN,
  findAvailableSchedules,
  type SlotPreference,
} from "@/lib/availability";
import { ensureBookingDepositForJob } from "@/lib/booking-deposit";
import { getBusyWindows } from "@/lib/busy-calendar";
import { createAuditQueue, recordAudit, type AuditActor, type AuditQueue } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { classifyRequest } from "@/lib/trade-playbooks";
import { parseSkills, recommendTechnician } from "@/lib/technician-match";
import { prisma } from "@/lib/prisma";
import { jobTitle } from "@/lib/job-schedule";
import {
  isJobOutcomeCode,
  parseFinalAmountCents,
  type JobOutcomeCode,
} from "@/lib/job-outcome";
import type { JobStatus } from "@/lib/job-status";

export { suggestedSchedule, jobTitle } from "@/lib/job-schedule";
export { JOB_STATUSES, isJobStatus, jobStatusLabel } from "@/lib/job-status";
export type { JobStatus } from "@/lib/job-status";

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/*
  Each round of a booking race settles at least one job per free technician,
  and the rest move on together. Four rounds left most of a 20-call burst
  unassigned on top of each other; this covers bursts several times the crew.
*/
const RESLOT_ATTEMPTS = 12;

async function closeBookingMoneyLoop(params: {
  businessId: string;
  leadId: string;
  jobId: string;
}) {
  try {
    const result = await ensureBookingDepositForJob(params);
    if (!result.ok) {
      logWarn("job.booking_deposit_skipped", {
        ...params,
        error: result.error,
      });
    }
  } catch (error) {
    // A payment-side outage must never erase a valid booking.
    logWarn("job.booking_deposit_error", {
      ...params,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

export const JOB_INCLUDE = {
  business: { select: { id: true, name: true, timezone: true, avgTicketCents: true, autopilot: true } },
  customer: {
    select: { id: true, name: true, phone: true, address: true, interactionCount: true },
  },
  lead: { select: { id: true, name: true, phone: true } },
  technician: { select: { id: true, name: true, phone: true } },
  estimate: {
    select: {
      id: true,
      amountCents: true,
      status: true,
      publicToken: true,
      sentAt: true,
      acceptedAt: true,
      invoice: {
        select: {
          id: true,
          amountCents: true,
          status: true,
          payments: { select: { id: true, amountCents: true, status: true } },
        },
      },
    },
  },
} as const;

export function serializeJob<
  T extends {
    scheduledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    confirmedAt?: Date | null;
    customerConfirmedAt?: Date | null;
    dispatchedAt?: Date | null;
    onSiteAt?: Date | null;
    completedAt?: Date | null;
  },
>(job: T) {
  return {
    ...job,
    scheduledAt: job.scheduledAt?.toISOString() ?? null,
    confirmedAt: job.confirmedAt?.toISOString() ?? null,
    customerConfirmedAt: job.customerConfirmedAt?.toISOString() ?? null,
    dispatchedAt: job.dispatchedAt?.toISOString() ?? null,
    onSiteAt: job.onSiteAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** A slot the receptionist held on a live call stays reserved this long if the call never books. */
export const HOLD_TTL_MS = 2 * 60 * 60 * 1000;

type OpenSlotParams = {
  businessId: string;
  urgency: string | null;
  durationMin: number;
  skill: string;
  hoursJson: string;
  timezone: string;
  excludeJobId?: string;
  /** The live call asking, whose own hold must not block it. */
  excludeCallId?: string;
  /**
   * Count only holds sequenced before this one, plus any not yet sequenced, so
   * a caller re-checking its own fresh hold yields to earlier callers but not
   * to later ones — exactly one side of any race keeps the time.
   */
  holdsSequencedBefore?: number;
};

/** First slot in shop hours where a technician who can do this job is free. */
async function findOpenSlot(params: OpenSlotParams): Promise<Date | null> {
  return (await findOpenSlots(params, { count: 1 }))[0] ?? null;
}

/**
 * Open slots for this job, counting booked work and times other live callers
 * are holding, so two callers at once are never offered the same technician.
 */
export async function findOpenSlots(
  params: OpenSlotParams,
  options: { count: number; minGapMin?: number; preference?: SlotPreference; onlyAt?: Date },
): Promise<Date[]> {
  const now = new Date();
  const [existing, technicians, holds, blocked] = await Promise.all([
    prisma.job.findMany({
      where: {
        businessId: params.businessId,
        status: { notIn: ["completed", "cancelled"] },
        scheduledAt: { not: null },
        ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
      },
      select: { scheduledAt: true, durationMin: true, technicianId: true },
    }),
    prisma.technician.findMany({
      where: { businessId: params.businessId, isActive: true },
      select: { id: true, skillsJson: true },
    }),
    prisma.call.findMany({
      where: {
        businessId: params.businessId,
        heldSlotAt: { gte: now },
        updatedAt: { gte: new Date(now.getTime() - HOLD_TTL_MS) },
        ...(params.excludeCallId ? { id: { not: params.excludeCallId } } : {}),
        AND: [
          { OR: [{ lead: { is: null } }, { lead: { is: { job: { is: null } } } }] },
          ...(params.holdsSequencedBefore != null
            ? [{ OR: [{ heldSeq: null }, { heldSeq: { lt: params.holdsSequencedBefore } }] }]
            : []),
        ],
      },
      select: { heldSlotAt: true, heldSlotDurationMin: true },
    }),
    getBusyWindows(params.businessId, now),
  ]);

  // Capacity is the people who can do this job — a furnace call cannot use
  // the cooling specialist's free hour. Unassigned jobs may land on any of
  // them, so they count against this pool too.
  const skill = params.skill;
  const eligible = technicians.filter((t) => {
    const skills = parseSkills(t.skillsJson);
    return skill === "general" || skills.length === 0 || skills.includes(skill);
  });
  const pool = eligible.length ? eligible : technicians;
  const poolIds = new Set(pool.map((t) => t.id));
  const activeTechnicians = pool.length;
  const relevant = eligible.length
    ? existing.filter((j) => !j.technicianId || poolIds.has(j.technicianId))
    : existing;

  return findAvailableSchedules(
    {
      now,
      urgency: params.urgency,
      durationMin: params.durationMin,
      hoursJson: params.hoursJson,
      timezone: params.timezone,
      capacity: Math.max(1, activeTechnicians),
      blocked,
      existing: [
        ...relevant.flatMap((job) =>
          job.scheduledAt
            ? [{ scheduledAt: job.scheduledAt, durationMin: job.durationMin ?? DEFAULT_JOB_DURATION_MIN }]
            : [],
        ),
        ...holds.flatMap((hold) =>
          hold.heldSlotAt
            ? [{ scheduledAt: hold.heldSlotAt, durationMin: hold.heldSlotDurationMin ?? DEFAULT_JOB_DURATION_MIN }]
            : [],
        ),
      ],
    },
    options,
  );
}

export async function createJobFromLead(params: {
  leadId: string;
  scheduledAt?: Date | string | null;
  notes?: string | null;
  /** Who booked it, for the audit trail. Auto-book is Orvius. */
  actor?: AuditActor;
  /** Skip automatic technician assignment (the caller assigns). */
  skipAutoAssign?: boolean;
}) {
  // Parallel instead of `include`, which Prisma runs as one query after another here.
  const [leadRow, existingJob, business] = await Promise.all([
    prisma.lead.findUnique({ where: { id: params.leadId } }),
    prisma.job.findUnique({ where: { leadId: params.leadId } }),
    prisma.business.findFirst({
      where: { leads: { some: { id: params.leadId } } },
      select: {
        id: true,
        name: true,
        servicesJson: true,
        hoursJson: true,
        timezone: true,
        trade: true,
      },
    }),
  ]);

  if (!leadRow) {
    throw new Error("Lead not found");
  }
  const lead = { ...leadRow, job: existingJob, business };

  if (!lead.businessId) {
    throw new Error("Lead is not attached to a business");
  }

  if (lead.job) {
    // Heal orphan jobs that somehow missed customer linking
    if (!lead.job.customerId && (lead.customerId || lead.phone)) {
      if (lead.customerId) {
        await prisma.job.update({
          where: { id: lead.job.id },
          data: { customerId: lead.customerId },
        });
      } else {
        await linkTouchToCustomer({
          businessId: lead.businessId,
          leadId: lead.id,
          jobId: lead.job.id,
          phone: lead.phone,
          name: lead.name,
          email: lead.email,
          address: lead.address,
        });
      }
      const healed = await prisma.job.findUniqueOrThrow({
        where: { id: lead.job.id },
      });
      await closeBookingMoneyLoop({
        businessId: lead.businessId,
        leadId: lead.id,
        jobId: healed.id,
      });
      return healed;
    }
    await closeBookingMoneyLoop({
      businessId: lead.businessId,
      leadId: lead.id,
      jobId: lead.job.id,
    });
    return lead.job;
  }

  // Ensure the shop brain has this customer before the job lands
  let customerId = lead.customerId;
  if (!customerId && lead.phone) {
    const customer = await linkTouchToCustomer({
      businessId: lead.businessId,
      leadId: lead.id,
      callId: lead.callId ?? undefined,
      phone: lead.phone,
      name: lead.name,
      email: lead.email,
      address: lead.address,
      notes: lead.notes,
    });
    customerId = customer?.id ?? null;
  }

  const playbook = classifyRequest({
    business: lead.business ?? {},
    serviceType: lead.serviceType,
    notes: lead.notes,
    urgency: lead.urgency,
  });
  const durationMin = playbook.service.durationMin;

  let scheduledAt: Date;
  if (params.scheduledAt) {
    scheduledAt = new Date(params.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error("Invalid appointment time");
    }
  } else {
    const available = await findOpenSlot({
      businessId: lead.businessId,
      urgency: lead.urgency,
      durationMin,
      skill: playbook.service.skill,
      hoursJson: lead.business?.hoursJson ?? "{}",
      timezone: lead.business?.timezone ?? "America/New_York",
    });
    if (!available) {
      throw new Error(
        "No appointment capacity in the next 14 days. Keep the lead open for manual scheduling.",
      );
    }
    scheduledAt = available;
  }

  const extraNotes = params.notes?.trim();
  const notes = [lead.notes, extraNotes].filter(Boolean).join("\n") || null;

  // Booked work is the half of the dataset that carries a price, so the job
  // has to land on the same code as the call. Leads written before capture
  // existed have none, so re-derive rather than book an uncountable job.
  const demand =
    lead.categoryCode || lead.postalCode
      ? { categoryCode: lead.categoryCode, postalCode: lead.postalCode }
      : deriveDemandSignal({
          serviceType: lead.serviceType,
          notes: lead.notes,
          address: lead.address,
          trade: tradeForCapture(lead.business ?? {}),
        });

  let createdNow = true;
  let job;
  try {
    job = await prisma.$transaction(async (tx) => {
      const created = await tx.job.create({
        data: {
          businessId: lead.businessId!,
          customerId: customerId,
          leadId: lead.id,
          title: jobTitle({ serviceType: lead.serviceType, name: lead.name }),
          serviceType: lead.serviceType,
          urgency: lead.urgency,
          address: lead.address,
          notes,
          status: "scheduled",
          scheduledAt,
          durationMin,
          categoryCode: demand.categoryCode,
          postalCode: demand.postalCode,
        },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: {
          status: "booked",
          closedAt: new Date(),
          firstContactedAt: lead.firstContactedAt ?? new Date(),
          // Backfill the lead too, so the call and the job agree.
          categoryCode: lead.categoryCode ?? demand.categoryCode,
          postalCode: lead.postalCode ?? demand.postalCode,
        },
      });

      if (lead.callId) {
        await tx.call.update({
          where: { id: lead.callId },
          data: { booked: true },
        });
      }

      return created;
    });
  } catch (error) {
    // The database's unique Lead → Job edge is the final idempotency lock.
    // Two webhook/view requests may both pass the earlier read; the loser of
    // that race should receive the one real job, not turn a valid call into a
    // 500 or send a second confirmation.
    if (!isUniqueConstraintError(error)) throw error;
    const existing = await prisma.job.findUnique({
      where: { leadId: lead.id },
    });
    if (!existing) throw error;
    job = existing;
    createdNow = false;
  }

  if (createdNow) {
    const actor = params.actor ?? "orvius";
    const link = {
      businessId: lead.businessId,
      callId: lead.callId,
      leadId: lead.id,
      customerId,
      jobId: job.id,
    };
    // Booking decisions are written in order while assignment keeps working.
    const audit = createAuditQueue();
    audit.add({
      ...link,
      entityType: "job",
      entityId: job.id,
      actor,
      action: "job.booked",
      summary: `Booked ${playbook.service.label.toLowerCase()} for ${scheduledAt.toISOString()} (${durationMin} min)`,
      detail: {
        scheduledAt: scheduledAt.toISOString(),
        durationMin,
        service: playbook.service,
        chosenBy: params.scheduledAt ? "owner" : "first open slot in shop hours",
      },
      idempotencyKey: `job:${job.id}:booked`,
    });

    if (!params.skipAutoAssign && !job.technicianId) {
      // When Orvius chose the time, a lost race for the last free tech moves
      // the job to the next open slot instead of leaving it unassigned.
      const canReslot = !params.scheduledAt;
      let slot = scheduledAt;
      for (let attempt = 0; attempt < RESLOT_ATTEMPTS; attempt++) {
        const last = !canReslot || attempt === RESLOT_ATTEMPTS - 1;
        const outcome = await autoAssignTechnician({
          job: { id: job.id, scheduledAt: slot, durationMin, technicianId: null },
          skill: playbook.service.skill,
          link,
          audit,
          recordUnassigned: last,
        });
        job = outcome.job;
        if (job.technicianId || last || !outcome.busy) {
          if (!job.technicianId && !last) {
            await autoAssignTechnician({
              job: { id: job.id, scheduledAt: slot, durationMin, technicianId: null },
              skill: playbook.service.skill,
              link,
              audit,
              recordUnassigned: true,
            });
          }
          break;
        }
        const next = await findOpenSlot({
          businessId: lead.businessId,
          urgency: lead.urgency,
          durationMin,
          skill: playbook.service.skill,
          hoursJson: lead.business?.hoursJson ?? "{}",
          timezone: lead.business?.timezone ?? "America/New_York",
          excludeJobId: job.id,
        });
        if (!next || next.getTime() === slot.getTime()) {
          await autoAssignTechnician({
            job: { id: job.id, scheduledAt: slot, durationMin, technicianId: null },
            skill: playbook.service.skill,
            link,
            audit,
            recordUnassigned: true,
          });
          break;
        }
        await prisma.job.update({ where: { id: job.id }, data: { scheduledAt: next } });
        audit.add({
          ...link,
          entityType: "job",
          entityId: job.id,
          action: "job.rescheduled",
          summary: `Moved to ${next.toISOString()} — another call took the last free technician at ${slot.toISOString()}`,
          detail: { from: slot.toISOString(), to: next.toISOString() },
          idempotencyKey: `job:${job.id}:reslot:${attempt}`,
        });
        slot = next;
        scheduledAt = next;
      }
    }

    /*
      Deposit link, then the customer's confirmation text (which can carry
      that link). Both already swallow their own failures, so neither could
      ever fail the booking; running them after the response keeps the
      caller's webhook from waiting on Stripe and Twilio.
    */
    await audit.flush();
    const bookedJobId = job.id;
    const businessId = lead.businessId;
    await afterResponse(async () => {
      await closeBookingMoneyLoop({ businessId, leadId: lead.id, jobId: bookedJobId });
      try {
        const confirm = await sendCustomerConfirmSms(bookedJobId);
        await recordAudit({
          ...link,
          entityType: "job",
          entityId: bookedJobId,
          action: confirm.sent ? "customer.confirmation_sent" : "customer.confirmation_skipped",
          summary: confirm.sent
            ? "Texted the customer the proposed window to confirm"
            : `Customer confirmation not sent (${(confirm.reason ?? "unknown").replace(/_/g, " ")})`,
          detail: { reason: confirm.reason ?? null },
          idempotencyKey: `job:${bookedJobId}:confirmation`,
        });
      } catch (error) {
        logWarn("job.customer_confirm_sms_error", {
          jobId: bookedJobId,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    });
  }

  return job;
}

async function autoAssignTechnician(params: {
  job: { id: string; scheduledAt: Date; durationMin: number; technicianId: string | null };
  skill: string;
  /** false while Orvius may still move the job to another slot. */
  recordUnassigned?: boolean;
  link: { businessId: string; callId: string | null; leadId: string; customerId: string | null; jobId: string };
  audit: AuditQueue;
}) {
  const { job, link } = params;
  let ranking = await recommendTechnician({
    businessId: link.businessId,
    scheduledAt: job.scheduledAt,
    durationMin: job.durationMin,
    skill: params.skill,
    excludeJobId: job.id,
  });

  // Concurrent bookings read the same free calendar. Claim, then re-check the
  // tech's calendar: on overlap the older job keeps the tech and this one
  // re-ranks, so two calls can never put one tech in two places.
  for (let attempt = 0; ranking.pick && attempt < 3; attempt++) {
    const techId = ranking.pick.technicianId;
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, technicianId: null },
      data: { technicianId: techId },
    });
    if (claimed.count !== 1) return { job: await prisma.job.findUniqueOrThrow({ where: { id: job.id } }), busy: false };

    const thisJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id }, select: { createdAt: true } });
    const others = await prisma.job.findMany({
      where: {
        businessId: link.businessId,
        technicianId: techId,
        id: { not: job.id },
        status: { notIn: ["completed", "cancelled"] },
        scheduledAt: { not: null },
      },
      select: { id: true, scheduledAt: true, durationMin: true, createdAt: true },
    });
    const start = job.scheduledAt.getTime();
    const end = start + job.durationMin * 60_000;
    const conflict = others.find((o) => {
      const oStart = o.scheduledAt!.getTime();
      const oEnd = oStart + (o.durationMin ?? DEFAULT_JOB_DURATION_MIN) * 60_000;
      const overlapping = start < oEnd && oStart < end;
      const olderWins =
        o.createdAt.getTime() < thisJob.createdAt.getTime() ||
        (o.createdAt.getTime() === thisJob.createdAt.getTime() && o.id < job.id);
      return overlapping && olderWins;
    });
    if (!conflict) {
      params.audit.add({
        ...link,
        entityType: "job",
        entityId: job.id,
        action: "technician.assigned",
        summary: `Assigned ${ranking.pick.name} — ${ranking.pick.reason}`,
        detail: { technicianId: techId, skill: params.skill, considered: ranking.considered },
        idempotencyKey: `job:${job.id}:auto-assign`,
      });
      await afterResponse(async () => {
        try {
          await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: null, nextTechnicianId: techId });
        } catch (error) {
          logWarn("job.auto_assign_notify_error", {
            jobId: job.id,
            error: error instanceof Error ? error.message : "unknown",
          });
        }
      });
      return { job: await prisma.job.findUniqueOrThrow({ where: { id: job.id } }), busy: false };
    }
    await prisma.job.updateMany({ where: { id: job.id, technicianId: techId }, data: { technicianId: null } });
    ranking = await recommendTechnician({
      businessId: link.businessId,
      scheduledAt: job.scheduledAt,
      durationMin: job.durationMin,
      skill: params.skill,
      excludeJobId: job.id,
    });
  }

  const busy = !ranking.pick || ranking.considered.some((c) => c.fit === "busy");
  if (params.recordUnassigned !== false) {
    params.audit.add({
      ...link,
      entityType: "job",
      entityId: job.id,
      action: "technician.unassigned",
      summary: `Left unassigned — ${ranking.blocked ?? "no technician fits"}`,
      detail: { skill: params.skill, considered: ranking.considered },
      idempotencyKey: `job:${job.id}:auto-assign`,
    });
  }
  return { job: await prisma.job.findUniqueOrThrow({ where: { id: job.id } }), busy };
}

export async function updateJobStatus(jobId: string, status: JobStatus) {
  const data: {
    status: JobStatus;
    confirmedAt?: Date;
    dispatchedAt?: Date;
    onSiteAt?: Date;
    completedAt?: Date;
  } = { status };

  if (status === "confirmed") data.confirmedAt = new Date();
  if (status === "en_route") data.dispatchedAt = new Date();
  if (status === "on_site") data.onSiteAt = new Date();
  if (status === "completed") data.completedAt = new Date();

  return prisma.job.update({
    where: { id: jobId },
    data,
  });
}

export async function completeJobWithOutcome(
  jobId: string,
  outcome: {
    resolutionCode: JobOutcomeCode;
    resolutionSummary?: string | null;
    finalAmountCents?: number | null;
  },
) {
  if (!isJobOutcomeCode(outcome.resolutionCode)) {
    throw new Error("Choose what happened before completing the job");
  }
  const finalAmountCents = parseFinalAmountCents(outcome.finalAmountCents);
  if (
    outcome.finalAmountCents != null &&
    finalAmountCents == null
  ) {
    throw new Error("Final amount must be between $0 and $50,000");
  }
  const now = new Date();
  return prisma.job.update({
    where: { id: jobId },
    data: {
      status: "completed",
      completedAt: now,
      resolutionCode: outcome.resolutionCode,
      resolutionSummary: outcome.resolutionSummary?.trim().slice(0, 500) || null,
      finalAmountCents,
      outcomeCapturedAt: now,
    },
  });
}
