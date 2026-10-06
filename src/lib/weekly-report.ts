import type { Business } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/domains";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getShopOutcomes, type ShopOutcomes } from "@/lib/shop-outcomes";
import { sendSms } from "@/lib/twilio-sms";

/**
 * What the owner reads on Monday morning: what the line did last week, in
 * counts Orvius measured. Dollar figures appear only as estimates at the
 * owner's own average ticket, or as payments they recorded — never invented.
 */

export const WEEKLY_REPORT_INTERVAL_MS = 6.5 * 24 * 60 * 60_000;

const money = (cents: number) =>
  `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function buildWeeklyReportEmail(outcomes: ShopOutcomes, shopName: string, dashboardUrl: string) {
  const subject =
    outcomes.calls === 0
      ? `${shopName}: no calls reached your line last week`
      : `${shopName} last week: ${plural(outcomes.calls, "call")} answered, ${plural(outcomes.jobsBooked, "job")} booked`;

  const lines: string[] = [`Here's what your line did in the last ${outcomes.windowDays} days.`, ""];
  if (outcomes.calls === 0) {
    lines.push(
      "No calls reached your Orvius line. If you expected some, check that your shop number forwards to it — open Settings → Phone.",
    );
  } else {
    lines.push(`• ${plural(outcomes.calls, "call")} answered`);
    lines.push(`• ${plural(outcomes.leads, "request")} captured`);
    lines.push(`• ${plural(outcomes.jobsBooked, "job")} booked`);
    if (outcomes.afterHoursLeads > 0) {
      lines.push(
        `• ${plural(outcomes.afterHoursLeads, "after-hours request")}, ${outcomes.afterHoursBooked} booked`,
      );
    }
    if (outcomes.emergenciesBooked > 0) lines.push(`• ${plural(outcomes.emergenciesBooked, "emergency", "emergencies")} booked`);
    if (outcomes.jobsCompleted > 0) lines.push(`• ${plural(outcomes.jobsCompleted, "job")} marked complete`);
  }

  const moneyLines: string[] = [];
  if (outcomes.collectedCents > 0) moneyLines.push(`• ${money(outcomes.collectedCents)} in payments you recorded`);
  if (outcomes.capturedDemandEstimatedValueCents != null && outcomes.capturedDemandJobs > 0) {
    moneyLines.push(
      `• About ${money(outcomes.capturedDemandEstimatedValueCents)} in work from calls Orvius answered (${plural(outcomes.capturedDemandJobs, "job")} at your average ticket)`,
    );
  }
  if (moneyLines.length) lines.push("", ...moneyLines);

  const completed = outcomes.weeks.filter((w) => !w.partial);
  const [prior, latest] = completed.slice(-2);
  if (prior && latest && (prior.booked > 0 || latest.booked > 0)) {
    lines.push("", `Booked from calls: ${latest.booked} this week vs ${prior.booked} the week before.`);
  }

  if (outcomes.unassignedJobs > 0) {
    lines.push("", `${plural(outcomes.unassignedJobs, "job")} still ${outcomes.unassignedJobs === 1 ? "needs" : "need"} a technician.`);
  }

  lines.push("", `See every call: ${dashboardUrl}`, "", "— Orvius");
  return { subject, text: lines.join("\n") };
}

export function weeklyReportDue(business: Pick<Business, "weeklyReportSentAt" | "createdAt">, now = new Date()) {
  if (now.getTime() - business.createdAt.getTime() < 7 * 24 * 60 * 60_000) return false;
  return !business.weeklyReportSentAt || now.getTime() - business.weeklyReportSentAt.getTime() >= WEEKLY_REPORT_INTERVAL_MS;
}

export async function sendDueWeeklyReports(now = new Date(), limit = 50) {
  if (!isEmailConfigured()) return { sent: 0, skipped: "email not configured" };
  // Due shops only, longest-waiting first: a fixed first 500 left every shop past them without a report.
  const shops = await prisma.business.findMany({
    where: {
      isActive: true,
      environment: { notIn: ["test", "demo"] },
      ownerEmail: { not: null },
      createdAt: { lte: new Date(now.getTime() - 7 * 24 * 60 * 60_000) },
      OR: [{ weeklyReportSentAt: null }, { weeklyReportSentAt: { lte: new Date(now.getTime() - WEEKLY_REPORT_INTERVAL_MS) } }],
    },
    orderBy: { weeklyReportSentAt: { sort: "asc", nulls: "first" } },
    take: limit * 2,
  });
  let sent = 0;
  for (const shop of shops) {
    if (sent >= limit) break;
    if (!shop.ownerEmail || !weeklyReportDue(shop, now)) continue;
    const claimed = await prisma.business.updateMany({
      where: { id: shop.id, weeklyReportSentAt: shop.weeklyReportSentAt },
      data: { weeklyReportSentAt: now },
    });
    if (!claimed.count) continue;
    try {
      const outcomes = await getShopOutcomes(shop.id, 7);
      const email = buildWeeklyReportEmail(outcomes, shop.name, `${getAppBaseUrl()}/dashboard`);
      await sendOwnerEmail({ to: shop.ownerEmail, ...email });
      sent += 1;
      logInfo("weekly_report.sent", { businessId: shop.id, calls: outcomes.calls });
    } catch (error) {
      await prisma.business.updateMany({
        where: { id: shop.id, weeklyReportSentAt: now },
        data: { weeklyReportSentAt: shop.weeklyReportSentAt },
      });
      logWarn("weekly_report.failed", { businessId: shop.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { sent };
}

/**
 * The same week in one text, because the owner reads texts and skims email.
 * Only measured counts and money that actually moved — no estimates.
 */
export function buildWeeklyValueText(outcomes: ShopOutcomes, shopName: string) {
  if (outcomes.calls === 0) {
    return (
      `Orvius · ${shopName}: no calls reached your line in the last ${outcomes.windowDays} days. ` +
      "If that's wrong, check that your shop number forwards to Orvius (Settings → Phone)."
    );
  }
  const parts = [`${plural(outcomes.calls, "call")} answered`, `${plural(outcomes.jobsBooked, "job")} booked`];
  if (outcomes.afterHoursBooked > 0) parts.push(`${outcomes.afterHoursBooked} of them after hours`);
  if (outcomes.collectedCents > 0) parts.push(`${money(outcomes.collectedCents)} collected`);
  const lines = [`Orvius · ${shopName}, last ${outcomes.windowDays} days: ${parts.join(", ")}.`];
  if (outcomes.openInvoiceCents > 0) lines.push(`${money(outcomes.openInvoiceCents)} in bills still unpaid.`);
  if (outcomes.unassignedJobs > 0) lines.push(`${plural(outcomes.unassignedJobs, "job")} still ${outcomes.unassignedJobs === 1 ? "needs" : "need"} a tech.`);
  lines.push("Reply TODAY for today's board.");
  return lines.join(" ");
}

type WeeklyTexts = { toOwner: typeof sendSms };

/** Monday, 8–11 AM where the shop is: the one window the weekly text goes out. */
export function inWeeklyTextWindow(timezone: string, now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", hourCycle: "h23" }).formatToParts(now);
    const weekday = parts.find((p) => p.type === "weekday")?.value;
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    return weekday === "Mon" && hour >= 8 && hour < 11;
  } catch {
    return false;
  }
}

/*
  Driven every 30 minutes. Only zones in their Monday-morning window are
  queried, so shops elsewhere never crowd the batch, and a budget stops the run
  before the cron's own deadline.
*/
export async function sendDueWeeklyTexts(
  options: { now?: Date; limit?: number; budgetMs?: number; texts?: WeeklyTexts } = {},
) {
  const now = options.now ?? new Date();
  const texts = options.texts ?? { toOwner: sendSms };
  const started = Date.now();
  const zones = await prisma.business.groupBy({ by: ["timezone"], where: { isActive: true, environment: "production" } });
  const open = zones.map((z) => z.timezone).filter((tz) => inWeeklyTextWindow(tz, now));
  if (!open.length) return { sent: 0 };

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const lastDue = new Date(now.getTime() - WEEKLY_REPORT_INTERVAL_MS);
  const shops = await prisma.business.findMany({
    where: {
      isActive: true,
      environment: "production",
      timezone: { in: open },
      ownerPhone: { not: null },
      ownerSmsOptOutAt: null,
      createdAt: { lte: weekAgo },
      OR: [{ weeklyTextSentAt: null }, { weeklyTextSentAt: { lte: lastDue } }],
    },
    orderBy: { weeklyTextSentAt: { sort: "asc", nulls: "first" } },
    select: { id: true, name: true, ownerPhone: true, weeklyTextSentAt: true },
    take: options.limit ?? 300,
  });
  let sent = 0;
  for (const shop of shops) {
    if (options.budgetMs && Date.now() - started > options.budgetMs) break;
    const claimed = await prisma.business.updateMany({
      where: { id: shop.id, weeklyTextSentAt: shop.weeklyTextSentAt },
      data: { weeklyTextSentAt: now },
    });
    if (!claimed.count || !shop.ownerPhone) continue;
    try {
      const outcomes = await getShopOutcomes(shop.id, 7);
      const result = await texts.toOwner({
        to: shop.ownerPhone,
        businessId: shop.id,
        audience: "owner",
        body: buildWeeklyValueText(outcomes, shop.name),
      });
      if (!result) throw new Error("sms not sent");
      sent += 1;
    } catch (error) {
      await prisma.business.updateMany({
        where: { id: shop.id, weeklyTextSentAt: now },
        data: { weeklyTextSentAt: shop.weeklyTextSentAt },
      });
      logWarn("weekly_text.failed", { businessId: shop.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { sent };
}
