/* Report shapes and periods, safe to import in the browser. */

export type ReportPeriodId = "this_month" | "last_month" | "last_90";
export const REPORT_PERIODS: Array<{ id: ReportPeriodId; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90", label: "Last 90 days" },
];
/** Below this many sent estimates a close rate is noise, so it isn't shown. */
export const MIN_ESTIMATES_FOR_RATE = 3;

/** One receipt as it came in; `refundedCents` is how much of it went back out. */
export type MoneyRow = { amountCents: number; refundedCents?: number; technicianId: string | null; source: string | null; kind: "invoice" | "deposit" };
export type EstimateRow = { amountCents: number; won: boolean; technicianId: string | null };
export type JobRow = { technicianId: string | null };
export type CallLeadRow = { booked: boolean };

export type ReportRow = { key: string; label: string; collectedCents: number; payments: number; jobsCompleted?: number; estimatesSent?: number; estimatesWon?: number };

/** A bill the customer hasn't finished paying. Balance is the bill minus collected payments. */
export type OpenInvoiceRow = { id: string; label: string; jobId: string | null; amountCents: number; balanceCents: number; agedDays: number };

export type OwnerReport = {
  /** What the shop kept: receipts less refunds. Not revenue, and not what anyone owes. */
  collectedCents: number;
  /** Receipts as they came in, what was refunded, and what was kept. */
  money?: { grossCents: number; refundedCents: number; netCents: number };
  previousCollectedCents: number;
  payments: number;
  averageInvoiceCents: number | null;
  jobsCompleted: number;
  estimates: { sent: number; won: number; sentCents: number; wonCents: number; closeRate: number | null };
  calls: { leads: number; booked: number; bookedRate: number | null };
  /** Bills still waiting on the customer, full balance left, oldest first. Not in any period: owed is owed. */
  stillToCollect: { totalCents: number; count: number; invoices: OpenInvoiceRow[] };
  byTechnician: ReportRow[];
  bySource: ReportRow[];
  /** Work that moved through Orvius in the period, from workflow events checked against the job records. Absent when it couldn't be read. */
  operating?: OperatingEvidence;
};

export type OperatingEvidence = {
  /** Seen in the records: jobs a person marked done, money on those jobs, decisions, problems and recoveries. */
  observed: {
    completedJobs: number;
    money: { grossCents: number; refundedCents: number; netCents: number };
    ownerDecisions: number;
    exceptions: number;
    recovered: number;
    /** Middle of request-to-done times, when at least one is known. */
    medianStartToCompleteMs: number | null;
  };
  /** Of the observed jobs, the ones from a real call Orvius answered or a booking approved in Command. A hand in it, not proof it caused the sale. */
  attributableJobs: number;
  /** Demo, test and simulated events left out. All of a shop's work is synthetic when the shop is. */
  syntheticLeftOut: number;
  shopSynthetic: boolean;
  /** What these numbers can't tell you. */
  unknown: readonly string[];
};

