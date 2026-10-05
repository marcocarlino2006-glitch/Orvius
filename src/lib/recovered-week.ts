import { formatCents, formatCentsTidy } from "@/lib/money";
import type { ShopOutcomes } from "@/lib/shop-outcomes";

export type RecoveredRow = { label: string; value: string; detail?: string };

export type RecoveredWeek = {
  /** Null when the line captured nothing in the window. */
  headline: { value: string; label: string; estimate: boolean } | null;
  rows: RecoveredRow[];
  /** Jobs came from calls but the owner never set an average ticket, so no dollar estimate exists. */
  needsTicket: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * What the line brought in this week, from the shop's own records. Collected
 * money is real payments; any other dollar figure is captured jobs × the
 * owner's own average ticket and is marked as an estimate. Nothing is invented
 * when the owner hasn't given a ticket.
 */
export function buildRecoveredWeek(outcomes: ShopOutcomes): RecoveredWeek {
  const collected = outcomes.collectedCents;
  const estimate = outcomes.capturedDemandEstimatedValueCents;
  const jobs = outcomes.capturedDemandJobs;
  const ticket = outcomes.avgTicketCents;

  let headline: RecoveredWeek["headline"] = null;
  if (collected > 0) {
    headline = { value: formatCentsTidy(collected) ?? "$0", label: "collected this week", estimate: false };
  } else if (estimate && estimate > 0) {
    headline = { value: `≈${formatCents(estimate)}`, label: "booked from Orvius calls", estimate: true };
  } else if (jobs > 0) {
    headline = { value: plural(jobs, "job"), label: "booked from Orvius calls", estimate: false };
  } else if (outcomes.leads > 0) {
    headline = { value: plural(outcomes.leads, "caller"), label: "captured this week", estimate: false };
  }

  const rows: RecoveredRow[] = [
    {
      label: "Booked from Orvius calls",
      value: plural(jobs, "job"),
      detail: estimate && ticket ? `≈${formatCents(estimate)} at your ${formatCents(ticket)} average ticket` : undefined,
    },
    {
      label: "Caught outside your hours",
      value: plural(outcomes.afterHoursLeads, "caller"),
      detail: outcomes.afterHoursBooked > 0 ? `${plural(outcomes.afterHoursBooked, "job")} booked from them` : undefined,
    },
  ];
  if (collected === 0) rows.push({ label: "Collected", value: "$0", detail: "Payments you record on jobs show here" });

  return { headline, rows, needsTicket: jobs > 0 && !ticket };
}
