import { normalizePhone } from "@/lib/customer";
import { prisma } from "@/lib/prisma";

/*
  Appointment texts ride on the number a customer gave for that appointment.
  "Come back and book again" is marketing, and the TCPA wants a written yes
  for it — a ticked box or a texted keyword, never inferred from a call.
*/

export const MARKETING_OPT_IN_KEYWORD = "JOIN";

export function marketingJoinConfirmation(shopName: string) {
  return `${shopName}: you're in for occasional reminders and offers, up to 2 a month. Reply STOP to cancel. Msg&data rates may apply.`;
}

export async function recordMarketingOptIn(params: { businessId: string; phone: string; source: "booking_page" | "sms_join" }) {
  const phoneNormalized = normalizePhone(params.phone);
  if (!phoneNormalized) return false;
  const now = new Date();
  await prisma.customer.upsert({
    where: { businessId_phoneNormalized: { businessId: params.businessId, phoneNormalized } },
    create: { businessId: params.businessId, phone: params.phone, phoneNormalized, marketingOptInAt: now, marketingOptInSource: params.source },
    update: { marketingOptInAt: now, marketingOptInSource: params.source },
  });
  return true;
}

export async function clearMarketingOptIn(businessId: string, phone: string) {
  const phoneNormalized = normalizePhone(phone);
  if (!phoneNormalized) return;
  await prisma.customer.updateMany({
    where: { businessId, phoneNormalized, marketingOptInAt: { not: null } },
    data: { marketingOptInAt: null, marketingOptInSource: null },
  });
}
