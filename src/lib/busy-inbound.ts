/**
 * Twilio voice CallStatus for busy / no-answer / failed inbound legs.
 * When the second caller never reaches Vapi, this is how we still get From.
 */

import { linkTouchToCustomer } from "@/lib/customer";
import { notifyFallbackCaller } from "@/lib/fallback-caller-sms";
import { logInfo, logWarn } from "@/lib/logger";
import {
  buildLeadAlertDedupeKey,
  enqueueOwnerAlert,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { resolveBusinessByInboundPhone } from "@/lib/resolve-shop-line";
import { recordWebhookEvent } from "@/lib/webhook-events";

const ACTIONABLE = new Set([
  "busy",
  "no-answer",
  "failed",
  "canceled",
  "cancelled",
]);

export function isActionableVoiceStatus(status: string): boolean {
  return ACTIONABLE.has(status.trim().toLowerCase());
}

export async function captureBusyInboundCall(params: {
  from: string;
  to: string;
  callSid: string;
  callStatus: string;
}): Promise<{ ok: boolean; leadId?: string; reason?: string }> {
  const status = params.callStatus.trim().toLowerCase();
  if (!isActionableVoiceStatus(status)) {
    return { ok: true, reason: "ignored_status" };
  }
  if (!params.from?.trim() || !params.to?.trim()) {
    return { ok: false, reason: "missing_from_or_to" };
  }

  const business = await resolveBusinessByInboundPhone(params.to);
  if (!business) {
    logWarn("twilio.voice_status.shop_not_found", {
      to: params.to,
      from: params.from,
      callSid: params.callSid,
    });
    return { ok: false, reason: "shop_not_found" };
  }

  const externalId = params.callSid
    ? `voice-status:${params.callSid}`
    : null;

  if (externalId) {
    const existing = await prisma.lead.findFirst({
      where: { businessId: business.id, externalId },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, leadId: existing.id, reason: "duplicate" };
    }
    // Also skip if voice-fallback already opened this call.
    const fallback = await prisma.lead.findFirst({
      where: {
        businessId: business.id,
        externalId: `voice-fallback:${params.callSid}`,
      },
      select: { id: true },
    });
    if (fallback) {
      return { ok: true, leadId: fallback.id, reason: "fallback_owns" };
    }
  }

  const statusLabel =
    status === "busy"
      ? "Line busy"
      : status === "no-answer"
        ? "No answer"
        : status === "failed"
          ? "Call failed"
          : "Call canceled";

  const notes = `${statusLabel} — caller never reached the receptionist.`;

  const lead = await prisma.lead.create({
    data: {
      businessId: business.id,
      externalId,
      phone: params.from,
      notes,
      serviceType: "Missed call — line busy / unavailable",
      urgency: null,
      source: "voice-status",
      status: "new",
    },
  });

  await linkTouchToCustomer({
    businessId: business.id,
    leadId: lead.id,
    phone: params.from,
    notes,
  });

  await enqueueOwnerAlert({
    businessId: business.id,
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message: [
      `${statusLabel} from ${params.from}.`,
      "They never reached the AI line — call them back.",
      business.overflowForwardConfirmedAt
        ? null
        : "Confirm overflow forward in Settings so second callers land on Orvius.",
    ]
      .filter(Boolean)
      .join(" "),
    leadId: lead.id,
    dedupeKey: buildLeadAlertDedupeKey({
      messageSid: externalId ?? lead.id,
    }),
  });

  await notifyFallbackCaller({
    businessId: business.id,
    businessName: business.name,
    leadId: lead.id,
    from: params.from,
  });

  await recordWebhookEvent({
    source: "twilio-voice-status",
    externalId: externalId ?? lead.id,
    eventType: status,
    businessId: business.id,
    status: "processed",
    payload: {
      from: params.from,
      to: params.to,
      callSid: params.callSid,
      callStatus: status,
      leadId: lead.id,
    },
  });

  logInfo("twilio.voice_status.captured", {
    callSid: params.callSid,
    businessId: business.id,
    leadId: lead.id,
    callStatus: status,
  });

  return { ok: true, leadId: lead.id };
}
