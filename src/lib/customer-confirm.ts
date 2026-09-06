import { randomBytes } from "node:crypto";
import { getAppBaseUrl } from "@/lib/domains";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { sendSms } from "@/lib/twilio-sms";

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
}> {
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

  const to = job.customer?.phone?.trim() || job.lead?.phone?.trim() || null;
  if (!to) return { sent: false, reason: "no_customer_phone" };

  const token = await ensureCustomerConfirmToken(jobId);
  const when = formatWindow(job.scheduledAt);
  const shop = job.business.name;
  const body = withSmsOptOutFooter(
    [
      `${shop}: we have you down for service`,
      when ? `Proposed window: ${when}` : "We'll confirm timing shortly",
      `Confirm here: ${customerConfirmUrl(token)}`,
    ].join("\n"),
  );

  try {
    const result = await sendSms({ to, body });
    if (!result) {
      return { sent: false, reason: "sms_not_configured" };
    }
    logInfo("customer.confirm_sms_sent", {
      jobId,
      businessId: job.businessId,
      sid: result.sid,
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
