import { isAfterHours } from "@/lib/business";
import { estimatedRevenueCents, recoveredRevenueCents } from "@/lib/money";
import { prisma } from "@/lib/prisma";

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
  /**
   * Jobs attributed to Orvius lift in this window.
   * Method: baseline lift, else after-hours booked jobs.
   */
  recoveredJobsEstimate: number | null;
  recoveredMethod: "baseline_jobs" | "after_hours_booked" | null;
  recoveredRevenueCents: number | null;
  /** CRM money ring — recorded payments / open estimates / open invoices. */
  collectedCents: number;
  openEstimateCents: number;
  openInvoiceCents: number;
  economicsReady: boolean;
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
    unassignedJobs,
    activeTechnicians,
    emergencyLeads,
    payments,
    openEstimates,
    openInvoices,
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

  let recoveredJobsEstimate: number | null = null;
  let recoveredMethod: ShopOutcomes["recoveredMethod"] = null;

  if (jobsPerWeekVsBaseline != null && jobsPerWeekVsBaseline > 0) {
    recoveredJobsEstimate = Math.round(jobsPerWeekVsBaseline * weeks * 10) / 10;
    recoveredMethod = "baseline_jobs";
  } else if (afterHoursBooked > 0) {
    recoveredJobsEstimate = afterHoursBooked;
    recoveredMethod = "after_hours_booked";
  }

  const collectedCents = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const openEstimateCents = openEstimates.reduce((sum, e) => sum + e.amountCents, 0);
  const openInvoiceCents = openInvoices.reduce((sum, i) => sum + i.amountCents, 0);

  const economicsReady = Boolean(
    avgTicketCents &&
      avgTicketCents > 0 &&
      baselineMissed != null &&
      baselineJobs != null,
  );

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
    recoveredJobsEstimate,
    recoveredMethod,
    recoveredRevenueCents: recoveredRevenueCents({
      avgTicketCents,
      recoveredJobs: recoveredJobsEstimate,
    }),
    collectedCents,
    openEstimateCents,
    openInvoiceCents,
    economicsReady,
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
    outcomes.recoveredJobsEstimate != null
      ? `Recovered jobs (est.): ${outcomes.recoveredJobsEstimate} via ${outcomes.recoveredMethod}`
      : "Recovered jobs: set baseline + avg ticket in Settings",
    outcomes.recoveredRevenueCents != null
      ? `Recovered revenue (est.): $${(outcomes.recoveredRevenueCents / 100).toFixed(0)}`
      : null,
    `Collected (recorded payments): $${(outcomes.collectedCents / 100).toFixed(0)}`,
    `Open estimates: $${(outcomes.openEstimateCents / 100).toFixed(0)} · Open invoices: $${(outcomes.openInvoiceCents / 100).toFixed(0)}`,
    "Label: estimate from owner baseline/avg ticket + CRM records — not audited GAAP revenue.",
  ];
  return lines.filter(Boolean).join("\n");
}
