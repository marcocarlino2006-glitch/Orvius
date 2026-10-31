import type { SlotPreference } from "@/lib/availability";

/**
 * The tools the receptionist can call mid-call, as Vapi sees them, and the
 * parsing of what callers say about timing. No database here, so the
 * assistant config can be built and tested anywhere.
 */

export const IN_CALL_TOOL_NAMES = ["check_availability", "hold_appointment", "hold_new_time", "alert_team_now", "tell_the_team", "pass_to_network", "check_truck"] as const;
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
          "Reserve the time the caller picked from check_availability. Pass the slot id exactly as check_availability returned it. Ask for their name and the service address first: a time is only held for a visit the shop can be sent to.",
        parameters: {
          type: "object",
          properties: {
            slot: { type: "string", description: "The slot id from check_availability, e.g. 2026-09-29T12:00:00.000Z" },
            serviceType: { type: "string", description: "What needs fixing" },
            callerName: { type: "string", description: "The caller's name as they said it" },
            address: { type: "string", description: "The service address as the caller said it: street number and street, plus city or ZIP" },
            callbackNumber: {
              type: "string",
              description: "A callback number the caller said out loud. Omit it to use the number they are calling from.",
            },
          },
          required: ["slot", "callerName", "address"],
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
          "Text the shop owner right now, while the caller is still on the line. Use it only on a DANGER call — gas smell, carbon monoxide alarm, smoke, sparking, a burning smell, a shock, water on electrical equipment, or sewage backing up — right after the safety instruction. Pass whatever you already know; do not hold the call to collect more.",
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
        name: "tell_the_team",
        description:
          "Text the shop owner right now because this call is urgent and the caller is still on the line. Use it for no heat or no AC in extreme weather or with a baby, elderly or sick person at home, an active water leak, or no power. Do not use it for gas, carbon monoxide, smoke, sparking, a burning smell, a shock, water on electrical equipment, or sewage (use alert_team_now), and do not use it for an estimate or a flexible visit. Pass whatever you already know. Do not wait to collect more before calling it.",
        parameters: {
          type: "object",
          properties: {
            what: { type: "string", description: "What the caller needs, e.g. 'no heat and a baby at home'" },
            address: { type: "string", description: "Service address, if the caller has given it" },
            callerName: { type: "string", description: "Caller's name, if given" },
            callbackNumber: { type: "string", description: "Callback number the caller gave, if different from the one they are calling from" },
          },
          required: ["what"],
        },
      },
      server,
    },
    {
      type: "function",
      function: {
        name: "pass_to_network",
        description:
          "Only after check_availability said a nearby Orvius Network shop can help, you told the caller their name, number and problem would be shared with another local company, and they said yes. Records their yes; a nearby pro then reaches out. Never call it without a clear yes.",
        parameters: {
          type: "object",
          properties: {
            callerSaid: { type: "string", description: "The caller's own words agreeing to be passed along, as they said them." },
          },
          required: ["callerSaid"],
        },
      },
      messages: [{ type: "request-start", content: "One moment." }],
      server,
    },
    {
      type: "function",
      function: {
        name: "check_truck",
        description:
          "Look up how many of a part are counted on this shop's truck. Call it before saying a part is on the truck. If it says the shop hasn't counted that part, say the technician will confirm. Never name a count this tool did not return.",
        parameters: {
          type: "object",
          properties: {
            part: { type: "string", description: "The part the caller asked about, in their words" },
          },
          required: ["part"],
        },
      },
      messages: [{ type: "request-start", content: "Let me check the truck." }],
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

/** The same time as a Spanish speaker says it: "el jueves 30 de octubre a las 3 de la tarde". */
export function describeSlotSpanish(at: Date, timezone: string) {
  const part = (locale: string, options: Intl.DateTimeFormatOptions, type: Intl.DateTimeFormatPartTypes) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).formatToParts(at).find((p) => p.type === type)?.value ?? "";
  const weekday = part("es-US", { weekday: "long" }, "weekday");
  const day = Number(part("en-US", { day: "numeric" }, "day"));
  const month = part("es-US", { month: "long" }, "month");
  const hour24 = Number(part("en-US", { hour: "numeric", hourCycle: "h23" }, "hour"));
  const minute = Number(part("en-US", { minute: "numeric" }, "minute"));
  const hour = hour24 % 12 || 12;
  const minutes = minute === 0 ? "" : minute === 30 ? " y media" : minute === 15 ? " y cuarto" : `:${String(minute).padStart(2, "0")}`;
  const period = hour24 === 12 ? "del mediodía" : hour24 < 12 ? "de la mañana" : hour24 < 20 ? "de la tarde" : "de la noche";
  return `el ${weekday} ${day} de ${month} a ${hour === 1 ? "la" : "las"} ${hour}${minutes} ${period}`;
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
  "No open times here in the next two weeks. Do not offer a time. Ask once: \"We're booked up. I can share your name, number and what you need with another local company we work with, so they can call you sooner. Is that okay?\" If they say yes, call pass_to_network with their words. If not, take their details and say the office will call to schedule.";
export const NETWORK_NOT_A_YES_REPLY =
  "That was not a clear yes, so nothing was shared. Take their details and say the office will call to schedule.";
/** Bump when the question in NETWORK_OFFER_REPLY changes what is shared or with whom. */
export const NETWORK_DISCLOSURE_VERSION = "network-offer-v1";
export const NETWORK_SHARES = ["name", "callback number", "what they need"] as const;
export const NETWORK_OFFER_TTL_MS = 15 * 60_000;
export const SLOT_OFFER_TTL_MS = 20 * 60_000;
export const NETWORK_NOT_OFFERED_REPLY =
  "Nothing was shared: passing them along was not offered on this call. Take their details and say the office will call to schedule.";
export const UNOFFERED_SLOT_REPLY =
  "That time was not one the schedule offered on this call, so nothing is held. Call check_availability and offer only the times it returns.";

export function callerLines(words: string | null | undefined): string[] {
  return (words ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/*
  The yes has to be the caller's own latest words after the question was
  asked. A yes from earlier in the call ("yes, the AC is out") or a yes only
  the model reports is not consent.
*/
export function networkConsentLine(callerWords: string | null | undefined, callerLinesBefore: number): string | null {
  const after = callerLines(callerWords).slice(Math.max(0, callerLinesBefore));
  const latest = after.at(-1);
  return latest && isClearYes(latest) ? latest.slice(0, 200) : null;
}

/*
  Passing a caller to another business is only theirs to direct, so the yes is
  checked in their own words rather than taken from the model's say-so.
*/
export function isClearYes(words: string | null | undefined): boolean {
  const t = words?.toLowerCase().trim() ?? "";
  if (!t) return false;
  if (/\b(no|nope|nah|don'?t|do not|not really|rather not|i'?ll wait|never mind)\b/.test(t)) return false;
  return /\b(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|that'?s fine|fine|do it|sounds good|absolutely|s[ií]|claro|por favor)\b/.test(t);
}
export const PASSED_TO_NETWORK_REPLY =
  "Done. Tell them a nearby pro will reach out shortly. Do not name a shop or promise a time. Make sure you have their name, callback number and service address before ending the call.";
export const NETWORK_UNAVAILABLE_REPLY =
  "Passing along is not available. Take their details and say the office will call to schedule.";
export const URGENT_NO_BOOK_REPLY =
  "This is an emergency: do not offer or book a time. Call tell_the_team if you have not already. Say \"I'm telling the team now. They'll call you right back.\" Then take their name, callback number and address if you don't have them. Do not tell them to leave the home or call 911.";

/** What to say after paging the owner for an urgent call that is not a danger. */
export function urgentTeamReply(params: { queued: boolean }) {
  const status = params.queued
    ? "The owner is being told now. Never say they were texted, have seen it, or are on the way."
    : "The team could not be told just now. Do not say they were alerted.";
  return `${status} This is not a danger call. Do not tell them to leave the home or call 911. Say "I'm telling the team now. They'll call you right back." Then take any name, callback number or address you do not already have. Do not book a time.`;
}
export function outsideScopeReply(label: string) {
  return `Do not book this. ${label} isn't work this shop books through you. Take their name, callback number and address, say "I'll have the owner call you back about that," and do not offer a time.`;
}
/** The owner chose "alert me first": nothing goes on the schedule from a call. */
export const OWNER_SETS_TIMES_REPLY =
  "This business sets every time itself. Do not offer or hold a time. Take their name, callback number and what they need, then say \"The team will call you to set a time.\"";
export const CALENDAR_UNREADABLE_REPLY =
  "The schedule can't be checked right now. Do not offer or hold a time, and do not say the business is booked up. Take their name, callback number, what they need and when suits them, then say \"The team will call you to set a time.\"";
export const BAD_SLOT_REPLY = "That slot id is not valid. Call check_availability again and use a slot id it returns.";
export const NO_ALT_NOTE = "Nothing is open at the time they asked for. Say so, then offer these instead. ";

export function outsideAreaReply(zip: string) {
  return `Not held. ${zip} is not a ZIP code this shop goes to. Read the ZIP back to the caller. If they correct it, call hold_appointment again. If it is right, say the shop doesn't cover that area, take their name and callback, and put in notes "Out of service area — not a job".`;
}

export function dangerRefusal(instruction: string) {
  return `Do not book this. ${instruction} Call alert_team_now if you have not already, then follow the danger rule.`;
}

const IN_SPANISH = "The caller is speaking Spanish: say the times in Spanish exactly as written after \"en español\".";

export function availabilityReply(slots: Date[], timezone: string, note = "", spanish = false) {
  const list = slots
    .map((at) => `${describeSlot(at, timezone)}${spanish ? ` (en español: ${describeSlotSpanish(at, timezone)})` : ""} [slot ${at.toISOString()}]`)
    .join("; ");
  return `${note}Open times, shop local time: ${list}. Offer at most two, in plain words, without the slot ids. When they pick one, call hold_appointment with that slot id.${spanish ? ` ${IN_SPANISH}` : ""}`;
}

export function heldReply(at: Date, timezone: string, spanish = false) {
  const when = describeSlot(at, timezone);
  const say = spanish ? `Ya está reservado para ${describeSlotSpanish(at, timezone)}.` : `You're booked for ${when}.`;
  return `Held ${when}. If the caller is a person, tell them "${say}" If the caller is an AI assistant booking for someone else, do not say the time is confirmed; the shop confirms with the customer. Do not promise a text.`;
}

type BookingDetail = "name" | "service address" | "callback number";

/*
  The visit is only written after the call, and that booker holds a call
  without a name, a reachable number or a street address for the owner. So
  the hold refuses first: "You're booked" is never said for a visit that
  cannot be created.
*/
export function missingBookingDetails(
  args: Record<string, unknown>,
  callback: { reachable: boolean },
): BookingDetail[] {
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const missing: BookingDetail[] = [];
  if (text(args.callerName).length < 2) missing.push("name");
  const address = text(args.address);
  if (address.length < 6 || !/\d/.test(address) || !/[a-z]{2}/i.test(address)) missing.push("service address");
  if (!callback.reachable) missing.push("callback number");
  return missing;
}

export function missingDetailsReply(missing: BookingDetail[]) {
  const named = missing.map((detail) =>
    detail === "service address" ? "service address (street number and street, plus city or ZIP)" : detail,
  );
  const list = named.length > 1 ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}` : named[0];
  return `Not held yet. Before a time is held you need their ${list}. Ask for it now without saying they are booked, then call hold_appointment again with the same slot.`;
}

export function heldNewTimeReply(at: Date, timezone: string, spanish = false) {
  const when = describeSlot(at, timezone);
  const say = spanish ? `"Su visita queda cambiada para ${describeSlotSpanish(at, timezone)}."` : `the visit is moved to ${when}`;
  return `Held ${when} as the new time for their existing visit. Tell the caller ${say}. Do not book a second visit. Never say it is cancelled.`;
}

/*
  A queued alert has not been sent, and a sent text has not been read, so the
  caller never hears that the owner was texted or knows. The safety
  instruction is the caller's protection and stands whatever happens to the
  alert.
*/
export const SAFETY_STANDS =
  "Keep giving the safety instruction you were given; it does not depend on this alert. If anyone is in danger, tell them to get to safety and call 911 now.";

export function safetyAlertReply(params: { queued: boolean; transferring: boolean }) {
  const status = params.queued
    ? "An alert to the owner is queued; it may not have arrived. Never say the owner was texted, has seen it, or is on the way."
    : "The alert could not be queued. Do not say the team was alerted.";
  if (params.transferring) {
    return `${status} ${SAFETY_STANDS} Then say "I'm connecting you to the team now" and use the transfer tool in the same reply. If the transfer does not go through, say the team will call back as soon as they can and take their name, number and address.`;
  }
  return params.queued
    ? `${status} ${SAFETY_STANDS} Then tell them "I'm alerting the team so they can call you back." Take their name, callback number and address if you don't have them yet.`
    : `${status} ${SAFETY_STANDS} Then take their name, callback number and address so the team can call them back.`;
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
