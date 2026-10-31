import type { Business } from "@prisma/client";
import { afterResponse } from "@/lib/after-response";
import { isBusyCalendarUnreadable } from "@/lib/busy-calendar";
import { isFsmScheduleUnreadable } from "@/lib/fsm-schedule";
import { displayPhone } from "@/lib/customer";
import { trustedCallbackNumber } from "@/lib/callback-number";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { findOpenSlots } from "@/lib/job";
import { getEffectivePlanId } from "@/lib/plan-features";
import { getSchedulingPolicy, holdsForApproval } from "@/lib/scheduling-policy";
import { recordAudit } from "@/lib/audit";
import { logError, logInfo } from "@/lib/logger";
import { enqueueOwnerAlert, processNotificationQueue } from "@/lib/notification-queue";
import { findNetworkPartners, zip3From } from "@/lib/orvius-network";
import { checkTruck } from "@/lib/truck-stock";
import { prisma } from "@/lib/prisma";
import { extractPostalCode, parseServiceZips } from "@/lib/service-area";
import { callerSpeakingSpanish } from "@/lib/caller-language";
import { classifyRequest } from "@/lib/trade-playbooks";
import { outsideScope } from "@/lib/trade-scope";
import {
  availabilityReply,
  BAD_SLOT_REPLY,
  dangerRefusal,
  heldNewTimeReply,
  heldReply,
  missingBookingDetails,
  missingDetailsReply,
  NETWORK_OFFER_REPLY,
  NETWORK_UNAVAILABLE_REPLY,
  NO_ALT_NOTE,
  NO_SLOTS_REPLY,
  CALENDAR_UNREADABLE_REPLY,
  OWNER_SETS_TIMES_REPLY,
  outsideAreaReply,
  outsideScopeReply,
  URGENT_NO_BOOK_REPLY,
  urgentTeamReply,
  OFFER_GAP_MIN,
  OFFERED_SLOTS,
  parseSlotPreference,
  PASSED_TO_NETWORK_REPLY,
  NETWORK_NOT_A_YES_REPLY,
  NETWORK_NOT_OFFERED_REPLY,
  NETWORK_DISCLOSURE_VERSION,
  NETWORK_OFFER_TTL_MS,
  NETWORK_SHARES,
  SLOT_OFFER_TTL_MS,
  UNOFFERED_SLOT_REPLY,
  callerLines,
  networkConsentLine,
  isClearYes,
  safetyAlertReply,
  SLOT_TAKEN_REPLY,
  type ToolCall,
} from "@/lib/in-call-tool-defs";

/**
 * What the receptionist can do while the caller is still on the line.
 *
 * Availability is never the model's call: it asks, and these handlers answer
 * from the same rules the post-call booker uses (shop hours, technician
 * skills, booked work, times other live callers are holding). A time the
 * receptionist says out loud always came from here.
 */


const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

type ShopForTools = Pick<Business, "id" | "hoursJson" | "timezone" | "trade" | "servicesJson" | "name"> & { jobLengthsJson?: string | null } &
  Partial<Pick<Business, "ownerPhone" | "ownerEmail" | "transferPhone" | "networkOn" | "networkZip3" | "address" | "bookingMode" | "serviceZipsJson">> &
  Partial<Pick<Business, "billingStatus" | "billingPlan" | "pilotEndsAt" | "createdAt" | "pastDueSince" | "pauseStartsAt" | "pausedUntil" | "environment">>;

/* The post-call booker holds every lead of a lapsed plan for the owner, so no time is offered that it would refuse. */
const ownerSetsTimes = async (shop: ShopForTools) =>
  shop.bookingMode === "alert" || getEffectivePlanId(shop) === "expired" || holdsForApproval(await getSchedulingPolicy(shop.id));

type CallForTools = { id: string; vapiCallId?: string | null; callerPhone?: string | null };

/* The model's summary can drop the detail that makes a call dangerous or urgent, so those come from the caller's own words too. */
function jobShape(shop: ShopForTools, serviceType: string | null, urgency: string | null, callerWords?: string | null) {
  const playbook = classifyRequest({ business: shop, serviceType, urgency });
  const heard = callerWords ? classifyRequest({ business: shop, serviceType, urgency, callerWords }) : playbook;
  return {
    playbook: { ...playbook, safety: playbook.safety ?? heard.safety, urgency: heard.urgency },
    durationMin: playbook.service.durationMin,
    skill: playbook.service.skill,
  };
}

async function checkAvailability(shop: ShopForTools, callId: string, args: Record<string, unknown>, callerWords?: string | null) {
  const timezone = shop.timezone ?? "America/New_York";
  const serviceType = str(args.serviceType);
  const urgency = str(args.urgency);
  const { playbook, durationMin, skill } = jobShape(shop, serviceType, urgency, callerWords);
  if (playbook.safety) {
    return dangerRefusal(playbook.safety.instruction);
  }
  const outside = outsideScope(shop.trade, serviceType);
  if (outside) return outsideScopeReply(outside.label);
  if (playbook.urgency === "emergency") return URGENT_NO_BOOK_REPLY;
  if (await ownerSetsTimes(shop)) return OWNER_SETS_TIMES_REPLY;
  const base = {
    businessId: shop.id,
    urgency: playbook.urgency ?? urgency,
    durationMin,
    skill,
    hoursJson: shop.hoursJson,
    timezone,
    excludeCallId: callId,
  };
  const preference = parseSlotPreference(str(args.preference));
  let slots = await findOpenSlots(base, { count: OFFERED_SLOTS, minGapMin: OFFER_GAP_MIN, preference });
  let note = "";
  if (!slots.length && preference) {
    slots = await findOpenSlots(base, { count: OFFERED_SLOTS, minGapMin: OFFER_GAP_MIN });
    if (slots.length) note = NO_ALT_NOTE;
  }
  if (!slots.length) {
    await recordOffers(callId, { slots: [] });
    if ((await isBusyCalendarUnreadable(shop.id)) || (await isFsmScheduleUnreadable(shop.id))) return CALENDAR_UNREADABLE_REPLY;
    if (!(await networkCanHelp(shop))) return NO_SLOTS_REPLY;
    await recordOffers(callId, { slots: [], network: { callerLinesBefore: callerLines(callerWords).length } });
    return NETWORK_OFFER_REPLY;
  }
  await recordOffers(callId, { slots });
  return availabilityReply(slots, timezone, note, callerSpeakingSpanish(callerWords));
}

/* Each availability answer replaces what the call was offered before it. */
async function recordOffers(callId: string, offer: { slots: Date[]; network?: { callerLinesBefore: number } }) {
  const now = Date.now();
  await prisma.call.updateMany({
    where: { id: callId },
    data: {
      slotOfferJson: offer.slots.length
        ? JSON.stringify({
            issuedAt: new Date(now).toISOString(),
            expiresAt: new Date(now + SLOT_OFFER_TTL_MS).toISOString(),
            slots: offer.slots.map((at) => at.toISOString()),
          })
        : null,
      networkOfferJson: offer.network
        ? JSON.stringify({
            offeredAt: new Date(now).toISOString(),
            expiresAt: new Date(now + NETWORK_OFFER_TTL_MS).toISOString(),
            disclosureVersion: NETWORK_DISCLOSURE_VERSION,
            shares: NETWORK_SHARES,
            callerLinesBefore: offer.network.callerLinesBefore,
          })
        : null,
    },
  });
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function wasOffered(raw: string | null | undefined, at: Date, now = Date.now()) {
  const offer = parseJson<{ expiresAt?: string; slots?: string[] }>(raw);
  if (!offer?.expiresAt || !Array.isArray(offer.slots) || new Date(offer.expiresAt).getTime() <= now) return false;
  return offer.slots.some((slot) => new Date(slot).getTime() === at.getTime());
}

/* A fully booked shop on the network can still get the caller help today. */
async function networkCanHelp(shop: ShopForTools) {
  if (!shop.networkOn || !shop.trade) return false;
  const stored = shop.networkZip3 && /^\d{3}$/.test(shop.networkZip3) ? shop.networkZip3 : null;
  const zip3 = stored ?? zip3From(shop.address);
  if (!zip3) return false;
  const partners = await findNetworkPartners({ trade: shop.trade, zip3, excludeBusinessId: shop.id });
  return partners.length > 0;
}

async function passToNetwork(shop: ShopForTools, callId: string, args: Record<string, unknown>, callerWords?: string | null) {
  const modelSaid = str(args.callerSaid)?.slice(0, 200) ?? null;
  const row = await prisma.call.findUnique({ where: { id: callId }, select: { networkOfferJson: true } });
  const offer = parseJson<{ offeredAt?: string; expiresAt?: string; disclosureVersion?: string; callerLinesBefore?: number }>(row?.networkOfferJson);
  if (
    !offer?.offeredAt ||
    !offer.expiresAt ||
    offer.disclosureVersion !== NETWORK_DISCLOSURE_VERSION ||
    new Date(offer.expiresAt).getTime() <= Date.now()
  ) {
    logInfo("in_call.network_consent_not_offered", { businessId: shop.id, callId });
    return NETWORK_NOT_OFFERED_REPLY;
  }
  const callerLine = networkConsentLine(callerWords, offer.callerLinesBefore ?? 0);
  if (!callerLine) {
    logInfo("in_call.network_consent_refused", { businessId: shop.id, callId, modelReportedYes: isClearYes(modelSaid) });
    return NETWORK_NOT_A_YES_REPLY;
  }
  if (!(await networkCanHelp(shop))) return NETWORK_UNAVAILABLE_REPLY;
  const consentedAt = new Date();
  const evidence = {
    callerLine,
    disclosureVersion: offer.disclosureVersion,
    shares: NETWORK_SHARES,
    offeredAt: offer.offeredAt,
    consentedAt: consentedAt.toISOString(),
  };
  await prisma.call.update({ where: { id: callId }, data: { networkConsentAt: consentedAt, networkConsentJson: JSON.stringify(evidence) } });
  await recordAudit({
    businessId: shop.id,
    entityType: "call",
    entityId: callId,
    action: "network.consent",
    actor: "customer",
    summary: `Caller agreed to have their ${NETWORK_SHARES.join(", ")} passed to a nearby shop: "${callerLine}"`,
    detail: evidence,
    idempotencyKey: `network-consent:${callId}`,
  });
  logInfo("in_call.network_consent", { businessId: shop.id, callId });
  return PASSED_TO_NETWORK_REPLY;
}

/*
  Only the caller's own words count, never the model's summary, and only a
  call where every ZIP the caller said is outside the list is refused: a
  caller who corrects a ZIP mid-call keeps their booking.
*/
export function zipOutsideArea(serviceZipsJson: string | null | undefined, callerWords: string | null | undefined): string | null {
  const allowed = parseServiceZips(serviceZipsJson);
  if (!allowed.length || !callerWords) return null;
  const said = callerLines(callerWords)
    .map((line) => extractPostalCode(line))
    .filter((zip): zip is string => Boolean(zip));
  if (!said.length || said.some((zip) => allowed.includes(zip))) return null;
  return said[said.length - 1];
}

async function holdAppointment(
  shop: ShopForTools,
  callId: string,
  args: Record<string, unknown>,
  intent: "new" | "reschedule" = "new",
  callerWords?: string | null,
  callerPhone?: string | null,
) {
  const timezone = shop.timezone ?? "America/New_York";
  const raw = str(args.slot);
  const at = raw ? new Date(raw) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return BAD_SLOT_REPLY;
  }
  const { durationMin, skill, playbook } = jobShape(shop, str(args.serviceType), null, callerWords);
  if (playbook.safety) {
    return dangerRefusal(playbook.safety.instruction);
  }
  const outside = intent === "new" ? outsideScope(shop.trade, str(args.serviceType)) : null;
  if (outside) return outsideScopeReply(outside.label);
  const farZip = intent === "new" ? zipOutsideArea(shop.serviceZipsJson, callerWords) : null;
  if (farZip) {
    logInfo("in_call.hold_outside_area", { businessId: shop.id, callId });
    return outsideAreaReply(farZip);
  }
  if (playbook.urgency === "emergency" && intent === "new") return URGENT_NO_BOOK_REPLY;
  if (await ownerSetsTimes(shop)) return OWNER_SETS_TIMES_REPLY;
  if (intent === "new") {
    const callback = trustedCallbackNumber({
      extracted: str(args.callbackNumber),
      callerId: callerPhone,
      callerLines: callerLines(callerWords),
    });
    const missing = missingBookingDetails(args, { reachable: Boolean(callback.phone) });
    if (missing.length) {
      logInfo("in_call.hold_missing_details", { businessId: shop.id, callId, missing: missing.join(",") });
      return missingDetailsReply(missing);
    }
  }
  const offered = await prisma.call.findUnique({ where: { id: callId }, select: { slotOfferJson: true } });
  if (!wasOffered(offered?.slotOfferJson, at)) {
    logInfo("in_call.hold_unoffered", { businessId: shop.id, callId });
    return UNOFFERED_SLOT_REPLY;
  }
  const slot = {
    businessId: shop.id,
    urgency: null,
    durationMin,
    skill,
    hoursJson: shop.hoursJson,
    timezone,
    excludeCallId: callId,
  };
  if (!(await findOpenSlots(slot, { count: 1, onlyAt: at })).length) return SLOT_TAKEN_REPLY;

  /*
    Checking and then writing is a race: callers holding the same time at the
    same moment all see it open. So write the hold, take a sequence number in
    one statement (the database serializes it, so a lower number is always
    visible to a higher one), then re-check counting only holds numbered
    earlier. The lowest number keeps the time; everyone after it lets go.
  */
  const claimedAt = new Date();
  await prisma.call.update({
    where: { id: callId },
    data: {
      heldSlotAt: at,
      heldSlotDurationMin: durationMin,
      heldClaimedAt: claimedAt,
      heldSeq: null,
      heldIntent: intent === "reschedule" ? "reschedule" : null,
    },
  });
  await prisma.$executeRaw`UPDATE "Call" SET "heldSeq" = (SELECT COALESCE(MAX("heldSeq"), 0) + 1 FROM "Call" WHERE "businessId" = ${shop.id}) WHERE "id" = ${callId}`;
  const { heldSeq } = await prisma.call.findUniqueOrThrow({ where: { id: callId }, select: { heldSeq: true } });
  const kept = await findOpenSlots({ ...slot, holdsSequencedBefore: heldSeq ?? 0 }, { count: 1, onlyAt: at });
  if (!kept.length) {
    await prisma.call.updateMany({
      where: { id: callId, heldClaimedAt: claimedAt },
      data: { heldSlotAt: null, heldSlotDurationMin: null, heldClaimedAt: null, heldSeq: null },
    });
    return SLOT_TAKEN_REPLY;
  }
  const spanish = callerSpeakingSpanish(callerWords);
  return intent === "reschedule" ? heldNewTimeReply(at, timezone, spanish) : heldReply(at, timezone, spanish);
}

/*
  A danger call used to reach the owner only after the caller hung up, which
  on a gas or carbon monoxide call is minutes the owner didn't have. This
  texts them mid-call. The post-call alert still goes out with the full
  record; this one is keyed to the call so a repeated tool call texts once.
*/
async function alertTeamNow(shop: ShopForTools, call: CallForTools, args: Record<string, unknown>, callerWords?: string | null) {
  const hazard = str(args.hazard) ?? "a safety hazard";
  const address = str(args.address);
  const name = str(args.callerName);
  // The tool argument is model output: it only beats caller ID when the caller said every digit of it.
  const callback = trustedCallbackNumber({
    extracted: str(args.callbackNumber),
    callerId: call.callerPhone,
    callerLines: (callerWords ?? "").split("\n").filter((line) => line.trim()),
  });
  const number = callback.phone ? displayPhone(callback.phone) : callback.withheld ? "number not confirmed, check the call" : null;
  const transferring = Boolean(shop.transferPhone?.trim());
  let queued = false;

  if (shop.ownerPhone || shop.ownerEmail) {
    const alert = await enqueueOwnerAlert({
      businessId: shop.id,
      businessName: shop.name,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
      dedupeKey: `safety-live:${call.vapiCallId ?? call.id}`,
      message: [
        `SAFETY CALL, caller on the line now: ${hazard}.`,
        address ? `Address: ${address}.` : null,
        [name, number].filter(Boolean).length ? `Caller: ${[name, number].filter(Boolean).join(", ")}.` : null,
        transferring ? "Orvius is connecting them to your transfer number." : "Call them back now.",
      ]
        .filter(Boolean)
        .join(" "),
    });
    // A repeated tool call finds the first one's rows: still queued unless they failed.
    const channels = alert.duplicate
      ? (
          await prisma.ownerNotification.findMany({
            where: { businessId: shop.id, dedupeKey: `safety-live:${call.vapiCallId ?? call.id}`, status: { not: "failed" } },
            select: { channel: true },
          })
        ).map((row) => row.channel)
      : alert.queued;
    queued = channels.length > 0;
    await afterResponse(() =>
      // This shop's safety text goes first, ahead of any other shop's backlog and the sweeps.
      processNotificationQueue(5, { businessId: shop.id })
        .then(() => drainOwnerAlerts({ at: "in-call.alert_team_now", businessId: shop.id }))
        .catch((error) =>
        logError("in_call.safety_alert_drain_failed", {
          businessId: shop.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
    logInfo("in_call.safety_alert", { businessId: shop.id, callId: call.id, transferring, callbackSource: callback.source, callbackReplaced: callback.replaced });
  }

  return safetyAlertReply({ queued, transferring });
}

/** An urgent job that is not a danger: the owner hears it while the caller is still talking. */
async function tellTheTeam(shop: ShopForTools, call: CallForTools, args: Record<string, unknown>, callerWords?: string | null) {
  const what = str(args.what) ?? "an urgent job";
  const address = str(args.address);
  const name = str(args.callerName);
  const callback = trustedCallbackNumber({
    extracted: str(args.callbackNumber),
    callerId: call.callerPhone,
    callerLines: (callerWords ?? "").split("\n").filter((line) => line.trim()),
  });
  const number = callback.phone ? displayPhone(callback.phone) : callback.withheld ? "number not confirmed, check the call" : null;
  let queued = false;

  if (shop.ownerPhone || shop.ownerEmail) {
    const alert = await enqueueOwnerAlert({
      businessId: shop.id,
      businessName: shop.name,
      ownerPhone: shop.ownerPhone,
      ownerEmail: shop.ownerEmail,
      dedupeKey: `urgent-live:${call.vapiCallId ?? call.id}`,
      message: [
        `Urgent call, caller still on the line: ${what}.`,
        address ? `Address: ${address}.` : null,
        [name, number].filter(Boolean).length ? `Caller: ${[name, number].filter(Boolean).join(", ")}.` : null,
        "Call them back now.",
      ]
        .filter(Boolean)
        .join(" "),
    });
    const channels = alert.duplicate
      ? (
          await prisma.ownerNotification.findMany({
            where: { businessId: shop.id, dedupeKey: `urgent-live:${call.vapiCallId ?? call.id}`, status: { not: "failed" } },
            select: { channel: true },
          })
        ).map((row) => row.channel)
      : alert.queued;
    queued = channels.length > 0;
    await afterResponse(() =>
      processNotificationQueue(5, { businessId: shop.id })
        .then(() => drainOwnerAlerts({ at: "in-call.tell_the_team", businessId: shop.id }))
        .catch((error) =>
          logError("in_call.urgent_alert_drain_failed", {
            businessId: shop.id,
            error: error instanceof Error ? error.message : String(error),
          }),
        ),
    );
    logInfo("in_call.urgent_alert", { businessId: shop.id, callId: call.id, callbackSource: callback.source, callbackReplaced: callback.replaced });
  }

  return urgentTeamReply({ queued });
}

export async function handleInCallToolCalls(params: {
  shop: ShopForTools;
  callId: string;
  call?: CallForTools;
  toolCalls: ToolCall[];
  callerWords?: string | null;
}): Promise<Array<{ toolCallId: string; result: string }>> {
  return Promise.all(
    params.toolCalls.map(async (call) => {
      if (call.name === "tell_the_team") {
        try {
          return {
            toolCallId: call.id,
            result: await tellTheTeam(params.shop, params.call ?? { id: params.callId }, call.args, params.callerWords),
          };
        } catch (error) {
          logError("in_call.urgent_alert_failed", {
            businessId: params.shop.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return { toolCallId: call.id, result: urgentTeamReply({ queued: false }) };
        }
      }
      if (call.name === "alert_team_now") {
        try {
          return {
            toolCallId: call.id,
            result: await alertTeamNow(params.shop, params.call ?? { id: params.callId }, call.args, params.callerWords),
          };
        } catch (error) {
          logError("in_call.safety_alert_failed", {
            businessId: params.shop.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            toolCallId: call.id,
            result: safetyAlertReply({ queued: false, transferring: Boolean(params.shop.transferPhone?.trim()) }),
          };
        }
      }
      try {
        if (call.name === "check_availability") {
          return { toolCallId: call.id, result: await checkAvailability(params.shop, params.callId, call.args, params.callerWords) };
        }
        if (call.name === "hold_appointment") {
          return { toolCallId: call.id, result: await holdAppointment(params.shop, params.callId, call.args, "new", params.callerWords, params.call?.callerPhone) };
        }
        if (call.name === "pass_to_network") {
          return { toolCallId: call.id, result: await passToNetwork(params.shop, params.callId, call.args, params.callerWords) };
        }
        if (call.name === "check_truck") {
          try {
            return { toolCallId: call.id, result: await checkTruck(params.shop.id, String(call.args.part ?? "")) };
          } catch (error) {
            logError("in_call.truck_failed", { businessId: params.shop.id, error: error instanceof Error ? error.message : String(error) });
            return {
              toolCallId: call.id,
              result: "You cannot see the truck right now. Say the technician will confirm whether that part is on the truck. Do not name a number.",
            };
          }
        }
        if (call.name === "hold_new_time") {
          return { toolCallId: call.id, result: await holdAppointment(params.shop, params.callId, call.args, "reschedule", params.callerWords) };
        }
        return { toolCallId: call.id, result: "Unknown tool. Continue the call without it." };
      } catch {
        return {
          toolCallId: call.id,
          result: "The schedule is unavailable right now. Do not offer a time. Take their details and say the office will confirm a time.",
        };
      }
    }),
  );
}
