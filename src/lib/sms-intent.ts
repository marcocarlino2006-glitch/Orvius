import { Prisma } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

/*
  The intent ledger: an operational text is written down before the provider
  is called, keyed by shop + event + recipient + channel + message version.
  Twilio has no idempotency header for messages, so nothing here promises
  exactly-once. What it does promise: a send that may already have left is
  marked unknown_submission and never retried or re-routed through another
  sender; only failures known to happen before submission get a bounded retry;
  and for severe messages, uncertain delivery raises one owner exception.
*/

export type IntentSeverity = "routine" | "severe";

export type SmsIntentInput = {
  eventType: string;
  eventId: string;
  /** Defaults to 1. A resend or change uses `nextIntentVersion`. */
  version?: number;
  priorIntentId?: string | null;
  authorizedBy?: string | null;
  severity?: IntentSeverity;
};

export const MAX_PRE_SUBMIT_ATTEMPTS = 3;
const LEASE_MS = 60_000;

/** Twilio refuses these for the recipient, whichever number sends. */
export const RECIPIENT_REFUSED_CODES = new Set([21610, 21211, 21408, 21612, 21614]);

export type SendErrorKind = "recipient_refused" | "rejected" | "retryable" | "unknown_submission";

/**
 * What a provider error says about whether the message left. A 4xx answer is
 * Twilio refusing before it queued anything (429 is a rate refusal worth one
 * more try); anything else — a timeout, a reset socket, a 5xx — may have been
 * accepted, so it is unknown.
 */
export function classifySendError(error: unknown): SendErrorKind {
  const e = (error ?? {}) as { code?: unknown; status?: unknown };
  const code = typeof e.code === "number" ? e.code : typeof e.code === "string" && /^\d+$/.test(e.code) ? Number(e.code) : null;
  if (code != null && RECIPIENT_REFUSED_CODES.has(code)) return "recipient_refused";
  const status = typeof e.status === "number" ? e.status : null;
  if (status === 429) return "retryable";
  if (status != null && status >= 400 && status < 500) return "rejected";
  return "unknown_submission";
}

type IntentRow = Awaited<ReturnType<typeof prisma.smsIntent.findUniqueOrThrow>>;

export type IntentClaim =
  | { kind: "claimed"; intent: IntentRow }
  | { kind: "already_sent"; intent: IntentRow }
  | { kind: "in_flight"; intent: IntentRow }
  | { kind: "closed"; intent: IntentRow };

function isUnique(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const SENT = new Set(["submitted", "delivered", "undelivered"]);
const CLOSED = new Set(["rejected", "retry_exhausted", "unknown_submission"]);

/**
 * Take the lease on this intent, creating it on first sight. A second caller
 * for the same key gets the existing row back instead of a second send. A
 * lease that expired mid-send is unknown: the first attempt may have left.
 */
export async function claimIntent(params: {
  businessId: string;
  to: string;
  audience: string;
  intent: SmsIntentInput;
  now?: Date;
}): Promise<IntentClaim> {
  const now = params.now ?? new Date();
  const key = {
    businessId: params.businessId,
    eventType: params.intent.eventType,
    eventId: params.intent.eventId,
    recipientNormalized: params.to,
    channel: "sms",
    messageVersion: params.intent.version ?? 1,
  };
  try {
    const intent = await prisma.smsIntent.create({
      data: {
        ...key,
        priorIntentId: params.intent.priorIntentId ?? null,
        authorizedBy: params.intent.authorizedBy ?? null,
        audience: params.audience,
        severity: params.intent.severity ?? "routine",
        status: "leased",
        leaseUntil: new Date(now.getTime() + LEASE_MS),
      },
    });
    return { kind: "claimed", intent };
  } catch (error) {
    if (!isUnique(error)) throw error;
  }
  const existing = await prisma.smsIntent.findUniqueOrThrow({
    where: { businessId_eventType_eventId_recipientNormalized_channel_messageVersion: key },
  });
  if (SENT.has(existing.status)) return { kind: "already_sent", intent: existing };
  if (CLOSED.has(existing.status)) return { kind: "closed", intent: existing };
  if (existing.status === "leased" && existing.leaseUntil && existing.leaseUntil.getTime() > now.getTime()) {
    return { kind: "in_flight", intent: existing };
  }
  if (existing.status === "leased") {
    const marked = await finishIntent(existing.id, { status: "unknown_submission", error: "lease expired mid-send" });
    return { kind: "closed", intent: marked };
  }
  const took = await prisma.smsIntent.updateMany({
    where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
    data: { status: "leased", leaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  const fresh = await prisma.smsIntent.findUniqueOrThrow({ where: { id: existing.id } });
  return took.count ? { kind: "claimed", intent: fresh } : { kind: "in_flight", intent: fresh };
}

export type AttemptRecord = { at: string; sender: string; outcome: "accepted" | SendErrorKind; errorCode: number | null; status: number | null };

export async function recordIntentAttempt(intentId: string, attempt: AttemptRecord): Promise<void> {
  const row = await prisma.smsIntent.findUnique({ where: { id: intentId }, select: { attemptsJson: true } });
  const history = parseList<AttemptRecord>(row?.attemptsJson);
  await prisma.smsIntent.update({
    where: { id: intentId },
    data: { attempts: { increment: 1 }, attemptsJson: JSON.stringify([...history, attempt].slice(-20)) },
  });
}

export async function finishIntent(
  intentId: string,
  result: { status: string; sid?: string | null; providerAccount?: string | null; error?: string | null },
): Promise<IntentRow> {
  return prisma.smsIntent.update({
    where: { id: intentId },
    data: {
      status: result.status,
      leaseUntil: null,
      ...(result.sid ? { providerSid: result.sid } : {}),
      ...(result.providerAccount ? { providerAccount: result.providerAccount } : {}),
      ...(result.error ? { lastError: result.error.slice(0, 300) } : {}),
    },
  });
}

const EXCEPTION_WORDS: Record<string, string> = {
  unknown_submission: "may not have gone out — the text service didn't answer, so Orvius won't resend it on its own",
  rejected: "was refused by the text service",
  retry_exhausted: "couldn't be sent after a few tries",
  undelivered: "didn't reach the phone",
};

/**
 * One owner-visible exception per severe intent whose delivery is uncertain
 * or failed. The update that sets exceptionRaisedAt is the dedupe: a second
 * receipt or a racing worker finds it already set and does nothing.
 */
export async function raiseIntentException(intent: Pick<IntentRow, "id" | "businessId" | "severity" | "eventType" | "eventId" | "status" | "audience">): Promise<boolean> {
  if (intent.severity !== "severe") return false;
  const words = EXCEPTION_WORDS[intent.status];
  if (!words) return false;
  const claimed = await prisma.smsIntent.updateMany({ where: { id: intent.id, exceptionRaisedAt: null }, data: { exceptionRaisedAt: new Date() } });
  if (!claimed.count) return false;
  try {
    await recordAudit({
      businessId: intent.businessId,
      entityType: "notification",
      entityId: intent.id,
      action: "sms.delivery_exception",
      actor: "system",
      summary: `A ${intent.eventType.replace(/[._]/g, " ")} text to the ${intent.audience} ${words}. Check with them directly.`,
      detail: { intentId: intent.id, eventType: intent.eventType, eventId: intent.eventId, status: intent.status },
      idempotencyKey: `sms-intent:${intent.id}:exception`,
    });
  } catch (error) {
    logWarn("sms.intent_exception_record_failed", { intentId: intent.id, error: error instanceof Error ? error.message : "unknown" });
  }
  return true;
}

export type IntentReceipt = { at: string; status: string; errorCode: string | null };

/** Delivery receipts append once per distinct status; delivered and undelivered settle the intent. */
export async function applyIntentReceipt(params: { messageSid: string; messageStatus: string; errorCode?: string | null; now?: Date }) {
  const intent = await prisma.smsIntent.findFirst({ where: { providerSid: params.messageSid } });
  if (!intent) return { matched: false, exception: false };
  const receipts = parseList<IntentReceipt>(intent.receiptsJson);
  const errorCode = params.errorCode?.trim() || null;
  if (receipts.some((r) => r.status === params.messageStatus && r.errorCode === errorCode)) return { matched: true, exception: false };
  const next = [...receipts, { at: (params.now ?? new Date()).toISOString(), status: params.messageStatus, errorCode }].slice(-20);
  const settled =
    params.messageStatus === "delivered"
      ? "delivered"
      : params.messageStatus === "undelivered" || params.messageStatus === "failed"
        ? "undelivered"
        : null;
  const status = intent.status === "delivered" ? "delivered" : (settled ?? intent.status);
  // Conditional on the status read, so a "delivered" landing between the read and this write is never undone.
  const written = await prisma.smsIntent.updateMany({
    where: { id: intent.id, status: intent.status },
    data: { receiptsJson: JSON.stringify(next), status },
  });
  if (!written.count) return applyIntentReceipt(params);
  const exception = status === "undelivered" ? await raiseIntentException({ ...intent, status }) : false;
  return { matched: true, exception };
}

/** The carrier already confirmed this message reached the phone; a later failure receipt for it is stale. */
export async function smsAlreadyDelivered(messageSid: string): Promise<boolean> {
  if (!messageSid) return false;
  const [intent, thread, owner] = await Promise.all([
    prisma.smsIntent.findFirst({ where: { providerSid: messageSid, status: "delivered" }, select: { id: true } }),
    prisma.message.findFirst({ where: { sid: messageSid, deliveryStatus: "delivered" }, select: { id: true } }),
    prisma.ownerNotification.findFirst({ where: { deliveryId: messageSid, deliveryStatus: "delivered" }, select: { id: true } }),
  ]);
  return Boolean(intent || thread || owner);
}

/** The version after the latest one for this event and recipient, linked to it. */
export async function nextIntentVersion(params: { businessId: string; eventType: string; eventId: string; to: string }) {
  const latest = await prisma.smsIntent.findFirst({
    where: { businessId: params.businessId, eventType: params.eventType, eventId: params.eventId, recipientNormalized: params.to, channel: "sms" },
    orderBy: { messageVersion: "desc" },
    select: { id: true, messageVersion: true },
  });
  return { version: (latest?.messageVersion ?? 0) + 1, priorIntentId: latest?.id ?? null };
}

/** The latest intent for an event and recipient, for linking a follow-up message to it. */
export async function latestIntentId(params: { businessId: string; eventType: string; eventId: string; to: string }) {
  const latest = await prisma.smsIntent.findFirst({
    where: { businessId: params.businessId, eventType: params.eventType, eventId: params.eventId, recipientNormalized: params.to, channel: "sms" },
    orderBy: { messageVersion: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

function parseList<T>(raw: string | null | undefined): T[] {
  try {
    const v = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}
