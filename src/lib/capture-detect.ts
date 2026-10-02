import type { Business } from "@prisma/client";
import { recordAudit } from "@/lib/audit";
import { logInfo, logWarn } from "@/lib/logger";
import { phonesEqual } from "@/lib/owner-alerts";
import { OWNER_TEST_CALL_PREFIX } from "@/lib/owner-test-call";
import { prisma } from "@/lib/prisma";
import { getTwilioClient } from "@/lib/twilio-client";
import { sendSms } from "@/lib/twilio-sms";

/*
  Owners used to confirm call capture by hand — tick a box or text DONE — and
  many never did, so Orvius kept nagging shops that were already set up. The
  calls themselves say whether capture works:

  - forward: carriers stamp a forwarded call with the number it was forwarded
    from. One real call forwarded from another number to this line is proof.
  - publish: the Orvius number is the shop's public number. Two different
    customers reaching it is proof people are finding it.

  The owner's own calls and in-app tests never count. A forward-mode shop
  whose carrier doesn't pass the forwarding number is left to confirm by hand
  rather than guessed at: a wrong "confirmed" would stop the reminders while
  calls still ring out at the old number.
*/

export const PUBLISH_DISTINCT_CALLERS = 2;

type TwilioCalls = { calls(sid: string): { fetch(): Promise<{ forwardedFrom?: string | null }> } };

export type CaptureEvidence =
  | { kind: "forwarded"; from: string }
  | { kind: "customers"; callers: number };

async function forwardedFromFor(providerCallId: string | null | undefined, client?: TwilioCalls) {
  if (!providerCallId?.startsWith("CA")) return null;
  if (!client && !(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim())) return null;
  try {
    const call = await (client ?? (getTwilioClient() as unknown as TwilioCalls)).calls(providerCallId).fetch();
    return call.forwardedFrom?.trim() || null;
  } catch (error) {
    logWarn("capture_detect.twilio_fetch_failed", { error: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

/** Confirms capture from a completed call when the call itself proves it. Runs once per shop. */
export async function detectCallCapture(params: {
  business: Pick<
    Business,
    "id" | "name" | "ownerPhone" | "twilioPhone" | "vapiPhoneNumber" | "captureMode" | "overflowForwardConfirmedAt"
  >;
  vapiCallId: string;
  callerPhone: string | null;
  providerCallId?: string | null;
  client?: TwilioCalls;
}): Promise<CaptureEvidence | null> {
  const { business } = params;
  if (business.overflowForwardConfirmedAt) return null;
  if (params.vapiCallId.startsWith(OWNER_TEST_CALL_PREFIX)) return null;
  if (!params.callerPhone || phonesEqual(params.callerPhone, business.ownerPhone)) return null;
  const line = business.twilioPhone ?? business.vapiPhoneNumber;

  let evidence: CaptureEvidence | null = null;
  const mode = business.captureMode ?? "forward";
  if (mode === "forward") {
    const from = await forwardedFromFor(params.providerCallId, params.client);
    if (from && !phonesEqual(from, line) && !phonesEqual(from, params.callerPhone)) {
      evidence = { kind: "forwarded", from };
    }
  } else {
    const calls = await prisma.call.findMany({
      where: {
        businessId: business.id,
        callerPhone: { not: null },
        NOT: { vapiCallId: { startsWith: OWNER_TEST_CALL_PREFIX } },
      },
      select: { callerPhone: true },
      distinct: ["callerPhone"],
      take: 20,
    });
    const callers = calls.filter((c) => c.callerPhone && !phonesEqual(c.callerPhone, business.ownerPhone)).length;
    if (callers >= PUBLISH_DISTINCT_CALLERS) evidence = { kind: "customers", callers };
  }
  if (!evidence) return null;

  const now = new Date();
  const stamped = await prisma.business.updateMany({
    where: { id: business.id, overflowForwardConfirmedAt: null, lineVerifiedAt: { not: null } },
    data: { overflowForwardConfirmedAt: now, overflowProvedAt: now },
  });
  if (stamped.count === 0) return null;

  const summary =
    evidence.kind === "forwarded"
      ? `Forwarding works: a call forwarded from ${evidence.from} reached the Orvius line`
      : `Customers are reaching the Orvius number: ${evidence.callers} different callers so far`;
  logInfo("capture_detect.confirmed", { businessId: business.id, kind: evidence.kind });
  await recordAudit({
    businessId: business.id,
    entityType: "shop",
    entityId: business.id,
    action: "capture.confirmed",
    actor: "orvius",
    summary,
    detail: evidence,
    idempotencyKey: `capture-confirmed:${business.id}`,
  });
  if (business.ownerPhone) {
    await sendSms({
      to: business.ownerPhone,
      businessId: business.id,
      audience: "owner",
      body:
        evidence.kind === "forwarded"
          ? `Orvius: forwarding works. A call to ${evidence.from} just came through to ${business.name}'s Orvius line and was answered. Nothing else to set up.`
          : `Orvius: customers are reaching ${business.name}'s Orvius number. Call capture is confirmed; nothing else to set up.`,
    }).catch((error: unknown) => {
      logWarn("capture_detect.owner_sms_failed", { error: error instanceof Error ? error.message : "unknown" });
    });
  }
  return evidence;
}
