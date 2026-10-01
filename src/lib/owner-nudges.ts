import type { Business } from "@prisma/client";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing-entitlement";
import { includedCallsForPlan, usagePeriodStart } from "@/lib/call-usage";
import { getAppUrl } from "@/lib/env";
import { logInfo } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";

/*
  Messages the owner needs about their own account: a failed card, a line
  that isn't catching their main number yet, a month running past its calls.
  They ride the owner-alert queue, so they text and email with its retries,
  and each carries a dedupe key so a daily sweep sends it once.
*/

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DUE_REMINDER_DAY = 5;
const FORWARD_NUDGE_AFTER_MS = DAY_MS;
const FORWARD_NUDGE_WINDOW_MS = 14 * DAY_MS;
const USAGE_THRESHOLDS = [0.8, 1] as const;

type NudgeShop = Pick<Business, "id" | "name" | "ownerPhone" | "ownerEmail">;

const link = (path: string) => `${getAppUrl()}${path}`;
const day = (at: Date) => at.toISOString().slice(0, 10);

function nudge(shop: NudgeShop, dedupeKey: string, message: string) {
  return enqueueOwnerAlert({
    businessId: shop.id,
    businessName: shop.name,
    ownerPhone: shop.ownerPhone,
    ownerEmail: shop.ownerEmail,
    dedupeKey,
    message,
  });
}

/** Sent when Stripe first reports the plan past due. */
export async function alertPaymentFailed(shop: NudgeShop & { pastDueSince: Date | null; environment?: string | null }) {
  if (shop.environment === "test" || shop.environment === "demo" || !shop.pastDueSince) return;
  await nudge(
    shop,
    `billing:past_due:${shop.id}:${day(shop.pastDueSince)}`,
    `Orvius: the card payment for ${shop.name} failed. Everything keeps working for ${PAST_DUE_GRACE_DAYS} days while you update the card: ${link("/dashboard?settings=billing")}`,
  );
}

export async function sendOwnerNudges(now = new Date()) {
  const [pastDue, forwarding, usage] = await Promise.all([
    pastDueReminders(now),
    forwardingNudges(now),
    usageAlerts(now),
  ]);
  const sent = { pastDue, forwarding, usage };
  if (pastDue + forwarding + usage) logInfo("owner_nudges.queued", sent);
  return sent;
}

async function pastDueReminders(now: Date) {
  const shops = await prisma.business.findMany({
    where: {
      billingStatus: "past_due",
      environment: { notIn: ["test", "demo"] },
      pastDueSince: { lte: new Date(now.getTime() - PAST_DUE_REMINDER_DAY * DAY_MS) },
    },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, pastDueSince: true },
  });
  let queued = 0;
  for (const shop of shops) {
    const left = Math.max(0, PAST_DUE_GRACE_DAYS - Math.floor((now.getTime() - shop.pastDueSince!.getTime()) / DAY_MS));
    const result = await nudge(
      shop,
      `billing:past_due:${shop.id}:${day(shop.pastDueSince!)}:reminder`,
      left > 0
        ? `Orvius: ${shop.name}'s payment is still failing. Your dashboard locks in ${left} day${left === 1 ? "" : "s"}, and if the plan cancels the line stops answering. Update the card: ${link("/dashboard?settings=billing")}`
        : `Orvius: ${shop.name}'s payment is still failing and your dashboard is locked. If the plan cancels the line stops answering. Update the card: ${link("/dashboard?settings=billing")}`,
    );
    if (result.queued.length) queued += 1;
  }
  return queued;
}

async function forwardingNudges(now: Date) {
  const shops = await prisma.business.findMany({
    where: {
      isActive: true,
      environment: { notIn: ["test", "demo"] },
      billingStatus: "active",
      overflowForwardConfirmedAt: null,
      lineVerifiedAt: {
        gte: new Date(now.getTime() - FORWARD_NUDGE_WINDOW_MS),
        lte: new Date(now.getTime() - FORWARD_NUDGE_AFTER_MS),
      },
    },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true },
  });
  let queued = 0;
  for (const shop of shops) {
    const result = await nudge(
      shop,
      `setup:forward:${shop.id}`,
      `Orvius: ${shop.name}'s line works, but calls to your main number don't reach it yet. Forwarding takes about 2 minutes: ${link("/dashboard?settings=phone")}`,
    );
    if (result.queued.length) queued += 1;
  }
  return queued;
}

async function usageAlerts(now: Date) {
  const since = usagePeriodStart(now);
  const counts = await prisma.call.groupBy({
    by: ["businessId"],
    where: { direction: "inbound", createdAt: { gte: since } },
    _count: { _all: true },
  });
  const busy = new Map(counts.map((row) => [row.businessId, row._count._all]));
  if (!busy.size) return 0;

  const shops = await prisma.business.findMany({
    where: { id: { in: [...busy.keys()] }, billingStatus: "active", environment: { notIn: ["test", "demo"] } },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, billingPlan: true },
  });
  const period = day(since).slice(0, 7);
  let queued = 0;
  for (const shop of shops) {
    const used = busy.get(shop.id) ?? 0;
    const included = includedCallsForPlan(shop.billingPlan);
    if (!included) continue;
    const crossed = USAGE_THRESHOLDS.filter((t) => used >= included * t).at(-1);
    if (!crossed) continue;
    const result = await nudge(
      shop,
      `usage:${shop.id}:${period}:${crossed * 100}`,
      crossed >= 1
        ? `Orvius: ${shop.name} has used all ${included} included calls this month. Every call is still answered; extra calls bill at the overage rate. Plans: ${link("/dashboard?settings=billing")}`
        : `Orvius: ${shop.name} has used ${used} of ${included} included calls this month. Every call is still answered either way. Plans: ${link("/dashboard?settings=billing")}`,
    );
    if (result.queued.length) queued += 1;
  }
  return queued;
}
