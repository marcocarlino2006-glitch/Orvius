import { prisma } from "@/lib/prisma";
import { completeWebhookEvent } from "@/lib/webhook-events";

const SOURCE = "deposit-sms";
const EVENT_TYPE = "delivery";
const FAILED_STATUSES = new Set(["failed", "undelivered"]);
const DELIVERED_STATUSES = new Set(["delivered", "read"]);

function depositIdFromPayload(payloadJson: string | null): string | null {
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as { depositId?: unknown };
    return typeof payload.depositId === "string" ? payload.depositId : null;
  } catch {
    return null;
  }
}

/**
 * Reconciles Twilio's carrier verdict with a pending deposit request.
 *
 * `messages.create` only confirms carrier acceptance. A terminal failure must
 * reopen the same deposit so the owner can retry instead of trusting a text
 * that never reached the customer.
 */
export async function applyDepositDeliveryReceipt(params: {
  messageSid: string;
  messageStatus: string;
  errorCode?: string;
}) {
  const delivery = await prisma.webhookEvent.findUnique({
    where: {
      source_externalId_eventType: {
        source: SOURCE,
        externalId: params.messageSid,
        eventType: EVENT_TYPE,
      },
    },
    select: { payloadJson: true },
  });

  if (!delivery) return { matched: false, reopened: false };

  const depositId = depositIdFromPayload(delivery.payloadJson);
  const status = params.messageStatus.toLowerCase();
  const failed = FAILED_STATUSES.has(status);
  const delivered = DELIVERED_STATUSES.has(status);
  const error = params.errorCode
    ? `Twilio error ${params.errorCode}`
    : failed
      ? `Twilio reported ${status}`
      : null;

  await completeWebhookEvent({
    source: SOURCE,
    externalId: params.messageSid,
    eventType: EVENT_TYPE,
    status: failed ? "failed" : delivered ? "processed" : "pending",
    payload: {
      depositId,
      messageStatus: status,
      errorCode: params.errorCode || null,
    },
    error,
  });

  if (!failed || !depositId) {
    return { matched: true, reopened: false };
  }

  const reopened = await prisma.deposit.updateMany({
    where: { id: depositId, status: "pending", sentAt: { not: null } },
    data: { sentAt: null },
  });

  return { matched: true, reopened: reopened.count > 0 };
}
