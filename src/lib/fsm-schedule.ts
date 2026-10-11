import { afterResponse } from "@/lib/after-response";
import { MAX_SCHEDULE_DAYS, type BusyWindow } from "@/lib/availability";
import { BUSY_REFRESH_MS, BUSY_STALE_MAX_MS } from "@/lib/busy-calendar";
import { normalizePhone } from "@/lib/customer";
import { housecallScheduledVisits } from "@/lib/housecall";
import { jobberScheduledVisits } from "@/lib/jobber";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { serviceTitanScheduledVisits } from "@/lib/servicetitan";

/**
 * Jobs the shop books in Jobber, Housecall Pro or ServiceTitan never pass
 * through Orvius, so Orvius reads them back and counts each as one person's
 * time taken. Live calls read a cached copy; the 30-minute sweep and a
 * stale read refresh it.
 */

const HORIZON_MS = (MAX_SCHEDULE_DAYS + 1) * 86_400_000;
/** An Orvius job this close to an outside visit for the same phone is the same job, already counted. */
const SAME_JOB_MS = 30 * 60_000;

export type FsmSource = "jobber" | "housecall" | "servicetitan";
type Visit = { start: Date; end: Date; phone: string | null };
export type ExternalBooking = { scheduledAt: Date; durationMin: number; technicianId: null };

const LABEL: Record<FsmSource, string> = { jobber: "Jobber", housecall: "Housecall Pro", servicetitan: "ServiceTitan" };

async function connectedSource(businessId: string): Promise<FsmSource | null> {
  const [jobber, housecall, servicetitan] = await Promise.all([
    prisma.jobberConnection.findUnique({ where: { businessId }, select: { status: true } }),
    prisma.housecallConnection.findUnique({ where: { businessId }, select: { status: true } }),
    prisma.serviceTitanConnection.findUnique({ where: { businessId }, select: { status: true } }),
  ]);
  if (servicetitan?.status === "active") return "servicetitan";
  if (housecall?.status === "active") return "housecall";
  if (jobber?.status === "active") return "jobber";
  return null;
}

async function readVisits(source: FsmSource, businessId: string, from: Date, to: Date): Promise<Visit[] | null> {
  if (source === "jobber") return jobberScheduledVisits(businessId, from, to);
  if (source === "housecall") return housecallScheduledVisits(businessId, from, to);
  return serviceTitanScheduledVisits(businessId, from, to);
}

/** Drop visits that are Orvius's own jobs, booked here and copied over. */
async function withoutOrviusJobs(businessId: string, visits: Visit[], from: Date, to: Date) {
  if (!visits.some((v) => v.phone)) return visits;
  const jobs = await prisma.job.findMany({
    where: { businessId, status: { notIn: ["cancelled"] }, scheduledAt: { gte: new Date(from.getTime() - SAME_JOB_MS), lt: to } },
    select: { scheduledAt: true, customer: { select: { phoneNormalized: true } }, lead: { select: { phone: true } } },
  });
  return visits.filter((v) => {
    if (!v.phone) return true;
    return !jobs.some((j) => {
      const phone = j.customer?.phoneNormalized ?? normalizePhone(j.lead?.phone ?? "");
      return phone === v.phone && Math.abs(j.scheduledAt!.getTime() - v.start.getTime()) <= SAME_JOB_MS;
    });
  });
}

export async function refreshFsmSchedule(businessId: string, now = new Date()): Promise<{ source: FsmSource | null; error: string | null; count: number }> {
  const source = await connectedSource(businessId);
  if (!source) {
    await prisma.business.update({
      where: { id: businessId },
      data: { fsmScheduleJson: null, fsmScheduleSyncedAt: null, fsmScheduleSource: null, fsmScheduleError: null },
    });
    return { source: null, error: null, count: 0 };
  }
  const to = new Date(now.getTime() + HORIZON_MS);
  try {
    const visits = await readVisits(source, businessId, now, to);
    if (!visits) throw new Error(`${LABEL[source]} is no longer connected`);
    const kept = await withoutOrviusJobs(businessId, visits, now, to);
    await prisma.business.update({
      where: { id: businessId },
      data: {
        fsmScheduleJson: JSON.stringify(kept.map((v) => ({ s: v.start.toISOString(), e: v.end.toISOString() }))),
        fsmScheduleSyncedAt: now,
        fsmScheduleSource: source,
        fsmScheduleError: null,
      },
    });
    return { source, error: null, count: kept.length };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 280);
    logWarn("fsm_schedule.refresh_failed", { businessId, source, error: message });
    const shop = await prisma.business.update({
      where: { id: businessId },
      data: { fsmScheduleSource: source, fsmScheduleError: message },
      select: { name: true, ownerPhone: true, ownerEmail: true, fsmScheduleSyncedAt: true },
    });
    if (shop.fsmScheduleSyncedAt && now.getTime() - shop.fsmScheduleSyncedAt.getTime() >= BUSY_STALE_MAX_MS) {
      await enqueueOwnerAlert({
        businessId,
        dedupeKey: `fsm-schedule-unreadable:${now.toISOString().slice(0, 10)}`,
        businessName: shop.name,
        message: `Orvius can't read your ${LABEL[source]} schedule (${message.slice(0, 120)}). Until it can, callers aren't offered times: Orvius takes their details and you call to set the time. Reconnect in Settings > Integrations.`,
        ownerPhone: shop.ownerPhone,
        ownerEmail: shop.ownerEmail,
      }).catch(() => undefined);
    }
    return { source, error: message, count: 0 };
  }
}

function decode(json: string | null): Visit[] {
  if (!json) return [];
  try {
    const rows = JSON.parse(json) as Array<{ s: string; e: string }>;
    return rows.flatMap((r) => {
      const start = new Date(r.s);
      const end = new Date(r.e);
      return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) ? [] : [{ start, end, phone: null }];
    });
  } catch {
    return [];
  }
}

/**
 * Outside jobs as bookings that each use one person, plus a full block when a
 * schedule that has worked before can no longer be read: an old copy would
 * offer times the shop has since filled. A schedule that has never been read
 * blocks nothing; Settings shows why it isn't reading.
 */
export async function getExternalSchedule(businessId: string, now = new Date()): Promise<{ booked: ExternalBooking[]; blocked: BusyWindow[] }> {
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { fsmScheduleJson: true, fsmScheduleSyncedAt: true, fsmScheduleSource: true },
  });
  if (!shop?.fsmScheduleSource) return { booked: [], blocked: [] };
  const syncedAt = shop.fsmScheduleSyncedAt;
  if (!syncedAt) return { booked: [], blocked: [] };
  const age = now.getTime() - syncedAt.getTime();
  let visits: Visit[];
  if (age < BUSY_REFRESH_MS) {
    visits = decode(shop.fsmScheduleJson);
  } else if (age < BUSY_STALE_MAX_MS) {
    visits = decode(shop.fsmScheduleJson);
    await afterResponse(() => refreshFsmSchedule(businessId, now).then(() => undefined));
  } else {
    const fresh = await refreshFsmSchedule(businessId, now);
    if (fresh.error) return { booked: [], blocked: [{ start: now, end: new Date(now.getTime() + HORIZON_MS) }] };
    const reread = await prisma.business.findUnique({ where: { id: businessId }, select: { fsmScheduleJson: true } });
    visits = decode(reread?.fsmScheduleJson ?? null);
  }
  return {
    booked: visits
      .filter((v) => v.end.getTime() > now.getTime())
      .map((v) => ({
        scheduledAt: v.start,
        durationMin: Math.max(15, Math.round((v.end.getTime() - v.start.getTime()) / 60_000)),
        technicianId: null,
      })),
    blocked: [],
  };
}

/** Keep every connected schedule inside the serve-stale window. Runs from the 30-minute line-watch sweep. */
export async function refreshStaleFsmSchedules({ now = new Date(), limit = 50, budgetMs = 15_000 } = {}) {
  const started = Date.now();
  const active = { status: "active" };
  const shops = await prisma.business.findMany({
    where: {
      AND: [
        { OR: [{ jobberConnection: { is: active } }, { housecallConnection: { is: active } }, { serviceTitanConnection: { is: active } }] },
        { OR: [{ fsmScheduleSyncedAt: null }, { fsmScheduleSyncedAt: { lt: new Date(now.getTime() - BUSY_REFRESH_MS) } }] },
      ],
    },
    select: { id: true },
    orderBy: { fsmScheduleSyncedAt: "asc" },
    take: limit,
  });
  let refreshed = 0;
  let failed = 0;
  for (const shop of shops) {
    if (Date.now() - started > budgetMs) break;
    const result = await refreshFsmSchedule(shop.id, now);
    if (result.error) failed += 1;
    else refreshed += 1;
  }
  return { due: shops.length, refreshed, failed };
}

/** A connected schedule that has worked before and hasn't been read in BUSY_STALE_MAX_MS. */
export async function isFsmScheduleUnreadable(businessId: string, now = new Date()) {
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { fsmScheduleSource: true, fsmScheduleSyncedAt: true },
  });
  if (!shop?.fsmScheduleSource || !shop.fsmScheduleSyncedAt) return false;
  return now.getTime() - shop.fsmScheduleSyncedAt.getTime() >= BUSY_STALE_MAX_MS;
}
