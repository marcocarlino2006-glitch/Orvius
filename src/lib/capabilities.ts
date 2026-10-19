import type { Business } from "@prisma/client";
import { activationVersions } from "@/lib/activation-ack";
import { busyCalendarUnreadable } from "@/lib/busy-calendar";
import { parseJson, type BusinessHours } from "@/lib/business";
import { isFsmScheduleUnreadable } from "@/lib/fsm-schedule";
import { prisma } from "@/lib/prisma";
import { getSchedulingPolicy, holdsForApproval, type SchedulingPolicy } from "@/lib/scheduling-policy";
import { textingEligibility, type TextingEligibility } from "@/lib/sms-eligibility";

/*
  What a shop can actually do right now, one capability at a time. A setting
  says what the owner asked for; a capability is "ready" only when what it
  depends on is on record. A number is not proof of forwarding, a connected
  calendar is not proof of a readable schedule, and a finished wizard is not
  proof of anything. The runtime paths read the same rules: booking through
  `bookingReadiness`, texting through `textingEligibility`, card collection
  through Stripe's chargesEnabled.
*/

export type CapabilityId = "voice" | "owner_alerts" | "sms" | "booking" | "follow_ups" | "payments";
/** off: the owner hasn't asked for it. pending: asked for, a prerequisite is missing. ready: on and allowed. */
export type CapabilityState = "ready" | "pending" | "off";
export type CapabilityFact = { label: string; ok: boolean | null };
export type Capability = {
  id: CapabilityId;
  label: string;
  requested: boolean;
  state: CapabilityState;
  /** What happens instead while it is pending or off. */
  meanwhile: string | null;
  detail: string;
  facts: CapabilityFact[];
  /** Where the owner fixes it. */
  fixHref: string | null;
  /** Test mode: what this says works is simulated and reaches no one. */
  simulated?: boolean;
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export function openDays(hoursJson: string | null | undefined): number {
  const hours = parseJson<BusinessHours>(hoursJson || "{}", {});
  return DAYS.filter((day) => {
    const entry = hours?.[day];
    return Boolean(entry && !entry.closed && entry.open && entry.close && entry.open < entry.close);
  }).length;
}

export type BookingBlock = "alert_mode" | "no_hours" | "policy_not_set" | "calendar_unreadable" | "field_software_unreadable";
export type BookingReadiness = { ok: true } | { ok: false; block: BookingBlock; detail: string };

const BOOKING_BLOCK_DETAIL: Record<BookingBlock, string> = {
  alert_mode: "You chose to set times yourself, so Orvius takes details and you confirm.",
  no_hours: "No open hours are saved, so there are no times to offer.",
  policy_not_set: "Travel between jobs isn't set, so only you can promise an exact time.",
  calendar_unreadable: "Your busy calendar hasn't been read recently, so Orvius can't tell which times are free.",
  field_software_unreadable: "Your field software's schedule hasn't been read successfully, so Orvius can't tell which times are free.",
};

/**
 * Whether anyone but the owner may promise an exact time for this shop now.
 * Voice holds, online booking and the capability report all ask this.
 */
export async function bookingReadiness(
  shop: Pick<Business, "id" | "hoursJson"> & Partial<Pick<Business, "bookingMode" | "busyCalendarUrl" | "busyCalendarSyncedAt">>,
  now = new Date(),
  known?: { policy?: SchedulingPolicy },
): Promise<BookingReadiness> {
  const fail = (block: BookingBlock): BookingReadiness => ({ ok: false, block, detail: BOOKING_BLOCK_DETAIL[block] });
  if (shop.bookingMode === "alert") return fail("alert_mode");
  if (openDays(shop.hoursJson) === 0) return fail("no_hours");
  if (holdsForApproval(known?.policy ?? (await getSchedulingPolicy(shop.id)))) return fail("policy_not_set");
  const calendar =
    shop.busyCalendarUrl !== undefined
      ? { busyCalendarUrl: shop.busyCalendarUrl ?? null, busyCalendarSyncedAt: shop.busyCalendarSyncedAt ?? null }
      : await prisma.business.findUnique({ where: { id: shop.id }, select: { busyCalendarUrl: true, busyCalendarSyncedAt: true } });
  if (calendar && busyCalendarUnreadable(calendar, now)) return fail("calendar_unreadable");
  if (await isFsmScheduleUnreadable(shop.id, now)) return fail("field_software_unreadable");
  return { ok: true };
}

type CapabilityShop = Pick<
  Business,
  | "id"
  | "name"
  | "greeting"
  | "bookingMode"
  | "autopilot"
  | "followUpMode"
  | "transferPhone"
  | "setupJson"
  | "hoursJson"
  | "busyCalendarUrl"
  | "busyCalendarSyncedAt"
  | "vapiPhoneNumber"
  | "twilioPhone"
  | "lineVerifiedAt"
  | "overflowProvedAt"
  | "ownerPhone"
  | "ownerEmail"
  | "ownerSmsOptOutAt"
  | "depositEnabled"
  | "depositAmountCents"
  | "stripeConnectAccountId"
  | "stripeConnectChargesEnabled"
  | "environment"
>;

export type CapabilityInput = {
  shop: CapabilityShop;
  booking: BookingReadiness;
  texting: TextingEligibility;
  /** The latest activation approval on record, if any. */
  activation: { noticeVersion: string; setupVersion: string; createdAt: Date; actorEmail: string } | null;
  simulated: boolean;
  /** Evidence about owner alerts. A phone on file or a texting flag is not delivery. */
  alerts?: { reachable: boolean; lastDelivered: { channel: string; at: Date } | null; lastFailedAt: Date | null };
};

export function capabilityReport(input: CapabilityInput): Capability[] {
  const { shop, booking, texting, activation } = input;
  const line = shop.vapiPhoneNumber ?? shop.twilioPhone ?? null;
  const current = activationVersions(shop);
  const approvalCurrent = Boolean(activation && activation.noticeVersion === current.noticeVersion);

  const voiceReady = Boolean(line) && Boolean(activation) && !input.simulated;
  const voice: Capability = {
    id: "voice",
    label: "Answering calls",
    requested: true,
    state: voiceReady ? "ready" : "pending",
    meanwhile: voiceReady ? null : "Calls are not answered by Orvius yet.",
    detail: input.simulated
      ? "Test mode: calls are simulated. Nothing answers real callers until you approve and go live."
      : !line
        ? "No Orvius number yet."
        : !activation
          ? "No go-live approval is on record for this shop."
          : shop.overflowProvedAt
            ? "Answering. A call to your own number has come through."
            : "Answering calls to the Orvius number. Forwarding from your own number isn't proven until a call comes through it.",
    facts: [
      { label: "Orvius number assigned", ok: Boolean(line) },
      { label: "Answered a real call", ok: shop.lineVerifiedAt ? true : line ? false : null },
      { label: "Forwarding from your number proven", ok: shop.overflowProvedAt ? true : line ? false : null },
      {
        label: activation
          ? `Recording notice approved by ${activation.actorEmail} on ${activation.createdAt.toISOString().slice(0, 10)}${approvalCurrent ? "" : " (greeting changed since)"}`
          : "Recording notice approved",
        ok: activation ? approvalCurrent : false,
      },
    ],
    fixHref: !line || !activation ? "/dashboard/onboarding" : "/dashboard/settings?settings=phone",
  };

  const smsOk = input.simulated || texting.ok;
  const sms: Capability = {
    id: "sms",
    label: "Texting customers",
    requested: true,
    state: smsOk ? "ready" : "pending",
    meanwhile: smsOk ? null : "Customer and technician texts are held, not sent, and not swapped for email. Call the customer instead.",
    detail: input.simulated
      ? "Test mode: texts are written as simulated and reach nobody."
      : texting.ok
        ? texting.via === "own"
          ? "Texts come from your own registered number."
          : "Texts come from the verified Orvius sender."
        : texting.detail,
    facts: [
      { label: "Your texting registration approved", ok: texting.ok && texting.via === "own" ? true : texting.ok ? null : false },
      { label: "Shared sender verified with carriers", ok: texting.ok && texting.via === "shared" ? true : texting.ok ? null : false },
    ],
    fixHref: smsOk ? null : "/dashboard/settings?settings=integrations",
  };

  const bookingRequested = shop.bookingMode !== "alert";
  const bookingCap: Capability = {
    id: "booking",
    label: "Booking times",
    requested: bookingRequested,
    state: !bookingRequested ? "off" : booking.ok ? "ready" : "pending",
    meanwhile: booking.ok ? null : "Callers and the booking page leave their details and you set the time.",
    detail: booking.ok ? "Callers and the booking page can pick from your real open times." : booking.detail,
    facts: [
      { label: "Open hours saved", ok: openDays(shop.hoursJson) > 0 },
      { label: "Travel between jobs set", ok: booking.ok ? true : booking.block === "policy_not_set" ? false : null },
      {
        label: "Schedule sources readable",
        ok: booking.ok ? true : booking.block === "calendar_unreadable" || booking.block === "field_software_unreadable" ? false : null,
      },
    ],
    fixHref: booking.ok ? null : booking.block === "no_hours" ? "/dashboard/settings?settings=hours" : "/dashboard/settings?settings=receptionist",
  };

  const followRequested = shop.followUpMode === "auto";
  const followReady = followRequested && smsOk;
  const followUps: Capability = {
    id: "follow_ups",
    label: "Automatic follow-ups",
    requested: followRequested,
    state: !followRequested ? "off" : followReady ? "ready" : "pending",
    meanwhile: !followRequested
      ? "Follow-ups wait for you to send them."
      : followReady
        ? null
        : "Automatic follow-ups are paused until texting is allowed. Nothing is sent in their place.",
    detail: !followRequested ? "You send follow-ups yourself." : followReady ? "Callers who didn't book get one text from your shop." : sms.detail,
    facts: [{ label: "Texting allowed", ok: smsOk }],
    fixHref: followRequested && !followReady ? sms.fixHref : null,
  };

  const depositRequested = shop.depositEnabled && Boolean(shop.depositAmountCents);
  const cardsReady = Boolean(shop.stripeConnectAccountId && shop.stripeConnectChargesEnabled);
  const payments: Capability = {
    id: "payments",
    label: "Card payments and deposits",
    requested: depositRequested || Boolean(shop.stripeConnectAccountId),
    state: cardsReady ? "ready" : depositRequested || shop.stripeConnectAccountId ? "pending" : "off",
    meanwhile: cardsReady ? null : "Pay links and deposits aren't offered. Cash, check and card in person are still recorded.",
    detail: cardsReady
      ? "Stripe has cleared your account to take cards."
      : shop.stripeConnectAccountId
        ? "Stripe hasn't cleared your account to take cards yet."
        : "No Stripe account connected.",
    facts: [
      { label: "Stripe account connected", ok: Boolean(shop.stripeConnectAccountId) },
      { label: "Stripe cleared to charge", ok: cardsReady },
    ],
    fixHref: cardsReady ? null : "/dashboard/settings?settings=integrations",
  };

  const alertFacts = input.alerts ?? { reachable: false, lastDelivered: null, lastFailedAt: null };
  const delivered = alertFacts.lastDelivered;
  const failedSince = Boolean(alertFacts.lastFailedAt && (!delivered || alertFacts.lastFailedAt > delivered.at));
  const alertsReady = alertFacts.reachable && Boolean(delivered) && !failedSince && !input.simulated;
  const ownerAlerts: Capability = {
    id: "owner_alerts",
    label: "Alerts to you",
    requested: true,
    state: alertsReady ? "ready" : "pending",
    meanwhile: alertsReady ? null : "New requests still show in Command; don't rely on a text or email reaching you yet.",
    detail: input.simulated
      ? "Test mode: alerts are simulated and reach no one."
      : !alertFacts.reachable
        ? "No mobile number or email on file to reach you."
        : failedSince
          ? "The last alert to you failed after the last one that got through."
          : delivered
            ? delivered.channel === "email"
              ? `An alert email was accepted by the mail provider ${delivered.at.toISOString().slice(0, 10)}.`
              : `An alert text was delivered (carrier receipt) ${delivered.at.toISOString().slice(0, 10)}.`
            : "Nothing has reached you yet. Send a test alert to prove it.",
    facts: [
      { label: "A way to reach you on file", ok: alertFacts.reachable },
      { label: "An alert has reached you", ok: delivered ? true : alertFacts.reachable ? false : null },
      { label: "No failure since", ok: delivered ? !failedSince : null },
    ],
    fixHref: alertsReady ? null : "/dashboard/settings?settings=notifications",
  };

  const all = [voice, ownerAlerts, sms, bookingCap, followUps, payments];
  return input.simulated ? all.map((c) => (c.state === "off" ? c : { ...c, simulated: true })) : all;
}

export async function loadCapabilities(businessId: string, now = new Date()): Promise<Capability[] | null> {
  const shop = await prisma.business.findUnique({ where: { id: businessId } });
  if (!shop) return null;
  const [booking, texting, activation, delivered, failed] = await Promise.all([
    bookingReadiness(shop, now),
    textingEligibility(shop.id),
    prisma.activationAcknowledgement.findFirst({
      where: { businessId: shop.id },
      orderBy: { createdAt: "desc" },
      select: { noticeVersion: true, setupVersion: true, createdAt: true, actorEmail: true },
    }),
    // A text counts once the carrier says delivered; an email once the mail provider accepted it.
    prisma.ownerNotification.findFirst({
      where: { businessId: shop.id, status: "sent", OR: [{ channel: "email" }, { deliveryStatus: "delivered" }] },
      orderBy: { createdAt: "desc" },
      select: { channel: true, createdAt: true },
    }),
    prisma.ownerNotification.findFirst({ where: { businessId: shop.id, status: "failed" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  const simulated = shop.environment === "test";
  const alerts = {
    reachable: Boolean((shop.ownerPhone?.trim() && !shop.ownerSmsOptOutAt) || shop.ownerEmail?.trim()),
    lastDelivered: delivered ? { channel: delivered.channel, at: delivered.createdAt } : null,
    lastFailedAt: failed?.createdAt ?? null,
  };
  return capabilityReport({ shop, booking, texting, activation, simulated, alerts });
}
