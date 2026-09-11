import { isAfterHours } from "@/lib/business";
import { estimatedRevenueCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** How much history the trend draws. Eight weeks fits a screen and a season. */
const TREND_WEEKS = 8;

export type OutcomeWeek = {
  /** Monday of the week, as an ISO date. */
  start: string;
  leads: number;
  booked: number;
  /**
   * The week still in progress. It has to be marked, because a Tuesday-morning
   * bar next to seven finished weeks looks like collapse and is not.
   */
  partial: boolean;
};

/*
  Monday, not Sunday. A trades week runs Monday to Saturday with emergencies on
  the weekend attached to the week they interrupt, so a Sunday-aligned bucket
  splits every weekend across two bars.
*/
function weekStart(at: Date) {
  const start = new Date(at);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export type ShopOutcomes = {
  windowDays: number;
  since: string;
  calls: number;
  leads: number;
  jobsBooked: number;
  bookingRate: number | null;
  afterHoursLeads: number;
  afterHoursBooked: number;
  emergenciesBooked: number;
  unassignedJobs: number;
  activeTechnicians: number;
  jobsPerTech: number | null;
  avgTicketCents: number | null;
  estimatedPipelineCents: number | null;
  estimatedLeadValueCents: number | null;
  /** Owner-reported baseline (before Orvius). */
  baselineMissedCallsPerWeek: number | null;
  baselineJobsPerWeek: number | null;
  /** Weekly-rate comparisons when baseline is set (null if not). */
  callsPerWeekVsBaseline: number | null;
  jobsPerWeekVsBaseline: number | null;
  /** Measured jobs whose originating lead was captured by Orvius call/SMS. */
  capturedDemandJobs: number;
  /** Estimated value only: measured captured jobs × owner-entered avg ticket. */
  capturedDemandEstimatedValueCents: number | null;
  /** CRM money ring — recorded payments / open estimates / open invoices. */
  collectedCents: number;
  openEstimateCents: number;
  openInvoiceCents: number;
  economicsReady: boolean;
  /**
   * Captured demand by week, oldest first, independent of `windowDays` — the
   * trend is about history and the window is about right now.
   */
  weeks: OutcomeWeek[];
};

/**
 * Outcome + economics pulse from existing shop data.
 * Dollar estimates only when avgTicketCents is set — never invented.
 * Collected $ only from recorded Payment rows.
 */
export async function getShopOutcomes(
  businessId: string,
  windowDays = 7,
): Promise<ShopOutcomes> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  since.setHours(0, 0, 0, 0);

  const trendSince = weekStart(new Date());
  trendSince.setDate(trendSince.getDate() - 7 * (TREND_WEEKS - 1));

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      hoursJson: true,
      timezone: true,
      avgTicketCents: true,
      baselineMissedCallsPerWeek: true,
      baselineJobsPerWeek: true,
    },
  });

  const [
    calls,
    leads,
    jobsBooked,
    capturedDemandJobs,
    unassignedJobs,
    activeTechnicians,
    emergencyLeads,
    payments,
    openEstimates,
    openInvoices,
    trendLeads,
  ] = await Promise.all([
    prisma.call.count({
      where: { businessId, createdAt: { gte: since } },
    }),
    prisma.lead.findMany({
      where: { businessId, createdAt: { gte: since } },
      select: {
        id: true,
        createdAt: true,
        urgency: true,
        job: { select: { id: true } },
      },
    }),
    prisma.job.count({
      where: { businessId, createdAt: { gte: since } },
    }),
    prisma.job.count({
      where: {
        businessId,
        createdAt: { gte: since },
        lead: {
          is: {
            OR: [{ callId: { not: null } }, { source: "sms" }],
          },
        },
      },
    }),
    prisma.job.count({
      where: {
        businessId,
        technicianId: null,
        status: { in: ["scheduled", "confirmed", "en_route"] },
      },
    }),
    prisma.technician.count({
      where: { businessId, isActive: true },
    }),
    prisma.lead.count({
      where: {
        businessId,
        createdAt: { gte: since },
        urgency: { contains: "emergency" },
        job: { isNot: null },
      },
    }),
    prisma.payment.findMany({
      where: {
        businessId,
        createdAt: { gte: since },
        status: { in: ["recorded", "paid", "succeeded"] },
      },
      select: { amountCents: true },
    }),
    prisma.estimate.findMany({
      where: {
        businessId,
        createdAt: { gte: since },
        status: { in: ["draft", "sent", "accepted"] },
        invoice: { is: null },
      },
      select: { amountCents: true },
    }),
    prisma.invoice.findMany({
      where: {
        businessId,
        createdAt: { gte: since },
        status: { in: ["draft", "sent", "open"] },
      },
      select: { amountCents: true },
    }),
    /* Bucketed in JS rather than with a date-truncating GROUP BY, which SQLite
       and libsql spell differently and which would hide the empty weeks — and
       an empty week is the most informative bar on the chart. */
    prisma.lead.findMany({
      where: { businessId, createdAt: { gte: trendSince } },
      select: { createdAt: true, job: { select: { id: true } } },
    }),
  ]);

  const leadCount = leads.length;
  const bookedFromLeads = leads.filter((l) => l.job).length;
  const hoursJson = business?.hoursJson ?? "{}";
  const timezone = business?.timezone ?? "America/New_York";

  const afterHoursLeadsList = leads.filter((lead) =>
    isAfterHours(lead.createdAt, hoursJson, timezone),
  );
  const afterHoursLeads = afterHoursLeadsList.length;
  const afterHoursBooked = afterHoursLeadsList.filter((l) => l.job).length;

  const bookingRate =
    leadCount > 0 ? Math.round((bookedFromLeads / leadCount) * 100) : null;
  const jobsPerTech =
    activeTechnicians > 0
      ? Math.round((jobsBooked / activeTechnicians) * 10) / 10
      : null;

  const avgTicketCents = business?.avgTicketCents ?? null;
  const baselineMissed = business?.baselineMissedCallsPerWeek ?? null;
  const baselineJobs = business?.baselineJobsPerWeek ?? null;
  const weeks = windowDays / 7;
  const callsPerWeek = weeks > 0 ? calls / weeks : calls;
  const jobsPerWeek = weeks > 0 ? jobsBooked / weeks : jobsBooked;

  const jobsPerWeekVsBaseline =
    baselineJobs != null && baselineJobs >= 0
      ? Math.round((jobsPerWeek - baselineJobs) * 10) / 10
      : null;

  const collectedCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const openEstimateCents = openEstimates.reduce((sum, e) => sum + e.amountCents, 0);
  const openInvoiceCents = openInvoices.reduce((sum, i) => sum + i.amountCents, 0);

  const economicsReady = Boolean(
    avgTicketCents &&
      avgTicketCents > 0 &&
      baselineMissed != null &&
      baselineJobs != null,
  );

  const currentWeek = weekStart(new Date()).getTime();
  const buckets = new Map<number, { leads: number; booked: number }>();
  for (let i = 0; i < TREND_WEEKS; i++) {
    buckets.set(trendSince.getTime() + i * 7 * 86_400_000, {
      leads: 0,
      booked: 0,
    });
  }
  for (const lead of trendLeads) {
    const key = weekStart(lead.createdAt).getTime();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.leads += 1;
    if (lead.job) bucket.booked += 1;
  }
  const trend: OutcomeWeek[] = [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([at, counts]) => ({
      start: new Date(at).toISOString().slice(0, 10),
      leads: counts.leads,
      booked: counts.booked,
      partial: at === currentWeek,
    }));

  return {
    windowDays,
    since: since.toISOString(),
    calls,
    leads: leadCount,
    jobsBooked,
    bookingRate,
    afterHoursLeads,
    afterHoursBooked,
    emergenciesBooked: emergencyLeads,
    unassignedJobs,
    activeTechnicians,
    jobsPerTech,
    avgTicketCents,
    estimatedPipelineCents: estimatedRevenueCents(avgTicketCents, jobsBooked),
    estimatedLeadValueCents: estimatedRevenueCents(avgTicketCents, leadCount),
    baselineMissedCallsPerWeek: baselineMissed,
    baselineJobsPerWeek: baselineJobs,
    callsPerWeekVsBaseline:
      baselineMissed != null && baselineMissed > 0
        ? Math.round((callsPerWeek - baselineMissed) * 10) / 10
        : null,
    jobsPerWeekVsBaseline,
    capturedDemandJobs,
    capturedDemandEstimatedValueCents: estimatedRevenueCents(
      avgTicketCents,
      capturedDemandJobs,
    ),
    collectedCents,
    openEstimateCents,
    openInvoiceCents,
    economicsReady,
    weeks: trend,
  };
}

/** Printable weekly proof block for design-partner artifacts. */
export function formatWeeklyProof(outcomes: ShopOutcomes, shopName: string): string {
  const lines = [
    `Orvius weekly proof — ${shopName}`,
    `Window: last ${outcomes.windowDays} days (since ${outcomes.since.slice(0, 10)})`,
    `Calls: ${outcomes.calls} · Leads: ${outcomes.leads} · Jobs booked: ${outcomes.jobsBooked}`,
    outcomes.bookingRate != null ? `Booking rate: ${outcomes.bookingRate}%` : null,
    `After-hours leads: ${outcomes.afterHoursLeads} (booked ${outcomes.afterHoursBooked})`,
    `Booked from captured demand: ${outcomes.capturedDemandJobs} (call/SMS leads → jobs)`,
    outcomes.capturedDemandEstimatedValueCents != null
      ? `Estimated value at owner avg ticket: $${(outcomes.capturedDemandEstimatedValueCents / 100).toFixed(0)}`
      : null,
    outcomes.jobsPerWeekVsBaseline != null
      ? `Jobs/week vs owner-reported before-Orvius baseline: ${outcomes.jobsPerWeekVsBaseline >= 0 ? "+" : ""}${outcomes.jobsPerWeekVsBaseline} (context, not attribution)`
      : null,
    `Collected (recorded payments): $${(outcomes.collectedCents / 100).toFixed(0)}`,
    `Open estimates: $${(outcomes.openEstimateCents / 100).toFixed(0)} · Open invoices: $${(outcomes.openInvoiceCents / 100).toFixed(0)}`,
    "Label: booking counts and recorded payments are measured CRM events; dollar value uses owner avg ticket and is not audited GAAP revenue.",
  ];
  return lines.filter(Boolean).join("\n");
}
