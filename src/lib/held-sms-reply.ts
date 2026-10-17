import { normalizePhone } from "@/lib/customer";
import { logInfo } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { recordWebhookEvent } from "@/lib/webhook-events";

/** A held reply the customer has not pointed at a shop within this long stays held for the founder to route. */
const RELEASE_WINDOW_MS = 7 * 86_400_000;

type Candidate = {
  id: string;
  name: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
};

type HeldPayload = {
  from: string;
  fromNormalized: string;
  to: string;
  body: string;
  candidateIds: string[];
};

export function heldReplyAsk(candidates: Array<{ name: string }>) {
  const names = candidates.map((c) => c.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
  return `Thanks, we got your message. More than one business texts you through this number, so reply with the name of the one you mean (${list}) and we'll pass it on.`;
}

/**
 * Keep a reply no single shop can claim, tell each candidate owner without
 * showing them the text (it may be meant for someone else), and return the
 * question that lets the customer route it. The held row is the founder's
 * repair signal if the customer never answers.
 */
export async function holdAmbiguousReply(params: {
  from: string;
  to: string;
  body: string;
  messageSid: string;
  candidates: Candidate[];
}) {
  const fromNormalized = normalizePhone(params.from) ?? params.from;
  const payload: HeldPayload = {
    from: params.from,
    fromNormalized,
    to: params.to,
    body: params.body,
    candidateIds: params.candidates.map((c) => c.id),
  };
  const { duplicate } = await recordWebhookEvent({
    source: "twilio-sms",
    externalId: params.messageSid || `held:${fromNormalized}:${Date.now()}`,
    eventType: "inbound-held",
    status: "held",
    payload,
    error: "more than one shop texted this phone recently",
  });
  if (!duplicate) {
    for (const shop of params.candidates) {
      await enqueueOwnerAlert({
        businessId: shop.id,
        ownerPhone: shop.ownerPhone,
        ownerEmail: shop.ownerEmail,
        businessName: shop.name,
        message: `${params.from} replied to a text sent through Orvius, but another business also texted that number recently, so we held the reply instead of guessing who it was for. We asked them which business they meant. If they're yours, call or text ${params.from}.`,
        dedupeKey: `sms-held:${params.messageSid || `${fromNormalized}:${Date.now()}`}:${shop.id}`,
      });
    }
  }
  logInfo("twilio.sms.reply_held", { candidates: payload.candidateIds, messageSid: params.messageSid, duplicate });
  return heldReplyAsk(params.candidates);
}

/**
 * Hand the held replies from this phone to the shop the customer just named,
 * oldest first. Each row is claimed with a status swap so a redelivered
 * clarification cannot release it twice.
 */
export async function releaseHeldReplies(params: { from: string; businessId: string; now?: Date }) {
  const fromNormalized = normalizePhone(params.from);
  if (!fromNormalized) return [];
  const since = new Date((params.now ?? new Date()).getTime() - RELEASE_WINDOW_MS);
  const rows = await prisma.webhookEvent.findMany({
    where: {
      source: "twilio-sms",
      eventType: "inbound-held",
      status: "held",
      createdAt: { gte: since },
      payloadJson: { contains: `"fromNormalized":${JSON.stringify(fromNormalized)}` },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
  });
  const bodies: string[] = [];
  for (const row of rows) {
    let payload: HeldPayload;
    try {
      payload = JSON.parse(row.payloadJson ?? "") as HeldPayload;
    } catch {
      continue;
    }
    if (payload.fromNormalized !== fromNormalized || !payload.candidateIds?.includes(params.businessId)) continue;
    const claimed = await prisma.webhookEvent.updateMany({
      where: { id: row.id, status: "held" },
      data: { status: "released", businessId: params.businessId, error: null },
    });
    if (claimed.count === 1 && payload.body) bodies.push(payload.body);
  }
  return bodies;
}
