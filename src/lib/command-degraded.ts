import type { ShopOutcomes } from "@/lib/shop-outcomes";
import type { ShopIssue } from "@/lib/work";

/**
 * Money reads are the one part of Command that can fail on its own — e.g. a
 * release that selects columns a not-yet-migrated database lacks. That must
 * degrade to "money paused", never take the whole screen down, and never
 * present paused money as measured fact.
 */
export function degradedOutcomes(now: Date): ShopOutcomes {
  return {
    windowDays: 7,
    since: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    calls: 0,
    leads: 0,
    jobsBooked: 0,
    leadsBooked: 0,
    bookingRate: null,
    afterHoursLeads: 0,
    afterHoursBooked: 0,
    emergenciesBooked: 0,
    unassignedJobs: 0,
    activeTechnicians: 0,
    jobsPerTech: null,
    avgTicketCents: null,
    estimatedPipelineCents: null,
    estimatedLeadValueCents: null,
    baselineMissedCallsPerWeek: null,
    baselineJobsPerWeek: null,
    callsPerWeekVsBaseline: null,
    jobsPerWeekVsBaseline: null,
    capturedDemandJobs: 0,
    jobsCompleted: 0,
    capturedDemandEstimatedValueCents: null,
    collectedCents: 0,
    openEstimateCents: 0,
    openInvoiceCents: 0,
    economicsReady: false,
    weeks: [],
  };
}

/**
 * True when a money read failed only because the database is behind the
 * release — a column the code selects (e.g. Payment.refundedCents) does not
 * exist yet. Callers degrade those reads to "money paused" instead of
 * failing the whole screen. Any other error keeps throwing.
 */
export function isMoneySchemaDrift(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ((error as { code?: unknown }).code === "P2022") return true;
  const message = error instanceof Error ? error.message : "";
  if (message.includes("does not exist in the current database")) return true;
  /* Through the Turso/libsql driver adapter the same failure can arrive in
     SQLite's own words instead of Prisma's — match those too, or production
     money reads throw straight past the degradation. */
  return /no such column/i.test(message) || /has no column named/i.test(message);
}

export const MONEY_PAUSED_ISSUE: ShopIssue = {
  id: "money-paused",
  kind: "billing_gap",
  title: "Money numbers are paused",
  detail:
    "Jobs, calls and bookings are unaffected, but bills and payments can't be read right now. This needs a database update on our side — nothing for you to do, and no money data is lost.",
  action: "Open billing",
  href: "/dashboard/billing",
  severity: "critical",
};
