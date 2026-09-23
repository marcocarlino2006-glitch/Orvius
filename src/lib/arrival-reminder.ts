/**
 * Pre-arrival nudge for a confirmed window — one SMS, within ARRIVAL_WINDOW.
 * Complements the single unconfirmed reminder; never a drip after grace.
 */

import { sendCustomerSms } from "@/lib/customer-sms";
import { logInfo, logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { jobIsCustomerNoShow } from "@/lib/job-no-show";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

/** Send when the window is between now and this many hours ahead. */
export const ARRIVAL_REMINDER_WITHIN_HOURS = 2;
/** Don't spam if the window is already underway. */
export const ARRIVAL_REMINDER_MIN_LEAD_MINUTES = 15;

function formatWindow(iso: Date | string | null | undefined): string | null {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shouldSendArrivalReminder(
  job: {
    status: string;
    scheduledAt: Date | null;
    customerConfirmedAt: Date | null;
    arrivalReminderSentAt: Date | null;
    onSiteAt?: Date | null;
    completedAt?: Date | null;
  },
  now = new Date(),
): boolean {
  if (job.onSiteAt || job.completedAt) return false;
  if (job.status !== "confirmed" && job.status !== "scheduled") return false;
  if (!job.customerConfirmedAt || !job.scheduledAt) return false;
  if (job.arrivalReminderSentAt) return false;

  const leadMs = job.scheduledAt.getTime() - now.getTime();
  const maxMs = ARRIVAL_REMINDER_WITHIN_HOURS * 60 * 60_000;
  const minMs = ARRIVAL_REMINDER_MIN_LEAD_MINUTES * 60_000;
  return leadMs <= maxMs && leadMs >= minMs;
}

export async function sendArrivalReminderSms(jobId: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      business: { select: { id: true, name: true } },
      customer: { select: { phone: true } },
      lead: { select: { phone: true } },
    },
  });
  if (!job?.business) return { sent: false, reason: "not_found" };
  if (!shouldSendArrivalReminder(job)) {
    return { sent: false, reason: "not_due" };
  }

  const to = job.customer?.phone?.trim() || job.lead?.phone?.trim() || null;
  if (!to) return { sent: false, reason: "no_phone" };

  const when = formatWindow(job.scheduledAt);
  const body = withSmsOptOutFooter(
    [
      `${job.business.name}: reminder — your service window is coming up`,
      when ? `Window: ${when}` : null,
      "Reply STOP to opt out. Call the shop if you need to change plans.",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  try {
    const result = await sendCustomerSms({
      businessId: job.businessId,
      to,
      body,
    });
    if (!result.sent) return result;

    await prisma.job.update({
      where: { id: jobId },
      data: { arrivalReminderSentAt: new Date() },
    });
    logInfo("job.arrival_reminder_sent", {
      jobId,
      businessId: job.businessId,
      sid: result.sid,
    });
    return { sent: true };
  } catch (error) {
    logWarn("job.arrival_reminder_failed", {
      jobId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}

export async function sendDueArrivalReminders(now = new Date(), limit = 25) {
  const horizon = new Date(
    now.getTime() + ARRIVAL_REMINDER_WITHIN_HOURS * 60 * 60_000,
  );
  const candidates = await prisma.job.findMany({
    where: {
      status: { in: ["scheduled", "confirmed"] },
      customerConfirmedAt: { not: null },
      arrivalReminderSentAt: null,
      completedAt: null,
      onSiteAt: null,
      scheduledAt: { gt: now, lte: horizon },
    },
    orderBy: { scheduledAt: "asc" },
    take: Math.max(1, Math.min(limit * 4, 100)),
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      customerConfirmedAt: true,
      arrivalReminderSentAt: true,
      onSiteAt: true,
      completedAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  for (const job of candidates) {
    if (sent >= limit) break;
    if (!shouldSendArrivalReminder(job, now)) {
      skipped += 1;
      continue;
    }
    const result = await sendArrivalReminderSms(job.id);
    if (result.sent) sent += 1;
    else skipped += 1;
  }

  return { checked: candidates.length, sent, skipped };
}

/**
 * One owner alert the first time a confirmed window is past grace with no
 * on-site — board already shows Call; this wakes the phone once.
 */
export async function alertDueCustomerNoShows(now = new Date(), limit = 25) {
  const candidates = await prisma.job.findMany({
    where: {
      status: { in: ["scheduled", "confirmed"] },
      customerConfirmedAt: { not: null },
      customerNoShowAlertedAt: null,
      completedAt: null,
      onSiteAt: null,
      scheduledAt: { lt: now },
    },
    orderBy: { scheduledAt: "asc" },
    take: Math.max(1, Math.min(limit * 4, 100)),
    include: {
      business: {
        select: {
          id: true,
          name: true,
          ownerPhone: true,
          ownerEmail: true,
        },
      },
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true, id: true } },
    },
  });

  let alerted = 0;
  for (const job of candidates) {
    if (alerted >= limit) break;
    if (!jobIsCustomerNoShow({ ...job, now })) continue;

    const who =
      job.customer?.name ??
      job.customer?.phone ??
      job.lead?.name ??
      job.lead?.phone ??
      "Customer";
    await enqueueOwnerAlert({
      businessId: job.businessId,
      leadId: job.lead?.id ?? undefined,
      dedupeKey: `customer-no-show:${job.id}`,
      businessName: job.business.name,
      ownerPhone: job.business.ownerPhone,
      ownerEmail: job.business.ownerEmail,
      message: [
        "Customer no-show — call to reschedule",
        job.title,
        who,
        formatWindow(job.scheduledAt) ?? "Window passed",
      ].join("\n"),
    });
    await prisma.job.update({
      where: { id: job.id },
      data: { customerNoShowAlertedAt: now },
    });
    alerted += 1;
  }

  return { checked: candidates.length, alerted };
}
