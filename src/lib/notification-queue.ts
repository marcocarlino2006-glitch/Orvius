import { getOwnerAlertOpenUrl } from "@/lib/owner-alert-message";
import { getWebhookUrl } from "@/lib/env";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/twilio-client";

export const NOTIFICATION_RETRY_MINUTES = [1, 5, 15, 60, 240];
const MAX_ATTEMPTS = 5;
const RETRY_MINUTES = NOTIFICATION_RETRY_MINUTES;

export type ChannelDeliveryStatus = "sent" | "failed" | "skipped" | "duplicate";

export type ChannelResult = {
  status: ChannelDeliveryStatus;
  id?: string;
  error?: string;
};

export type NotifyOwnerResult = {
  sms?: ChannelResult;
  email?: ChannelResult;
  duplicate?: boolean;
};

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export function getNotificationRetryAt(attempts: number, now = Date.now()) {
  const minutes = RETRY_MINUTES[Math.min(attempts, RETRY_MINUTES.length - 1)];
  return new Date(now + minutes * 60_000);
}

function retryAt(attempts: number) {
  return getNotificationRetryAt(attempts);
}

function buildBodies(params: {
  businessName: string;
  message: string;
  openUrl?: string | null;
}) {
  const smsBody = [
    `[Orvius] ${params.businessName}`,
    "",
    params.message,
    params.openUrl ? `\nOpen → ${params.openUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const emailBody = [
    `${params.businessName} — new activity`,
    "",
    params.message,
    params.openUrl ? `\nOpen in Orvius: ${params.openUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return { smsBody, emailBody };
}

async function resolveOpenUrl(leadId: string | null): Promise<string | null> {
  if (!leadId) return null;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { job: { select: { id: true } } },
  });
  if (!lead) return null;
  return getOwnerAlertOpenUrl({ leadId, jobId: lead.job?.id });
}

async function createQueueRow(params: {
  businessId: string;
  leadId?: string;
  channel: "sms" | "email";
  dedupeKey: string;
  businessName: string;
  message: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
}) {
  try {
    await prisma.ownerNotification.create({
      data: {
        businessId: params.businessId,
        leadId: params.leadId ?? null,
        channel: params.channel,
        dedupeKey: params.dedupeKey,
        status: "pending",
        businessName: params.businessName,
        message: params.message,
        ownerPhone: params.ownerPhone ?? null,
        ownerEmail: params.ownerEmail ?? null,
        nextRetryAt: new Date(),
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) return false;
    throw error;
  }
}

export async function enqueueOwnerAlert(params: {
  businessId: string;
  leadId?: string;
  dedupeKey: string;
  businessName: string;
  message: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
}) {
  const queued: Array<"sms" | "email"> = [];

  if (params.ownerPhone) {
    const created = await createQueueRow({
      ...params,
      channel: "sms",
    });
    if (created) queued.push("sms");
  }

  if (params.ownerEmail) {
    const created = await createQueueRow({
      ...params,
      channel: "email",
    });
    if (created) queued.push("email");
  }

  return { queued, duplicate: queued.length === 0 };
}

async function deliverQueuedRow(row: {
  id: string;
  channel: string;
  businessName: string | null;
  message: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  leadId: string | null;
  attempts: number;
  businessId: string;
  dedupeKey: string;
}): Promise<ChannelResult> {
  const businessName = row.businessName ?? "Your shop";
  const message = row.message ?? "New activity in Orvius.";
  const openUrl = await resolveOpenUrl(row.leadId);
  const { smsBody, emailBody } = buildBodies({
    businessName,
    message,
    openUrl,
  });

  if (row.channel === "sms") {
    if (
      process.env.ENABLE_OWNER_SMS !== "true" ||
      !row.ownerPhone ||
      !process.env.TWILIO_PHONE_NUMBER
    ) {
      await prisma.ownerNotification.update({
        where: { id: row.id },
        data: {
          status: "skipped",
          error: "SMS not enabled or owner phone missing",
          processedAt: new Date(),
        },
      });
      return {
        status: "skipped",
        error: "SMS not enabled or owner phone missing",
      };
    }

    const client = getTwilioClient();
    const sms = await client.messages.create({
      body: smsBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: row.ownerPhone,
      statusCallback:
        process.env.TWILIO_STATUS_CALLBACK_URL?.trim() ||
        getWebhookUrl("/api/webhooks/twilio/status"),
    });

    await prisma.ownerNotification.update({
      where: { id: row.id },
      data: {
        status: "sent",
        deliveryId: sms.sid,
        deliveryStatus: "queued",
        processedAt: new Date(),
        error: null,
      },
    });

    logInfo("notification.sms_sent", {
      businessId: row.businessId,
      leadId: row.leadId,
      dedupeKey: row.dedupeKey,
      sid: sms.sid,
    });

    return { status: "sent", id: sms.sid };
  }

  if (row.channel === "email") {
    if (!row.ownerEmail || !isEmailConfigured()) {
      await prisma.ownerNotification.update({
        where: { id: row.id },
        data: {
          status: "skipped",
          error: "Email not configured",
          processedAt: new Date(),
        },
      });
      return { status: "skipped", error: "Email not configured" };
    }

    const id = await sendOwnerEmail({
      to: row.ownerEmail,
      subject: `[Orvius] New lead — ${businessName}`,
      text: emailBody,
    });

    await prisma.ownerNotification.update({
      where: { id: row.id },
      data: {
        status: "sent",
        deliveryId: id,
        deliveryStatus: "sent",
        processedAt: new Date(),
        error: null,
      },
    });

    logInfo("notification.email_sent", {
      businessId: row.businessId,
      leadId: row.leadId,
      dedupeKey: row.dedupeKey,
      id,
    });

    return { status: "sent", id };
  }

  await prisma.ownerNotification.update({
    where: { id: row.id },
    data: {
      status: "skipped",
      error: `Unknown channel: ${row.channel}`,
      processedAt: new Date(),
    },
  });
  return { status: "skipped", error: `Unknown channel: ${row.channel}` };
}

async function markDeliveryFailure(
  row: { id: string; attempts: number },
  error: string,
) {
  const attempts = row.attempts + 1;
  const exhausted = attempts >= MAX_ATTEMPTS;

  await prisma.ownerNotification.update({
    where: { id: row.id },
    data: {
      status: exhausted ? "failed" : "pending",
      attempts,
      nextRetryAt: exhausted ? null : retryAt(attempts),
      error,
      processedAt: exhausted ? new Date() : null,
    },
  });
}

export async function processNotificationQueue(limit = 20) {
  const now = new Date();
  const rows = await prisma.ownerNotification.findMany({
    where: {
      status: "pending",
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const result = await deliverQueuedRow(row);
      if (result.status === "sent") sent += 1;
      else if (result.status === "skipped") skipped += 1;
    } catch (error) {
      failed += 1;
      const errMsg = error instanceof Error ? error.message : "Delivery failed";
      await markDeliveryFailure(row, errMsg);
      logError("notification.queue_delivery_failed", {
        notificationId: row.id,
        businessId: row.businessId,
        channel: row.channel,
        error: errMsg,
      });
    }
  }

  return { processed: rows.length, sent, failed, skipped };
}

export async function notifyOwnerSync(params: {
  businessId?: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  businessName: string;
  message: string;
  leadId?: string;
  dedupeKey: string;
}): Promise<NotifyOwnerResult> {
  if (params.businessId) {
    const enqueueResult = await enqueueOwnerAlert({
      businessId: params.businessId,
      leadId: params.leadId,
      dedupeKey: params.dedupeKey,
      businessName: params.businessName,
      message: params.message,
      ownerPhone: params.ownerPhone,
      ownerEmail: params.ownerEmail,
    });

    if (enqueueResult.duplicate) {
      return { duplicate: true };
    }

    await processNotificationQueue(10);

    const rows = await prisma.ownerNotification.findMany({
      where: {
        businessId: params.businessId,
        dedupeKey: params.dedupeKey,
      },
      select: { channel: true, status: true, deliveryId: true, error: true },
    });

    const result: NotifyOwnerResult = {};
    for (const row of rows) {
      const channelResult: ChannelResult = {
        status:
          row.status === "sent"
            ? "sent"
            : row.status === "failed"
              ? "failed"
              : row.status === "skipped"
                ? "skipped"
                : "duplicate",
        id: row.deliveryId ?? undefined,
        error: row.error ?? undefined,
      };
      if (row.channel === "sms") result.sms = channelResult;
      if (row.channel === "email") result.email = channelResult;
    }
    return result;
  }

  const { smsBody, emailBody } = buildBodies({
    businessName: params.businessName,
    message: params.message,
    openUrl: params.leadId
      ? getOwnerAlertOpenUrl({ leadId: params.leadId })
      : null,
  });

  const result: NotifyOwnerResult = {};

  if (
    process.env.ENABLE_OWNER_SMS === "true" &&
    params.ownerPhone &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    try {
      const client = getTwilioClient();
      const sms = await client.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: params.ownerPhone,
      });
      result.sms = { status: "sent", id: sms.sid };
    } catch (error) {
      result.sms = {
        status: "failed",
        error: error instanceof Error ? error.message : "SMS failed",
      };
    }
  }

  if (params.ownerEmail && isEmailConfigured()) {
    try {
      const id = await sendOwnerEmail({
        to: params.ownerEmail,
        subject: `[Orvius] New lead — ${params.businessName}`,
        text: emailBody,
      });
      result.email = { status: "sent", id };
    } catch (error) {
      result.email = {
        status: "failed",
        error: error instanceof Error ? error.message : "Email failed",
      };
    }
  }

  return result;
}
