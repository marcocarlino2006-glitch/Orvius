import { DEFAULT_JOB_DURATION_MIN } from "@/lib/availability";
import { activeGrantsFor, grantsForActor } from "@/lib/command-authority";
import { prisma } from "@/lib/prisma";

/*
  One scheduling policy per shop, read by every path that books or moves work.
  Travel is whatever the owner said it is: no gap (duration only, no drive-time
  claim) or a fixed minimum gap between one technician's jobs. Orvius never
  estimates drive time, routes, or ETAs on the owner's behalf.
*/

/** Bumped when the checks below change, so an override record says which rules it overrode. */
export const SCHEDULING_POLICY_VERSION = "scheduling-policy-1";

export const MAX_TRAVEL_GAP_MIN = 240;

/** The grant a non-owner needs to book over a scheduling conflict. */
export const SCHEDULE_OVERRIDE_GRANT = "schedule_override";

export type TravelState = "legacy_no_travel_policy" | "not_configured" | "duration_only" | "min_gap";

export type SchedulingPolicy = {
  state: TravelState;
  /** Minutes required between one technician's jobs; 0 unless min_gap. */
  gapMin: number;
  /** Policy row version; 0 for a legacy shop with no row. */
  version: number;
  remoteCompletionAllowed: boolean;
};

type PolicyRow = { travelMode: string; travelGapMin: number | null; version: number; remoteCompletionAllowed: boolean };

type PolicyDb = { shopOperatingPolicy: { findUnique: (args: { where: { businessId: string } }) => Promise<PolicyRow | null> } };

export function policyFromRow(row: PolicyRow | null): SchedulingPolicy {
  if (!row) return { state: "legacy_no_travel_policy", gapMin: 0, version: 0, remoteCompletionAllowed: false };
  const gap = row.travelGapMin ?? 0;
  if (row.travelMode === "min_gap" && Number.isInteger(gap) && gap > 0) {
    return { state: "min_gap", gapMin: gap, version: row.version, remoteCompletionAllowed: row.remoteCompletionAllowed };
  }
  if (row.travelMode === "duration_only") {
    return { state: "duration_only", gapMin: 0, version: row.version, remoteCompletionAllowed: row.remoteCompletionAllowed };
  }
  return { state: "not_configured", gapMin: 0, version: row.version, remoteCompletionAllowed: row.remoteCompletionAllowed };
}

export async function getSchedulingPolicy(businessId: string, db: PolicyDb = prisma as unknown as PolicyDb): Promise<SchedulingPolicy> {
  return policyFromRow(await db.shopOperatingPolicy.findUnique({ where: { businessId } }));
}

/**
 * A row still marked not configured has not chosen how travel works, so callers
 * and the booking page take details and the owner sets the time. New shops are
 * not created in that state: they book the job length and invent no drive time.
 */
export function holdsForApproval(policy: SchedulingPolicy): boolean {
  return policy.state === "not_configured";
}

/**
 * Shops created before a travel choice existed were stored as not configured,
 * which stopped the receptionist from booking. Duration only books the job
 * length. A shop that already picked a gap is left alone.
 */
export async function openUnchosenBooking() {
  const result = await prisma.shopOperatingPolicy.updateMany({
    where: { travelMode: "not_configured" },
    data: { travelMode: "duration_only" },
  });
  return result.count;
}

/** Owner input for the policy, or the reason it is refused. */
export function parsePolicyInput(body: unknown): { travelMode: "duration_only" | "min_gap"; travelGapMin: number | null } | { error: string } {
  const b = (body ?? {}) as { mode?: unknown; gapMin?: unknown };
  if (b.mode === "duration_only") return { travelMode: "duration_only", travelGapMin: null };
  if (b.mode === "min_gap") {
    const gap = b.gapMin;
    if (typeof gap !== "number" || !Number.isInteger(gap) || gap < 1 || gap > MAX_TRAVEL_GAP_MIN) {
      return { error: `Pick a whole number of minutes from 1 to ${MAX_TRAVEL_GAP_MIN}.` };
    }
    return { travelMode: "min_gap", travelGapMin: gap };
  }
  return { error: "Choose duration only (no gap) or a minimum gap between jobs." };
}

type TechJob = { id: string; scheduledAt: Date | null; durationMin: number | null };

export type AdjacentCheck = {
  beforeJobId: string | null;
  afterJobId: string | null;
  /** Minutes between the previous job's end and this start; negative when they overlap. */
  gapBeforeMin: number | null;
  gapAfterMin: number | null;
  /** True when either neighbour is closer than the policy gap. */
  short: boolean;
};

/**
 * The technician's immediately preceding and following open jobs around this
 * slot, and whether either sits closer than the required gap. Only these two
 * are checked: a gap is about getting from one job to the next.
 */
export function adjacentJobs(params: { start: Date; durationMin: number; gapMin: number; jobs: TechJob[] }): AdjacentCheck {
  const startMs = params.start.getTime();
  const endMs = startMs + params.durationMin * 60_000;
  let before: { id: string; end: number } | null = null;
  let after: { id: string; start: number } | null = null;
  for (const j of params.jobs) {
    if (!j.scheduledAt) continue;
    const s = j.scheduledAt.getTime();
    const e = s + (j.durationMin ?? DEFAULT_JOB_DURATION_MIN) * 60_000;
    if (s <= startMs) {
      if (!before || e > before.end) before = { id: j.id, end: e };
    } else if (!after || s < after.start) {
      after = { id: j.id, start: s };
    }
  }
  const gapBeforeMin = before ? Math.round((startMs - before.end) / 60_000) : null;
  const gapAfterMin = after ? Math.round((after.start - endMs) / 60_000) : null;
  const short =
    params.gapMin > 0 &&
    ((gapBeforeMin !== null && gapBeforeMin < params.gapMin) || (gapAfterMin !== null && gapAfterMin < params.gapMin));
  return { beforeJobId: before?.id ?? null, afterJobId: after?.id ?? null, gapBeforeMin, gapAfterMin, short };
}

export function gapClashWords(name: string, check: AdjacentCheck, gapMin: number): string | null {
  if (!check.short) return null;
  const parts: string[] = [];
  if (check.gapBeforeMin !== null && check.gapBeforeMin < gapMin) parts.push(`${Math.max(0, check.gapBeforeMin)} min after their previous job`);
  if (check.gapAfterMin !== null && check.gapAfterMin < gapMin) parts.push(`${Math.max(0, check.gapAfterMin)} min before their next job`);
  return `${name} would start ${parts.join(" and ")}; your policy is at least ${gapMin} min between jobs.`;
}

/** The tech's open jobs that could be either neighbour of this slot. */
export async function techNeighbours(params: {
  businessId: string;
  technicianId: string;
  at: Date;
  durationMin: number;
  gapMin: number;
  excludeJobId?: string;
}): Promise<TechJob[]> {
  const startMs = params.at.getTime();
  const endMs = startMs + params.durationMin * 60_000;
  return prisma.job.findMany({
    where: {
      businessId: params.businessId,
      technicianId: params.technicianId,
      status: { notIn: ["completed", "cancelled"] },
      scheduledAt: { gte: new Date(startMs - 7 * 24 * 60 * 60 * 1000), lt: new Date(endMs + Math.max(params.gapMin, 1) * 60_000 + 24 * 60 * 60 * 1000) },
      ...(params.excludeJobId ? { id: { not: params.excludeJobId } } : {}),
    },
    select: { id: true, scheduledAt: true, durationMin: true },
  });
}

export type OverrideActor = { role: string; email?: string | null };

export type OverrideAuthority =
  | { ok: true; kind: "owner" | "grant"; grantId: string | null; reason: string }
  | { ok: false; status: 403 | 422; error: string };

/**
 * Booking over a scheduling conflict: the owner, or someone the owner granted
 * schedule_override to, and always with a reason.
 */
export async function authorizeScheduleOverride(params: {
  businessId: string;
  actor: OverrideActor;
  reason: string | null | undefined;
  now?: Date;
}): Promise<OverrideAuthority> {
  const reason = params.reason?.trim().slice(0, 300) ?? "";
  if (params.actor.role === "owner") {
    if (!reason) return { ok: false, status: 422, error: "Say why you're booking over this, so the history shows it." };
    return { ok: true, kind: "owner", grantId: null, reason };
  }
  const grants = params.actor.email ? await grantsForActor(params.businessId, params.actor.email) : [];
  const grant = activeGrantsFor(grants, { role: params.actor.role, email: params.actor.email ?? "" }, SCHEDULE_OVERRIDE_GRANT, params.now)[0];
  if (!grant) return { ok: false, status: 403, error: "Only the owner, or someone they've allowed to, can book over a schedule conflict." };
  if (!reason) return { ok: false, status: 422, error: "Say why you're booking over this, so the history shows it." };
  return { ok: true, kind: "grant", grantId: grant.id, reason };
}

export type SourceFreshness = {
  fsmScheduleSource: string | null;
  fsmScheduleSyncedAt: string | null;
  busyCalendarConnected: boolean;
  busyCalendarSyncedAt: string | null;
};

export async function sourceFreshness(businessId: string): Promise<SourceFreshness> {
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { fsmScheduleSource: true, fsmScheduleSyncedAt: true, busyCalendarUrl: true, busyCalendarSyncedAt: true },
  });
  return {
    fsmScheduleSource: shop?.fsmScheduleSource ?? null,
    fsmScheduleSyncedAt: shop?.fsmScheduleSyncedAt?.toISOString() ?? null,
    busyCalendarConnected: Boolean(shop?.busyCalendarUrl),
    busyCalendarSyncedAt: shop?.busyCalendarSyncedAt?.toISOString() ?? null,
  };
}

export type ScheduleSlot = { at: Date | null; technicianId: string | null };

/** Who will hear about the change once it lands. */
export type NotificationPlan = { customer: string; technician: string };

/**
 * The durable record of one override: who, in which role and on what
 * authority, why, the slot before and after, the policy as it stood, the
 * neighbouring jobs, how fresh the outside calendars were, and who is told.
 */
export async function scheduleOverrideRecord(params: {
  businessId: string;
  clash: string;
  before: ScheduleSlot;
  after: ScheduleSlot;
  durationMin: number;
  excludeJobId?: string;
  actor: OverrideActor;
  authority: Extract<OverrideAuthority, { ok: true }>;
  via: "dashboard" | "owner_sms" | "api";
  notify: NotificationPlan;
}) {
  const policy = await getSchedulingPolicy(params.businessId);
  const [freshness, neighbours] = await Promise.all([
    sourceFreshness(params.businessId),
    params.after.at && params.after.technicianId
      ? techNeighbours({
          businessId: params.businessId,
          technicianId: params.after.technicianId,
          at: params.after.at,
          durationMin: params.durationMin,
          gapMin: policy.gapMin,
          excludeJobId: params.excludeJobId,
        })
      : Promise.resolve([]),
  ]);
  const adjacent = params.after.at
    ? adjacentJobs({ start: params.after.at, durationMin: params.durationMin, gapMin: policy.gapMin, jobs: neighbours })
    : null;
  return {
    policyVersion: SCHEDULING_POLICY_VERSION,
    policy: { state: policy.state, gapMin: policy.gapMin, version: policy.version },
    clash: params.clash,
    actor: { role: params.actor.role, email: params.actor.email ?? null },
    authority: { kind: params.authority.kind, grantId: params.authority.grantId },
    reason: params.authority.reason,
    before: { at: params.before.at?.toISOString() ?? null, technicianId: params.before.technicianId },
    after: { at: params.after.at?.toISOString() ?? null, technicianId: params.after.technicianId },
    adjacent,
    sourceFreshness: freshness,
    notify: params.notify,
    via: params.via,
  };
}
