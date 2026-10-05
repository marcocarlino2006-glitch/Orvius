import { prisma } from "@/lib/prisma";

export type ReceptionistWeek = {
  windowDays: number;
  /** Inbound calls the line picked up. */
  answered: number;
  /** Callers who were a real customer: a captured request that isn't spam. */
  realCallers: number;
  /** Real callers whose request became a job. */
  booked: number;
  /** Safety calls and callers who needed a person, passed straight to the owner. */
  handedToYou: number;
  /** Spam, robocalls and wrong numbers the owner never had to see. */
  filtered: number;
  /** Typical wait for the receptionist's reply, across the week's calls. */
  replyMs: number | null;
};

export async function getReceptionistWeek(businessId: string, windowDays = 7, now = new Date()): Promise<ReceptionistWeek> {
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const callLeads = { businessId, callId: { not: null }, createdAt: { gte: since } };
  const [answered, realCallers, booked, filtered, handedToYou, reply] = await Promise.all([
    prisma.call.count({ where: { businessId, direction: "inbound", createdAt: { gte: since } } }),
    prisma.lead.count({ where: { ...callLeads, status: { not: "spam" } } }),
    prisma.lead.count({ where: { ...callLeads, status: { not: "spam" }, job: { isNot: null } } }),
    prisma.lead.count({ where: { ...callLeads, status: "spam" } }),
    prisma.auditEvent.count({ where: { businessId, action: "lead.escalated", createdAt: { gte: since } } }),
    prisma.call.aggregate({
      where: { businessId, createdAt: { gte: since }, replyP50Ms: { not: null } },
      _avg: { replyP50Ms: true },
    }),
  ]);
  const replyMs = reply._avg.replyP50Ms;
  return {
    windowDays,
    answered,
    realCallers,
    booked,
    handedToYou,
    filtered,
    replyMs: replyMs == null ? null : Math.round(replyMs),
  };
}

export type ReceptionistRow = { label: string; value: string; detail?: string };

export type ReceptionistCard = {
  /** Null until the line has had a real caller this week. */
  headline: { value: string; label: string } | null;
  /** Same share as the headline, for the bar; null until a real caller. */
  bookedShare: number | null;
  rows: ReceptionistRow[];
};

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * The receptionist's week in the shape Intercom shows Fin's: one rate up top,
 * then where every call went. Every figure is a count of the shop's own records.
 */
export function buildReceptionistCard(week: ReceptionistWeek): ReceptionistCard {
  const rate = week.realCallers > 0 ? Math.round((week.booked / week.realCallers) * 100) : null;
  const rows: ReceptionistRow[] = [
    { label: "Answered", value: count(week.answered, "call"), detail: week.answered ? "Picked up by Orvius" : undefined },
    {
      label: "Became a job",
      value: count(week.booked, "job"),
      detail: week.realCallers ? `of ${count(week.realCallers, "real caller")}` : undefined,
    },
    {
      label: "Handed to you",
      value: count(week.handedToYou, "call"),
      detail: week.handedToYou ? "Safety calls and callers who needed a person" : undefined,
    },
    {
      label: "Filtered out",
      value: count(week.filtered, "call"),
      detail: week.filtered ? "Spam and wrong numbers you never saw" : undefined,
    },
  ];
  if (week.replyMs != null) {
    rows.push({ label: "Typical reply", value: `${(week.replyMs / 1000).toFixed(1)}s`, detail: "From the caller finishing to Orvius answering" });
  }
  return {
    headline: rate == null ? null : { value: `${rate}%`, label: "of real callers booked this week" },
    bookedShare: week.realCallers > 0 ? Math.min(1, week.booked / week.realCallers) : null,
    rows,
  };
}
