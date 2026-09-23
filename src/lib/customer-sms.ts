import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/twilio-sms";

export type CustomerSmsResult =
  | { sent: true; sid: string; messageId?: string }
  | {
      sent: false;
      reason:
        | "invalid_customer_phone"
        | "customer_opted_out"
        | "sms_not_configured";
    };

export type CustomerSmsDirection = "inbound" | "outbound";

/**
 * Persist one SMS on the customer thread. Idempotent when twilioSid is set
 * for the same business (inbound webhook retries).
 */
export async function recordCustomerSms(params: {
  businessId: string;
  customerId: string;
  direction: CustomerSmsDirection;
  body: string;
  twilioSid?: string | null;
  status?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const sid = params.twilioSid?.trim() || null;
  if (sid) {
    const existing = await prisma.customerSms.findFirst({
      where: { businessId: params.businessId, twilioSid: sid },
      select: { id: true },
    });
    if (existing) return { id: existing.id, created: false };
  }

  const row = await prisma.customerSms.create({
    data: {
      businessId: params.businessId,
      customerId: params.customerId,
      direction: params.direction,
      body: params.body,
      twilioSid: sid,
      status: params.status ?? (params.direction === "inbound" ? "received" : "sent"),
    },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

async function resolveCustomerId(params: {
  businessId: string;
  to: string;
  customerId?: string;
}): Promise<string | null> {
  if (params.customerId) {
    const owned = await prisma.customer.findFirst({
      where: { id: params.customerId, businessId: params.businessId },
      select: { id: true },
    });
    return owned?.id ?? null;
  }
  const normalized = normalizePhone(params.to);
  if (!normalized) return null;
  const byPhone = await prisma.customer.findUnique({
    where: {
      businessId_phoneNormalized: {
        businessId: params.businessId,
        phoneNormalized: normalized,
      },
    },
    select: { id: true },
  });
  return byPhone?.id ?? null;
}

/**
 * The only outbound SMS path for customers.
 *
 * Owner and technician operational messages have separate consent contexts.
 * Anything directed to a caller/customer must pass the shop-scoped STOP
 * record here so a new feature cannot accidentally bypass it.
 *
 * Successful sends are written to the customer Texts thread when a customer
 * record can be resolved (by id or phone).
 */
export async function sendCustomerSms(params: {
  businessId: string;
  to: string;
  body: string;
  customerId?: string;
}): Promise<CustomerSmsResult> {
  const normalized = normalizePhone(params.to);
  if (!normalized) {
    return { sent: false, reason: "invalid_customer_phone" };
  }

  const optedOut = await prisma.smsOptOut.findUnique({
    where: {
      businessId_phoneNormalized: {
        businessId: params.businessId,
        phoneNormalized: normalized,
      },
    },
    select: { clearedAt: true },
  });
  if (optedOut && !optedOut.clearedAt) {
    return { sent: false, reason: "customer_opted_out" };
  }

  const result = await sendSms({ to: normalized, body: params.body });
  if (!result) return { sent: false, reason: "sms_not_configured" };

  const customerId = await resolveCustomerId({
    businessId: params.businessId,
    to: normalized,
    customerId: params.customerId,
  });
  let messageId: string | undefined;
  if (customerId) {
    const recorded = await recordCustomerSms({
      businessId: params.businessId,
      customerId,
      direction: "outbound",
      body: params.body,
      twilioSid: result.sid,
      status: "sent",
    });
    messageId = recorded.id;
  }

  return { sent: true, sid: result.sid, messageId };
}
