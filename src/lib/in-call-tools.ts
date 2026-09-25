import type { Business } from "@prisma/client";
import { findOpenSlots } from "@/lib/job";
import { prisma } from "@/lib/prisma";
import { classifyRequest } from "@/lib/trade-playbooks";
import { describeSlot, parseSlotPreference, type ToolCall } from "@/lib/in-call-tool-defs";

/**
 * What the receptionist can do while the caller is still on the line.
 *
 * Availability is never the model's call: it asks, and these handlers answer
 * from the same rules the post-call booker uses (shop hours, technician
 * skills, booked work, times other live callers are holding). A time the
 * receptionist says out loud always came from here.
 */

const OFFERED_SLOTS = 3;
/** Offered times at least this far apart, so "8, 8:30 or 9" never happens. */
const OFFER_GAP_MIN = 180;

const TAKEN = "That time was just taken. Apologize briefly and call check_availability again for fresh times.";

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

type ShopForTools = Pick<Business, "id" | "hoursJson" | "timezone" | "trade" | "servicesJson" | "name">;

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
    return `Do not book this. ${playbook.safety.instruction} Take their name, number and address and tell them the team is being alerted now.`;
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
    if (slots.length) note = "Nothing is open at the time they asked for. Say so, then offer these instead. ";
  }
  if (!slots.length) {
    return "No open times in the next two weeks. Do not offer a time. Take their details and say the office will call to schedule.";
  }
  const list = slots.map((at) => `${describeSlot(at, timezone)} [slot ${at.toISOString()}]`).join("; ");
  return `${note}Open times, shop local time: ${list}. Offer at most two, in plain words, without the slot ids. When they pick one, call hold_appointment with that slot id.`;
}

async function holdAppointment(shop: ShopForTools, callId: string, args: Record<string, unknown>) {
  const timezone = shop.timezone ?? "America/New_York";
  const raw = str(args.slot);
  const at = raw ? new Date(raw) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return "That slot id is not valid. Call check_availability again and use a slot id it returns.";
  }
  const { durationMin, skill, playbook } = jobShape(shop, str(args.serviceType), null);
  if (playbook.safety) {
    return `Do not book this. ${playbook.safety.instruction}`;
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
  if (!(await findOpenSlots(slot, { count: 1, onlyAt: at })).length) return TAKEN;

  /*
    Checking and then writing is a race: callers holding the same time at the
    same moment all see it open. So write the hold, then re-check counting
    only holds claimed earlier. Every racer sees the same order, so the
    earliest claims keep the time and the rest let go before the receptionist
    tells anyone they're booked.
  */
  const claimedAt = new Date();
  await prisma.call.update({
    where: { id: callId },
    data: { heldSlotAt: at, heldSlotDurationMin: durationMin, heldClaimedAt: claimedAt },
  });
  const kept = await findOpenSlots({ ...slot, holdsClaimedBefore: { at: claimedAt, callId } }, { count: 1, onlyAt: at });
  if (!kept.length) {
    await prisma.call.updateMany({
      where: { id: callId, heldClaimedAt: claimedAt },
      data: { heldSlotAt: null, heldSlotDurationMin: null, heldClaimedAt: null },
    });
    return TAKEN;
  }
  return `Held ${describeSlot(at, timezone)}. Tell the caller they're penciled in for that time and will get a text to confirm. Make sure you have their name, callback number and service address before ending the call.`;
}

export async function handleInCallToolCalls(params: {
  shop: ShopForTools;
  callId: string;
  toolCalls: ToolCall[];
}): Promise<Array<{ toolCallId: string; result: string }>> {
  return Promise.all(
    params.toolCalls.map(async (call) => {
      try {
        if (call.name === "check_availability") {
          return { toolCallId: call.id, result: await checkAvailability(params.shop, params.callId, call.args) };
        }
        if (call.name === "hold_appointment") {
          return { toolCallId: call.id, result: await holdAppointment(params.shop, params.callId, call.args) };
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
