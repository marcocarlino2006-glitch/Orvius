import { afterResponse } from "@/lib/after-response";
import { linkTouchToCustomer } from "@/lib/customer";
import { sendCustomerConfirmSms } from "@/lib/customer-confirm";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import {
  DEFAULT_JOB_DURATION_MIN,
  findAvailableSchedules,
  formatShopTime,
  MAX_SCHEDULE_DAYS,
  SLOT_STEP_MIN,
  type BusyWindow,
  type SlotPreference,
} from "@/lib/availability";
import { ensureBookingDepositForJob } from "@/lib/booking-deposit";
import { getBusyWindows } from "@/lib/busy-calendar";
import { getExternalSchedule, type ExternalBooking } from "@/lib/fsm-schedule";
import { closureWindows, parseClosures } from "@/lib/shop-closures";
import { createAuditQueue, recordAudit, type AuditActor, type AuditQueue } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { notifyTechOnAssign } from "@/lib/notify-tech-assign";
import { notifyCustomerOnTheWay } from "@/lib/on-the-way";
import { classifyRequest } from "@/lib/trade-playbooks";
import { parseSkills, recommendTechnician } from "@/lib/technician-match";
import { slotHasRoom, techUnavailable, type TechShift } from "@/lib/tech-hours";
import { adjacentJobs, authorizeScheduleOverride, gapClashWords, getSchedulingPolicy, scheduleOverrideRecord, techNeighbours } from "@/lib/scheduling-policy";
import { prisma } from "@/lib/prisma";
import { isAfterHours, parseJson, type BusinessHours } from "@/lib/business";
import { jobTitle } from "@/lib/job-schedule";
import { isDatabaseBusy } from "@/lib/webhook-events";
import { jobTransitionProblem, type JobStatus } from "@/lib/job-status";

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
  invoices: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { id: true, amountCents: true, status: true, sentAt: true, payments: { select: { amountCents: true, status: true } } },
  },
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
      optionsJson: true,
      chosenOption: true,
      publicToken: true,
      sentAt: true,
      acceptedAt: true,
      invoice: {
        select: {
          id: true,
          amountCents: true,
          status: true,
          sentAt: true,
          payments: { select: { id: true, amountCents: true, status: true, method: true } },
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
   * Count only holds sequenced before this one, so a caller re-checking its
   * own fresh hold yields to earlier callers but not to later ones. A hold not
   * yet sequenced will number after this one and yield to it, so counting it
   * too would let every racer lose.
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
  const [existing, technicians, holds, busy, shop, outside, policy] = await Promise.all([
    prisma.job.findMany({
      where: {
        businessId: params.businessId,
        status: { notIn: ["completed", "cancelled"] },
        // Only jobs that can overlap the search window (long installs start up to a week early).
        scheduledAt: {
          gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          lte: new Date(now.getTime() + (MAX_SCHEDULE_DAYS + 1) * 24 * 60 * 60 * 1000),
        },
        ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
      },
      select: { scheduledAt: true, durationMin: true, technicianId: true },
    }),
    prisma.technician.findMany({
      where: { businessId: params.businessId, isActive: true },
      select: TECH_SHIFT_SELECT(now),
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
            ? [{ heldSeq: { lt: params.holdsSequencedBefore } }]
            : []),
        ],
      },
      select: { heldSlotAt: true, heldSlotDurationMin: true },
    }),
    getBusyWindows(params.businessId, now),
    prisma.business.findUnique({ where: { id: params.businessId }, select: { closedDatesJson: true } }),
    getExternalSchedule(params.businessId, now),
    getSchedulingPolicy(params.businessId),
  ]);
  // A holiday is a full calendar for every booking path: live calls, auto-booking, reschedules.
  const blocked = [...busy, ...outside.blocked, ...closureWindows(parseClosures(shop?.closedDatesJson), params.timezone, now)];

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

  const shifts = pool.map(toShift);
  const booked = [
    ...relevant.flatMap((job) =>
      job.scheduledAt ? [{ scheduledAt: job.scheduledAt, durationMin: job.durationMin, technicianId: job.technicianId }] : [],
    ),
    ...holds.flatMap((hold) =>
      hold.heldSlotAt ? [{ scheduledAt: hold.heldSlotAt, durationMin: hold.heldSlotDurationMin, technicianId: null }] : [],
    ),
    ...outside.booked,
  ];

  return findAvailableSchedules(
    {
      now,
      urgency: params.urgency,
      durationMin: params.durationMin,
      hoursJson: params.hoursJson,
      timezone: params.timezone,
      capacity: Math.max(1, activeTechnicians),
      blocked,
      hasRoom: (start, durationMin) =>
        slotHasRoom({ pool: shifts, booked, start, durationMin, timezone: params.timezone, gapMin: policy.gapMin }),
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
        ...outside.booked,
      ],
    },
    options,
  );
}

/** Hours and the time off that could still matter from `from` on. */
const TECH_SHIFT_SELECT = (from: Date) => ({
  id: true,
  skillsJson: true,
  hoursJson: true,
  timeOff: { where: { endsAt: { gt: from } }, select: { startsAt: true, endsAt: true } },
});

function toShift(t: { id: string; hoursJson: string; timeOff: { startsAt: Date; endsAt: Date }[] }): TechShift {
  return { id: t.id, hoursJson: t.hoursJson, timeOff: t.timeOff.map((o) => ({ start: o.startsAt, end: o.endsAt })) };
}

/** Thrown inside the booking transaction when the slot filled after it was chosen. */
export class SlotTakenError extends Error {
  constructor(at: Date) {
    super(`Slot ${at.toISOString()} was taken before the booking landed`);
    this.name = "SlotTakenError";
  }
}

/*
 * One shop's bookings take the write lock one at a time. The database has a
 * single writer, so concurrent booking transactions do not run faster — they
 * collide, time out, and turn real bookings into errors. Queuing in the
 * process turns a burst into latency instead of failures; the transaction's
 * own slot re-check stays the guard across processes, where this lock cannot
 * reach. A failed booking never jams the shop behind it.
 */
const bookingTurns = new Map<string, Promise<void>>();

async function withBookingTurn<T>(businessId: string, fn: () => Promise<T>): Promise<T> {
  const prev = bookingTurns.get(businessId) ?? Promise.resolve();
  let release!: () => void;
  const turn = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = prev.then(
    () => turn,
    () => turn,
  );
  bookingTurns.set(businessId, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (bookingTurns.get(businessId) === chained) bookingTurns.delete(businessId);
  }
}

/** A cold snap lands dozens of calls at once; each losing race re-picks. */
const AUTO_PICK_ATTEMPTS = 12;

type BookingTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/** Calendars outside Orvius's own jobs, read once per booking outside the transaction. */
type OutsideTime = { blocked: BusyWindow[]; booked: ExternalBooking[] };

async function outsideTime(businessId: string, timezone: string, now = new Date()): Promise<OutsideTime> {
  const [busy, shop, outside] = await Promise.all([
    getBusyWindows(businessId, now),
    prisma.business.findUnique({ where: { id: businessId }, select: { closedDatesJson: true } }),
    getExternalSchedule(businessId, now),
  ]);
  return {
    blocked: [...busy, ...outside.blocked, ...closureWindows(parseClosures(shop?.closedDatesJson), timezone, now)],
    booked: outside.booked,
  };
}

/**
 * Re-count the slot inside the booking transaction. The slot was chosen from
 * an earlier read, so two bookings landing together could both see it free;
 * reading again on the write path closes most of that gap. Another live
 * caller's hold counts as booked unless this call took its own hold first,
 * and a busy-calendar block or closed day refuses the time outright.
 */
async function assertSlotOpen(tx: BookingTx, params: SlotCheck) {
  if (await slotProblem(tx, params)) throw new SlotTakenError(params.at);
}

type SlotCheck = {
    businessId: string;
    at: Date;
    durationMin: number;
    skill: string;
    timezone: string;
    callId: string | null;
    outside: OutsideTime;
    /** The job being moved, which must not count against its own new time. */
    excludeJobId?: string;
};

async function slotProblem(tx: BookingTx, params: SlotCheck): Promise<"blocked" | "full" | null> {
  const startMs = params.at.getTime();
  const endMs = startMs + params.durationMin * 60_000;
  if (params.outside.blocked.some((w) => w.start.getTime() < endMs && startMs < w.end.getTime())) return "blocked";
  const now = Date.now();
  const own = params.callId
    ? await tx.call.findUnique({ where: { id: params.callId }, select: { heldSeq: true, heldSlotAt: true } })
    : null;
  const policy = await getSchedulingPolicy(params.businessId, tx as never);
  const gapMs = policy.gapMin * 60_000;
  const [jobs, technicians, holds] = await Promise.all([
    tx.job.findMany({
      where: {
        businessId: params.businessId,
        status: { notIn: ["completed", "cancelled"] },
        scheduledAt: { gte: new Date(startMs - 7 * 24 * 60 * 60 * 1000), lt: new Date(endMs + gapMs) },
        ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
      },
      select: { scheduledAt: true, durationMin: true, technicianId: true },
    }),
    tx.technician.findMany({
      where: { businessId: params.businessId, isActive: true },
      select: TECH_SHIFT_SELECT(params.at),
    }),
    tx.call.findMany({
      where: {
        businessId: params.businessId,
        heldSlotAt: { gte: new Date(Math.max(now, startMs - 7 * 24 * 60 * 60 * 1000)), lt: new Date(endMs + gapMs) },
        updatedAt: { gte: new Date(now - HOLD_TTL_MS) },
        ...(params.callId ? { id: { not: params.callId } } : {}),
        AND: [
          { OR: [{ lead: { is: null } }, { lead: { is: { job: { is: null } } } }] },
          ...(own?.heldSlotAt && own.heldSeq != null ? [{ heldSeq: { lt: own.heldSeq } }] : []),
        ],
      },
      select: { heldSlotAt: true, heldSlotDurationMin: true },
    }),
  ]);
  const eligible = technicians.filter((t) => {
    const skills = parseSkills(t.skillsJson);
    return params.skill === "general" || skills.length === 0 || skills.includes(params.skill);
  });
  const pool = eligible.length ? eligible : technicians;
  const poolIds = new Set(pool.map((t) => t.id));
  const booked = [
    ...jobs.flatMap((job) =>
      job.scheduledAt && !(eligible.length && job.technicianId && !poolIds.has(job.technicianId))
        ? [{ scheduledAt: job.scheduledAt, durationMin: job.durationMin, technicianId: job.technicianId }]
        : [],
    ),
    ...holds.flatMap((hold) =>
      hold.heldSlotAt ? [{ scheduledAt: hold.heldSlotAt, durationMin: hold.heldSlotDurationMin, technicianId: null }] : [],
    ),
    ...params.outside.booked,
  ];
  const open = slotHasRoom({
    pool: pool.map(toShift),
    booked,
    start: params.at,
    durationMin: params.durationMin,
    timezone: params.timezone,
    gapMin: policy.gapMin,
  });
  return open ? null : "full";
}

/** Only configured hours count; a shop with none set has not told Orvius when it is closed. */
function outsideShopHours(at: Date, durationMin: number, hoursJson: string | null | undefined, timezone: string): boolean {
  const hours = parseJson<BusinessHours>(hoursJson ?? "{}", {});
  if (!hours || Object.keys(hours).length === 0) return false;
  const lastMinute = new Date(at.getTime() + Math.max(durationMin - 1, 0) * 60_000);
  return isAfterHours(at, hoursJson!, timezone) || isAfterHours(lastMinute, hoursJson!, timezone);
}

/** An owner-picked time that clashes; the owner can still book it after seeing why. */
export class OwnerClashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerClashError";
  }
}

/** A booking over a clash by someone without override authority, or without a reason. */
export class OverrideRefusedError extends Error {
  readonly status: 403 | 422;
  constructor(message: string, status: 403 | 422) {
    super(message);
    this.status = status;
    this.name = "OverrideRefusedError";
  }
}

/**
 * The one check every owner-side schedule write runs — a new job, a move, a
 * reassignment, a text command: shop hours, closed days, the busy calendar, the tech's
 * shift and time off, their other jobs, and whether anyone qualified is free. A clash is a reason the owner sees, not a refusal they can't
 * override.
 */
export async function ownerScheduleClash(params: {
  businessId: string;
  at: Date;
  durationMin: number;
  skill: string;
  timezone: string;
  technicianId: string | null;
  excludeJobId?: string;
}): Promise<string | null> {
  return ownerClash(params);
}

async function ownerClash(params: {
  businessId: string;
  at: Date;
  durationMin: number;
  skill: string;
  timezone: string;
  technicianId: string | null;
  excludeJobId?: string;
}): Promise<string | null> {
  const [outside, shop] = await Promise.all([
    outsideTime(params.businessId, params.timezone),
    prisma.business.findUnique({ where: { id: params.businessId }, select: { hoursJson: true } }),
  ]);
  if (outsideShopHours(params.at, params.durationMin, shop?.hoursJson, params.timezone)) {
    return "That's outside your shop hours.";
  }
  if (params.technicianId) {
    const startMs = params.at.getTime();
    const endMs = startMs + params.durationMin * 60_000;
    if (outside.blocked.some((w) => w.start.getTime() < endMs && startMs < w.end.getTime())) {
      return "Your busy calendar or a closed day already covers that time.";
    }
    const [tech, theirs] = await Promise.all([
      prisma.technician.findUnique({ where: { id: params.technicianId }, select: { name: true, ...TECH_SHIFT_SELECT(params.at) } }),
      prisma.job.findMany({
        where: {
          businessId: params.businessId,
          technicianId: params.technicianId,
          status: { notIn: ["completed", "cancelled"] },
          scheduledAt: { gte: new Date(startMs - 7 * 24 * 60 * 60 * 1000), lt: new Date(endMs) },
          ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
        },
        select: { scheduledAt: true, durationMin: true },
      }),
    ]);
    if (!tech) return null;
    const skills = parseSkills(tech.skillsJson);
    if (params.skill !== "general" && skills.length > 0 && !skills.includes(params.skill)) {
      return `${tech.name} isn't set up for this kind of job.`;
    }
    const off = techUnavailable(toShift(tech), params.at, params.durationMin, params.timezone);
    if (off) return `${tech.name} is ${off === "time_off" ? "on time off" : "off shift"} then.`;
    const clash = theirs.some((j) => {
      const s = j.scheduledAt!.getTime();
      return s < endMs && startMs < s + (j.durationMin ?? DEFAULT_JOB_DURATION_MIN) * 60_000;
    });
    if (clash) return `${tech.name} already has a job then.`;
    const policy = await getSchedulingPolicy(params.businessId);
    if (policy.gapMin > 0) {
      const neighbours = await techNeighbours({ ...params, technicianId: params.technicianId, gapMin: policy.gapMin });
      const check = adjacentJobs({ start: params.at, durationMin: params.durationMin, gapMin: policy.gapMin, jobs: neighbours });
      const words = gapClashWords(tech.name, check, policy.gapMin);
      if (words) return words;
    }
    // Visits booked in the shop's field software aren't tied to a technician here, so they count against the team.
    if (outside.booked.length && (await slotProblem(prisma, { ...params, callId: null, outside })) === "full") {
      return "Your field software already has the team booked then.";
    }
    return null;
  }
  const problem = await slotProblem(prisma, { ...params, callId: null, outside });
  if (problem === "blocked") return "Your busy calendar or a closed day already covers that time.";
  if (problem === "full") return "Everyone who can do this job is booked, off, or held by a live caller then.";
  return null;
}

/** Thrown inside the booking transaction when the same caller's other call booked first. */
export class RepeatCallerError extends Error {
  readonly job: { id: string; title: string | null; scheduledAt: Date | null };
  constructor(job: { id: string; title: string | null; scheduledAt: Date | null }) {
    super(`Caller already has job ${job.id}`);
    this.job = job;
    this.name = "RepeatCallerError";
  }
}

export async function createJobFromLead(params: {
  leadId: string;
  scheduledAt?: Date | string | null;
  notes?: string | null;
  /** Who booked it, for the audit trail. Auto-book is Orvius. */
  actor?: AuditActor;
  /** Skip automatic technician assignment (the caller assigns). */
  skipAutoAssign?: boolean;
  /**
   * Refuse a time that is already full instead of overbooking it. Owners may
   * overbook on purpose; a time a caller was promised may not.
   */
  enforceCapacity?: boolean;
  /**
   * Refuse when this caller already has an open job created since then. Auto-book
   * checks before booking, but a dropped call and its callback can both pass that
   * read; the check inside the transaction is the one that holds.
   */
  repeatSince?: { at: Date; statuses: string[] };
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
        jobLengthsJson: true,
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

  /*
    The first pick is the earliest open time. After losing a race, every other
    loser would re-pick the same next time and collide again, so a retry takes
    one of the next few at random and a burst spreads across them.
  */
  const pickSlot = async (spread = 1) => {
    const open = await findOpenSlots(
      {
        businessId: lead.businessId!,
        urgency: lead.urgency,
        durationMin,
        skill: playbook.service.skill,
        hoursJson: lead.business?.hoursJson ?? "{}",
        timezone: lead.business?.timezone ?? "America/New_York",
      },
      { count: spread },
    );
    const available = open[Math.floor(Math.random() * open.length)];
    if (!available) {
      throw new Error(
        "No appointment capacity in the next 14 days. Keep the lead open for manual scheduling.",
      );
    }
    return available;
  };

  let scheduledAt: Date;
  if (params.scheduledAt) {
    scheduledAt = new Date(params.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new Error("Invalid appointment time");
    }
  } else {
    scheduledAt = await pickSlot();
  }
  const checkSlot = !params.scheduledAt || params.enforceCapacity === true;
  const outside = checkSlot
    ? await outsideTime(lead.businessId!, lead.business?.timezone ?? "America/New_York")
    : { blocked: [], booked: [] };

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
  let job: Awaited<ReturnType<typeof bookInTransaction>>;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        job = await withBookingTurn(lead.businessId!, bookInTransaction);
        break;
      } catch (error) {
        // A burst of callers books at once; a lock collision says nothing
        // about the slot, so the same time is tried again instead of failing
        // the caller. The transaction rolled back, so nothing half-exists.
        // Same-shop bookings already queue above, so this is for collisions
        // with other shops' writes, which clear in milliseconds.
        if (isDatabaseBusy(error) && attempt < 4) {
          await new Promise((resolve) => setTimeout(resolve, 200 + Math.random() * 500 * (attempt + 1)));
          continue;
        }
        // A time Orvius picked is re-picked; a promised or owner-chosen time is reported, never moved.
        if (!(error instanceof SlotTakenError) || params.scheduledAt || attempt >= AUTO_PICK_ATTEMPTS - 1) throw error;
        await new Promise((resolve) => setTimeout(resolve, 15 + Math.random() * 60 * (attempt + 1)));
        scheduledAt = await pickSlot(3 + attempt * 3);
      }
    }
  } catch (error) {
    // The database's unique Lead → Job edge is the final idempotency lock.
    // Two webhook/view requests may both pass the earlier read; the loser of
    // that race should receive the one real job, not turn a valid call into a
    // 500 or send a second confirmation. The winner's job also fills the slot,
    // so a slot-taken refusal is checked against it the same way.
    if (!isUniqueConstraintError(error) && !(error instanceof SlotTakenError)) throw error;
    const existing = await prisma.job.findUnique({
      where: { leadId: lead.id },
    });
    if (!existing) throw error;
    job = existing;
    createdNow = false;
  }

  async function bookInTransaction() {
    return prisma.$transaction(async (tx) => {
      if (params.repeatSince && (customerId || lead.phone)) {
        const earlier = await tx.job.findFirst({
          where: {
            businessId: lead.businessId!,
            leadId: { not: lead.id },
            status: { in: params.repeatSince.statuses },
            createdAt: { gte: params.repeatSince.at },
            AND: [
              { OR: [...(customerId ? [{ customerId }] : []), ...(lead.phone ? [{ lead: { phone: lead.phone } }] : [])] },
              ...(demand.categoryCode ? [{ OR: [{ categoryCode: demand.categoryCode }, { categoryCode: null }] }] : []),
            ],
          },
          select: { id: true, title: true, scheduledAt: true },
        });
        if (earlier) throw new RepeatCallerError(earlier);
      }
      if (checkSlot) {
        await assertSlotOpen(tx, {
          businessId: lead.businessId!,
          at: scheduledAt,
          durationMin,
          skill: playbook.service.skill,
          timezone: lead.business?.timezone ?? "America/New_York",
          callId: lead.callId ?? null,
          outside,
        });
      }
      const created = await tx.job.create({
        data: {
          businessId: lead.businessId!,
          customerId: customerId,
          leadId: lead.id,
          assigneeEmail: lead.assigneeEmail,
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
  }

  /*
    Committing the job and giving it a technician are one turn: the claim
    that assigns the tech runs its own transactions, and under a burst those
    collide the same way the booking itself does. A booking that commits and
    then fails to assign reads as a lost booking, so the turn covers both.
  */
  const settleBooking = async () => {
    const actor = params.actor ?? "orvius";
    const link = {
      // The guard above already threw when the lead has no business.
      businessId: lead.businessId!,
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
      summary: `Booked ${job.title || playbook.service.label} for ${formatShopTime(scheduledAt, lead.business?.timezone ?? "America/New_York")} (${durationMin} min)`,
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
          businessId: lead.businessId!,
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
    return job;
  };
  if (createdNow) {
    job = await withBookingTurn(lead.businessId!, settleBooking);
    const bookedJobId = job.id;
    const businessId = lead.businessId!;
    const confirmLink = { businessId, callId: lead.callId, leadId: lead.id, customerId, jobId: bookedJobId };
    await afterResponse(async () => {
      await closeBookingMoneyLoop({ businessId, leadId: lead.id, jobId: bookedJobId });
      try {
        const confirm = await sendCustomerConfirmSms(bookedJobId, { firstOnly: true });
        await recordAudit({
          ...confirmLink,
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

/**
 * Work the owner booked themselves — a call to their own cell, a walk-in, a
 * repeat customer. It has no lead, so it never counts as work Orvius brought
 * in, but it gets the same tech assignment and customer confirmation.
 */
export async function createOwnerJob(params: {
  businessId: string;
  name?: string | null;
  phone: string;
  serviceType: string;
  address?: string | null;
  notes?: string | null;
  scheduledAt: Date;
  technicianId?: string | null;
  /** The owner saw the clash and chose this time anyway. */
  allowClash?: boolean;
  /** Who is booking, for the audit trail and any override record. */
  bookedBy?: { actor: AuditActor; actorEmail?: string; role: string; reason?: string | null };
}) {
  const business = await prisma.business.findUniqueOrThrow({
    where: { id: params.businessId },
    select: { id: true, name: true, servicesJson: true, jobLengthsJson: true, hoursJson: true, timezone: true, trade: true },
  });
  const name = params.name?.trim() || null;
  const address = params.address?.trim() || null;
  const notes = params.notes?.trim() || null;
  const playbook = classifyRequest({ business, serviceType: params.serviceType, notes, urgency: null });
  const durationMin = playbook.service.durationMin;
  const clash = await ownerClash({
    businessId: business.id,
    at: params.scheduledAt,
    durationMin,
    skill: playbook.service.skill,
    timezone: business.timezone ?? "America/New_York",
    technicianId: params.technicianId ?? null,
  });
  if (clash && !params.allowClash) throw new OwnerClashError(clash);
  const by = params.bookedBy ?? { actor: "owner" as AuditActor, role: "owner" };
  const authority = clash
    ? await authorizeScheduleOverride({ businessId: business.id, actor: { role: by.role, email: by.actorEmail }, reason: by.reason })
    : null;
  if (authority && !authority.ok) throw new OverrideRefusedError(authority.error, authority.status);
  const customer = await linkTouchToCustomer({
    businessId: business.id,
    phone: params.phone,
    name,
    address,
    notes,
  });
  const demand = deriveDemandSignal({
    serviceType: params.serviceType,
    notes,
    address,
    trade: tradeForCapture(business),
  });

  let job = await prisma.job.create({
    data: {
      businessId: business.id,
      customerId: customer?.id ?? null,
      technicianId: params.technicianId ?? null,
      title: jobTitle({ serviceType: params.serviceType, name }),
      serviceType: params.serviceType,
      address,
      notes,
      status: "scheduled",
      scheduledAt: params.scheduledAt,
      durationMin,
      categoryCode: demand.categoryCode,
      postalCode: demand.postalCode,
    },
  });

  const link = { businessId: business.id, callId: null, leadId: null, customerId: customer?.id ?? null, jobId: job.id };
  const audit = createAuditQueue();
  audit.add({
    ...link,
    entityType: "job",
    entityId: job.id,
    actor: by.actor,
    ...(by.actorEmail ? { actorEmail: by.actorEmail } : {}),
    action: "job.booked",
    summary: `Booked by the ${by.actor === "owner" ? "owner" : "team"} — ${params.serviceType}, ${formatShopTime(params.scheduledAt, business.timezone ?? "America/New_York")}`,
    detail: { scheduledAt: params.scheduledAt.toISOString(), durationMin, chosenBy: "owner" },
    idempotencyKey: `job:${job.id}:booked`,
  });
  if (clash && authority?.ok) {
    audit.add({
      ...link,
      entityType: "job",
      entityId: job.id,
      actor: by.actor,
      ...(by.actorEmail ? { actorEmail: by.actorEmail } : {}),
      action: "job.schedule_override",
      summary: `Booked over a clash: ${clash}`,
      detail: await scheduleOverrideRecord({
        businessId: business.id,
        clash,
        before: { at: null, technicianId: null },
        after: { at: params.scheduledAt, technicianId: params.technicianId ?? null },
        durationMin,
        excludeJobId: job.id,
        actor: { role: by.role, email: by.actorEmail },
        authority,
        via: "dashboard",
        notify: { customer: "booking_confirmation", technician: params.technicianId ? "assignment_text" : "none" },
      }),
      idempotencyKey: `job:${job.id}:override`,
    });
  }

  if (params.technicianId) {
    const techId = params.technicianId;
    await afterResponse(async () => {
      try {
        await notifyTechOnAssign({ jobId: job.id, previousTechnicianId: null, nextTechnicianId: techId });
      } catch (error) {
        logWarn("job.owner_assign_notify_error", {
          jobId: job.id,
          error: error instanceof Error ? error.message : "unknown",
        });
      }
    });
  } else {
    job = (
      await autoAssignTechnician({
        job: { id: job.id, scheduledAt: params.scheduledAt, durationMin, technicianId: null },
        skill: playbook.service.skill,
        link,
        audit,
      })
    ).job;
  }
  await audit.flush();

  const bookedJobId = job.id;
  await afterResponse(async () => {
    try {
      const confirm = await sendCustomerConfirmSms(bookedJobId, { firstOnly: true });
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

  return job;
}

class TechTakenError extends Error {}

async function autoAssignTechnician(params: {
  job: { id: string; scheduledAt: Date; durationMin: number; technicianId: string | null };
  skill: string;
  /** false while Orvius may still move the job to another slot. */
  recordUnassigned?: boolean;
  link: { businessId: string; callId: string | null; leadId: string | null; customerId: string | null; jobId: string };
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

  // Concurrent bookings read the same free calendar. The claim is written
  // first inside one transaction, which takes the database's write lock, and
  // the tech's calendar is read after it: the second booking always sees the
  // first one's claim, rolls back and re-ranks, so two calls can never put
  // one tech in two places.
  const gapMs = (await getSchedulingPolicy(link.businessId)).gapMin * 60_000;
  const start = job.scheduledAt.getTime() - gapMs;
  const end = job.scheduledAt.getTime() + job.durationMin * 60_000 + gapMs;
  for (let attempt = 0; ranking.pick && attempt < 3; attempt++) {
    const techId = ranking.pick.technicianId;
    let outcome: "kept" | "gone" | "taken";
    try {
      outcome = await prisma.$transaction(async (tx) => {
        const claimed = await tx.job.updateMany({
          where: { id: job.id, technicianId: null },
          data: { technicianId: techId },
        });
        if (claimed.count !== 1) return "gone" as const;
        const others = await tx.job.findMany({
          where: {
            businessId: link.businessId,
            technicianId: techId,
            id: { not: job.id },
            status: { notIn: ["completed", "cancelled"] },
            scheduledAt: { gte: new Date(start - 7 * 24 * 60 * 60_000), lt: new Date(end) },
          },
          select: { scheduledAt: true, durationMin: true },
        });
        const overlap = others.some((o) => {
          const oStart = o.scheduledAt!.getTime();
          return oStart + (o.durationMin ?? DEFAULT_JOB_DURATION_MIN) * 60_000 > start;
        });
        if (overlap) throw new TechTakenError();
        return "kept" as const;
      });
    } catch (error) {
      if (!(error instanceof TechTakenError)) throw error;
      outcome = "taken";
    }
    if (outcome === "gone") return { job: await prisma.job.findUniqueOrThrow({ where: { id: job.id } }), busy: false };
    if (outcome === "kept") {
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

/** `at` is when it happened in the field; a late "on the way" (an offline phone catching up) is recorded without texting. */
export class JobTransitionError extends Error {
  readonly status: 403 | 404 | 409 | 422;
  constructor(message: string, status: 403 | 404 | 409 | 422 = 409) {
    super(message);
    this.status = status;
    this.name = "JobTransitionError";
  }
}

/**
 * The field steps only (confirmed, on the way, on site, cancelled). Completion
 * and reopening go through `transitionJob`, which checks evidence and authority.
 */
export async function updateJobStatus(jobId: string, status: JobStatus, options: { at?: Date; notifyCustomer?: boolean } = {}) {
  if (status === "completed") throw new JobTransitionError("A job is marked done through transitionJob, with what happened.");
  const current = await prisma.job.findUnique({ where: { id: jobId }, select: { status: true } });
  if (current && current.status !== status && (current.status === "completed" || current.status === "cancelled")) {
    throw new JobTransitionError("Reopen it first.");
  }
  if (current && current.status !== status) {
    const paidInvoice = status === "cancelled" && (await prisma.invoice.count({ where: { jobId, status: { in: ["paid", "partial"] } } })) > 0;
    const problem = jobTransitionProblem(current.status, status, { paidInvoice });
    if (problem) throw new JobTransitionError(problem);
  }
  const data: {
    status: JobStatus;
    confirmedAt?: Date;
    dispatchedAt?: Date;
    onSiteAt?: Date;
  } = { status };

  const at = options.at ?? new Date();
  if (status === "confirmed") data.confirmedAt = at;
  if (status === "en_route") data.dispatchedAt = at;
  if (status === "on_site") data.onSiteAt = at;

  if (status !== "en_route") {
    return prisma.job.update({
      where: { id: jobId },
      data,
    });
  }

  /* Only the request that moves the job into en_route texts the customer, so a double tap
     or the owner and the tech marking it together send one "on the way". */
  const moved = await prisma.job.updateMany({
    where: { id: jobId, status: { not: "en_route" } },
    data,
  });
  if (moved.count && options.notifyCustomer !== false) {
    await notifyCustomerOnTheWay(jobId).catch((error) =>
      logWarn("customer.on_the_way_failed", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  return prisma.job.findUniqueOrThrow({ where: { id: jobId } });
}
