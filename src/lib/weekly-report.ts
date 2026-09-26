import type { Business } from "@prisma/client";
import { getAppBaseUrl } from "@/lib/domains";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getShopOutcomes, type ShopOutcomes } from "@/lib/shop-outcomes";

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
    lines.push("", `${plural(outcomes.unassignedJobs, "job")} still need a technician.`);
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
  const shops = await prisma.business.findMany({
    where: { isActive: true, environment: { not: "test" }, ownerEmail: { not: null } },
    take: 500,
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
