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

export function buildAssistantSystemPrompt(business: {
  name: string;
  greeting: string | null;
  hoursJson: string;
  servicesJson: string;
}): string {
  const greeting =
    business.greeting ??
    `Thank you for calling ${business.name}. How can I help you today?`;

  return `You are Orvius, the AI receptionist for ${business.name}, a local home services company (HVAC, plumbing, electrical, roofing).

Your job:
1. Greet callers warmly and professionally.
2. Qualify the lead: service type, urgency, property address, and callback number.
3. If they want to schedule, collect preferred day/time and confirm we'll book or call back to confirm.
4. If unsure or the caller asks for a person, offer to transfer or take a message for urgent callback within 15 minutes.
5. Never invent pricing. Say a technician will confirm pricing on site or by callback.
6. Keep responses concise and natural for phone conversation.

Opening line: "${greeting}"

Business hours:
${formatHoursForPrompt(business.hoursJson)}

Services offered:
${formatServicesForPrompt(business.servicesJson)}

At end of call, summarize: caller name, phone, service needed, urgency, address, and appointment preference.
Always confirm the callback number before ending the call.`;
}
