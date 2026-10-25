import { shopDayBounds } from "@/lib/availability";
import { priorVisitExcluded } from "@/lib/job-outcome";
import { isAfterHours } from "@/lib/business";
import { COLLECTED_STATUSES, addTotals, moneyTotals, type MoneyTotals } from "@/lib/payment-math";
import { isMoneySchemaDrift } from "@/lib/command-degraded";
import { estimatedRevenueCents, formatCentsExact } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { weekBounds } from "@/lib/tech-timesheet";

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

function shiftDay(isoDay: string, days: number) {
  const [y, m, d] = isoDay.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/*
  Monday, not Sunday. A trades week runs Monday to Saturday with emergencies on
  the weekend attached to the week they interrupt, so a Sunday-aligned bucket
  splits every weekend across two bars. Weeks start at midnight where the shop
  is, not where the server is, so a Sunday-night call stays in its own week.
*/
export function trendWeeks(timezone: string, now = new Date(), count = TREND_WEEKS) {
  const today = shopDayBounds(null, timezone, now).day;
  const current = weekBounds(today, timezone);
  const monday = shopDayBounds(null, timezone, current.start).day;
  const weeks = Array.from({ length: count }, (_, i) => {
    const day = shiftDay(monday, -7 * (count - 1 - i));
    return { day, start: shopDayBounds(day, timezone).start };
  });
  return { weeks, end: current.end };
}

/** Which of the given weeks a moment falls in, or -1 outside them all. */
export function weekIndex(weeks: { start: Date }[], end: Date, at: Date) {
  const t = at.getTime();
  if (weeks.length === 0 || t < weeks[0].start.getTime() || t >= end.getTime()) return -1;
  for (let i = weeks.length - 1; i >= 0; i--) {
    if (t >= weeks[i].start.getTime()) return i;
  }
  return -1;
}

export type ShopOutcomes = {
  windowDays: number;
  since: string;
  calls: number;
  leads: number;
  /** Every job created in the window, including ones the owner added by hand. */
  jobsBooked: number;
  /** Leads in the window that became a job — the numerator of bookingRate. */
  leadsBooked: number;
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
  /** Jobs marked completed in the window — call→cash requires this step. */
  jobsCompleted: number;
  /** Estimated value only: measured captured jobs × owner-entered avg ticket. */
  capturedDemandEstimatedValueCents: number | null;
  /** Money the shop kept from recorded payments and deposits: gross less refunds. Not revenue, not what anyone owes. */
  collectedCents: number;
  /** Gross receipts, refunded and kept, from moneyTotals. */
  money?: MoneyTotals;
  /** Money reads paused (database behind the release); counts stay exact and money is absent, never zeroed. */
  moneyPaused?: boolean;
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
  const timezone = business?.timezone ?? "America/New_York";
  const now = new Date();
  const since = shopDayBounds(
    shiftDay(shopDayBounds(null, timezone, now).day, -windowDays),
    timezone,
  ).start;
  const trend = trendWeeks(timezone, now);
  const trendSince = trend.weeks[0].start;

  const [
    calls,
    leads,
    jobsBooked,
    jobsCompleted,
    capturedDemandJobs,
    unassignedJobs,
    activeTechnicians,
    emergencyLeads,
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
      where: { businessId, createdAt: { gte: since }, ...priorVisitExcluded() },
    }),
    prisma.job.count({
      where: {
        AND: [
          {
            businessId,
            status: "completed",
            OR: [
              { completedAt: { gte: since } },
              { completedAt: null, updatedAt: { gte: since } },
            ],
          },
          priorVisitExcluded(),
        ],
      },
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

  /* The refund columns are the one read that can be ahead of the database.
     When they are missing, money pauses (absent below) and every count
     above stays exact — the same degradation Command uses. */
  const moneyRows = await Promise.all([
    prisma.payment.findMany({
      where: {
        businessId,
        createdAt: { gte: since },
        // Refunded rows still came in once; their refunds come off below. Claims never count.
        status: { in: [...COLLECTED_STATUSES, "refunded"] },
      },
      select: { amountCents: true, status: true, refundedCents: true },
    }),
    // Invoices bill the balance net of any deposit, so deposits add to payments without counting twice.
    prisma.deposit.findMany({
      where: { businessId, status: { in: ["paid", "refunded"] }, paidAt: { gte: since } },
      select: { amountCents: true, status: true, refundedCents: true },
    }),
  ]).catch((error: unknown) => {
    if (isMoneySchemaDrift(error)) return null;
    throw error;
  });

  const leadCount = leads.length;
  const bookedFromLeads = leads.filter((l) => l.job).length;
  const hoursJson = business?.hoursJson ?? "{}";

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

  const money = moneyRows ? addTotals(moneyTotals(moneyRows[0]), moneyTotals(moneyRows[1])) : undefined;
  const collectedCents = money ? money.netCents : 0;
  const openEstimateCents = openEstimates.reduce((sum, e) => sum + e.amountCents, 0);
  const openInvoiceCents = openInvoices.reduce((sum, i) => sum + i.amountCents, 0);

  const economicsReady = Boolean(
    avgTicketCents &&
      avgTicketCents > 0 &&
      baselineMissed != null &&
      baselineJobs != null,
  );

  const weekly: OutcomeWeek[] = trend.weeks.map((week, i) => ({
    start: week.day,
    leads: 0,
    booked: 0,
    partial: i === trend.weeks.length - 1,
  }));
  for (const lead of trendLeads) {
    const i = weekIndex(trend.weeks, trend.end, lead.createdAt);
    if (i < 0) continue;
    weekly[i].leads += 1;
    if (lead.job) weekly[i].booked += 1;
  }

  return {
    windowDays,
    since: since.toISOString(),
    calls,
    leads: leadCount,
    jobsBooked,
    leadsBooked: bookedFromLeads,
    jobsCompleted,
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
    money,
    moneyPaused: moneyRows === null,
    openEstimateCents,
    openInvoiceCents,
    economicsReady,
    weeks: weekly,
  };
}

/** Printable weekly proof block for design-partner artifacts. */
export function formatWeeklyProof(outcomes: ShopOutcomes, shopName: string): string {
  const completedWeeks = outcomes.weeks.filter((week) => !week.partial);
  const latestWeek = completedWeeks.at(-1);
  const priorWeek = completedWeeks.at(-2);
  const lines = [
    `Orvius weekly proof — ${shopName}`,
    `Window: last ${outcomes.windowDays} days (since ${outcomes.since.slice(0, 10)})`,
    `Calls: ${outcomes.calls} · Leads: ${outcomes.leads} · Jobs proposed: ${outcomes.jobsBooked}`,
    outcomes.bookingRate != null ? `Booking rate: ${outcomes.bookingRate}%` : null,
    `After-hours leads: ${outcomes.afterHoursLeads} (booked ${outcomes.afterHoursBooked})`,
    `Booked from captured demand: ${outcomes.capturedDemandJobs} (call/SMS leads → jobs)`,
    outcomes.capturedDemandEstimatedValueCents != null
      ? `Estimated value at owner avg ticket: ${formatCentsExact(outcomes.capturedDemandEstimatedValueCents)}`
      : null,
    latestWeek && priorWeek
      ? `Completed-week trend: ${latestWeek.booked} booked vs ${priorWeek.booked} prior (${latestWeek.leads} leads vs ${priorWeek.leads})`
      : null,
    outcomes.jobsPerWeekVsBaseline != null
      ? `Jobs/week vs owner-reported before-Orvius baseline: ${outcomes.jobsPerWeekVsBaseline >= 0 ? "+" : ""}${outcomes.jobsPerWeekVsBaseline} (context, not attribution)`
      : null,
    outcomes.money && outcomes.money.refundedCents > 0
      ? `Collected (recorded payments): ${formatCentsExact(outcomes.money.grossCents)} · refunded ${formatCentsExact(outcomes.money.refundedCents)} · kept ${formatCentsExact(outcomes.money.netCents)}`
      : `Collected (recorded payments): ${formatCentsExact(outcomes.collectedCents)}`,
    `Open estimates: ${formatCentsExact(outcomes.openEstimateCents)} · Open invoices: ${formatCentsExact(outcomes.openInvoiceCents)}`,
    "Label: booking counts and recorded payments are measured CRM events; dollar value uses owner avg ticket and is not audited GAAP revenue.",
  ];
  return lines.filter(Boolean).join("\n");
}
