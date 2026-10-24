import { formatCents, formatCentsTidy } from "@/lib/money";

/** A live shop still owes these before the desk reads as finished. */
export type DayOneFacts = {
  /** Paid production shop. Demos and test mode stay off this list. */
  live: boolean;
  numberProved: boolean;
  chargesEnabled: boolean;
  avgTicketCents: number | null;
  jobsBooked: number;
  collectedCents: number;
  /** Collected dollars could not be read. Never report that as zero. */
  moneyPaused?: boolean;
  /** This shop's closed amounts for the week, already one shop. */
  closed?: string | null;
};

export type DayOneStepId = "number" | "card" | "ticket";

export type DayOneStep = {
  id: DayOneStepId;
  done: boolean;
  title: string;
  detail: string;
  href: string | null;
};

export type DayOne = {
  open: boolean;
  worth: string;
  steps: [DayOneStep, DayOneStep, DayOneStep];
};

export function ticketSet(cents: number | null | undefined): boolean {
  return typeof cents === "number" && Number.isFinite(cents) && cents > 0;
}

/** Booked jobs times the shop's average. Null until that average exists. */
export function weekBooked(input: {
  jobsBooked: number;
  avgTicketCents: number | null | undefined;
}): string | null {
  if (!ticketSet(input.avgTicketCents)) return null;
  const ticket = input.avgTicketCents as number;
  const avg = formatCents(ticket) ?? "$0";
  if (input.jobsBooked <= 0) return `No jobs booked this week at your ${avg} average.`;
  const about = formatCents(ticket * input.jobsBooked) ?? "$0";
  const jobs = input.jobsBooked === 1 ? "1 job booked" : `${input.jobsBooked} jobs booked`;
  return `${jobs}, about ${about} at your ${avg} average.`;
}

/** This week's booked value, then what was actually collected. */
export function weekWorth(input: {
  jobsBooked: number;
  avgTicketCents: number | null | undefined;
  collectedCents: number;
  moneyPaused?: boolean;
  closed?: string | null;
}): string {
  const collected = input.moneyPaused
    ? "Collected dollars are paused until the books can be read."
    : input.collectedCents > 0
      ? `Collected ${formatCentsTidy(input.collectedCents) ?? "$0"}.`
      : "Collected nothing.";
  const booked = weekBooked(input);
  const closed = input.closed?.trim() || null;
  if (!booked && !closed) return `Set your average ticket to see what this week's jobs are worth. ${collected}`;
  return [booked, closed, collected].filter(Boolean).join(" ");
}

export function dayOne(facts: DayOneFacts): DayOne {
  const number: DayOneStep = facts.numberProved
    ? {
        id: "number",
        done: true,
        title: "Your receptionist answers",
        detail: "A call reached the number we assigned.",
        href: null,
      }
    : {
        id: "number",
        done: false,
        title: "Call your number",
        detail: "Your receptionist answers the number we assigned. Call it once.",
        href: "/dashboard?settings=phone",
      };
  const card: DayOneStep = facts.chargesEnabled
    ? {
        id: "card",
        done: true,
        title: "Cards can be charged",
        detail: "A deposit or an invoice can take a card. Orvius keeps 1%.",
        href: null,
      }
    : {
        id: "card",
        done: false,
        title: "Turn on the card account",
        detail: "Connect the account that takes a deposit or an invoice. Orvius keeps 1% of the card charge.",
        href: "/dashboard/billing",
      };
  const ticket = ticketSet(facts.avgTicketCents);
  const amount = ticket ? formatCents(facts.avgTicketCents) : null;
  const ticketStep: DayOneStep = ticket
    ? {
        id: "ticket",
        done: true,
        title: `Average ticket is ${amount}`,
        detail: "The desk uses this for booked jobs. Collected dollars stay what was actually paid.",
        href: null,
      }
    : {
        id: "ticket",
        done: false,
        title: "Set your average ticket",
        detail: "One number. Booked jobs this week times that amount, next to what you collected.",
        href: null,
      };
  return {
    open: facts.live && (!number.done || !card.done || !ticketStep.done),
    worth: weekWorth(facts),
    steps: [number, card, ticketStep],
  };
}
