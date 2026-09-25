import type { SlotPreference } from "@/lib/availability";

/**
 * The tools the receptionist can call mid-call, as Vapi sees them, and the
 * parsing of what callers say about timing. No database here, so the
 * assistant config can be built and tested anywhere.
 */

export const IN_CALL_TOOL_NAMES = ["check_availability", "hold_appointment"] as const;
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

/** Vapi sends arguments as an object, some providers as a JSON string. */
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
