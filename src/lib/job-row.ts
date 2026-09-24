import { formatCents } from "@/lib/money";

export type JobRowInput = {
  status: string;
  urgency: string | null;
  createdAt: string;
  scheduledAt: string | null;
  customerConfirmedAt?: string | null;
  finalAmountCents?: number | null;
  technician?: { name: string } | null;
  business?: { avgTicketCents: number | null } | null;
  estimate?: {
    amountCents: number;
    status: string;
    invoice: {
      amountCents: number;
      status: string;
      payments?: { amountCents: number; status: string }[];
    } | null;
  } | null;
};

export type JobRowFacts = {
  owner: { label: string; missing: boolean };
  timing: { label: string; tone: "neutral" | "attention" | "risk" };
  money: { label: string; kind: "paid" | "due" | "estimate" | "final" | "expected" | "none"; cents: number | null };
  /** Why this row needs the owner, if it does. Drives ordering. */
  attention: { reason: string; weight: number } | null;
};

const HOUR = 60 * 60 * 1000;
const OPEN = new Set(["scheduled", "confirmed", "en_route", "on_site"]);

function span(ms: number) {
  const h = Math.round(ms / HOUR);
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))}m`;
  if (h < 48) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** What makes one job different from the next: who owns it, how late it is, and what it is worth. */
export function jobRowFacts(job: JobRowInput, now = Date.now()): JobRowFacts {
  const open = OPEN.has(job.status);
  const at = job.scheduledAt ? new Date(job.scheduledAt).getTime() : null;
  const age = now - new Date(job.createdAt).getTime();

  const owner = job.technician
    ? { label: job.technician.name, missing: false }
    : { label: open ? "No technician" : "—", missing: open };

  let timing: JobRowFacts["timing"];
  if (job.status === "completed") timing = { label: "Done", tone: "neutral" };
  else if (job.status === "cancelled") timing = { label: "Cancelled", tone: "neutral" };
  else if (at == null) timing = { label: `Unscheduled · booked ${span(age)} ago`, tone: "attention" };
  else if (at < now && (job.status === "scheduled" || job.status === "confirmed")) {
    timing = { label: `Overdue ${span(now - at)}`, tone: "risk" };
  } else if (at >= now) timing = { label: `In ${span(at - now)}`, tone: at - now < 2 * HOUR ? "attention" : "neutral" };
  else timing = { label: `Started ${span(now - at)} ago`, tone: "neutral" };

  const invoice = job.estimate?.invoice ?? null;
  const paid = (invoice?.payments ?? [])
    .filter((p) => p.status !== "failed" && p.status !== "refunded")
    .reduce((sum, p) => sum + p.amountCents, 0);
  let money: JobRowFacts["money"];
  if (invoice && paid >= invoice.amountCents && invoice.amountCents > 0) {
    money = { label: `${formatCents(paid)} paid`, kind: "paid", cents: paid };
  } else if (invoice) {
    const due = invoice.amountCents - paid;
    money = { label: `${formatCents(due)} due`, kind: "due", cents: due };
  } else if (job.finalAmountCents) {
    money = { label: `${formatCents(job.finalAmountCents)} final`, kind: "final", cents: job.finalAmountCents };
  } else if (job.estimate) {
    money = {
      label: `${formatCents(job.estimate.amountCents)} estimate${job.estimate.status === "accepted" ? " · accepted" : ""}`,
      kind: "estimate",
      cents: job.estimate.amountCents,
    };
  } else if (open && job.business?.avgTicketCents) {
    money = { label: `~${formatCents(job.business.avgTicketCents)} expected`, kind: "expected", cents: job.business.avgTicketCents };
  } else {
    money = { label: "No amount yet", kind: "none", cents: null };
  }

  let attention: JobRowFacts["attention"] = null;
  if (timing.tone === "risk") attention = { reason: "Appointment time passed and nobody is on the way.", weight: 5 };
  else if (owner.missing) {
    attention = {
      reason: job.urgency === "emergency" ? "Emergency with no technician." : "Nobody is assigned.",
      weight: job.urgency === "emergency" ? 6 : 4,
    };
  } else if (at == null && open) attention = { reason: "No appointment time yet.", weight: 3 };
  else if (money.kind === "due") attention = { reason: "Invoice is waiting on payment.", weight: 2 };
  else if (job.status === "completed" && !job.finalAmountCents && !invoice) {
    attention = { reason: "Completed without a final amount.", weight: 1 };
  } else if (open && at != null && at - now < 2 * HOUR && !job.customerConfirmedAt) {
    // Earlier than two hours out, autopilot texts the customer; this close, a person should call.
    attention = { reason: "Starts within 2 hours and the customer has not confirmed. Call them.", weight: 3 };
  }

  return { owner, timing, money, attention };
}
