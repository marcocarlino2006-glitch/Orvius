import { usagePeriodStart } from "@/lib/call-usage";
import { prisma } from "@/lib/prisma";

export type MonthValue = {
  callsAnswered: number;
  leadsCaptured: number;
  jobsBooked: number;
  collectedCents: number;
};

/**
 * What Orvius did for a shop since the 1st, counted from its own records.
 * Shown beside the bill so the owner weighs the price against the work, not
 * against nothing. Money counts only card payments that settled to the shop.
 */
export async function getMonthValue(businessId: string, now = new Date()): Promise<MonthValue> {
  const since = usagePeriodStart(now);
  const [callsAnswered, leadsCaptured, jobsBooked, deposits, invoices] = await Promise.all([
    prisma.call.count({ where: { businessId, direction: "inbound", createdAt: { gte: since } } }),
    prisma.lead.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.job.count({ where: { businessId, createdAt: { gte: since } } }),
    prisma.deposit.aggregate({
      where: { businessId, status: "paid", paidAt: { gte: since } },
      _sum: { amountCents: true },
    }),
    prisma.invoice.aggregate({
      where: { businessId, status: "paid", paidAt: { gte: since }, stripeSessionId: { not: null } },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    callsAnswered,
    leadsCaptured,
    jobsBooked,
    collectedCents: (deposits._sum.amountCents ?? 0) + (invoices._sum.amountCents ?? 0),
  };
}

export function monthValueLine(value: MonthValue): string | null {
  const fmt = (n: number) => n.toLocaleString("en-US");
  const parts = [
    value.callsAnswered ? `answered ${fmt(value.callsAnswered)} call${value.callsAnswered === 1 ? "" : "s"}` : null,
    value.leadsCaptured ? `captured ${fmt(value.leadsCaptured)} lead${value.leadsCaptured === 1 ? "" : "s"}` : null,
    value.jobsBooked ? `booked ${fmt(value.jobsBooked)} job${value.jobsBooked === 1 ? "" : "s"}` : null,
    value.collectedCents
      ? `collected ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value.collectedCents / 100)} by card`
      : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  return `This month Orvius ${list}.`;
}
