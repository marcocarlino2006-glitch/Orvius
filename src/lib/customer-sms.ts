import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { isTextableNumber } from "@/lib/sms-destination";
import { sendSms } from "@/lib/twilio-sms";

export type CustomerSmsResult =
  | { sent: true; sid: string }
  | {
      sent: false;
      reason:
        | "invalid_customer_phone"
        | "unsupported_destination"
        | "customer_opted_out"
        | "human_takeover"
        | "sms_not_configured";
    };

/**
 * The only outbound SMS path for customers.
 *
 * Owner and technician operational messages have separate consent contexts.
 * Anything directed to a caller/customer must pass the shop-scoped STOP
 * record here so a new feature cannot accidentally bypass it. A person who
 * took the conversation over silences Orvius here too; their own texts
 * (author "owner") still go.
 */
export async function sendCustomerSms(params: {
  businessId: string;
  to: string;
  body: string;
  author?: "orvius" | "owner";
}): Promise<CustomerSmsResult> {
  const normalized = normalizePhone(params.to);
  if (!normalized) {
    return { sent: false, reason: "invalid_customer_phone" };
  }
  if (!isTextableNumber(normalized)) {
    return { sent: false, reason: "unsupported_destination" };
  }

  const key = { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized: normalized } };
  const [optedOut, takeover] = await Promise.all([
    prisma.smsOptOut.findUnique({ where: key, select: { clearedAt: true } }),
    params.author === "owner"
      ? null
      : prisma.takeover.findUnique({ where: key, select: { releasedAt: true, takenBy: true, leadId: true } }),
  ]);
  if (optedOut && !optedOut.clearedAt) {
    return { sent: false, reason: "customer_opted_out" };
  }
  if (takeover && !takeover.releasedAt) {
    await recordAudit({
      businessId: params.businessId,
      entityType: "notification",
      entityId: normalized,
      action: "sms.held_for_human",
      actor: "orvius",
      summary: `Held an automated text — ${takeover.takenBy} has taken this conversation over`,
      detail: { to: normalized, body: params.body.slice(0, 160) },
      leadId: takeover.leadId,
    });
    return { sent: false, reason: "human_takeover" };
  }

  let result: { sid: string } | null;
  try {
    result = await sendSms({
      to: normalized,
      body: params.body,
      businessId: params.businessId,
      audience: "customer",
      author: params.author,
    });
  } catch (error) {
    await recordAudit({
      businessId: params.businessId,
      entityType: "notification",
      entityId: normalized,
      action: "sms.failed",
      actor: "system",
      summary: `Text to ${normalized} did not send — ${error instanceof Error ? error.message : "the carrier refused it"}`,
      detail: { to: normalized, author: params.author ?? "orvius", body: params.body.slice(0, 160) },
    });
    throw error;
  }
  if (!result) return { sent: false, reason: "sms_not_configured" };
  return { sent: true, sid: result.sid };
}
