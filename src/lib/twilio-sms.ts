import { getTwilioClient } from "@/lib/twilio-client";
import { normalizePhone } from "@/lib/customer";
import { getWebhookUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type SmsAudience = "customer" | "owner" | "tech";

/*
  One registered sender for every shop. With TWILIO_MESSAGING_SERVICE_SID set,
  Twilio spreads sends across the service's number pool (and queues past the
  per-number rate), so volume grows by adding numbers to the pool in Twilio
  rather than by changing code. Without it, the single TWILIO_PHONE_NUMBER sends.
*/
export function smsSender(): { messagingServiceSid: string } | { from: string } | null {
  const service = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (service) return { messagingServiceSid: service };
  const from = process.env.TWILIO_PHONE_NUMBER?.trim();
  return from ? { from } : null;
}

export function isSmsReady(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      smsSender(),
  );
}

export function smsStatusCallback(): string {
  return (
    process.env.TWILIO_STATUS_CALLBACK_URL?.trim() ||
    getWebhookUrl("/api/webhooks/twilio/status")
  );
}

/**
 * Remember which shop texted which phone, so a reply to the shared sender is
 * routed back to that shop. A failed write must never cost the send itself.
 */
export async function recordOutboundSms(params: {
  businessId: string;
  to: string;
  audience: SmsAudience;
  sid?: string | null;
}): Promise<void> {
  const toNormalized = normalizePhone(params.to);
  if (!toNormalized) return;
  try {
    await prisma.outboundSms.create({
      data: {
        businessId: params.businessId,
        toNormalized,
        audience: params.audience,
        sid: params.sid ?? null,
      },
    });
  } catch (error) {
    logWarn("sms.outbound_record_failed", {
      businessId: params.businessId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }
}

/** Fire-and-forget SMS. Returns null when Twilio isn't configured or phone is bad. */
export async function sendSms(params: {
  to: string;
  body: string;
  /** Omitted only for texts that belong to no shop, such as a pre-purchase preview. */
  businessId?: string;
  audience: SmsAudience;
}): Promise<{ sid: string } | null> {
  const sender = smsSender();
  if (!isSmsReady() || !sender) return null;

  const to = normalizePhone(params.to);
  if (!to || !params.body.trim()) return null;

  const client = getTwilioClient();
  const sms = await client.messages.create({
    body: params.body.trim(),
    ...sender,
    to,
    statusCallback: smsStatusCallback(),
  });

  if (params.businessId) {
    await recordOutboundSms({
      businessId: params.businessId,
      to,
      audience: params.audience,
      sid: sms.sid,
    });
  }

  return { sid: sms.sid };
}
