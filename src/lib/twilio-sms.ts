import { getTwilioClient } from "@/lib/twilio-client";
import { normalizePhone } from "@/lib/customer";
import { getWebhookUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { recordMessage, type MessageAuthor } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { shopTextSender } from "@/lib/shop-texting";
import { isSimulatedWorkspace, simulateSend } from "@/lib/sms-simulation";
import { isTextableNumber } from "@/lib/sms-destination";

export type SmsAudience = "customer" | "owner" | "tech";

/*
  The shared Orvius sender: owner alerts always, and a shop's customer and tech
  texts until its own number is registered (lib/shop-texting.ts). With TWILIO_MESSAGING_SERVICE_SID set,
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
  body?: string | null;
  jobId?: string | null;
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
        body: params.audience === "tech" ? (params.body?.trim().slice(0, 1600) ?? null) : null,
        jobId: params.audience === "tech" ? (params.jobId ?? null) : null,
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
  /** Who wrote a customer text; only customer texts land in the inbox thread. */
  author?: Exclude<MessageAuthor, "customer">;
  /** The job a technician text is about. */
  jobId?: string;
}): Promise<{ sid: string } | null> {
  const simulated = await isSimulatedWorkspace(params.businessId);
  /* A customer or tech hears from the shop's own number once carriers approve it;
     owner alerts are Orvius talking, so they stay on the Orvius sender. */
  const ownSender =
    !simulated && params.businessId && params.audience !== "owner" ? await shopTextSender(params.businessId) : null;
  const sender = ownSender ?? smsSender();
  if (!simulated && (!isSmsReady() || !sender)) return null;

  const to = normalizePhone(params.to);
  if (!to || !params.body.trim()) return null;
  if (!isTextableNumber(to)) {
    logWarn("sms.destination_refused", { businessId: params.businessId, audience: params.audience, prefix: to.slice(0, 5) });
    return null;
  }

  const create = (from: NonNullable<typeof sender>) =>
    getTwilioClient().messages.create({
      body: params.body.trim(),
      ...from,
      to,
      statusCallback: smsStatusCallback(),
    });
  let sms: { sid: string };
  if (simulated) {
    sms = simulateSend(to);
  } else if (ownSender) {
    try {
      sms = await create(ownSender);
    } catch (error) {
      logWarn("sms.own_sender_failed", {
        businessId: params.businessId,
        error: error instanceof Error ? error.message : "unknown",
      });
      const shared = smsSender();
      if (!shared) throw error;
      sms = await create(shared);
    }
  } else {
    sms = await create(sender!);
  }

  if (params.businessId) {
    await recordOutboundSms({
      businessId: params.businessId,
      to,
      audience: params.audience,
      sid: sms.sid,
      body: params.body,
      jobId: params.jobId,
    });
    if (params.audience === "customer") {
      await recordMessage({
        businessId: params.businessId,
        phone: to,
        direction: "out",
        author: params.author ?? "orvius",
        body: params.body,
        sid: sms.sid,
      });
    }
  }

  return { sid: sms.sid };
}
