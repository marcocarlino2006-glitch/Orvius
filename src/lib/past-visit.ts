import { safeTimezone, zonedWallToUtc } from "@/lib/availability";
import { recordAudit, type AuditActor } from "@/lib/audit";
import { PRIOR_VISIT_CODE } from "@/lib/job-outcome";
import { prisma } from "@/lib/prisma";

/**
 * A visit the shop already did, typed onto the customer. It is finished, it
 * is not a booking, and it does not text anyone, open a bill, or add a review.
 */

export class PastVisitError extends Error {
  readonly status: 404 | 422;
  constructor(message: string, status: 404 | 422 = 422) {
    super(message);
    this.name = "PastVisitError";
    this.status = status;
  }
}

const EARLIEST_YEAR = 1990;

function shopDay(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export async function recordPastVisit(params: {
  businessId: string;
  customerId: string;
  title: string;
  /** The calendar day it happened, YYYY-MM-DD, on the shop's clock. */
  day: string;
  notes?: string | null;
  actor?: { actor: AuditActor; actorEmail?: string | null };
}) {
  const title = params.title.trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 120) {
    throw new PastVisitError("Say what the visit was, in a few words.");
  }
  const notes = params.notes?.trim() || null;
  if (notes && notes.length > 500) throw new PastVisitError("Keep the note under 500 characters.");
  const match = params.day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new PastVisitError("Pick the day it happened.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (year < EARLIEST_YEAR || month < 1 || month > 12 || date < 1 || date > 31) {
    throw new PastVisitError("Pick the day it happened.");
  }

  const [customer, business] = await Promise.all([
    prisma.customer.findFirst({
      where: { id: params.customerId, businessId: params.businessId },
      select: { id: true, address: true },
    }),
    prisma.business.findUnique({ where: { id: params.businessId }, select: { timezone: true } }),
  ]);
  if (!customer || !business) throw new PastVisitError("Customer not found", 404);

  const timezone = safeTimezone(business.timezone ?? "America/New_York");
  const at = zonedWallToUtc(year, month, date, 12, 0, 0, timezone);
  const wanted = `${match[1]}-${match[2]}-${match[3]}`;
  if (shopDay(at, timezone) !== wanted) throw new PastVisitError("Pick the day it happened.");
  if (wanted > shopDay(new Date(), timezone)) {
    throw new PastVisitError("That day hasn't happened. Book a job for work still ahead.");
  }

  const job = await prisma.job.create({
    data: {
      businessId: params.businessId,
      customerId: customer.id,
      title,
      serviceType: title,
      address: customer.address,
      notes,
      status: "completed",
      scheduledAt: at,
      completedAt: at,
      finalAmountCents: 0,
      resolutionCode: PRIOR_VISIT_CODE,
      resolutionSummary: notes,
      outcomeCapturedAt: new Date(),
    },
  });

  await recordAudit({
    businessId: params.businessId,
    entityType: "job",
    entityId: job.id,
    jobId: job.id,
    customerId: customer.id,
    actor: params.actor?.actor ?? "owner",
    ...(params.actor?.actorEmail ? { actorEmail: params.actor.actorEmail } : {}),
    action: "job.past_visit",
    summary: `Wrote an earlier visit onto the record — ${title}`,
    detail: { day: wanted, at: at.toISOString() },
    idempotencyKey: `job:${job.id}:past_visit`,
  });

  return job;
}
