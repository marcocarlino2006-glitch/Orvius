import type { Business } from "@prisma/client";
import { isLineEntitled } from "@/lib/billing-entitlement";
import { latencyFromReport } from "@/lib/call-latency";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { readToolCalls } from "@/lib/in-call-tool-defs";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/twilio-client";
import { isUniqueViolation } from "@/lib/unique-violation";
import type { VapiWebhookMessage } from "@/lib/vapi";

/*
  Once a day Orvius rings one live shop's line from that same line and asks
  the receptionist a question, a different shop each day. Nothing else proves
  the whole path a customer takes — the number, the carrier, Vapi, the voice
  and the model — still answers. The call carries the line's own caller ID,
  which is how the Vapi webhook knows it is this check and keeps it out of
  the shop's calls, leads and alerts.
*/

const EVENT = "line-check";
/** Vapi's report lands within a minute of hang-up; past this the check failed. */
export const LINE_CHECK_SETTLE_MS = 10 * 60_000;
/** Placed in the early hours Eastern, when a busy line is least likely to turn a real caller away. */
const START_HOURS_UTC = [7, 8, 9];

export const LINE_CHECK_TWIML =
  '<Response><Pause length="8"/><Say voice="Polly.Matthew">Hi, are you open today?</Say><Pause length="15"/><Say voice="Polly.Matthew">Okay, thank you. Bye.</Say><Pause length="2"/><Hangup/></Response>';

type TwilioLike = {
  calls: {
    create(input: { to: string; from: string; twiml: string; timeout: number }): Promise<{ sid: string }>;
    (sid: string): { fetch(): Promise<{ status?: string | null }> };
  };
};

type Payload = {
  businessId: string;
  shop: string;
  line: string;
  sid?: string;
  replyP50Ms?: number | null;
  replyP90Ms?: number | null;
  endedReason?: string | null;
};

export type LineCheckVerdict = { passed: boolean; reason: string | null };

/** Passing means the receptionist heard the caller and answered them, not only that something picked up. */
export function lineCheckVerdict(message: Pick<VapiWebhookMessage["message"], "artifact" | "endedReason">): LineCheckVerdict {
  const messages = message.artifact?.messages ?? [];
  const spoke = (m: { role?: string; message?: string }) => (m.role === "bot" || m.role === "assistant") && Boolean(m.message?.trim());
  const firstCaller = messages.findIndex((m) => m.role === "user" && Boolean(m.message?.trim()));
  const ended = message.endedReason ? ` Vapi ended it with "${message.endedReason}".` : "";
  if (!messages.some(spoke)) return { passed: false, reason: `The receptionist never spoke.${ended}` };
  if (firstCaller < 0) return { passed: false, reason: `The receptionist greeted but never heard the caller.${ended}` };
  if (!messages.slice(firstCaller + 1).some(spoke)) {
    return { passed: false, reason: `The receptionist greeted but never answered the caller's question.${ended}` };
  }
  return { passed: true, reason: null };
}

const founderRecipients = () =>
  (process.env.ORVIUS_FOUNDER_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

async function alertFounders(payload: Payload, reason: string) {
  logWarn("line_check.failed", { businessId: payload.businessId, reason });
  const recipients = founderRecipients();
  if (!recipients.length || !isEmailConfigured()) return;
  const text = [
    `Orvius's daily test call to ${payload.shop} (${payload.line}) failed.`,
    "",
    reason,
    "",
    "A customer calling that line right now may hit the same thing. Call it yourself to hear it, then check the admin Launch tab.",
  ].join("\n");
  for (const to of recipients) {
    await sendOwnerEmail({ to, subject: `Orvius alarm: the test call to ${payload.shop} failed`, text }).catch((error: unknown) =>
      logWarn("line_check.alert_failed", { error: error instanceof Error ? error.message : String(error) }),
    );
  }
}

/** Moves a check off "calling" once; only the move that wins alerts. */
async function settle(id: string, payload: Payload, verdict: LineCheckVerdict) {
  const moved = await prisma.webhookEvent.updateMany({
    where: { id, status: "calling" },
    data: { status: verdict.passed ? "passed" : "failed", error: verdict.reason, payloadJson: JSON.stringify(payload) },
  });
  if (!moved.count) return false;
  if (verdict.passed) logInfo("line_check.passed", { businessId: payload.businessId, replyP90Ms: payload.replyP90Ms ?? null });
  else await alertFounders(payload, verdict.reason ?? "The test call failed.");
  return true;
}

const readPayload = (json: string | null): Payload | null => {
  try {
    return json ? (JSON.parse(json) as Payload) : null;
  } catch {
    return null;
  }
};

/** Today's call, from the 30-minute sweep. A no-op outside the early-hours window or once placed. */
export async function startDailyLineCheck(
  now = new Date(),
  deps: { client?: TwilioLike } = {},
): Promise<{ ran: false; reason: string } | { ran: true; businessId: string; placed: boolean }> {
  if (!START_HOURS_UTC.includes(now.getUTCHours())) return { ran: false, reason: "outside the window" };
  const canDial = Boolean(deps.client) || Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
  if (!canDial) return { ran: false, reason: "no Twilio credentials" };
  const day = now.toISOString().slice(0, 10);
  let row: { id: string };
  try {
    row = await prisma.webhookEvent.create({ data: { source: "orvius", externalId: day, eventType: EVENT, status: "processing" }, select: { id: true } });
  } catch (error) {
    if (isUniqueViolation(error)) return { ran: false, reason: "already ran today" };
    throw error;
  }
  const candidates = (
    await prisma.business.findMany({
      where: { isActive: true, environment: "production", vapiAssistantId: { not: null }, twilioPhone: { not: null } },
      orderBy: { id: "asc" },
    })
  ).filter((shop: Business) => isLineEntitled(shop, now));
  if (!candidates.length) {
    await prisma.webhookEvent.update({ where: { id: row.id }, data: { status: "skipped", error: "No live shop line to call." } });
    return { ran: false, reason: "no live lines" };
  }
  const shop = candidates[Math.floor(now.getTime() / 86_400_000) % candidates.length]!;
  const from = shop.twilioPhone!.trim();
  const payload: Payload = { businessId: shop.id, shop: shop.name, line: (shop.vapiPhoneNumber ?? from).trim() };
  await prisma.webhookEvent.update({
    where: { id: row.id },
    data: { status: "calling", businessId: shop.id, payloadJson: JSON.stringify(payload) },
  });
  try {
    const client = deps.client ?? (getTwilioClient() as unknown as TwilioLike);
    const call = await client.calls.create({ to: payload.line, from, twiml: LINE_CHECK_TWIML, timeout: 30 });
    payload.sid = call.sid;
    await prisma.webhookEvent.updateMany({ where: { id: row.id, status: "calling" }, data: { payloadJson: JSON.stringify(payload) } });
    logInfo("line_check.placed", { businessId: shop.id });
    return { ran: true, businessId: shop.id, placed: true };
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    await settle(row.id, payload, { passed: false, reason: `Twilio wouldn't place the call: ${message}` });
    return { ran: true, businessId: shop.id, placed: false };
  }
}

/** The check in flight on this shop's line, when a call arrives carrying the line's own caller ID. */
export async function lineCheckInFlight(businessId: string, now = new Date()) {
  return prisma.webhookEvent.findFirst({
    where: {
      source: "orvius",
      eventType: EVENT,
      businessId,
      status: "calling",
      createdAt: { gte: new Date(now.getTime() - LINE_CHECK_SETTLE_MS) },
    },
    select: { id: true, payloadJson: true },
  });
}

/** The receptionist may look something up while answering; it gets an answer and nothing is booked. */
export function lineCheckToolResults(message: VapiWebhookMessage["message"]) {
  return readToolCalls(message).map((call) => ({ toolCallId: call.id, result: "This is Orvius's daily line check. Nothing needs to be done." }));
}

/** Past this a caller talks over the silence or asks "hello?". */
export const LINE_CHECK_SLOW_MS = 2_500;

export async function recordLineCheckReport(check: { id: string; payloadJson: string | null }, message: VapiWebhookMessage["message"]) {
  const payload = readPayload(check.payloadJson);
  if (!payload) return false;
  const latency = latencyFromReport(message);
  let verdict = lineCheckVerdict(message);
  if (verdict.passed && latency && latency.p90 > LINE_CHECK_SLOW_MS) {
    verdict = {
      passed: false,
      reason: `The receptionist answered, but its slowest reply took ${(latency.p90 / 1000).toFixed(1)}s. Callers talk over a pause that long.`,
    };
  }
  return settle(
    check.id,
    { ...payload, replyP50Ms: latency?.p50 ?? null, replyP90Ms: latency?.p90 ?? null, endedReason: message.endedReason ?? null },
    verdict,
  );
}

const TWILIO_UNANSWERED: Record<string, string> = {
  "no-answer": "The line rang out and nothing answered.",
  busy: "The line was busy.",
  failed: "The carrier couldn't connect the call.",
  canceled: "The call was canceled before it connected.",
};

/** A check Vapi never reported on fails, with what the carrier saw. */
export async function settleStaleLineChecks(now = new Date(), deps: { client?: TwilioLike } = {}) {
  const stale = await prisma.webhookEvent.findMany({
    where: { source: "orvius", eventType: EVENT, status: "calling", createdAt: { lt: new Date(now.getTime() - LINE_CHECK_SETTLE_MS) } },
    select: { id: true, payloadJson: true },
    take: 5,
  });
  let failed = 0;
  for (const check of stale) {
    const payload = readPayload(check.payloadJson);
    if (!payload) continue;
    let status: string | null = null;
    if (payload.sid) {
      try {
        const client = deps.client ?? (getTwilioClient() as unknown as TwilioLike);
        status = (await client.calls(payload.sid).fetch()).status ?? null;
      } catch (error) {
        logWarn("line_check.status_failed", { error: error instanceof Error ? error.message : String(error) });
      }
    }
    const reason =
      (status && TWILIO_UNANSWERED[status]) ??
      (status === "completed"
        ? "The call connected but Vapi never reported it, so nobody knows what the caller heard."
        : "The call never finished, and Vapi never reported it.");
    if (await settle(check.id, payload, { passed: false, reason })) failed += 1;
  }
  return { failed };
}

/** The latest daily call, for the admin Launch tab. */
export async function lastLineCheck() {
  const row = await prisma.webhookEvent.findFirst({
    where: { source: "orvius", eventType: EVENT },
    orderBy: { createdAt: "desc" },
    select: { externalId: true, status: true, error: true, payloadJson: true },
  });
  if (!row) return null;
  const payload = readPayload(row.payloadJson);
  return {
    day: row.externalId,
    status: row.status,
    error: row.error,
    shop: payload?.shop ?? null,
    replyP90Ms: payload?.replyP90Ms ?? null,
  };
}
