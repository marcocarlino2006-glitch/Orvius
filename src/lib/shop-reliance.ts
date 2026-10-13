import { prisma } from "@/lib/prisma";

/*
  Is each paying shop leaning on Orvius more or less than it was? The value
  check asks whether a month paid for itself; this asks which way it's
  heading, two weeks against the two before, and whether anyone in the shop
  still acts in Orvius. A shop slips quietly (forwarding turned off, a new
  office manager, a habit that didn't stick) weeks before it cancels.
*/

export const RELIANCE_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const PEOPLE = ["owner", "teammate", "technician"];

export type RelianceFacts = {
  shopId: string;
  name: string;
  createdAt: Date;
  calls: number;
  callsBefore: number;
  jobs: number;
  jobsBefore: number;
  /** Days in the window when the owner, a teammate or a tech did something in Orvius. */
  activeDays: number;
};

export type RelianceVerdict = RelianceFacts & {
  verdict: "relies" | "steady" | "slipping" | "too_new";
  reason: string;
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function judgeReliance(facts: RelianceFacts, now = new Date()): RelianceVerdict {
  const ageDays = (now.getTime() - facts.createdAt.getTime()) / DAY_MS;
  if (ageDays < 2 * RELIANCE_WINDOW_DAYS) {
    return { ...facts, verdict: "too_new", reason: `Signed up ${Math.floor(ageDays)} days ago` };
  }
  const trend = `${plural(facts.calls, "call")} vs ${facts.callsBefore} the two weeks before`;
  if (facts.callsBefore >= 4 && facts.calls <= facts.callsBefore / 2) {
    return { ...facts, verdict: "slipping", reason: `Calls halved: ${trend}. Check the number still forwards.` };
  }
  if (facts.jobsBefore >= 3 && facts.jobs <= facts.jobsBefore / 2) {
    return {
      ...facts,
      verdict: "slipping",
      reason: `Bookings halved: ${plural(facts.jobs, "job")} vs ${facts.jobsBefore}. Check the calendar has open time.`,
    };
  }
  if (facts.activeDays === 0) {
    return { ...facts, verdict: "slipping", reason: `Nobody in the shop used Orvius in ${RELIANCE_WINDOW_DAYS} days (${trend}).` };
  }
  if (facts.calls >= 10 && facts.activeDays >= 5) {
    return { ...facts, verdict: "relies", reason: `${trend}; used on ${plural(facts.activeDays, "day")}` };
  }
  return { ...facts, verdict: "steady", reason: `${trend}; used on ${plural(facts.activeDays, "day")}` };
}

export async function payingShopReliance(now = new Date()): Promise<RelianceVerdict[]> {
  const start = new Date(now.getTime() - RELIANCE_WINDOW_DAYS * DAY_MS);
  const before = new Date(now.getTime() - 2 * RELIANCE_WINDOW_DAYS * DAY_MS);
  const shops = await prisma.business.findMany({
    where: { environment: "production", isActive: true, billingStatus: { in: ["active", "past_due"] } },
    select: { id: true, name: true, createdAt: true },
    take: 20_000,
  });
  if (!shops.length) return [];
  const ids = shops.map((s) => s.id);
  const inbound = (gte: Date, lt: Date) =>
    prisma.call.groupBy({ by: ["businessId"], where: { businessId: { in: ids }, direction: "inbound", createdAt: { gte, lt } }, _count: { _all: true } });
  const booked = (gte: Date, lt: Date) =>
    prisma.job.groupBy({ by: ["businessId"], where: { businessId: { in: ids }, leadId: { not: null }, createdAt: { gte, lt } }, _count: { _all: true } });
  const [calls, callsBefore, jobs, jobsBefore, actions] = await Promise.all([
    inbound(start, now),
    inbound(before, start),
    booked(start, now),
    booked(before, start),
    prisma.auditEvent.findMany({
      where: { businessId: { in: ids }, actor: { in: PEOPLE }, createdAt: { gte: start } },
      select: { businessId: true, createdAt: true },
      take: 200_000,
    }),
  ]);
  const count = (rows: { businessId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.businessId, r._count._all]));
  const [c, cb, j, jb] = [count(calls), count(callsBefore), count(jobs), count(jobsBefore)];
  const days = new Map<string, Set<string>>();
  for (const a of actions) {
    const set = days.get(a.businessId) ?? new Set<string>();
    set.add(a.createdAt.toISOString().slice(0, 10));
    days.set(a.businessId, set);
  }
  return shops.map((shop) =>
    judgeReliance(
      {
        shopId: shop.id,
        name: shop.name,
        createdAt: shop.createdAt,
        calls: c.get(shop.id) ?? 0,
        callsBefore: cb.get(shop.id) ?? 0,
        jobs: j.get(shop.id) ?? 0,
        jobsBefore: jb.get(shop.id) ?? 0,
        activeDays: days.get(shop.id)?.size ?? 0,
      },
      now,
    ),
  );
}
