import { randomBytes } from "node:crypto";
import { sendCustomerSms } from "@/lib/customer-sms";
import { formatShopTime } from "@/lib/availability";
import { getAppBaseUrl } from "@/lib/domains";
import { logInfo, logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

export const CONFIRM_REMINDER_AFTER_HOURS = 12;
export const CONFIRM_REMINDER_MIN_LEAD_HOURS = 2;

function formatWindow(iso: Date | string | null | undefined, timezone: string): string | null {
  if (!iso) return null;
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatShopTime(date, timezone);
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
type ConfirmSendOptions = {
  reminder?: boolean;
  /** Automatic sends: skip a job whose first confirmation already went out. The owner's resend doesn't set this. */
  firstOnly?: boolean;
};

/** A send that crashed mid-flight frees the job after this. */
const CONFIRM_CLAIM_MS = 2 * 60_000;

export async function sendCustomerConfirmSms(jobId: string): Promise<{
  sent: boolean;
  reason?: string;
}>;
export async function sendCustomerConfirmSms(
  jobId: string,
  options: ConfirmSendOptions,
): Promise<{ sent: boolean; reason?: string }>;
export async function sendCustomerConfirmSms(
  jobId: string,
  options: ConfirmSendOptions = {},
): Promise<{ sent: boolean; reason?: string }> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          timezone: true,
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
  const when = formatWindow(job.scheduledAt, job.business.timezone);
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

  const claimAt = new Date();
  const claimed = await prisma.job.updateMany({
    where: {
      id: jobId,
      customerConfirmedAt: null,
      OR: [{ customerConfirmClaimAt: null }, { customerConfirmClaimAt: { lt: new Date(claimAt.getTime() - CONFIRM_CLAIM_MS) } }],
      ...(options.reminder
        ? { customerConfirmReminderSentAt: null }
        : options.firstOnly
          ? { customerConfirmSentAt: null }
          : {}),
    },
    data: { customerConfirmClaimAt: claimAt },
  });
  if (!claimed.count) return { sent: false, reason: "already_sending_or_sent" };
  const release = () =>
    prisma.job
      .updateMany({ where: { id: jobId, customerConfirmClaimAt: claimAt }, data: { customerConfirmClaimAt: null } })
      .catch(() => undefined);

  try {
    const result = await sendCustomerSms({
      businessId: job.businessId,
      to,
      body,
    });
    if (!result.sent) {
      await release();
      return result;
    }
    const sentAt = new Date();
    await prisma.job.update({
      where: { id: jobId },
      data: {
        ...(options.reminder
          ? { customerConfirmReminderSentAt: sentAt }
          : { customerConfirmSentAt: sentAt }),
        customerConfirmSid: result.sid ?? null,
        customerConfirmClaimAt: null,
      },
    });
    logInfo("customer.confirm_sms_sent", {
      jobId,
      businessId: job.businessId,
      sid: result.sid,
      reminder: Boolean(options.reminder),
    });
    return { sent: true };
  } catch (error) {
    await release();
    logWarn("customer.confirm_sms_failed", {
      jobId,
      error: error instanceof Error ? error.message : "send failed",
    });
    await alertOwnerConfirmFailed(jobId, "the text was rejected").catch(() => undefined);
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}

/**
 * The caller was told the shop would confirm. When the text cannot carry that,
 * the owner has to — once per job, however many receipts arrive.
 */
async function alertOwnerConfirmFailed(jobId: string, why: string) {
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, customerConfirmFailedAt: null, customerConfirmedAt: null },
    data: { customerConfirmFailedAt: new Date() },
  });
  if (!claimed.count) return false;
  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    select: {
      businessId: true,
      leadId: true,
      scheduledAt: true,
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true } },
      business: { select: { name: true, timezone: true, ownerPhone: true, ownerEmail: true } },
    },
  });
  const who = job.customer?.name || job.lead?.name || "The customer";
  const phone = job.customer?.phone || job.lead?.phone || "";
  const when = formatWindow(job.scheduledAt, job.business.timezone);
  await enqueueOwnerAlert({
    businessId: job.businessId,
    leadId: job.leadId ?? undefined,
    dedupeKey: `confirm-failed:${jobId}`,
    businessName: job.business.name,
    message: `Confirmation text to ${who}${phone ? ` (${phone})` : ""} did not go through — ${why}. Call to confirm${when ? ` ${when}` : ""}.`,
    ownerPhone: job.business.ownerPhone,
    ownerEmail: job.business.ownerEmail,
  });
  logWarn("customer.confirm_undelivered", { jobId, why });
  return true;
}

/** Apply Twilio's carrier verdict to a confirmation text. */
export async function applyCustomerConfirmReceipt(params: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string | null;
}) {
  const status = params.messageStatus.trim().toLowerCase();
  if (status !== "failed" && status !== "undelivered") return { matched: false, alerted: false };
  const job = await prisma.job.findFirst({
    where: { customerConfirmSid: params.messageSid },
    select: { id: true },
  });
  if (!job) return { matched: false, alerted: false };
  const why = params.errorCode ? `carrier error ${params.errorCode}` : `the carrier reported it ${status}`;
  return { matched: true, alerted: await alertOwnerConfirmFailed(job.id, why) };
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

/** A confirm link stops working a day after the visit, or once the job is closed. */
export const CONFIRM_LINK_GRACE_MS = 24 * 60 * 60 * 1000;

export function confirmLinkExpired(job: { status: string; scheduledAt: Date | null }, now: Date) {
  if (job.status === "cancelled" || job.status === "completed") return true;
  return Boolean(job.scheduledAt && now.getTime() > job.scheduledAt.getTime() + CONFIRM_LINK_GRACE_MS);
}

export async function confirmJobByCustomerToken(
  token: string,
  now = new Date(),
  { readOnly = false }: { readOnly?: boolean } = {},
) {
  const job = await prisma.job.findFirst({
    where: { customerConfirmToken: token },
    include: {
      business: { select: { id: true, name: true, timezone: true, vapiPhoneNumber: true, twilioPhone: true, phone: true } },
      customer: { select: { name: true, phone: true } },
      lead: { select: { name: true, phone: true } },
    },
  });

  if (!job) return { ok: false as const, error: "not_found" as const };
  const shop = {
    businessName: job.business.name,
    businessPhone: job.business.vapiPhoneNumber ?? job.business.twilioPhone ?? job.business.phone ?? null,
    timezone: job.business.timezone,
  };

  if (confirmLinkExpired(job, now)) {
    return { ok: false as const, error: "expired" as const, ...shop };
  }

  if (job.customerConfirmedAt || readOnly) {
    return {
      ok: true as const,
      already: Boolean(job.customerConfirmedAt),
      job: {
        id: job.id,
        title: job.title,
        scheduledAt: job.scheduledAt,
        ...shop,
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
      ...shop,
      status: updated.status,
    },
  };
}
