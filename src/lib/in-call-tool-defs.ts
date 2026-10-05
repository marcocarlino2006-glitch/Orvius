import type { SlotPreference } from "@/lib/availability";

/**
 * The tools the receptionist can call mid-call, as Vapi sees them, and the
 * parsing of what callers say about timing. No database here, so the
 * assistant config can be built and tested anywhere.
 */

export const IN_CALL_TOOL_NAMES = ["check_availability", "hold_appointment", "hold_new_time", "alert_team_now", "pass_to_network"] as const;
export type InCallToolName = (typeof IN_CALL_TOOL_NAMES)[number];

const URGENCY = ["emergency", "same-day", "this-week", "flexible"] as const;
export function buildInCallTools(params: { webhookUrl: string; webhookSecret?: string }) {
  const server = {
    url: params.webhookUrl,
    ...(params.webhookSecret ? { secret: params.webhookSecret } : {}),
    timeoutSeconds: 10,
  };
  return [
    {
      type: "function",
      function: {
        name: "check_availability",
        description:
          "Look up real open appointment times for this shop. Call it once you know what the problem is. Never offer a time that did not come from this tool.",
        parameters: {
          type: "object",
          properties: {
            serviceType: { type: "string", description: "What needs fixing, in the caller's words" },
            urgency: { type: "string", enum: [...URGENCY], description: "How soon the caller needs someone" },
            preference: {
              type: "string",
              description: "When the caller wants it, in their words, e.g. 'tomorrow morning' or 'Thursday afternoon'. Omit if they have no preference.",
            },
          },
          required: ["serviceType"],
        },
      },
      messages: [{ type: "request-start", content: "Let me check the schedule." }],
      server,
    },
    {
      type: "function",
      function: {
        name: "hold_appointment",
        description:
          "Reserve the time the caller picked from check_availability. Pass the slot id exactly as check_availability returned it.",
        parameters: {
          type: "object",
          properties: {
            slot: { type: "string", description: "The slot id from check_availability, e.g. 2026-09-29T12:00:00.000Z" },
            serviceType: { type: "string", description: "What needs fixing" },
          },
          required: ["slot"],
        },
      },
      messages: [{ type: "request-start", content: "One moment." }],
      server,
    },
    {
      type: "function",
      function: {
        name: "hold_new_time",
        description:
          "The caller already has a visit and wants to move it. Reserve the new time they picked from check_availability instead of hold_appointment. This never books a second visit; the shop moves the existing one and confirms.",
        parameters: {
          type: "object",
          properties: {
            slot: { type: "string", description: "The slot id from check_availability" },
            serviceType: { type: "string", description: "What the existing visit is for" },
          },
          required: ["slot"],
        },
      },
      messages: [{ type: "request-start", content: "One moment." }],
      server,
    },
    {
      type: "function",
      function: {
        name: "alert_team_now",
        description:
          "Text the shop owner right now, while the caller is still on the line. Use it only on a danger call — gas smell, carbon monoxide alarm, smoke or sparking — right after giving the safety instruction. Pass whatever you already know; do not hold the call to collect more.",
        parameters: {
          type: "object",
          properties: {
            hazard: { type: "string", description: "What the caller reported, e.g. 'gas smell in the basement'" },
            address: { type: "string", description: "Service address, if the caller has given it" },
            callerName: { type: "string", description: "Caller's name, if given" },
            callbackNumber: { type: "string", description: "Callback number the caller gave, if different from the one they are calling from" },
          },
          required: ["hazard"],
        },
      },
      server,
    },
    {
      type: "function",
      function: {
        name: "pass_to_network",
        description:
          "Only after check_availability said a nearby Orvius Network shop can help and the caller said yes to being passed along. Records their yes; a nearby pro then reaches out. Never call it without a clear yes.",
        parameters: { type: "object", properties: {} },
      },
      messages: [{ type: "request-start", content: "One moment." }],
      server,
    },
  ];
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** The caller's "tomorrow morning" or "el jueves" as a filter on open slots. */
export function parseSlotPreference(text: string | null | undefined): SlotPreference | undefined {
  const t = text?.toLowerCase().trim();
  if (!t) return undefined;
  const pref: SlotPreference = {};
  const spanish: Record<string, string> = {
    lunes: "monday",
    martes: "tuesday",
    "miércoles": "wednesday",
    miercoles: "wednesday",
    jueves: "thursday",
    viernes: "friday",
    "sábado": "saturday",
    sabado: "saturday",
    domingo: "sunday",
  };
  const days = new Set<string>();
  for (const day of WEEKDAYS) if (new RegExp(`\\b${day}`).test(t)) days.add(day);
  for (const [es, en] of Object.entries(spanish)) if (t.includes(es)) days.add(en);
  if (days.size) pref.weekdays = [...days];

  if (/\b(today|hoy|this (morning|afternoon|evening))\b/.test(t)) pref.dayOffsets = [0];
  else if (/\b(tomorrow|mañana por|pasado)\b/.test(t) || /^mañana\b/.test(t)) pref.dayOffsets = [1];

  if (/\b(morning|a\.?m\.?|early|por la mañana|temprano)\b/.test(t)) pref.part = "morning";
  else if (/\b(afternoon|p\.?m\.?|after lunch|por la tarde|tarde)\b/.test(t)) pref.part = "afternoon";
  else if (/\b(evening|after work|night|noche)\b/.test(t)) pref.part = "evening";

  return Object.keys(pref).length ? pref : undefined;
}

export function describeSlot(at: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

export type ToolCall = { id: string; name: string; args: Record<string, unknown> };

/*
  What the receptionist is told back. Production and the voice sim's sandbox
  both answer with these, so the sim grades the words a real call hears.
*/
export const OFFERED_SLOTS = 3;
/** Offered times at least this far apart, so "8, 8:30 or 9" never happens. */
export const OFFER_GAP_MIN = 180;
export const SLOT_TAKEN_REPLY = "That time was just taken. Apologize briefly and call check_availability again for fresh times.";
export const NO_SLOTS_REPLY =
  "No open times in the next two weeks. Do not offer a time. Take their details and say the office will call to schedule.";
export const NETWORK_OFFER_REPLY =
  "No open times here in the next two weeks. Do not offer a time. Ask once: \"We're booked up. Would you like me to pass your request to another trusted local pro who may be able to come sooner?\" If they say yes, call pass_to_network. If not, take their details and say the office will call to schedule.";
export const PASSED_TO_NETWORK_REPLY =
  "Done. Tell them a nearby pro will reach out shortly. Do not name a shop or promise a time. Make sure you have their name, callback number and service address before ending the call.";
export const NETWORK_UNAVAILABLE_REPLY =
  "Passing along is not available. Take their details and say the office will call to schedule.";
export const URGENT_NO_BOOK_REPLY =
  "This is an emergency: do not offer or book a time. Say \"I'm marking this urgent so the team calls you right back.\" Then take their name, callback number and address if you don't have them.";
export const BAD_SLOT_REPLY = "That slot id is not valid. Call check_availability again and use a slot id it returns.";
export const NO_ALT_NOTE = "Nothing is open at the time they asked for. Say so, then offer these instead. ";

export function dangerRefusal(instruction: string) {
  return `Do not book this. ${instruction} Call alert_team_now if you have not already, then follow the danger rule.`;
}

export function availabilityReply(slots: Date[], timezone: string, note = "") {
  const list = slots.map((at) => `${describeSlot(at, timezone)} [slot ${at.toISOString()}]`).join("; ");
  return `${note}Open times, shop local time: ${list}. Offer at most two, in plain words, without the slot ids. When they pick one, call hold_appointment with that slot id.`;
}

export function heldReply(at: Date, timezone: string) {
  return `Held ${describeSlot(at, timezone)}. Tell the caller they're penciled in for that time and the shop will confirm with them shortly. Do not promise a text. Make sure you have their name, callback number and service address before ending the call.`;
}

export function heldNewTimeReply(at: Date, timezone: string) {
  return `Held ${describeSlot(at, timezone)} as the new time for their existing visit. Tell the caller "I've held ${describeSlot(at, timezone)} for you, and the shop will confirm the change with you." Never say the visit is moved or confirmed.`;
}

export function safetyAlertReply(params: { texted: boolean; transferring: boolean }) {
  const told = params.texted ? "The owner has been texted. " : "";
  return params.transferring
    ? `${told}Now say "I'm connecting you to the team now" and use the transfer tool in the same reply. If the transfer does not go through, tell them the team will call right back and take their name, number and address.`
    : `${told}Tell them "The team has been alerted and will call you right back." Then take their name, callback number and address if you don't have them yet.`;
}

/** Vapi sends arguments as an object, some providers as a JSON string. */
/** What the caller has said so far on this call, from the conversation Vapi sends with each tool request. */
export function callerWordsSoFar(message: unknown) {
  const msgs = (message as { artifact?: { messages?: Array<{ role?: string; message?: string }> } } | null)?.artifact?.messages;
  const said = (Array.isArray(msgs) ? msgs : [])
    .filter((m) => m.role === "user" && typeof m.message === "string")
    .map((m) => m.message)
    .join(" \n ");
  return said || null;
}

export function readToolCalls(message: {
  toolCallList?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>;
}): ToolCall[] {
  return (message.toolCallList ?? []).flatMap((call) => {
    const name = call.function?.name;
    if (!call.id || !name) return [];
    let args: unknown = call.function?.arguments ?? {};
    if (typeof args === "string") {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    return [{ id: call.id, name, args: args && typeof args === "object" ? (args as Record<string, unknown>) : {} }];
  });
}
