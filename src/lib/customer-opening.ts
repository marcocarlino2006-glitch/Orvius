/**
 * The one line a customer record opens on. Money waiting leads. A future
 * visit is next. Otherwise the last thing that happened with them.
 */
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

export function customerOpening(events: OpeningEvent[], money: (cents: number) => string): string | null {
  const unpaid = events.find((event) => event.type === "invoice" && event.amountCents && !CLOSED_MONEY.has((event.status ?? "").toLowerCase()));
  if (unpaid?.amountCents) {
    const figure = money(unpaid.amountCents);
    return (unpaid.status ?? "").toLowerCase() === "draft" ? `Send the ${figure} invoice.` : `${figure} waiting.`;
  }
  const now = Date.now();
  const next = events
    .filter((event) => event.type === "job" && Date.parse(event.at) > now && !CLOSED_JOB.has((event.status ?? "").toLowerCase()))
    .sort((a, b) => a.at.localeCompare(b.at))[0];
  if (next) {
    const when = formatBeat(next.at);
    const title = next.title.replace(/[.!?]+$/, "").trim();
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
