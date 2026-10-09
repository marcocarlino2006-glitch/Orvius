/* Report shapes and periods, safe to import in the browser. */

export type ReportPeriodId = "this_month" | "last_month" | "last_90";
export const REPORT_PERIODS: Array<{ id: ReportPeriodId; label: string }> = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90", label: "Last 90 days" },
];
/** Below this many sent estimates a close rate is noise, so it isn't shown. */
export const MIN_ESTIMATES_FOR_RATE = 3;

export type MoneyRow = { amountCents: number; technicianId: string | null; source: string | null; kind: "invoice" | "deposit" };
export type EstimateRow = { amountCents: number; won: boolean; technicianId: string | null };
export type JobRow = { technicianId: string | null };
export type CallLeadRow = { booked: boolean };

export type ReportRow = { key: string; label: string; collectedCents: number; payments: number; jobsCompleted?: number; estimatesSent?: number; estimatesWon?: number };

export type OwnerReport = {
  collectedCents: number;
  previousCollectedCents: number;
  payments: number;
  averageInvoiceCents: number | null;
  jobsCompleted: number;
  estimates: { sent: number; won: number; sentCents: number; wonCents: number; closeRate: number | null };
  calls: { leads: number; booked: number; bookedRate: number | null };
  byTechnician: ReportRow[];
  bySource: ReportRow[];
};

