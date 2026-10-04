import { createHash, timingSafeEqual } from "node:crypto";
import { findAvailableSchedules } from "@/lib/availability";
import {
  availabilityReply,
  BAD_SLOT_REPLY,
  dangerRefusal,
  heldNewTimeReply,
  heldReply,
  NO_ALT_NOTE,
  NO_SLOTS_REPLY,
  URGENT_NO_BOOK_REPLY,
  PASSED_TO_NETWORK_REPLY,
  OFFER_GAP_MIN,
  OFFERED_SLOTS,
  parseSlotPreference,
  safetyAlertReply,
  SLOT_TAKEN_REPLY,
  type ToolCall,
} from "@/lib/in-call-tool-defs";
import { classifyRequest } from "@/lib/trade-playbooks";

/*
  The voice sim's receptionist carries the same booking, alert and transfer
  tools a shop's does, and they need a server to answer. This is it: the
  production reply text over an empty calendar for a fixed demo shop, with no
  database, no shop and no owner behind it, so a sim call can never book,
  text or touch real data.

  The tool secret is derived from the Vapi API key, which the sim and the app
  already both hold, so the endpoint needs no new secret and answers nobody
  without that key.
*/

export const VOICE_SIM_SHOP = {
  name: "Summit HVAC",
  greeting: null,
  trade: "HVAC",
  timezone: "America/Chicago",
  hoursJson: JSON.stringify(
    Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday"].map((d) => [d, { open: "08:00", close: "18:00" }]),
    ),
  ),
  servicesJson: JSON.stringify([
    { name: "Emergency repair", description: "Same-day urgent service" },
    { name: "Maintenance", description: "Scheduled maintenance visit" },
  ]),
};

export function voiceSimToolSecret(vapiApiKey: string) {
  return createHash("sha256").update(`orvius-voice-sim-tools:${vapiApiKey}`).digest("hex");
}

export function voiceSimSecretMatches(presented: string | null, vapiApiKey: string | undefined) {
  if (!presented || !vapiApiKey?.trim()) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(voiceSimToolSecret(vapiApiKey.trim()));
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function shape(serviceType: string | null, urgency: string | null) {
  const playbook = classifyRequest({ business: VOICE_SIM_SHOP, serviceType, urgency });
  return { playbook, durationMin: playbook.service.durationMin };
}

function answer(call: ToolCall, now: Date, transferring: boolean) {
  const tz = VOICE_SIM_SHOP.timezone;
  if (call.name === "check_availability") {
    const { playbook, durationMin } = shape(str(call.args.serviceType), str(call.args.urgency));
    if (playbook.safety) return dangerRefusal(playbook.safety.instruction);
    if (playbook.urgency === "emergency") return URGENT_NO_BOOK_REPLY;
    const base = {
      now,
      urgency: (playbook.urgency ?? str(call.args.urgency) ?? undefined) as Parameters<typeof findAvailableSchedules>[0]["urgency"],
      hoursJson: VOICE_SIM_SHOP.hoursJson,
      timezone: tz,
      existing: [],
      capacity: 1,
      durationMin,
    };
    const preference = parseSlotPreference(str(call.args.preference));
    let slots = findAvailableSchedules(base, { count: OFFERED_SLOTS, minGapMin: OFFER_GAP_MIN, preference });
    let note = "";
    if (!slots.length && preference) {
      slots = findAvailableSchedules(base, { count: OFFERED_SLOTS, minGapMin: OFFER_GAP_MIN });
      if (slots.length) note = NO_ALT_NOTE;
    }
    return slots.length ? availabilityReply(slots, tz, note) : NO_SLOTS_REPLY;
  }
  if (call.name === "hold_appointment" || call.name === "hold_new_time") {
    const raw = str(call.args.slot);
    const at = raw ? new Date(raw) : null;
    if (!at || Number.isNaN(at.getTime())) return BAD_SLOT_REPLY;
    const { playbook, durationMin } = shape(str(call.args.serviceType), null);
    if (playbook.safety) return dangerRefusal(playbook.safety.instruction);
    if (playbook.urgency === "emergency" && call.name === "hold_appointment") return URGENT_NO_BOOK_REPLY;
    const open = findAvailableSchedules(
      { now, hoursJson: VOICE_SIM_SHOP.hoursJson, timezone: tz, existing: [], capacity: 1, durationMin },
      { count: 1, onlyAt: at },
    );
    if (!open.length) return SLOT_TAKEN_REPLY;
    return call.name === "hold_new_time" ? heldNewTimeReply(at, tz) : heldReply(at, tz);
  }
  if (call.name === "alert_team_now") return safetyAlertReply({ texted: true, transferring });
  if (call.name === "pass_to_network") return PASSED_TO_NETWORK_REPLY;
  return "Unknown tool. Continue the call without it.";
}

export function answerVoiceSimToolCalls(toolCalls: ToolCall[], options: { now?: Date; transferring?: boolean } = {}) {
  const now = options.now ?? new Date();
  return toolCalls.map((call) => ({ toolCallId: call.id, result: answer(call, now, Boolean(options.transferring)) }));
}
