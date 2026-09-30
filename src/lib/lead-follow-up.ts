import { recordAudit } from "@/lib/audit";
import { displayPhone, normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { afterResponse } from "@/lib/after-response";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { logError, logInfo, logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notifications";
import { recordWebhookEvent } from "@/lib/webhook-events";
import { prisma } from "@/lib/prisma";
import { classifyRequest } from "@/lib/trade-playbooks";
import { isEmergency } from "@/lib/urgency";

/**
 * The follow-up agent: a caller who asked for service and was never booked or
 * called back gets one short text from the shop, so the job is not lost to the
 * next company they call. One text per lead, one per phone a week, daytime
 * only, never to an emergency (those need a call) and never past a STOP.
 */

export const FOLLOW_UP_AFTER_MS = 3 * 60 * 60_000;
export const FOLLOW_UP_UNTIL_MS = 72 * 60 * 60_000;
const PER_PHONE_GAP_MS = 7 * 24 * 60 * 60_000;
/** A reply this long after the text is a new conversation, not an answer to it. */
export const FOLLOW_UP_REPLY_WINDOW_MS = 7 * 24 * 60 * 60_000;
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 20;

export type FollowUpMode = "off" | "ask" | "auto";
export const FOLLOW_UP_MODES: readonly FollowUpMode[] = ["off", "ask", "auto"];

export function followUpMode(value: string | null | undefined): FollowUpMode {
  return value === "off" || value === "auto" ? value : "ask";
}

export type FollowUpLead = {
  status: string;
  phone: string | null;
  urgency: string | null;
  categoryCode: string | null;
  createdAt: Date;
  firstContactedAt: Date | null;
  followUpSentAt: Date | null;
  job: { id: string } | null;
};

export type FollowUpBlock =
  | "already_sent"
  | "worked"
  | "booked"
  | "no_phone"
  | "emergency"
  | "not_service"
  | "too_soon"
  | "too_old";

/** Why this lead should not get the text, or null when it should. */
export function followUpBlock(lead: FollowUpLead, now: Date, options: { ignoreTooSoon?: boolean } = {}): FollowUpBlock | null {
  if (lead.followUpSentAt) return "already_sent";
  if (lead.job) return "booked";
  if (lead.status !== "new" || lead.firstContactedAt) return "worked";
  if (!normalizePhone(lead.phone ?? "")) return "no_phone";
  if (isEmergency(lead.urgency)) return "emergency";
  if (lead.categoryCode === "other.non_service") return "not_service";
  const age = now.getTime() - lead.createdAt.getTime();
  if (age > FOLLOW_UP_UNTIL_MS) return "too_old";
  if (!options.ignoreTooSoon && age < FOLLOW_UP_AFTER_MS) return "too_soon";
  return null;
}

export function isShopDaytime(now: Date, timeZone: string) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timeZone || "America/New_York" }).format(now),
  );
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
}

function firstName(name: string | null) {
  const first = name?.trim().split(/\s+/)[0];
  return first && /^[\p{L}'-]{2,}$/u.test(first) ? first : null;
}

function describeRequest(serviceType: string | null) {
  const s = serviceType?.trim();
  if (!s || /^sms inquiry$/i.test(s) || s.length > 60) return null;
  // "No heat" reads "about no heat"; "AC not cooling" keeps its acronym.
  return /^\p{Lu}\p{Ll}/u.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

export function followUpMessage(params: { businessName: string; name: string | null; serviceType: string | null; callbackPhone: string | null }) {
  const hi = firstName(params.name) ? `Hi ${firstName(params.name)}, ` : "Hi, ";
  const about = describeRequest(params.serviceType);
  const callback = params.callbackPhone ? displayPhone(params.callbackPhone) ?? params.callbackPhone : null;
  return [
    `${hi}it's ${params.businessName.trim()} following up on your call${about ? ` about ${about}` : ""}. `,
    "Still need a hand? Reply with a day and time that suits you and we'll get you on the schedule",
    callback ? `, or call us at ${callback}.` : ".",
    " Reply STOP to opt out.",
  ].join("");
}

const LEAD_FOR_FOLLOW_UP = {
  id: true,
  businessId: true,
  customerId: true,
  name: true,
  phone: true,
  status: true,
  urgency: true,
  serviceType: true,
  categoryCode: true,
  createdAt: true,
  firstContactedAt: true,
  followUpSentAt: true,
  job: { select: { id: true } },
  business: { select: { id: true, name: true, timezone: true, vapiPhoneNumber: true, twilioPhone: true, followUpMode: true, isActive: true } },
} as const;

type LoadedLead = NonNullable<Awaited<ReturnType<typeof loadLead>>>;

function loadLead(businessId: string, leadId: string) {
  return prisma.lead.findFirst({ where: { id: leadId, businessId }, select: LEAD_FOR_FOLLOW_UP });
}

/** Booked since, texted recently under another lead, or called back in: the text would be wrong. */
async function laterBlock(businessId: string, lead: LoadedLead, now: Date): Promise<"booked" | "recently_texted" | null> {
  const phone = normalizePhone(lead.phone ?? "");
  if (!phone) return null;
  const [otherJob, recentText] = await Promise.all([
    lead.customerId
      ? prisma.job.findFirst({ where: { businessId, customerId: lead.customerId, createdAt: { gte: lead.createdAt } }, select: { id: true } })
      : null,
    prisma.lead.findFirst({
      where: {
        businessId,
        id: { not: lead.id },
        followUpSentAt: { gte: new Date(now.getTime() - PER_PHONE_GAP_MS) },
        OR: samePerson(phone, lead.phone, lead.customerId),
      },
      select: { id: true },
    }),
  ]);
  if (otherJob) return "booked";
  if (recentText) return "recently_texted";
  return null;
}

/* Lead phones are stored as captured; the customer row holds the normalized one. */
function samePerson(normalized: string, raw: string | null, customerId: string | null) {
  return [
    { phone: normalized },
    ...(raw && raw !== normalized ? [{ phone: raw }] : []),
    { customer: { phoneNormalized: normalized } },
    ...(customerId ? [{ customerId }] : []),
  ];
}

export type FollowUpPreview = {
  mode: FollowUpMode;
  message: string;
  sentAt: string | null;
  canSend: boolean;
  reason: string | null;
};

const REASONS: Record<string, string> = {
  already_sent: "Follow-up already sent.",
  worked: "Someone already worked this lead.",
  booked: "Already booked.",
  no_phone: "No number to text.",
  emergency: "Emergencies need a call, not a text.",
  not_service: "Not a service request.",
  too_old: "Over three days old. Call instead.",
  recently_texted: "This customer got a follow-up in the last week.",
  night: "Texts go out between 9am and 8pm shop time.",
  off: "Follow-up texts are off in Settings.",
};

export async function previewFollowUp(businessId: string, leadId: string, now = new Date()): Promise<FollowUpPreview | null> {
  const lead = await loadLead(businessId, leadId);
  if (!lead?.business) return null;
  const mode = followUpMode(lead.business.followUpMode);
  const block =
    (mode === "off" ? "off" : null) ??
    followUpBlock(lead, now, { ignoreTooSoon: true }) ??
    (await laterBlock(businessId, lead, now)) ??
    (isShopDaytime(now, lead.business.timezone) ? null : "night");
  return {
    mode,
    message: messageFor(lead),
    sentAt: lead.followUpSentAt?.toISOString() ?? null,
    canSend: !block,
    reason: block ? REASONS[block] ?? null : null,
  };
}

function messageFor(lead: LoadedLead) {
  return followUpMessage({
    businessName: lead.business!.name,
    name: lead.name,
    serviceType: lead.serviceType,
    callbackPhone: lead.business!.vapiPhoneNumber ?? lead.business!.twilioPhone ?? null,
  });
}

export type FollowUpResult =
  | { sent: true }
  | { sent: false; reason: string };

/**
 * Claim, then send. The claim is the stamp: two taps, a tap racing the cron,
 * or a retried request all find it taken, so the customer gets one text.
 */
export async function sendLeadFollowUp(params: {
  businessId: string;
  leadId: string;
  by: { actor: "owner" | "teammate"; actorEmail: string } | "orvius";
  now?: Date;
  send?: typeof sendCustomerSms;
}): Promise<FollowUpResult> {
  const now = params.now ?? new Date();
  const lead = await loadLead(params.businessId, params.leadId);
  if (!lead?.business) return { sent: false, reason: "Lead not found." };
  const auto = params.by === "orvius";
  const mode = followUpMode(lead.business.followUpMode);
  if (mode === "off" || (auto && mode !== "auto")) return { sent: false, reason: REASONS.off };
  const block =
    followUpBlock(lead, now, { ignoreTooSoon: !auto }) ??
    (await laterBlock(params.businessId, lead, now)) ??
    (isShopDaytime(now, lead.business.timezone) ? null : "night");
  if (block) return { sent: false, reason: REASONS[block] ?? block };

  const claimed = await prisma.lead.updateMany({
    where: { id: lead.id, businessId: params.businessId, followUpSentAt: null, status: "new", firstContactedAt: null },
    data: { followUpSentAt: now },
  });
  if (!claimed.count) return { sent: false, reason: REASONS.already_sent };

  const message = messageFor(lead);
  let result: Awaited<ReturnType<typeof sendCustomerSms>>;
  try {
    result = await (params.send ?? sendCustomerSms)({ businessId: params.businessId, to: lead.phone!, body: message });
  } catch (error) {
    // Twilio refused the request, so nothing reached the customer; free the lead for another try.
    await prisma.lead.update({ where: { id: lead.id }, data: { followUpSentAt: null } });
    logWarn("follow_up.send_failed", { leadId: lead.id, error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "The text did not go out. Try again." };
  }
  if (!result.sent) {
    await prisma.lead.update({ where: { id: lead.id }, data: { followUpSentAt: null } });
    const why = {
      customer_opted_out: "This customer texted STOP.",
      invalid_customer_phone: REASONS.no_phone,
      sms_not_configured: "Texting is not switched on for this shop yet.",
    }[result.reason];
    return { sent: false, reason: why };
  }

  await recordAudit({
    businessId: params.businessId,
    entityType: "lead",
    entityId: lead.id,
    action: "lead.follow_up_sent",
    ...(params.by === "orvius" ? { actor: "orvius" as const } : params.by),
    summary: auto
      ? `Nobody had reached ${lead.name ?? "this caller"} in ${Math.round((now.getTime() - lead.createdAt.getTime()) / 3_600_000)}h, so Orvius texted a follow-up.`
      : `Texted ${lead.name ?? "the caller"} a follow-up.`,
    detail: { message },
    leadId: lead.id,
    customerId: lead.customerId,
    idempotencyKey: `follow-up:${lead.id}`,
  });
  logInfo("follow_up.sent", { businessId: params.businessId, leadId: lead.id, auto });
  return { sent: true };
}

/** Shops set to "auto": text every lead that has waited long enough, during the shop's day. */
export async function runAutoFollowUps(options: { now?: Date; perShop?: number; budgetMs?: number; send?: typeof sendCustomerSms } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 20_000);
  const tally = { shops: 0, sent: 0, skipped: 0 };
  let cursor: string | undefined;
  for (;;) {
    const shops = await prisma.business.findMany({
      where: { followUpMode: "auto", isActive: true, environment: { not: "test" }, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: 100,
      select: { id: true, timezone: true },
    });
    if (!shops.length) break;
    cursor = shops[shops.length - 1].id;
    for (const shop of shops) {
      if (Date.now() > stopAt) return tally;
      if (!isShopDaytime(now, shop.timezone)) continue;
      tally.shops += 1;
      const due = await prisma.lead.findMany({
        where: {
          businessId: shop.id,
          status: "new",
          firstContactedAt: null,
          followUpSentAt: null,
          job: null,
          phone: { not: null },
          createdAt: { gte: new Date(now.getTime() - FOLLOW_UP_UNTIL_MS), lte: new Date(now.getTime() - FOLLOW_UP_AFTER_MS) },
        },
        orderBy: { createdAt: "asc" },
        take: options.perShop ?? 10,
        select: { id: true },
      });
      for (const lead of due) {
        const result = await sendLeadFollowUp({ businessId: shop.id, leadId: lead.id, by: "orvius", now, send: options.send });
        tally[result.sent ? "sent" : "skipped"] += 1;
      }
    }
    if (shops.length < 100) break;
  }
  return tally;
}

/** The lead a customer's text is answering, if Orvius followed up with them this week. */
export async function followUpBeingAnswered(businessId: string, from: string, now = new Date()) {
  const phone = normalizePhone(from);
  if (!phone) return null;
  return prisma.lead.findFirst({
    where: {
      businessId,
      OR: samePerson(phone, from, null),
      followUpSentAt: { gte: new Date(now.getTime() - FOLLOW_UP_REPLY_WINDOW_MS) },
      job: null,
      status: { in: ["new", "contacted"] },
    },
    orderBy: { followUpSentAt: "desc" },
    select: { id: true, name: true, serviceType: true, address: true, notes: true, customerId: true, followUpRepliedAt: true },
  });
}

const REPLY_THANKS = "Thanks, we got it. We'll be in touch shortly to lock in a time.";

/**
 * A text from someone Orvius followed up with this week is their answer: it
 * lands on that lead and goes to the owner, rather than opening a second lead.
 * Twilio never redelivers an inbound text, so the owner alert is queued before
 * anything else can fail. Returns the reply to send back, or null when the
 * text is not a follow-up reply.
 */
export async function answerFollowUpReply(params: {
  business: { id: string; name: string; ownerPhone: string | null; ownerEmail: string | null; trade?: string | null; servicesJson?: string | null };
  from: string;
  to: string;
  body: string;
  messageSid: string;
  now?: Date;
}): Promise<string | null> {
  const { business, from, body, messageSid } = params;
  const now = params.now ?? new Date();
  const answering = await followUpBeingAnswered(business.id, from, now);
  if (!answering) return null;
  if (messageSid) {
    const seen = await prisma.webhookEvent.findUnique({
      where: { source_externalId_eventType: { source: "twilio-sms", externalId: messageSid, eventType: "follow-up-reply" } },
      select: { id: true },
    });
    if (seen) return REPLY_THANKS;
  }

  const hazard = Boolean(classifyRequest({ business, notes: body, callerWords: body }).safety);
  await enqueueOwnerAlert({
    businessId: business.id,
    ownerPhone: business.ownerPhone,
    ownerEmail: business.ownerEmail,
    businessName: business.name,
    message: [
      hazard ? "SAFETY — the reply mentions a hazard. Call them now." : null,
      `${answering.name ?? "A caller"} replied to your follow-up${answering.serviceType ? ` about ${answering.serviceType}` : ""}: "${body.slice(0, 300)}"`,
      `Call back: ${from}${answering.address ? ` · ${answering.address}` : ""}`,
    ]
      .filter(Boolean)
      .join("\n"),
    leadId: answering.id,
    dedupeKey: `follow-up-reply:${messageSid || `${answering.id}:${body.slice(0, 40)}`}`,
  });

  try {
    await recordFollowUpReply(answering.id, body, now);
    await recordAudit({
      businessId: business.id,
      entityType: "lead",
      entityId: answering.id,
      action: "lead.follow_up_replied",
      summary: `${answering.name ?? "The caller"} replied to the follow-up text.`,
      detail: { reply: body.slice(0, 500) },
      leadId: answering.id,
      customerId: answering.customerId,
      idempotencyKey: `sms:${messageSid || answering.id}:follow-up-reply`,
    });
    await recordWebhookEvent({
      source: "twilio-sms",
      externalId: messageSid || `${answering.id}:reply:${now.getTime()}`,
      eventType: "follow-up-reply",
      businessId: business.id,
      status: "processed",
      payload: { from, to: params.to, leadId: answering.id },
    });
  } catch (error) {
    logError("follow_up.reply_record_failed", { leadId: answering.id, error: error instanceof Error ? error.message : String(error) });
  }
  await afterResponse(() => drainOwnerAlerts({ at: "twilio.sms.follow_up_reply", messageSid, businessId: business.id }));
  return hazard ? "If there is immediate danger, leave the area and call 911. We got your message and will call you shortly." : REPLY_THANKS;
}

async function recordFollowUpReply(leadId: string, body: string, now: Date) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: leadId }, select: { notes: true } });
  const line = `Replied to follow-up: ${body.trim().slice(0, 500)}`;
  await prisma.lead.update({
    where: { id: leadId },
    data: { followUpRepliedAt: now, notes: [lead.notes?.trim(), line].filter(Boolean).join("\n").slice(0, 2000) },
  });
}
