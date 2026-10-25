import type { Business } from "@prisma/client";
import { PAST_DUE_GRACE_DAYS, PILOT_DAYS, PILOT_LINE_GRACE_DAYS, resolvePilotEndsAt } from "@/lib/billing-entitlement";
import { countBillableCalls } from "@/lib/billable-calls";
import { includedCallsForPlan, usagePeriodStart } from "@/lib/call-usage";
import { getAppUrl } from "@/lib/env";
import { logInfo } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { pageFounderForShop } from "@/lib/platform-pager";
import { planAdvice, planAdviceLine } from "@/lib/plan-advice";
import { getPlanById, OVERAGE_CENTS_PER_CALL, type PlanId } from "@/lib/pricing-plans";
import { prisma } from "@/lib/prisma";

/*
  Messages the owner needs about their own account: a failed card, a pilot
  about to lapse, a line that isn't catching their main number yet, a month
  running past its calls. They ride the owner-alert queue, so they text and
  email with its retries, and each carries a dedupe key so a daily sweep
  sends it once.
*/

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DUE_REMINDER_DAY = 5;
const PILOT_WARN_DAYS_LEFT = 7;
const PILOT_URGENT_DAYS_LEFT = 2;
const PILOT_FOUNDER_DAYS_DARK = 3;
const FORWARD_NUDGE_AFTER_MS = DAY_MS;
const FORWARD_REMINDER_DAY = 4;
const FORWARD_FOUNDER_DAY = 7;
const FORWARD_NUDGE_WINDOW_MS = 14 * DAY_MS;
const USAGE_THRESHOLDS = [0.8, 1] as const;
const USAGE_CHUNK = 400;

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
  const [pastDue, pilot, forwarding, usage] = await Promise.all([
    pastDueReminders(now),
    pilotSaveReminders(now),
    forwardingNudges(now),
    usageAlerts(now),
  ]);
  const sent = { pastDue, pilot, forwarding, usage };
  if (pastDue + pilot + forwarding + usage) logInfo("owner_nudges.queued", sent);
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

/*
  A paid line nobody forwards to takes no calls, and the owner cancels a month
  later for a product that never rang. Day one is a text, day four a second
  one, and at a week a person from Orvius calls to do it with them. A shop that
  is already getting real calls (forwarded or published) is left alone.
*/
/*
  A pilot nobody pays for lapses in silence: the forwarding nudges only cover
  paid plans, and the dashboard pay-prompt only speaks to owners who log in.
  A pilot costs a call audit to win, so its last week gets a text, its last
  days a sharper one, expiry names the grace left, and a pilot that proved
  value (the line took real calls) pages a person once it goes dark. Each
  milestone carries its own dedupe key, and every message stops the day the
  plan goes active, because the plan filter does.
*/
async function pilotSaveReminders(now: Date) {
  const shops = await prisma.business.findMany({
    where: {
      environment: { notIn: ["test", "demo"] },
      billingStatus: { in: ["pilot", "none"] },
    },
    select: {
      id: true,
      name: true,
      ownerPhone: true,
      ownerEmail: true,
      transferPhone: true,
      createdAt: true,
      pilotEndsAt: true,
    },
  });
  let queued = 0;
  for (const shop of shops) {
    if (!shop.ownerPhone && !shop.ownerEmail) continue;
    const ends = resolvePilotEndsAt({ pilotEndsAt: shop.pilotEndsAt, createdAt: shop.createdAt });
    if (!ends) continue;
    const daysLeft = Math.ceil((ends.getTime() - now.getTime()) / DAY_MS);
    if (daysLeft > PILOT_WARN_DAYS_LEFT) continue;
    const daysDark = Math.max(0, Math.ceil((now.getTime() - ends.getTime()) / DAY_MS));
    const calls = await countBillableCalls(shop, { gte: new Date(ends.getTime() - PILOT_DAYS * DAY_MS) });
    const callWord = calls === 1 ? "call" : "calls";
    const leftWord = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
    if (daysLeft > PILOT_URGENT_DAYS_LEFT) {
      const result = await nudge(
        shop,
        `setup:pilot:${shop.id}:week`,
        calls > 0
          ? `Orvius: ${shop.name}'s pilot ends in ${leftWord(daysLeft)}. Your line took ${calls} ${callWord} — pay with card to keep it answering: ${link("/dashboard/billing")}`
          : `Orvius: ${shop.name}'s pilot ends in ${leftWord(daysLeft)} and no customer calls have come through yet. Your receptionist is answering. Put the number where customers call you: ${link("/dashboard?settings=phone")}`,
      );
      if (result.queued.length) queued += 1;
      continue;
    }
    if (daysLeft > 0) {
      const result = await nudge(
        shop,
        `setup:pilot:${shop.id}:urgent`,
        calls > 0
          ? `Orvius: ${shop.name}'s pilot ends in ${leftWord(daysLeft)}. Don't lose the line that took ${calls} ${callWord} — pay with card: ${link("/dashboard/billing")}`
          : `Orvius: ${shop.name}'s pilot ends in ${leftWord(daysLeft)} and still no customer calls. Your receptionist is answering. Put the number where customers call you: ${link("/dashboard?settings=phone")}`,
      );
      if (result.queued.length) queued += 1;
      continue;
    }
    const graceLeft = PILOT_LINE_GRACE_DAYS - daysDark;
    if (graceLeft > 0) {
      const result = await nudge(
        shop,
        `setup:pilot:${shop.id}:ended`,
        `Orvius: ${shop.name}'s pilot ended. Your line keeps answering for ${leftWord(graceLeft)} while you decide — one tap keeps it: ${link("/dashboard/billing")}`,
      );
      if (result.queued.length) queued += 1;
      continue;
    }
    const result = await nudge(
      shop,
      `setup:pilot:${shop.id}:dark`,
      `Orvius: ${shop.name}'s line stopped answering — the pilot ended and the grace ran out. Pay with card to turn it back on: ${link("/dashboard/billing")}`,
    );
    if (result.queued.length) queued += 1;
    if (daysDark >= PILOT_FOUNDER_DAYS_DARK && calls > 0) {
      await pageFounderForShop(
        shop.id,
        "pilot_lapsed",
        `Orvius: ${shop.name}'s pilot ended ${daysDark} days ago after the line took ${calls} ${callWord}, and nobody paid. Worth a call before they go cold: ${shop.ownerPhone ?? "no phone"}${shop.ownerEmail ? `, ${shop.ownerEmail}` : ""}.`,
        now,
      ).catch(() => null);
    }
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
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, transferPhone: true, lineVerifiedAt: true },
  });
  let queued = 0;
  for (const shop of shops) {
    if ((await countBillableCalls(shop, { gte: shop.lineVerifiedAt! })) > 0) continue;
    const days = Math.floor((now.getTime() - shop.lineVerifiedAt!.getTime()) / DAY_MS);
    const result = await nudge(
      shop,
      days >= FORWARD_REMINDER_DAY ? `setup:forward:${shop.id}:reminder` : `setup:forward:${shop.id}`,
      days >= FORWARD_REMINDER_DAY
        ? `Orvius: ${shop.name} hasn't had a customer call yet. The receptionist is on. Put the number where customers reach you: ${link("/dashboard?settings=phone")}`
        : `Orvius: ${shop.name}'s receptionist is answering. Put that number where customers call you: ${link("/dashboard?settings=phone")}`,
    );
    if (result.queued.length) queued += 1;
    if (days >= FORWARD_FOUNDER_DAY) {
      await pageFounderForShop(
        shop.id,
        "no_forwarding",
        `Orvius: ${shop.name} has paid for a week and taken no customer calls. The receptionist is on the assigned number. Worth a call if they expected an older number to ring it: ${shop.ownerPhone ?? "no phone"}${shop.ownerEmail ? `, ${shop.ownerEmail}` : ""}.`,
        now,
      ).catch(() => null);
    }
  }
  return queued;
}

async function usageAlerts(now: Date) {
  const since = usagePeriodStart(now);
  const shops = await prisma.business.findMany({
    where: { billingStatus: "active", environment: { notIn: ["test", "demo"] } },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, transferPhone: true, billingPlan: true },
  });
  if (!shops.length) return 0;

  /* Chunked because an id list as long as the customer base outgrows the
     database's bound-parameter limit once enough shops are taking calls. */
  const busy = new Map<string, number>();
  for (let i = 0; i < shops.length; i += USAGE_CHUNK) {
    const counts = await prisma.call.groupBy({
      by: ["businessId"],
      where: {
        businessId: { in: shops.slice(i, i + USAGE_CHUNK).map((s) => s.id) },
        direction: "inbound",
        createdAt: { gte: since },
      },
      _count: { _all: true },
    });
    for (const row of counts) if (row.businessId) busy.set(row.businessId, row._count._all);
  }
  const period = day(since).slice(0, 7);
  let queued = 0;
  for (const shop of shops) {
    const included = includedCallsForPlan(shop.billingPlan);
    if (!included) continue;
    // The grouped count is every inbound call; only a shop it puts near a threshold pays for the exact billable count.
    if ((busy.get(shop.id) ?? 0) < included * USAGE_THRESHOLDS[0]) continue;
    const used = await countBillableCalls(shop, { gte: since });
    const crossed = USAGE_THRESHOLDS.filter((t) => used >= included * t).at(-1);
    if (!crossed) continue;
    const advice = planAdvice({ used, planId: shop.billingPlan, now });
    const pace = advice ? ` ${planAdviceLine(advice, getPlanById(shop.billingPlan as PlanId).name)}` : "";
    const result = await nudge(
      shop,
      `usage:${shop.id}:${period}:${crossed * 100}`,
      crossed >= 1
        ? `Orvius: ${shop.name} has used all ${included} included calls this month. Every call is still answered; each extra call is ${OVERAGE_CENTS_PER_CALL}¢, invoiced once after the month ends.${pace} Plans: ${link("/dashboard?settings=billing")}`
        : `Orvius: ${shop.name} has used ${used} of ${included} included calls this month. Every call is still answered either way.${pace} Plans: ${link("/dashboard?settings=billing")}`,
    );
    if (result.queued.length) queued += 1;
  }
  return queued;
}
