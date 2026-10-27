import type { CommandMoney } from "@/lib/command-depth";
import { weekBooked } from "@/lib/day-one";
import { formatCentsTidy } from "@/lib/money";

/**
 * The three facts under the Command sentence. Each one is omitted when the
 * count is zero, so a quiet shop does not grow a row of empty cards.
 */
export type DeskFacts = {
  you: string | null;
  ok: string | null;
  orvius: string | null;
};

type HandledCounts = {
  calls: number;
  booked: number;
  assigned: number;
  confirmations: number;
  escalated: number;
  collected?: number;
};

function join(parts: string[]): string {
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export function deskFacts(input: { needsYou: number; approvals: number; handled?: HandledCounts | null }): DeskFacts | null {
  const you = input.needsYou > 0 ? (input.needsYou === 1 ? "1 thing needs you." : `${input.needsYou} things need you.`) : null;
  const ok =
    input.approvals > 0
      ? input.approvals === 1
        ? "1 change is waiting on your OK."
        : `${input.approvals} changes are waiting on your OK.`
      : null;
  const handled = input.handled;
  const parts: string[] = [];
  if (handled?.calls) parts.push(handled.calls === 1 ? "answered 1 call" : `answered ${handled.calls} calls`);
  if (handled?.booked) parts.push(handled.booked === 1 ? "booked 1 job" : `booked ${handled.booked} jobs`);
  if (handled?.assigned) parts.push(handled.assigned === 1 ? "assigned 1 technician" : `assigned ${handled.assigned} technicians`);
  if (handled?.confirmations) parts.push(handled.confirmations === 1 ? "sent 1 confirmation" : `sent ${handled.confirmations} confirmations`);
  if (handled?.escalated) parts.push(handled.escalated === 1 ? "held 1 call for a person" : `held ${handled.escalated} calls for a person`);
  if (handled?.collected) parts.push(handled.collected === 1 ? "collected 1 payment" : `collected ${handled.collected} payments`);
  const orvius = parts.length ? `Orvius today ${join(parts)}.` : null;
  if (!you && !ok && !orvius) return null;
  return { you, ok, orvius };
}

export type MoneyBrief = {
  summary: string;
  owed: string | null;
  unbilled: string | null;
};

/** Collected and billed in one sentence. Owed and unbilled only when they are real. */
export function moneyBrief(
  money: CommandMoney,
  week?: { jobsBooked: number; avgTicketCents: number | null | undefined; closed?: string | null },
): MoneyBrief {
  const days = money.windowDays === 1 ? "the last day" : `the last ${money.windowDays} days`;
  const collected = money.payments ? `collected ${formatCentsTidy(money.collectedCents) ?? "$0"}` : "collected nothing";
  const billed = money.invoices ? `billed ${formatCentsTidy(money.invoicedCents) ?? "$0"}` : "billed nothing";
  const booked = week ? weekBooked(week) : null;
  const closed = week?.closed?.trim() || null;
  const head = [booked, closed].filter(Boolean).join(" ");
  return {
    summary: head ? `${head} In ${days}: ${collected}, ${billed}.` : `In ${days}: ${collected}, ${billed}.`,
    owed:
      money.outstandingCents > 0
        ? `${formatCentsTidy(money.outstandingCents) ?? "$0"} is still owed on ${money.outstandingInvoices === 1 ? "1 invoice" : `${money.outstandingInvoices} invoices`}.`
        : null,
    unbilled:
      money.doneNotBilled > 0
        ? money.doneNotBilled === 1
          ? "1 finished job has no bill."
          : `${money.doneNotBilled} finished jobs have no bill.`
        : null,
  };
}
