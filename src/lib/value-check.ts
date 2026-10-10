import { prisma } from "@/lib/prisma";
import { getPlanById, getPlanPrice, type PlanId } from "@/lib/pricing-plans";

/*
  Is each paying shop getting more out of Orvius than it pays? Counted from its
  own records over the last 30 days. A shop that is not is the next one to
  cancel, so it is named on the founders' board while there is time to fix it
  (a number that stopped forwarding, a calendar with no open time) or refund.
  Booked work is valued only at the owner's own average ticket; without one,
  only money actually collected counts.
*/

export const VALUE_WINDOW_DAYS = 30;
/** A shop this new has not had a fair month yet. */
export const VALUE_GRACE_DAYS = 14;

export type ValueFacts = {
  shopId: string;
  name: string;
  planId: string | null;
  /** "year" means billed annually; anything else is monthly. */
  interval?: string | null;
  createdAt: Date;
  avgTicketCents: number | null;
  callsAnswered: number;
  jobsBooked: number;
  collectedCents: number;
};

export type ValueVerdict = ValueFacts & {
  priceCents: number;
  /** Jobs booked × the owner's average ticket; null when the owner hasn't set one. */
  bookedValueCents: number | null;
  verdict: "earning" | "short" | "idle" | "too_new";
  reason: string;
};

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

/** What the shop pays per month; an annual charge is spread over its twelve months. */
export function planMonthlyCents(planId: string | null, interval?: string | null): number {
  if (!planId) return 0;
  try {
    const plan = getPlanById(planId as PlanId);
    return plan.contactSales ? 0 : Math.round(getPlanPrice(plan, interval === "year" ? "year" : "month") * 100);
  } catch {
    return 0;
  }
}

export function judgeShopValue(facts: ValueFacts, now = new Date()): ValueVerdict {
  const priceCents = planMonthlyCents(facts.planId, facts.interval);
  const bookedValueCents = facts.avgTicketCents ? facts.jobsBooked * facts.avgTicketCents : null;
  const base = { ...facts, priceCents, bookedValueCents };
  const ageDays = (now.getTime() - facts.createdAt.getTime()) / 86_400_000;

  if (ageDays < VALUE_GRACE_DAYS) {
    return { ...base, verdict: "too_new", reason: `Signed up ${Math.floor(ageDays)} days ago` };
  }
  if (facts.callsAnswered === 0) {
    return {
      ...base,
      verdict: "idle",
      reason: `No calls reached Orvius in ${VALUE_WINDOW_DAYS} days. Check the number is still forwarding.`,
    };
  }
  const best = Math.max(facts.collectedCents, bookedValueCents ?? 0);
  if (best >= priceCents && (bookedValueCents !== null || facts.collectedCents > 0)) {
    return { ...base, verdict: "earning", reason: `${usd(best)} against a ${usd(priceCents)} plan` };
  }
  const booked = `${facts.jobsBooked} job${facts.jobsBooked === 1 ? "" : "s"} booked from ${facts.callsAnswered} call${facts.callsAnswered === 1 ? "" : "s"}`;
  const worth =
    bookedValueCents !== null
      ? ` (${usd(bookedValueCents)} at their ${usd(facts.avgTicketCents!)} average ticket)`
      : facts.collectedCents
        ? `, ${usd(facts.collectedCents)} collected`
        : ", no average ticket set and nothing collected through Orvius";
  return { ...base, verdict: "short", reason: `${booked}${worth} against a ${usd(priceCents)} plan` };
}

export async function payingShopValue(now = new Date()): Promise<ValueVerdict[]> {
  const since = new Date(now.getTime() - VALUE_WINDOW_DAYS * 86_400_000);
  const shops = await prisma.business.findMany({
    where: { environment: "production", isActive: true, billingStatus: { in: ["active", "past_due"] } },
    select: { id: true, name: true, billingPlan: true, billingInterval: true, createdAt: true, avgTicketCents: true },
    take: 20_000,
  });
  if (!shops.length) return [];
  const ids = shops.map((s) => s.id);
  const [calls, jobs, deposits, invoices] = await Promise.all([
    prisma.call.groupBy({ by: ["businessId"], where: { businessId: { in: ids }, direction: "inbound", createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.job.groupBy({ by: ["businessId"], where: { businessId: { in: ids }, leadId: { not: null }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.deposit.groupBy({ by: ["businessId"], where: { businessId: { in: ids }, status: "paid", paidAt: { gte: since } }, _sum: { amountCents: true } }),
    prisma.invoice.groupBy({
      by: ["businessId"],
      where: { businessId: { in: ids }, status: "paid", paidAt: { gte: since }, stripeSessionId: { not: null } },
      _sum: { amountCents: true },
    }),
  ]);
  const count = (rows: { businessId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.businessId, r._count._all]));
  const sum = (rows: { businessId: string; _sum: { amountCents: number | null } }[]) => new Map(rows.map((r) => [r.businessId, r._sum.amountCents ?? 0]));
  const callsBy = count(calls);
  const jobsBy = count(jobs);
  const depositsBy = sum(deposits);
  const invoicesBy = sum(invoices);
  return shops.map((shop) =>
    judgeShopValue(
      {
        shopId: shop.id,
        name: shop.name,
        planId: shop.billingPlan,
        interval: shop.billingInterval,
        createdAt: shop.createdAt,
        avgTicketCents: shop.avgTicketCents,
        callsAnswered: callsBy.get(shop.id) ?? 0,
        jobsBooked: jobsBy.get(shop.id) ?? 0,
        collectedCents: (depositsBy.get(shop.id) ?? 0) + (invoicesBy.get(shop.id) ?? 0),
      },
      now,
    ),
  );
}
