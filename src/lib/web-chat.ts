import { recordAudit } from "@/lib/audit";
import { linkTouchToCustomer, normalizePhone } from "@/lib/customer";
import { isTextableNumber, UNTEXTABLE_PHONE_MESSAGE } from "@/lib/sms-destination";
import { sendCustomerSms } from "@/lib/customer-sms";
import { deriveDemandSignal, tradeForCapture } from "@/lib/demand-capture";
import { recordMessage } from "@/lib/messages";
import { buildLeadAlertDedupeKey, enqueueOwnerAlert } from "@/lib/notifications";
import type { PublicShop } from "@/lib/online-booking";
import { prisma } from "@/lib/prisma";
import { classifyRequest } from "@/lib/trade-playbooks";

/**
 * Web chat that never leaves a visitor waiting on a page they closed: the
 * message and their mobile number land in Inbox → Messages, Orvius texts them
 * that it arrived, and the owner answers by text. Their reply to that text is
 * the same conversation, not a new lead.
 */

/** A text from a web-chat visitor this soon after they wrote is them continuing the chat. */
export const WEB_CHAT_WINDOW_MS = 48 * 60 * 60_000;

export function webChatAck(params: { businessName: string; name: string | null }) {
  const first = params.name?.trim().split(/\s+/)[0];
  return `${first ? `Hi ${first}, thanks` : "Thanks"} for reaching out to ${params.businessName}. We got your message and will text you back here shortly. Reply STOP to opt out.`;
}

export type WebChatResult =
  | { ok: true; texted: boolean; safety: string | null }
  | { ok: false; reason: "bad_phone" | "empty"; message: string };

export async function startWebChat(
  shop: PublicShop,
  input: { name: string; phone: string; message: string; page?: string | null },
  send: typeof sendCustomerSms = sendCustomerSms,
): Promise<WebChatResult> {
  const phone = normalizePhone(input.phone);
  if (!phone || !isTextableNumber(phone)) {
    return { ok: false, reason: "bad_phone", message: UNTEXTABLE_PHONE_MESSAGE };
  }
  const body = input.message.trim().slice(0, 1000);
  if (!body) return { ok: false, reason: "empty", message: "Write a message first." };
  const name = input.name.trim().slice(0, 120) || null;

  const classification = classifyRequest({ business: shop, serviceType: null, notes: body, urgency: null });
  const demand = deriveDemandSignal({ serviceType: "Web chat", notes: body, trade: tradeForCapture(shop) });
  const lead = await prisma.lead.create({
    data: {
      businessId: shop.id,
      name,
      phone,
      notes: body,
      serviceType: classification.service.label,
      urgency: classification.safety ? "emergency" : null,
      source: "chat",
      status: "new",
      categoryCode: demand.categoryCode,
      postalCode: demand.postalCode,
    },
  });
  await linkTouchToCustomer({ businessId: shop.id, leadId: lead.id, phone, name, notes: body });
  await recordMessage({ businessId: shop.id, phone, direction: "in", author: "customer", body, sid: `chat:${lead.id}` });

  const sent = await send({ businessId: shop.id, to: phone, body: webChatAck({ businessName: shop.name, name }) });

  await recordAudit({
    businessId: shop.id,
    entityType: "lead",
    entityId: lead.id,
    leadId: lead.id,
    action: "lead.captured",
    summary: `Web chat — ${classification.service.label}`,
    detail: { channel: "chat", page: input.page?.slice(0, 300) ?? null },
    idempotencyKey: `chat:${lead.id}:captured`,
  });

  await enqueueOwnerAlert({
    businessId: shop.id,
    ownerPhone: shop.ownerPhone,
    ownerEmail: shop.ownerEmail,
    businessName: shop.name,
    leadId: lead.id,
    message: [
      classification.safety ? `SAFETY — ${classification.safety.label}. ${classification.safety.instruction}` : null,
      `Web chat from ${name ?? phone} (${phone}): ${body}`,
      sent.sent ? "They were texted that you got it. Reply in Inbox → Messages." : "Text or call them back.",
    ]
      .filter(Boolean)
      .join("\n"),
    dedupeKey: buildLeadAlertDedupeKey({ leadId: lead.id }),
  });

  return { ok: true, texted: sent.sent, safety: classification.safety?.label ?? null };
}

export async function hasOpenWebChat(businessId: string, from: string, now = new Date()) {
  const phone = normalizePhone(from);
  if (!phone) return false;
  const lead = await prisma.lead.findFirst({
    where: {
      businessId,
      source: "chat",
      phone,
      createdAt: { gte: new Date(now.getTime() - WEB_CHAT_WINDOW_MS) },
    },
    select: { id: true },
  });
  return Boolean(lead);
}
