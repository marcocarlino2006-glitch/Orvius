import { recordAudit } from "@/lib/audit";
import { summarizeCallUsage } from "@/lib/call-usage";
import { logWarn } from "@/lib/logger";
import { OVERAGE_CENTS_PER_CALL } from "@/lib/pricing-plans";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/*
  Overage is billed as its own Stripe invoice for the month just ended, not as
  a metered price on the subscription. Stripe requires every price on a
  subscription to share one interval, so a monthly metered price cannot sit on
  an annual plan — and an annual shop would otherwise be billed a year's
  overage at once. A separate invoice charges the card on file either way.
*/

/** Stripe will not charge a card for less than this; smaller overage is waived. */
const MIN_OVERAGE_INVOICE_CENTS = 100;

export function previousPeriod(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, key };
}

export type OverageDecision =
  | { bill: false; reason: "not_subscribed" | "already_billed" | "within_allowance" | "below_minimum" }
  | { bill: true; overCalls: number; amountCents: number; included: number; used: number };

export function decideOverage(params: {
  billingStatus: string | null;
  billingPlan: string | null;
  stripeCustomerId: string | null;
  overageBilledPeriod: string | null;
  periodKey: string;
  callsInPeriod: number;
}): OverageDecision {
  if (params.billingStatus !== "active" || !params.stripeCustomerId) {
    return { bill: false, reason: "not_subscribed" };
  }
  if (params.overageBilledPeriod && params.overageBilledPeriod >= params.periodKey) {
    return { bill: false, reason: "already_billed" };
  }
  const usage = summarizeCallUsage({ used: params.callsInPeriod, planId: params.billingPlan });
  if (usage.overCalls === 0) return { bill: false, reason: "within_allowance" };
  if (usage.overageCents < MIN_OVERAGE_INVOICE_CENTS) return { bill: false, reason: "below_minimum" };
  return {
    bill: true,
    overCalls: usage.overCalls,
    amountCents: usage.overageCents,
    included: usage.included,
    used: usage.used,
  };
}

/**
 * Invoice last month's overage for every subscribed shop. Safe to run daily:
 * the period stamp and Stripe idempotency keys make each month bill once.
 */
export async function billPreviousMonthOverage(now = new Date()) {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return { skipped: "stripe_unconfigured" as const };

  const period = previousPeriod(now);
  const shops = await prisma.business.findMany({
    where: {
      billingStatus: "active",
      stripeCustomerId: { not: null },
      environment: { not: "test" },
      OR: [{ overageBilledPeriod: null }, { overageBilledPeriod: { lt: period.key } }],
    },
    select: {
      id: true,
      name: true,
      billingStatus: true,
      billingPlan: true,
      stripeCustomerId: true,
      stripeSubscriptionId: true,
      overageBilledPeriod: true,
    },
    take: 500,
  });

  const stripe = getStripe();
  let billed = 0;
  let billedCents = 0;

  for (const shop of shops) {
    const countSince = (since: Date) =>
      prisma.call.count({
        where: { businessId: shop.id, direction: "inbound", createdAt: { gte: since, lt: period.end } },
      });
    let decision = decideOverage({ ...shop, periodKey: period.key, callsInPeriod: await countSince(period.start) });

    /* Calls answered during a pilot, before the paid plan began, are never billed. */
    if (decision.bill && shop.stripeSubscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(shop.stripeSubscriptionId).catch(() => null);
      const startedAt = subscription?.start_date ? new Date(subscription.start_date * 1000) : null;
      if (startedAt && startedAt > period.start) {
        decision = decideOverage({
          ...shop,
          periodKey: period.key,
          callsInPeriod: startedAt >= period.end ? 0 : await countSince(startedAt),
        });
      }
    }

    if (!decision.bill) {
      if (decision.reason !== "not_subscribed" && decision.reason !== "already_billed") {
        await prisma.business.update({ where: { id: shop.id }, data: { overageBilledPeriod: period.key } });
      }
      continue;
    }

    try {
      const key = `overage:${shop.id}:${period.key}`;
      await stripe.invoiceItems.create(
        {
          customer: shop.stripeCustomerId!,
          currency: "usd",
          amount: decision.amountCents,
          description: `${decision.overCalls} answered calls past the ${decision.included} included in ${period.key} × ${OVERAGE_CENTS_PER_CALL}¢`,
          metadata: { orvius: "call_overage", businessId: shop.id, period: period.key },
        },
        { idempotencyKey: `${key}:item` },
      );
      const invoice = await stripe.invoices.create(
        {
          customer: shop.stripeCustomerId!,
          collection_method: "charge_automatically",
          pending_invoice_items_behavior: "include",
          auto_advance: true,
          description: `Orvius call overage — ${period.key}`,
          metadata: { orvius: "call_overage", businessId: shop.id, period: period.key },
        },
        { idempotencyKey: `${key}:invoice` },
      );
      await prisma.business.update({ where: { id: shop.id }, data: { overageBilledPeriod: period.key } });
      await recordAudit({
        businessId: shop.id,
        entityType: "shop",
        entityId: shop.id,
        action: "billing.overage_invoiced",
        summary: `Invoiced ${decision.overCalls} calls past the allowance for ${period.key}`,
        detail: { invoiceId: invoice.id, amountCents: decision.amountCents, used: decision.used },
        idempotencyKey: key,
      });
      billed += 1;
      billedCents += decision.amountCents;
    } catch (error) {
      logWarn("billing.overage_failed", {
        businessId: shop.id,
        period: period.key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { period: period.key, checked: shops.length, billed, billedCents };
}
