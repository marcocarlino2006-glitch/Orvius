import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { isTextableNumber } from "@/lib/sms-destination";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { sendSms } from "@/lib/twilio-sms";
import type { SmsIntentInput } from "@/lib/sms-intent";

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
  /** The operational event, for the intent ledger. */
  intent?: SmsIntentInput;
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

  const body = params.author === "owner" ? await signedOwnerText(params.businessId, normalized, params.body) : params.body;

  let result: { sid: string } | null;
  try {
    result = await sendSms({
      to: normalized,
      body,
      businessId: params.businessId,
      audience: "customer",
      author: params.author,
      intent: params.intent,
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

const FOOTER_AFTER_MS = 30 * 24 * 60 * 60_000;

/*
  A person typing in Inbox writes "Running 10 min late", but the customer may
  get it from a number they've never seen. The shop's name goes on every text,
  and the opt-out line on the first one in a month, as carriers require.
*/
async function signedOwnerText(businessId: string, phoneNormalized: string, body: string): Promise<string> {
  const [shop, recent] = await Promise.all([
    prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }),
    prisma.message.findFirst({
      where: { businessId, phoneNormalized, direction: "out", createdAt: { gte: new Date(Date.now() - FOOTER_AFTER_MS) } },
      select: { id: true },
    }),
  ]);
  const text = body.trim();
  const name = shop?.name?.trim();
  const signed = name && !text.toLowerCase().includes(name.toLowerCase()) ? `${name}: ${text}` : text;
  return recent ? signed : withSmsOptOutFooter(signed);
}
