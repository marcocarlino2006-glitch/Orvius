import type { Business } from "@prisma/client";
import { afterResponse } from "@/lib/after-response";
import { displayPhone } from "@/lib/customer";
import { drainOwnerAlerts } from "@/lib/drain-owner-alerts";
import { findOpenSlots } from "@/lib/job";
import { logError, logInfo } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { findNetworkPartners, zip3From } from "@/lib/orvius-network";
import { prisma } from "@/lib/prisma";
import { classifyRequest } from "@/lib/trade-playbooks";
import {
  availabilityReply,
  BAD_SLOT_REPLY,
  dangerRefusal,
  heldNewTimeReply,
  heldReply,
  NETWORK_OFFER_REPLY,
  NETWORK_UNAVAILABLE_REPLY,
  NO_ALT_NOTE,
  NO_SLOTS_REPLY,
  OFFER_GAP_MIN,
  OFFERED_SLOTS,
  parseSlotPreference,
  PASSED_TO_NETWORK_REPLY,
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

type ShopForTools = Pick<Business, "id" | "hoursJson" | "timezone" | "trade" | "servicesJson" | "name"> &
  Partial<Pick<Business, "ownerPhone" | "ownerEmail" | "transferPhone" | "networkOn" | "networkZip3" | "address">>;

type CallForTools = { id: string; vapiCallId?: string | null; callerPhone?: string | null };

function jobShape(shop: ShopForTools, serviceType: string | null, urgency: string | null) {
  const playbook = classifyRequest({ business: shop, serviceType, urgency });
  return { playbook, durationMin: playbook.service.durationMin, skill: playbook.service.skill };
}

async function checkAvailability(shop: ShopForTools, callId: string, args: Record<string, unknown>) {
  const timezone = shop.timezone ?? "America/New_York";
  const serviceType = str(args.serviceType);
  const urgency = str(args.urgency);
  const { playbook, durationMin, skill } = jobShape(shop, serviceType, urgency);
  if (playbook.safety) {
    return dangerRefusal(playbook.safety.instruction);
  }
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
  if (!slots.length) return (await networkCanHelp(shop)) ? NETWORK_OFFER_REPLY : NO_SLOTS_REPLY;
  return availabilityReply(slots, timezone, note);
}

/* A fully booked shop on the network can still get the caller help today. */
async function networkCanHelp(shop: ShopForTools) {
  if (!shop.networkOn || !shop.trade) return false;
  const zip3 = shop.networkZip3 ?? zip3From(shop.address);
  if (!zip3) return false;
  const partners = await findNetworkPartners({ trade: shop.trade, zip3, excludeBusinessId: shop.id });
  return partners.length > 0;
}

async function passToNetwork(shop: ShopForTools, callId: string) {
  if (!(await networkCanHelp(shop))) return NETWORK_UNAVAILABLE_REPLY;
  await prisma.call.update({ where: { id: callId }, data: { networkConsentAt: new Date() } });
  logInfo("in_call.network_consent", { businessId: shop.id, callId });
  return PASSED_TO_NETWORK_REPLY;
}

async function holdAppointment(
  shop: ShopForTools,
  callId: string,
  args: Record<string, unknown>,
  intent: "new" | "reschedule" = "new",
) {
  const timezone = shop.timezone ?? "America/New_York";
  const raw = str(args.slot);
  const at = raw ? new Date(raw) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return BAD_SLOT_REPLY;
  }
  const { durationMin, skill, playbook } = jobShape(shop, str(args.serviceType), null);
  if (playbook.safety) {
    return dangerRefusal(playbook.safety.instruction);
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
  return intent === "reschedule" ? heldNewTimeReply(at, timezone) : heldReply(at, timezone);
}

/*
  A danger call used to reach the owner only after the caller hung up, which
  on a gas or carbon monoxide call is minutes the owner didn't have. This
  texts them mid-call. The post-call alert still goes out with the full
  record; this one is keyed to the call so a repeated tool call texts once.
*/
async function alertTeamNow(shop: ShopForTools, call: CallForTools, args: Record<string, unknown>) {
  const hazard = str(args.hazard) ?? "a safety hazard";
  const address = str(args.address);
  const name = str(args.callerName);
  const rawNumber = str(args.callbackNumber) ?? call.callerPhone ?? null;
  const number = rawNumber ? displayPhone(rawNumber) : null;
  const transferring = Boolean(shop.transferPhone?.trim());
  const canReach = Boolean(shop.ownerPhone || shop.ownerEmail);

  if (canReach) {
    await enqueueOwnerAlert({
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
    await afterResponse(() =>
      drainOwnerAlerts({ at: "in-call.alert_team_now", businessId: shop.id }).catch((error) =>
        logError("in_call.safety_alert_drain_failed", {
          businessId: shop.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      ),
    );
    logInfo("in_call.safety_alert", { businessId: shop.id, callId: call.id, transferring });
  }

  return safetyAlertReply({ texted: canReach, transferring });
}

export async function handleInCallToolCalls(params: {
  shop: ShopForTools;
  callId: string;
  call?: CallForTools;
  toolCalls: ToolCall[];
}): Promise<Array<{ toolCallId: string; result: string }>> {
  return Promise.all(
    params.toolCalls.map(async (call) => {
      if (call.name === "alert_team_now") {
        try {
          return {
            toolCallId: call.id,
            result: await alertTeamNow(params.shop, params.call ?? { id: params.callId }, call.args),
          };
        } catch (error) {
          logError("in_call.safety_alert_failed", {
            businessId: params.shop.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return {
            toolCallId: call.id,
            result: "The alert did not go through. Tell them the team will call right back, and take their name, number and address.",
          };
        }
      }
      try {
        if (call.name === "check_availability") {
          return { toolCallId: call.id, result: await checkAvailability(params.shop, params.callId, call.args) };
        }
        if (call.name === "hold_appointment") {
          return { toolCallId: call.id, result: await holdAppointment(params.shop, params.callId, call.args) };
        }
        if (call.name === "pass_to_network") {
          return { toolCallId: call.id, result: await passToNetwork(params.shop, params.callId) };
        }
        if (call.name === "hold_new_time") {
          return { toolCallId: call.id, result: await holdAppointment(params.shop, params.callId, call.args, "reschedule") };
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
