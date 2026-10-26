/**
 * The one line a customer record opens on. Money waiting leads. An open
 * visit is next, including one that is already late. Otherwise the last
 * thing that happened with them.
 */
import { jobPastDue } from "@/lib/job-status";
import { formatBeat } from "@/lib/when";

type OpeningEvent = {
  type: string;
  at: string;
  title: string;
  status: string | null;
  amountCents?: number | null;
};

const KIND: Record<string, string> = {
  call: "call",
  lead: "request",
  job: "job",
  estimate: "estimate",
  invoice: "invoice",
  payment: "payment",
  text: "text",
};

const CLOSED_MONEY = new Set(["paid", "void", "refunded"]);
const CLOSED_JOB = new Set(["cancelled", "completed", "done"]);

/** The visit still on the books. A future one wins. A late one is still the visit. */
export function customerVisit<T extends OpeningEvent>(events: T[], now = Date.now()): (T & { late: boolean }) | null {
  const open = events.filter((event) => event.type === "job" && !CLOSED_JOB.has((event.status ?? "").toLowerCase()));
  const future = open.filter((event) => Date.parse(event.at) > now).sort((a, b) => a.at.localeCompare(b.at))[0];
  const chosen = future ?? [...open].filter((event) => Date.parse(event.at) <= now).sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!chosen) return null;
  return { ...chosen, late: jobPastDue({ status: chosen.status ?? "", scheduledAt: chosen.at }, now) };
}

export function customerOpening(events: OpeningEvent[], money: (cents: number) => string): string | null {
  const unpaid = events.find((event) => event.type === "invoice" && event.amountCents && !CLOSED_MONEY.has((event.status ?? "").toLowerCase()));
  if (unpaid?.amountCents) {
    const figure = money(unpaid.amountCents);
    return (unpaid.status ?? "").toLowerCase() === "draft" ? `Send the ${figure} invoice.` : `${figure} waiting.`;
  }
  const visit = customerVisit(events);
  if (visit) {
    const title = visit.title.replace(/[.!?]+$/, "").trim();
    if (visit.late) return `Late. ${title}.`;
    const when = formatBeat(visit.at);
    return when ? `${when}. ${title}.` : `${title}.`;
  }
  const last = [...events].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (!last) return null;
  if (last.type === "invoice" && (last.status ?? "").toLowerCase() === "paid" && last.amountCents) return `${money(last.amountCents)} paid.`;
  if (last.type === "payment" && last.amountCents) return `${money(last.amountCents)} paid.`;
  const title = last.title.replace(/[.!?]+$/, "").trim();
  const kind = KIND[last.type] ?? last.type;
  if (title.toLowerCase().startsWith(kind)) return `${title}.`;
  return `Last ${kind}: ${title}.`;
}
