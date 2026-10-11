import type Stripe from "stripe";
import { recordAudit } from "@/lib/audit";
import { isPaused } from "@/lib/billing-entitlement";
import { getAppUrl } from "@/lib/env";
import { resumeShopLine, suspendShopLine } from "@/lib/line-lifecycle";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { HOUR_MS, pauseDate, PAUSE_ENDING_NOTICE_DAYS, type PauseMonths, pauseWindow } from "@/lib/plan-exit";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/*
  The off-season pause. HVAC and plumbing shops slow down between seasons, and
  that is when a monthly plan gets cancelled. Pausing keeps the number, the
  settings, the customers and the history, and charges nothing. The paid month
  runs out first; the line is off for the pause; Stripe and Orvius both switch
  back on by themselves on the date the owner picked.

  Stripe's pause_collection voids every invoice it would have charged while
  paused, so the shop is never billed for months it did not use. Annual plans
  are already paid for the year, so they are not offered a pause.
*/

const DAY_MS = 24 * HOUR_MS;

export type PausableShop = {
  billingStatus: string | null;
  billingInterval: string | null;
  stripeSubscriptionId: string | null;
  pauseStartsAt?: Date | string | null;
  pausedUntil?: Date | string | null;
};

/** Why this shop can't pause right now, in words for the owner; null when it can. */
export function pauseBlocker(shop: PausableShop, now = new Date()): string | null {
  if (!shop.stripeSubscriptionId || shop.billingStatus !== "active") return "Only an active plan can be paused.";
  if (shop.billingInterval === "year") return "Annual plans are paid for the year, so there is nothing to pause.";
  if (shop.pausedUntil && new Date(shop.pausedUntil).getTime() > now.getTime()) return "This plan is already paused.";
  return null;
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const legacy = (subscription as { current_period_end?: number }).current_period_end;
  const item = subscription.items?.data?.[0] as { current_period_end?: number } | undefined;
  const seconds = legacy ?? item?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

/** The pause columns that match what Stripe says about the subscription. */
export function pauseFieldsFromSubscription(
  subscription: Stripe.Subscription,
  current: { pauseStartsAt: Date | null },
  now = new Date(),
): { pauseStartsAt: Date | null; pausedUntil: Date | null } {
  const resumesAt = subscription.pause_collection?.resumes_at;
  if (!subscription.pause_collection || !resumesAt) return { pauseStartsAt: null, pausedUntil: null };
  return {
    pauseStartsAt: current.pauseStartsAt ?? subscriptionPeriodEnd(subscription) ?? now,
    pausedUntil: new Date(resumesAt * 1000),
  };
}

type PauseResult = { ok: true; startsAt: Date; until: Date } | { ok: false; error: string; status: number };

export async function pauseShopPlan(
  shopId: string,
  months: PauseMonths,
  actorEmail: string | null,
  now = new Date(),
): Promise<PauseResult> {
  const shop = await prisma.business.findUnique({ where: { id: shopId } });
  if (!shop) return { ok: false, error: "Shop not found.", status: 404 };
  const blocker = pauseBlocker(shop, now);
  if (blocker) return { ok: false, error: blocker, status: 409 };

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(shop.stripeSubscriptionId!);
  if (subscription.cancel_at_period_end || subscription.cancel_at) {
    return { ok: false, error: "This plan is already set to cancel. Undo that on Stripe first, then pause.", status: 409 };
  }
  const periodEnd = subscriptionPeriodEnd(subscription);
  if (!periodEnd) return { ok: false, error: "Stripe didn't say when this month ends. Nothing was changed.", status: 502 };

  const { startsAt, until } = pauseWindow(periodEnd, months);
  await stripe.subscriptions.update(subscription.id, {
    pause_collection: { behavior: "void", resumes_at: Math.floor(until.getTime() / 1000) },
  });
  await prisma.business.update({ where: { id: shop.id }, data: { pauseStartsAt: startsAt, pausedUntil: until } });
  await recordAudit({
    businessId: shop.id,
    entityType: "shop",
    entityId: shop.id,
    action: "billing.paused",
    actor: "owner",
    actorEmail,
    summary: `Plan paused for ${months} month${months === 1 ? "" : "s"}: no charge from ${pauseDate(startsAt)} until ${pauseDate(until)}.`,
  });
  return { ok: true, startsAt, until };
}

export async function resumeShopPlan(
  shopId: string,
  actorEmail: string | null,
  now = new Date(),
): Promise<{ ok: true; chargedNow: boolean } | { ok: false; error: string; status: number }> {
  const shop = await prisma.business.findUnique({ where: { id: shopId } });
  if (!shop?.stripeSubscriptionId || !shop.pausedUntil) return { ok: false, error: "This plan isn't paused.", status: 409 };

  /*
    Resuming inside the pause starts a fresh paid month today. Without the new
    anchor the shop would run free until the next renewal, because the invoice
    for the month it is in was voided.
  */
  const started = isPaused(shop, now);
  await getStripe().subscriptions.update(
    shop.stripeSubscriptionId,
    started ? { pause_collection: "", billing_cycle_anchor: "now", proration_behavior: "none" } : { pause_collection: "" },
  );
  const updated = await prisma.business.update({
    where: { id: shop.id },
    data: { pauseStartsAt: null, pausedUntil: null },
  });
  if (updated.lineSuspendedAt && !updated.lineReleasedAt) await resumeShopLine(updated);
  await recordAudit({
    businessId: shop.id,
    entityType: "shop",
    entityId: shop.id,
    action: "billing.resumed",
    actor: "owner",
    actorEmail,
    summary: started ? "Plan resumed early; a new month started today." : "Pause called off before it started.",
  });
  return { ok: true, chargedNow: started };
}

const pausedWhere = { environment: "production", billingStatus: "active", lineReleasedAt: null } as const;

/**
 * The line follows the pause: off once the paid month runs out, a reminder
 * before the plan charges again, and back on when the pause ends. Stripe's
 * webhook does the same on resume; this catches a webhook that never came.
 */
export async function sweepPausedPlans(now = new Date()) {
  const link = `${getAppUrl().replace(/\/$/, "")}/dashboard/billing`;
  let suspended = 0;
  let reminded = 0;
  let resumed = 0;

  const starting = await prisma.business.findMany({
    where: { ...pausedWhere, lineSuspendedAt: null, pauseStartsAt: { lte: now }, pausedUntil: { gt: now } },
    take: 200,
  });
  for (const shop of starting) {
    if (!(await suspendShopLine(shop, `Paused until ${pauseDate(shop.pausedUntil)}. The number is kept.`))) continue;
    suspended += 1;
    await enqueueOwnerAlert({
      businessId: shop.id,
      businessName: shop.name,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
      dedupeKey: `billing:paused:${shop.id}:${shop.pausedUntil!.toISOString().slice(0, 10)}`,
      message: `Orvius: ${shop.name} is paused until ${pauseDate(shop.pausedUntil)}. Your line has stopped answering and callers hear a short message to reach you directly. Your number, customers and settings are kept. Resume any time: ${link}`,
    }).catch((error: unknown) => logWarn("billing.pause_alert_failed", { businessId: shop.id, error: String(error) }));
  }

  const ending = await prisma.business.findMany({
    where: { ...pausedWhere, pausedUntil: { gt: now, lte: new Date(now.getTime() + PAUSE_ENDING_NOTICE_DAYS * DAY_MS) } },
    take: 200,
  });
  for (const shop of ending) {
    const result = await enqueueOwnerAlert({
      businessId: shop.id,
      businessName: shop.name,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
      dedupeKey: `billing:pause_ending:${shop.id}:${shop.pausedUntil!.toISOString().slice(0, 10)}`,
      message: `Orvius: ${shop.name}'s pause ends ${pauseDate(shop.pausedUntil)}. Your line answers again and your plan is charged again that day. To stay paused longer or cancel: ${link}`,
    }).catch(() => null);
    if (result && !result.duplicate && result.queued.length) reminded += 1;
  }

  const over = await prisma.business.findMany({ where: { ...pausedWhere, pausedUntil: { lte: now } }, take: 200 });
  for (const shop of over) {
    const updated = await prisma.business.update({ where: { id: shop.id }, data: { pauseStartsAt: null, pausedUntil: null } });
    if (updated.lineSuspendedAt && (await resumeShopLine(updated))) resumed += 1;
  }

  return { suspended, reminded, resumed };
}
