import { getOwnerAlertOpenUrl } from "@/lib/owner-alert-message";
import { getWebhookUrl } from "@/lib/env";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { getTwilioClient } from "@/lib/twilio-client";

/*
  Each rung is the wait after the attempt of that number: a first failure is
  retried in a minute, a second in five, and so on. Five rungs therefore means
  a sixth and last attempt four hours after the first, which is why the cap is
  derived here rather than written down twice.

  It used to be written down twice, as `MAX_ATTEMPTS = 5` alongside an index of
  `Math.min(attempts, length - 1)`, and the two disagreed. A first failure took
  the second rung, so the one-minute retry never happened and the four-hour one
  never did either — four rungs of a five-rung ladder, off by one at both ends.
  The mirrored copy in trust-stack.test.mjs called it with 0 and got a minute
  back, which is how the rung stayed published for as long as it did.
*/
export const NOTIFICATION_RETRY_MINUTES = [1, 5, 15, 60, 240];
export const MAX_ATTEMPTS = NOTIFICATION_RETRY_MINUTES.length + 1;
const RETRY_MINUTES = NOTIFICATION_RETRY_MINUTES;

/*
  How long a drain may hold a row before another drain may take it back. Long
  enough that a slow Twilio or Resend call is never stolen mid-flight, short
  enough that a process killed between claiming and sending does not strand an
  owner's alert for the rest of the night.
*/
const CLAIM_LEASE_MINUTES = 10;

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

/** `attempts` is the number of tries already made, so the first failure is 1. */
export function getNotificationRetryAt(attempts: number, now = Date.now()) {
  const rung = Math.min(Math.max(attempts, 1), RETRY_MINUTES.length);
  return new Date(now + RETRY_MINUTES[rung - 1] * 60_000);
}

function retryAt(attempts: number) {
  return getNotificationRetryAt(attempts);
}

function buildBodies(params: {
  businessName: string;
  message: string;
  openUrl?: string | null;
}) {
  const smsBody = withSmsOptOutFooter(
    [
      `[Orvius] ${params.businessName}`,
      "",
      params.message,
      params.openUrl ? `\nOpen → ${params.openUrl}` : null,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  );

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

/** Stamp Call.ownerNotifiedAt only after real delivery — never on enqueue. */
async function markCallOwnerNotifiedFromLead(leadId: string | null) {
  if (!leadId) return;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { callId: true },
  });
  if (!lead?.callId) return;
  await prisma.call.updateMany({
    where: { id: lead.callId, ownerNotifiedAt: null },
    data: { ownerNotifiedAt: new Date() },
  });
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
    const shop = await prisma.business.findUnique({
      where: { id: params.businessId },
      select: { ownerSmsOptOutAt: true },
    });
    if (shop?.ownerSmsOptOutAt) {
      logInfo("notification.sms_suppressed_opt_out", {
        businessId: params.businessId,
        dedupeKey: params.dedupeKey,
      });
    } else {
      const created = await createQueueRow({
        ...params,
        channel: "sms",
      });
      if (created) queued.push("sms");
    }
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

    const shop = await prisma.business.findUnique({
      where: { id: row.businessId },
      select: { ownerSmsOptOutAt: true },
    });
    if (shop?.ownerSmsOptOutAt) {
      await prisma.ownerNotification.update({
        where: { id: row.id },
        data: {
          status: "skipped",
          error: "Owner SMS opted out",
          processedAt: new Date(),
        },
      });
      return { status: "skipped", error: "Owner SMS opted out" };
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

    await markCallOwnerNotifiedFromLead(row.leadId);

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

    await markCallOwnerNotifiedFromLead(row.leadId);

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

async function escalateSmsFailureToEmail(row: {
  businessId: string;
  leadId: string | null;
  dedupeKey: string;
  businessName: string | null;
  message: string | null;
  ownerEmail: string | null;
}) {
  if (!isEmailConfigured()) return;

  /*
    The address is read off the shop when the queue row does not carry one.
    Taking it from the row alone had the failover exactly backwards: it fired
    only when the call site had already asked for an email — so the owner had
    the news in hand hours before the SMS gave up — and never fired for a shop
    alerted by SMS alone, which is the one case it exists for.
  */
  let ownerEmail = row.ownerEmail;
  if (!ownerEmail) {
    const shop = await prisma.business.findUnique({
      where: { id: row.businessId },
      select: { ownerEmail: true },
    });
    ownerEmail = shop?.ownerEmail ?? null;
  }
  if (!ownerEmail) return;

  /* Nothing to fall back to if this same alert already reached them by email. */
  const alreadyEmailed = await prisma.ownerNotification.findFirst({
    where: {
      businessId: row.businessId,
      dedupeKey: row.dedupeKey,
      channel: "email",
      status: "sent",
    },
    select: { id: true },
  });
  if (alreadyEmailed) return;

  await createQueueRow({
    businessId: row.businessId,
    leadId: row.leadId ?? undefined,
    channel: "email",
    dedupeKey: `${row.dedupeKey}:sms-failover`,
    businessName: row.businessName ?? "Your shop",
    message:
      row.message ??
      "New activity in Orvius (SMS delivery failed — email backup).",
    ownerEmail,
  });
  logInfo("notification.sms_failover_email_enqueued", {
    businessId: row.businessId,
    dedupeKey: row.dedupeKey,
  });
}

async function markDeliveryFailure(
  row: {
    id: string;
    attempts: number;
    channel: string;
    businessId: string;
    leadId: string | null;
    dedupeKey: string;
    businessName: string | null;
    message: string | null;
    ownerEmail: string | null;
  },
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

  if (exhausted && row.channel === "sms") {
    try {
      await escalateSmsFailureToEmail(row);
    } catch (escalateError) {
      logError("notification.sms_failover_email_failed", {
        businessId: row.businessId,
        error:
          escalateError instanceof Error
            ? escalateError.message
            : "escalate failed",
      });
    }
  }
}

export async function processNotificationQueue(limit = 20) {
  const now = new Date();
  const rows = await prisma.ownerNotification.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "pending", nextRetryAt: null },
        { status: "pending", nextRetryAt: { lte: now } },
        /* A drain that died mid-send left its claim behind. The expired lease
           is what puts the row back in reach of the next one. */
        { status: "sending", nextRetryAt: { lte: now } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    /*
      Two drains overlap the moment one of them runs longer than the gap
      between schedules, and both would read the same due row and send it.
      The claim is a compare-and-swap on the values this drain read: whichever
      write lands first moves the lease, and the loser's update matches nothing
      and moves on. An owner hearing about the same call twice is a smaller
      problem than never hearing about it, but it is still a problem.
    */
    const claimed = await prisma.ownerNotification.updateMany({
      where: {
        id: row.id,
        status: row.status,
        attempts: row.attempts,
        nextRetryAt: row.nextRetryAt,
      },
      data: {
        status: "sending",
        nextRetryAt: new Date(Date.now() + CLAIM_LEASE_MINUTES * 60_000),
      },
    });
    if (claimed.count !== 1) continue;
    processed += 1;

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

  return { processed, sent, failed, skipped };
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
