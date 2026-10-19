import { prisma } from "@/lib/prisma";

/*
  Who may text a shop's customers and technicians, and from what.

  A number being configured is not permission to text from it. US carriers
  filter application texts from an unregistered 10DLC number or an unverified
  toll-free number, so a customer text only goes out when one of these is on
  record:
  - the shop's own campaign is approved (ShopTexting.status "approved" with a
    messaging service), or
  - the shared Orvius sender in use right now has a "verified" MessagingSender
    row, written from the provider's own verification status.

  Otherwise customer and technician texts are held, never re-routed to email.
  Owner alerts are Orvius talking to the account holder who set them up, so
  they keep the shared sender and the email backup they already have.
*/

export type SenderIdentity = { identity: string; kind: "toll_free" | "ten_dlc" | "messaging_service" };

const TOLL_FREE = /^\+18(00|33|44|55|66|77|88)\d{7}$/;

/** The shared sender as configured now; the same rule `smsSender()` uses to pick it. */
export function sharedSenderIdentity(env: NodeJS.ProcessEnv = process.env): SenderIdentity | null {
  const service = env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  if (service) return { identity: `service:${service}`, kind: "messaging_service" };
  const number = env.TWILIO_PHONE_NUMBER?.trim();
  if (!number) return null;
  return { identity: `number:${number}`, kind: TOLL_FREE.test(number) ? "toll_free" : "ten_dlc" };
}

export async function isSharedSenderVerified(env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  const sender = sharedSenderIdentity(env);
  if (!sender) return false;
  const row = await prisma.messagingSender
    .findUnique({ where: { identity: sender.identity }, select: { status: true } })
    .catch(() => null);
  return row?.status === "verified";
}

export type TextingEligibility =
  | { ok: true; via: "own" | "shared" }
  | { ok: false; reason: "own_campaign_pending" | "own_campaign_failed" | "shared_sender_unverified" | "no_sender"; detail: string };

/** Whether this shop's customer and technician texts may go out right now, and through which sender. */
export async function textingEligibility(businessId: string): Promise<TextingEligibility> {
  const [own, sharedVerified] = await Promise.all([
    prisma.shopTexting
      .findUnique({ where: { businessId }, select: { status: true, messagingServiceSid: true, failureReason: true } })
      .catch(() => null),
    isSharedSenderVerified(),
  ]);
  if (own?.status === "approved" && own.messagingServiceSid) return { ok: true, via: "own" };
  if (sharedVerified) return { ok: true, via: "shared" };
  if (!sharedSenderIdentity()) return { ok: false, reason: "no_sender", detail: "No texting number is configured." };
  if (own?.status === "failed") {
    return { ok: false, reason: "own_campaign_failed", detail: own.failureReason ?? "The carriers did not approve your texting registration." };
  }
  if (own) return { ok: false, reason: "own_campaign_pending", detail: "Your texting registration is with the carriers. Customer texts are held until it is approved." };
  return {
    ok: false,
    reason: "shared_sender_unverified",
    detail: "Texting is not verified with the carriers yet. Customer texts are held, not sent.",
  };
}

const PROVIDER_STATUS: Record<string, "verified" | "pending" | "rejected"> = {
  TWILIO_APPROVED: "verified",
  IN_REVIEW: "pending",
  PENDING_REVIEW: "pending",
  TWILIO_REJECTED: "rejected",
};

/**
 * Store what Twilio said about the shared toll-free number's verification. Only
 * a toll-free check of the sender in use is accepted, and only TWILIO_APPROVED
 * makes it "verified". A messaging-service sender has no automatic check here,
 * so it stays unverified until one exists.
 */
export async function recordSharedSenderCheck(
  input: { number: string | null; tollFree: boolean; checked: boolean; status: string | null },
  recordedBy: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ recorded: boolean; status?: string }> {
  const sender = sharedSenderIdentity(env);
  if (!sender || sender.kind !== "toll_free" || !input.checked || !input.tollFree) return { recorded: false };
  if (sender.identity !== `number:${input.number}`) return { recorded: false };
  const status = (input.status && PROVIDER_STATUS[input.status]) ?? "unknown";
  const evidence = `Twilio toll-free verification status ${input.status ?? "none"} for ${input.number}`;
  const checkedAt = new Date();
  await prisma.messagingSender.upsert({
    where: { identity: sender.identity },
    create: { identity: sender.identity, kind: sender.kind, status, evidence, checkedAt, recordedBy },
    update: { kind: sender.kind, status, evidence, checkedAt, recordedBy },
  });
  return { recorded: true, status };
}
