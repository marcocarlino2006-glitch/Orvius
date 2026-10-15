import { getTwilioClient } from "@/lib/twilio-client";
import { normalizePhone } from "@/lib/customer";
import { getWebhookUrl } from "@/lib/env";
import { logInfo, logWarn } from "@/lib/logger";
import { recordMessage, type MessageAuthor } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { shopTextSender } from "@/lib/shop-texting";
import { isSimulatedWorkspace, simulateSend } from "@/lib/sms-simulation";
import { isTextableNumber } from "@/lib/sms-destination";
import {
  MAX_PRE_SUBMIT_ATTEMPTS,
  claimIntent,
  classifySendError,
  finishIntent,
  raiseIntentException,
  recordIntentAttempt,
  type SmsIntentInput,
} from "@/lib/sms-intent";

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

const UNSUBSCRIBED_RECIPIENT = 21610;

export function twilioErrorCode(error: unknown): number | null {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "number" ? code : typeof code === "string" && /^\d+$/.test(code) ? Number(code) : null;
}

/** One of our own lines answers a text with a text; sending to it starts two auto-replies talking to each other. */
async function isOrviusNumber(to: string): Promise<boolean> {
  if (normalizePhone(process.env.TWILIO_PHONE_NUMBER) === to) return true;
  const line = await prisma.business.findFirst({
    where: { OR: [{ twilioPhone: to }, { vapiPhoneNumber: to }] },
    select: { id: true },
  });
  return Boolean(line);
}

async function recipientOptedOut(businessId: string, to: string, audience: SmsAudience): Promise<boolean> {
  const [row, shop] = await Promise.all([
    prisma.smsOptOut.findUnique({
      where: { businessId_phoneNormalized: { businessId, phoneNormalized: to } },
      select: { clearedAt: true },
    }),
    audience === "owner"
      ? prisma.business.findUnique({ where: { id: businessId }, select: { ownerPhone: true, ownerSmsOptOutAt: true } })
      : null,
  ]);
  if (row && !row.clearedAt) return true;
  return Boolean(shop?.ownerSmsOptOutAt && normalizePhone(shop.ownerPhone) === to);
}

/** The carrier holds a STOP we never saw (sent to another number, or before routing existed); keep our record in step. */
async function recordCarrierOptOut(businessId: string, to: string, audience: SmsAudience): Promise<void> {
  try {
    await prisma.smsOptOut.upsert({
      where: { businessId_phoneNormalized: { businessId, phoneNormalized: to } },
      create: { businessId, phone: to, phoneNormalized: to, source: "carrier", clearedAt: null },
      update: { source: "carrier", clearedAt: null },
    });
    if (audience === "owner") {
      const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { ownerPhone: true } });
      if (normalizePhone(shop?.ownerPhone) === to) {
        await prisma.business.updateMany({
          where: { id: businessId, ownerSmsOptOutAt: null },
          data: { ownerSmsOptOutAt: new Date() },
        });
      }
    }
    logWarn("sms.carrier_opt_out_recorded", { businessId, audience });
  } catch (error) {
    logWarn("sms.carrier_opt_out_record_failed", { businessId, error: error instanceof Error ? error.message : "unknown" });
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
  /** The operational event this text is for; written to the intent ledger before the provider is called. */
  intent?: SmsIntentInput;
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

  if (await isOrviusNumber(to)) {
    logWarn("sms.destination_is_orvius_line", { businessId: params.businessId, audience: params.audience });
    return null;
  }
  if (params.businessId && (await recipientOptedOut(params.businessId, to, params.audience))) {
    logInfo("sms.suppressed_opt_out", { businessId: params.businessId, audience: params.audience });
    return null;
  }

  const claim = params.intent && params.businessId
    ? await claimIntent({ businessId: params.businessId, to, audience: params.audience, intent: params.intent })
    : null;
  if (claim && claim.kind !== "claimed") {
    logInfo("sms.intent_not_resent", { businessId: params.businessId, intentId: claim.intent.id, kind: claim.kind, status: claim.intent.status });
    return claim.kind === "already_sent" && claim.intent.providerSid ? { sid: claim.intent.providerSid } : null;
  }
  const intentId = claim?.intent.id ?? null;

  const create = (from: NonNullable<typeof sender>) =>
    getTwilioClient().messages.create({
      body: params.body.trim(),
      ...from,
      to,
      statusCallback: smsStatusCallback(),
    });
  const label = (from: NonNullable<typeof sender>) =>
    from === ownSender ? "own" : "messagingServiceSid" in from ? `service:${from.messagingServiceSid.slice(-6)}` : `number:${from.from.slice(-4)}`;
  const close = async (status: string, error: unknown) => {
    if (!intentId) return;
    const done = await finishIntent(intentId, { status, error: error instanceof Error ? error.message : String(error) });
    await raiseIntentException(done);
  };

  let sms: { sid: string };
  let current: NonNullable<typeof sender> | null = simulated ? null : sender;
  let usedShared = !ownSender;
  for (let attempt = 1; ; attempt++) {
    try {
      sms = simulated ? simulateSend(to) : await create(current!);
      if (intentId) {
        await recordIntentAttempt(intentId, { at: new Date().toISOString(), sender: simulated ? "simulated" : label(current!), outcome: "accepted", errorCode: null, status: null });
        await finishIntent(intentId, { status: "submitted", sid: sms.sid, providerAccount: simulated ? "simulated" : label(current!) });
      }
      break;
    } catch (error) {
      const kind = classifySendError(error);
      const errorCode = twilioErrorCode(error);
      if (intentId) {
        const status = (error as { status?: unknown })?.status;
        await recordIntentAttempt(intentId, { at: new Date().toISOString(), sender: current ? label(current) : "simulated", outcome: kind, errorCode, status: typeof status === "number" ? status : null });
      }
      if (kind === "recipient_refused") {
        // The person refused or can't take texts; another number would only route around them.
        if (params.businessId && errorCode === UNSUBSCRIBED_RECIPIENT) {
          await recordCarrierOptOut(params.businessId, to, params.audience);
        }
        await close("rejected", error);
        throw error;
      }
      if (kind === "unknown_submission") {
        // It may have been accepted: no retry and no other sender, or the person could get it twice.
        logWarn("sms.submission_unknown", { businessId: params.businessId, audience: params.audience, intentId });
        await close("unknown_submission", error);
        throw error;
      }
      if (kind === "rejected") {
        const shared = smsSender();
        if (!usedShared && shared) {
          logWarn("sms.own_sender_failed", { businessId: params.businessId, error: error instanceof Error ? error.message : "unknown" });
          current = shared;
          usedShared = true;
          continue;
        }
        await close("rejected", error);
        throw error;
      }
      if (attempt >= MAX_PRE_SUBMIT_ATTEMPTS) {
        await close("retry_exhausted", error);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
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
