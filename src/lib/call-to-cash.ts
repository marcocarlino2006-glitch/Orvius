/*
  One call, one thread: answered, booked, confirmed, done, paid.
  The same five steps the owner already runs in their head, read straight from
  the records, so the desk shows where each call stands and what is next.
*/

export type CashStepKey = "answered" | "booked" | "confirmed" | "done" | "paid";

export type CashStep = {
  key: CashStepKey;
  label: string;
  /** done: happened. now: the next thing still open. next: after that. */
  state: "done" | "now" | "next";
};

export type CashThreadInput = {
  live?: boolean;
  hasLead?: boolean;
  job?: {
    status: string;
    confirmedAt?: string | null;
    completedAt?: string | null;
    invoiceStatus?: string | null;
    invoicePaidAt?: string | null;
  } | null;
};

const LABEL: Record<CashStepKey, string> = {
  answered: "Answered",
  booked: "Booked",
  confirmed: "Confirmed",
  done: "Done",
  paid: "Paid",
};

/** Null when the call never became work, so there is no thread to show. */
export function callToCash(input: CashThreadInput): CashStep[] | null {
  if (input.live) return null;
  const job = input.job ?? null;
  if (!job && !input.hasLead) return null;
  if (job?.status === "cancelled") return null;

  const finished = job?.status === "completed" || Boolean(job?.completedAt);
  const reached: Record<CashStepKey, boolean> = {
    answered: true,
    booked: Boolean(job),
    confirmed: Boolean(job?.confirmedAt) || finished,
    done: finished,
    paid: job?.invoiceStatus === "paid" || Boolean(job?.invoicePaidAt),
  };

  const order: CashStepKey[] = ["answered", "booked", "confirmed", "done", "paid"];
  let open = false;
  return order.map((key) => {
    if (reached[key] && !open) return { key, label: LABEL[key], state: "done" as const };
    if (!open) {
      open = true;
      return { key, label: LABEL[key], state: "now" as const };
    }
    return { key, label: LABEL[key], state: "next" as const };
  });
}
