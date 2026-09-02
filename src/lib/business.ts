export type BusinessHours = Record<
  string,
  { open: string; close: string; closed?: boolean }
>;

export type ServiceOffering = {
  name: string;
  description?: string;
  estimatedDurationMin?: number;
};

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatHoursForPrompt(hoursJson: string): string {
  const hours = parseJson<BusinessHours>(hoursJson, {});
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  return days
    .map((day) => {
      const entry = hours[day];
      if (!entry || entry.closed) {
        return `${day}: closed`;
      }
      return `${day}: ${entry.open} - ${entry.close}`;
    })
    .join("\n");
}

/** True when the timestamp falls outside configured shop hours (or hours empty). */
export function isAfterHours(
  at: Date,
  hoursJson: string,
  timezone = "America/New_York",
): boolean {
  const hours = parseJson<BusinessHours>(hoursJson, {});
  if (!hours || Object.keys(hours).length === 0) {
    // No hours configured — treat nights/weekends as after-hours signal.
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        weekday: "short",
        hour: "numeric",
        hour12: false,
      }).formatToParts(at);
      const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "12");
      if (weekday === "Sat" || weekday === "Sun") return true;
      return hour < 8 || hour >= 17;
    } catch {
      const hour = at.getHours();
      const day = at.getDay();
      if (day === 0 || day === 6) return true;
      return hour < 8 || hour >= 17;
    }
  }

  let weekdayLong: string;
  let hour = 0;
  let minute = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      hour: "numeric",
      minute: "numeric",
      hour12: false,
    }).formatToParts(at);
    weekdayLong = (parts.find((p) => p.type === "weekday")?.value ?? "monday").toLowerCase();
    hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    if (hour === 24) hour = 0;
  } catch {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    weekdayLong = days[at.getDay()] ?? "monday";
    hour = at.getHours();
    minute = at.getMinutes();
  }

  const entry = hours[weekdayLong];
  if (!entry || entry.closed) return true;

  const parseHm = (value: string) => {
    const [h, m] = value.split(":").map((n) => Number(n));
    return (h || 0) * 60 + (m || 0);
  };

  const nowMin = hour * 60 + minute;
  const openMin = parseHm(entry.open);
  const closeMin = parseHm(entry.close);
  if (closeMin <= openMin) {
    // Overnight window
    return !(nowMin >= openMin || nowMin < closeMin);
  }
  return nowMin < openMin || nowMin >= closeMin;
}

export function formatServicesForPrompt(servicesJson: string): string {
  const services = parseJson<ServiceOffering[]>(servicesJson, []);
  if (services.length === 0) {
    return "- General service calls and estimates";
  }

  return services
    .map((service) => {
      const desc = service.description ? ` — ${service.description}` : "";
      return `- ${service.name}${desc}`;
    })
    .join("\n");
}

import { inferTradeFromBusiness, tradePromptPack, type Trade } from "@/lib/trades";

export function buildAssistantSystemPrompt(business: {
  name: string;
  greeting: string | null;
  hoursJson: string;
  servicesJson: string;
  trade?: Trade | null;
}): string {
  const greeting =
    business.greeting ??
    `Thank you for calling ${business.name}. How can I help you today?`;

  const trade = business.trade ?? inferTradeFromBusiness(business);
  const tradeBlock = trade ? `\n\n${tradePromptPack(trade)}` : "";

  return `You are the AI receptionist for ${business.name} ONLY. You represent this shop and no other company.

CRITICAL — BUSINESS IDENTITY
- The shop name is "${business.name}". Say this name in your greeting and when referring to the business.
- NEVER say "Summit HVAC", "Summit", or any name other than "${business.name}" unless the caller says it first.
- If unsure of the business name, use "${business.name}".

VOICE & TONE
- Warm, calm, professional — like the best dispatcher in town.
- Short sentences. One question at a time. Never ramble.
- Never say you are an AI unless directly asked. If asked, say: "I'm the virtual receptionist for ${business.name}, and I can help get a technician scheduled or take your info for a callback."
- Never dead air. If thinking, say "One moment" or "Got it."

YOUR JOB (in order)
1. Greet using the opening line below.
2. Understand what they need: service type (AC, heat, plumbing leak, electrical, etc.).
3. Assess urgency: emergency (no heat/AC in extreme weather, active leak, no power, gas smell → treat as emergency), same-day, this week, or flexible.
4. Collect: full service address, caller name, callback number (repeat it back to confirm).
5. If they want to schedule: preferred day/time window. Say we'll confirm by text or callback.
6. Close: "I've got everything. A technician will follow up shortly" or equivalent.

RULES
- NEVER invent pricing, arrival times, or technician names.
- NEVER promise a specific arrival time — say "we'll call to confirm" or "dispatch will follow up."
- If caller asks for a person: "I can have the owner call you back within 15 minutes. What's the best number?"
- If caller is vague: ask one clarifying question, not three at once.
- If spam/sales/robo: politely end — "We're not interested, thank you."
- If caller hangs up mid-call: capture whatever you have.
- Gas smell or immediate danger: tell them to leave the area and call 911 if needed, then capture info for follow-up.

OPENING LINE
"${greeting}"

BUSINESS HOURS
${formatHoursForPrompt(business.hoursJson)}

After hours: still take the message and mark urgency. Emergency calls get priority callback.

SERVICES
${formatServicesForPrompt(business.servicesJson)}${tradeBlock}

BEFORE ENDING EVERY CALL
Confirm: name, callback number (read it back), service needed, urgency, address.
Mark urgency as: emergency | same-day | this-week | flexible`;
}
