import { getPlanById, type PaidPlanId } from "@/lib/pricing-plans";

/*
  What an owner sees before cancelling: what Orvius did for the shop, counted
  from its own records, and the cheaper ways to stay. Every number is a count;
  nothing is estimated, and a shop that never took a call is told so.
*/

export const KEEP_WINDOW_DAYS = 90;

export type KeepCounts = {
  calls: number;
  afterHoursLeads: number;
  jobsBooked: number;
  collectedCents: number;
};

export type KeepRow = { label: string; value: string };

const n = (v: number) => v.toLocaleString("en-US");

export function keepRows(counts: KeepCounts): KeepRow[] {
  const rows: KeepRow[] = [
    { label: "Calls answered", value: n(counts.calls) },
    { label: "Requests after hours", value: n(counts.afterHoursLeads) },
    { label: "Jobs booked", value: n(counts.jobsBooked) },
  ];
  if (counts.collectedCents > 0) {
    rows.push({ label: "Payments recorded", value: `$${n(Math.round(counts.collectedCents / 100))}` });
  }
  return rows;
}

export function keepHeadline(counts: KeepCounts): string {
  if (counts.calls === 0) {
    return "Orvius hasn't answered a customer call for you yet. That usually means call forwarding was never switched on. Email us and we'll set it up with you.";
  }
  return `In the last ${KEEP_WINDOW_DAYS} days Orvius answered ${n(counts.calls)} call${counts.calls === 1 ? "" : "s"} and booked ${n(counts.jobsBooked)} job${counts.jobsBooked === 1 ? "" : "s"} for you.`;
}

const ORDER: PaidPlanId[] = ["line", "pro", "fleet"];

/** The next plan down, for an owner whose shop is paying for more than it uses. */
export function smallerPlan(planId: string | null | undefined) {
  const i = ORDER.indexOf(planId as PaidPlanId);
  if (i <= 0) return null;
  const plan = getPlanById(ORDER[i - 1]);
  return { id: plan.id, name: plan.name, price: plan.price, includedCalls: plan.includedCalls ?? 0 };
}

export const PAUSE_MONTH_OPTIONS = [1, 2, 3] as const;
export type PauseMonths = (typeof PAUSE_MONTH_OPTIONS)[number];

/** The owner gets a text this long before the plan charges again. */
export const PAUSE_ENDING_NOTICE_DAYS = 3;

export const HOUR_MS = 60 * 60 * 1000;

export function isPauseMonths(value: unknown): value is PauseMonths {
  return PAUSE_MONTH_OPTIONS.includes(value as PauseMonths);
}

/** Same day of the month `months` later, clamped to the month's last day (Jan 31 + 1 is Feb 28, not Mar 3). */
export function addMonthsUtc(from: Date, months: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(y, m, Math.min(from.getUTCDate(), lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()),
  );
}

/*
  The pause ends an hour before the renewal it lines up with, so that renewal
  is a normal paid invoice. Ending on the same second would leave Stripe free
  to void the first month back.
*/
export function pauseWindow(periodEnd: Date, months: PauseMonths) {
  return { startsAt: periodEnd, until: new Date(addMonthsUtc(periodEnd, months).getTime() - HOUR_MS) };
}

export function pauseDate(at: Date | string | null | undefined): string {
  if (!at) return "the date you picked";
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
