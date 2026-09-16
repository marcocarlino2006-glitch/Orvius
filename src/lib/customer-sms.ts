import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/twilio-sms";

export type CustomerSmsResult =
  | { sent: true; sid: string }
  | {
      sent: false;
      reason:
        | "invalid_customer_phone"
        | "customer_opted_out"
        | "sms_not_configured";
    };

/**
 * The only outbound SMS path for customers.
 *
 * Owner and technician operational messages have separate consent contexts.
 * Anything directed to a caller/customer must pass the shop-scoped STOP
 * record here so a new feature cannot accidentally bypass it.
 */
export async function sendCustomerSms(params: {
  businessId: string;
  to: string;
  body: string;
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
  return { sent: true, sid: result.sid };
}
