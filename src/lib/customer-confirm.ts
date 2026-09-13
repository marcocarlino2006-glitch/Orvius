import { randomBytes } from "node:crypto";
import { sendCustomerSms } from "@/lib/customer-sms";
import { getAppBaseUrl } from "@/lib/domains";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

export const CONFIRM_REMINDER_AFTER_HOURS = 12;
export const CONFIRM_REMINDER_MIN_LEAD_HOURS = 2;

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

export function customerConfirmUrl(token: string): string {
  return `${getAppBaseUrl()}/c/${token}`;
}

export async function ensureCustomerConfirmToken(jobId: string): Promise<string> {
  const existing = await prisma.job.findUnique({
    where: { id: jobId },
    select: { customerConfirmToken: true },
  });
  if (existing?.customerConfirmToken) return existing.customerConfirmToken;

  for (let attempt = 0; attempt < 5; attempt++) {
    const token = randomBytes(18).toString("base64url");
    try {
      await prisma.job.update({
        where: { id: jobId },
        data: { customerConfirmToken: token },
      });
      return token;
    } catch {
      /* unique collision — retry */
    }
  }
  throw new Error("Could not allocate customer confirm token");
}

/**
 * Ask the customer to confirm the proposed window.
 * Until they confirm, the job is a proposed schedule — not a locked appointment.
 */
export async function sendCustomerConfirmSms(jobId: string): Promise<{
  sent: boolean;
  reason?: string;
}>;
export async function sendCustomerConfirmSms(
  jobId: string,
  options: { reminder?: boolean },
): Promise<{ sent: boolean; reason?: string }>;
export async function sendCustomerConfirmSms(
  jobId: string,
  options: { reminder?: boolean } = {},
): Promise<{ sent: boolean; reason?: string }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          twilioPhone: true,
          vapiPhoneNumber: true,
        },
      },
      customer: { select: { phone: true, name: true } },
      lead: { select: { phone: true, name: true } },
    },
  });

  if (!job) return { sent: false, reason: "not_found" };
  if (job.customerConfirmedAt) return { sent: false, reason: "already_confirmed" };
  if (options.reminder && job.customerConfirmReminderSentAt) {
    return { sent: false, reason: "reminder_already_sent" };
  }

  const to = job.customer?.phone?.trim() || job.lead?.phone?.trim() || null;
  if (!to) return { sent: false, reason: "no_customer_phone" };

  const token = await ensureCustomerConfirmToken(jobId);
  const when = formatWindow(job.scheduledAt);
  const shop = job.business.name;
  const body = withSmsOptOutFooter(
    [
      options.reminder
        ? `${shop}: please confirm your proposed service window`
        : `${shop}: we have you down for service`,
      when ? `Proposed window: ${when}` : "We'll confirm timing shortly",
      `Confirm here: ${customerConfirmUrl(token)}`,
    ].join("\n"),
  );

  try {
    const result = await sendCustomerSms({
      businessId: job.businessId,
      to,
      body,
    });
    if (!result.sent) return result;
    const sentAt = new Date();
    await prisma.job.update({
      where: { id: jobId },
      data: options.reminder
        ? { customerConfirmReminderSentAt: sentAt }
        : { customerConfirmSentAt: sentAt },
    });
    logInfo("customer.confirm_sms_sent", {
      jobId,
      businessId: job.businessId,
      sid: result.sid,
      reminder: Boolean(options.reminder),
    });
    return { sent: true };
  } catch (error) {
    logWarn("customer.confirm_sms_failed", {
      jobId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}

export function shouldSendConfirmationReminder(
  job: {
    status: string;
    scheduledAt: Date | null;
    customerConfirmedAt: Date | null;
    customerConfirmSentAt: Date | null;
    customerConfirmReminderSentAt: Date | null;
  },
  now = new Date(),
) {
  if (job.status !== "scheduled") return false;
  if (
    !job.scheduledAt ||
    job.customerConfirmedAt ||
    !job.customerConfirmSentAt ||
    job.customerConfirmReminderSentAt
  ) {
    return false;
  }

  const ageMs = now.getTime() - job.customerConfirmSentAt.getTime();
  const leadMs = job.scheduledAt.getTime() - now.getTime();
  return (
    ageMs >= CONFIRM_REMINDER_AFTER_HOURS * 60 * 60_000 &&
    leadMs >= CONFIRM_REMINDER_MIN_LEAD_HOURS * 60 * 60_000
  );
}

/**
 * One operational reminder for a proposed window that remains unconfirmed.
 * No repeated drip campaign: one retry is useful; more becomes harassment.
 */
export async function sendDueCustomerConfirmationReminders(
  now = new Date(),
  limit = 25,
) {
  const candidates = await prisma.job.findMany({
    where: {
      status: "scheduled",
      customerConfirmedAt: null,
      customerConfirmSentAt: { not: null },
      customerConfirmReminderSentAt: null,
      scheduledAt: { gt: now },
    },
    orderBy: { customerConfirmSentAt: "asc" },
    take: Math.max(1, Math.min(limit * 4, 100)),
    select: {
      id: true,
      status: true,
      scheduledAt: true,
      customerConfirmedAt: true,
      customerConfirmSentAt: true,
      customerConfirmReminderSentAt: true,
    },
  });

  let sent = 0;
  let skipped = 0;
  for (const job of candidates) {
    if (sent >= limit) break;
    if (!shouldSendConfirmationReminder(job, now)) continue;
    const result = await sendCustomerConfirmSms(job.id, { reminder: true });
    if (result.sent) sent += 1;
    else skipped += 1;
  }

  return { checked: candidates.length, sent, skipped };
}

export async function confirmJobByCustomerToken(token: string) {
  const job = await prisma.job.findFirst({
    where: { customerConfirmToken: token },
    include: {
      business: { select: { id: true, name: true } },
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true } },
    },
  });

  if (!job) return { ok: false as const, error: "not_found" as const };

  if (job.customerConfirmedAt) {
    return {
      ok: true as const,
      already: true as const,
      job: {
        id: job.id,
        title: job.title,
        scheduledAt: job.scheduledAt,
        businessName: job.business.name,
        status: job.status,
      },
    };
  }

  const updated = await prisma.job.update({
    where: { id: job.id },
    data: {
      customerConfirmedAt: new Date(),
      status: job.status === "scheduled" ? "confirmed" : job.status,
      confirmedAt: job.confirmedAt ?? new Date(),
    },
  });

  logInfo("customer.confirm_accepted", {
    jobId: job.id,
    businessId: job.businessId,
  });

  return {
    ok: true as const,
    already: false as const,
    job: {
      id: updated.id,
      title: updated.title,
      scheduledAt: updated.scheduledAt,
      businessName: job.business.name,
      status: updated.status,
    },
  };
}
