import { recordAudit } from "@/lib/audit";
import { logInfo, logWarn } from "@/lib/logger";
import {
  FORWARD_TEST_WINDOW_MS,
  forwardTestVerdict,
  type Coverage,
  type ForwardTestVerdict,
} from "@/lib/number-connection";
import { phonesEqual } from "@/lib/owner-alerts";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/twilio-client";

/*
  Orvius dials the business number from the shop's own Orvius line and hangs
  up after a short silence. If forwarding is on, that call comes back to the
  Orvius line carrying the line's own caller ID — the only call that ever
  does — and the Vapi webhook records the arrival here instead of treating it
  as a customer. Nothing else counts as proof.
*/

type TwilioLike = {
  calls: {
    create(input: { to: string; from: string; twiml: string; timeout: number }): Promise<{ sid: string }>;
    (sid: string): { fetch(): Promise<{ status?: string | null }> };
    list(input: { to: string; startTimeAfter: Date; limit: number }): Promise<Array<{ from?: string | null; forwardedFrom?: string | null }>>;
  };
};

const SILENCE_TWIML = '<Response><Pause length="12"/><Hangup/></Response>';

export type StartResult =
  | { ok: true; id: string }
  | { ok: false; reason: "no_line" | "no_number" | "same_number" | "unavailable" | "busy"; message: string };

export async function startForwardTest(params: {
  business: { id: string; twilioPhone: string | null; vapiPhoneNumber: string | null };
  businessNumber: string;
  coverage: Coverage;
  client?: TwilioLike;
}): Promise<StartResult> {
  const from = params.business.twilioPhone?.trim() || null;
  const line = from ?? params.business.vapiPhoneNumber?.trim() ?? null;
  if (!line) return { ok: false, reason: "no_line", message: "Your Orvius line isn't ready yet, so there's nothing to test against." };
  const to = params.businessNumber.trim();
  if (!to) return { ok: false, reason: "no_number", message: "Enter your business number first." };
  if (phonesEqual(to, line)) {
    return { ok: false, reason: "same_number", message: "That's your Orvius number. Enter the number customers call today." };
  }
  const recent = await prisma.forwardTest.findFirst({
    where: { businessId: params.business.id, state: "calling", startedAt: { gte: new Date(Date.now() - FORWARD_TEST_WINDOW_MS) } },
    select: { id: true },
  });
  if (recent) return { ok: true, id: recent.id };

  const canDial = Boolean(params.client) || Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());
  if (!from || !canDial) {
    return {
      ok: false,
      reason: "unavailable",
      message: "Orvius can't place the test call for this line. Call your business number from another phone and don't answer — Orvius marks it done when the call comes through.",
    };
  }

  const test = await prisma.forwardTest.create({
    data: { businessId: params.business.id, businessNumber: to, coverage: params.coverage },
  });
  try {
    const client = params.client ?? (getTwilioClient() as unknown as TwilioLike);
    const call = await client.calls.create({ to, from, twiml: SILENCE_TWIML, timeout: 45 });
    await prisma.forwardTest.update({ where: { id: test.id }, data: { outboundSid: call.sid } });
    logInfo("forward_test.started", { businessId: params.business.id, testId: test.id });
    return { ok: true, id: test.id };
  } catch (error) {
    logWarn("forward_test.dial_failed", { businessId: params.business.id, error: error instanceof Error ? error.message : "unknown" });
    const verdict = forwardTestVerdict({ arrived: false, outbound: "failed", elapsedMs: 0, coverage: params.coverage });
    await prisma.forwardTest.update({
      where: { id: test.id },
      data: { state: verdict.state, title: verdict.title, finishedAt: new Date() },
    });
    return { ok: true, id: test.id };
  }
}

async function markProven(businessId: string, testId: string, businessNumber: string) {
  const now = new Date();
  await prisma.business.updateMany({ where: { id: businessId, lineVerifiedAt: null }, data: { lineVerifiedAt: now } });
  const stamped = await prisma.business.updateMany({
    where: { id: businessId, overflowForwardConfirmedAt: null },
    data: { overflowForwardConfirmedAt: now, overflowProvedAt: now },
  });
  if (stamped.count) {
    await recordAudit({
      businessId,
      entityType: "shop",
      entityId: businessId,
      action: "capture.confirmed",
      actor: "orvius",
      summary: `Connection proven: a test call to ${businessNumber} came through to the Orvius line`,
      detail: { kind: "forward_test", testId },
      idempotencyKey: `capture-confirmed:${businessId}`,
    });
  }
}

/** Called by the Vapi webhook when a call arrives carrying the line's own caller ID. */
export async function recordForwardTestArrival(businessId: string): Promise<boolean> {
  const test = await prisma.forwardTest.findFirst({
    where: { businessId, startedAt: { gte: new Date(Date.now() - 5 * 60_000) } },
    orderBy: { startedAt: "desc" },
  });
  if (!test) return false;
  if (test.state === "reached") return true;
  const verdict = forwardTestVerdict({ arrived: true, outbound: null, elapsedMs: 0, coverage: test.coverage as Coverage });
  const moved = await prisma.forwardTest.updateMany({
    where: { id: test.id, state: { not: "reached" } },
    data: { state: verdict.state, title: verdict.title, finishedAt: new Date() },
  });
  if (moved.count) await markProven(businessId, test.id, test.businessNumber);
  return true;
}

export type ForwardTestView = { id: string; state: string; title: string; fix: string | null; startedAt: string };

/** Re-reads the network for a test still in flight and settles it once the answer is known. */
export async function checkForwardTest(params: {
  businessId: string;
  id: string;
  line: string | null;
  client?: TwilioLike;
  now?: Date;
}): Promise<ForwardTestView | null> {
  const test = await prisma.forwardTest.findFirst({ where: { id: params.id, businessId: params.businessId } });
  if (!test) return null;
  const coverage = test.coverage as Coverage;
  const view = (v: ForwardTestVerdict, state: string = v.state): ForwardTestView => ({
    id: test.id,
    state,
    title: v.title,
    fix: v.fix,
    startedAt: test.startedAt.toISOString(),
  });
  if (test.state !== "calling") {
    const settled = forwardTestVerdict({
      arrived: test.state === "reached",
      outbound: { busy: "busy", failed: "failed", answered_elsewhere: "completed" }[test.state] ?? "no-answer",
      elapsedMs: FORWARD_TEST_WINDOW_MS,
      coverage,
    });
    return view({ ...settled, title: test.title ?? settled.title }, test.state);
  }

  const now = params.now ?? new Date();
  const elapsedMs = now.getTime() - test.startedAt.getTime();
  let outbound: string | null = null;
  let arrived = false;
  const client = params.client ?? (process.env.TWILIO_ACCOUNT_SID?.trim() ? (getTwilioClient() as unknown as TwilioLike) : null);
  if (client && test.outboundSid) {
    try {
      outbound = (await client.calls(test.outboundSid).fetch()).status ?? null;
      if (params.line) {
        const inbound = await client.calls.list({ to: params.line, startTimeAfter: test.startedAt, limit: 20 });
        arrived = inbound.some(
          (c) => phonesEqual(c.from ?? null, params.line) || phonesEqual(c.forwardedFrom ?? null, test.businessNumber),
        );
      }
    } catch (error) {
      logWarn("forward_test.check_failed", { testId: test.id, error: error instanceof Error ? error.message : "unknown" });
    }
  }
  // Twilio reports the outbound leg done slightly before the forwarded leg is listed; give it a beat.
  const verdict = forwardTestVerdict({
    arrived,
    outbound: outbound && elapsedMs < 8_000 ? null : outbound,
    elapsedMs,
    coverage,
  });
  if (verdict.state === "calling") return view(verdict);

  const moved = await prisma.forwardTest.updateMany({
    where: { id: test.id, state: "calling" },
    data: { state: verdict.state, title: verdict.title, finishedAt: now },
  });
  if (moved.count && verdict.state === "reached") await markProven(params.businessId, test.id, test.businessNumber);
  if (moved.count === 0) {
    const fresh = await prisma.forwardTest.findUnique({ where: { id: test.id } });
    if (fresh && fresh.state !== verdict.state) return checkForwardTest(params);
  }
  return view(verdict);
}

export async function latestForwardTest(businessId: string) {
  return prisma.forwardTest.findFirst({
    where: { businessId },
    orderBy: { startedAt: "desc" },
    select: { state: true, title: true, startedAt: true },
  });
}
