export type ProviderState = "operational" | "degraded" | "outage" | "unknown";

export type ProviderSource = {
  id: string;
  name: string;
  role: string;
  page: string;
  /** Statuspage-compatible JSON. Absent when the provider publishes no machine-readable status. */
  json?: string;
};

export type ProviderStatus = {
  id: string;
  name: string;
  role: string;
  page: string;
  state: ProviderState;
  /** The provider's own words, verbatim, when we could read them. */
  description: string | null;
};

export const PROVIDER_SOURCES: readonly ProviderSource[] = [
  { id: "vapi", name: "Vapi", role: "Answers and runs the call", page: "https://status.vapi.ai" },
  {
    id: "twilio",
    name: "Twilio",
    role: "Phone numbers and text messages",
    page: "https://status.twilio.com",
    json: "https://status.twilio.com/api/v2/status.json",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    role: "The receptionist's voice",
    page: "https://status.elevenlabs.io",
    json: "https://status.elevenlabs.io/api/v2/status.json",
  },
  {
    id: "deepgram",
    name: "Deepgram",
    role: "Hears what the caller says",
    page: "https://status.deepgram.com",
    json: "https://status.deepgram.com/api/v2/status.json",
  },
  {
    id: "openai",
    name: "OpenAI",
    role: "Understands the call and writes the summary",
    page: "https://status.openai.com",
    json: "https://status.openai.com/api/v2/status.json",
  },
];

export function stateFromIndicator(indicator: unknown): ProviderState {
  switch (indicator) {
    case "none":
      return "operational";
    case "minor":
    case "maintenance":
      return "degraded";
    case "major":
    case "critical":
      return "outage";
    default:
      return "unknown";
  }
}

export function parseStatuspage(body: unknown): { state: ProviderState; description: string | null } {
  const status = (body as { status?: { indicator?: unknown; description?: unknown } } | null)?.status;
  if (!status) return { state: "unknown", description: null };
  const description = typeof status.description === "string" ? status.description.slice(0, 120) : null;
  return { state: stateFromIndicator(status.indicator), description };
}

const RANK: Record<ProviderState, number> = { operational: 0, unknown: 1, degraded: 2, outage: 3 };

/**
 * One line a shop owner can act on. "Unknown" never reads as green: a provider
 * we couldn't reach is said out loud rather than folded into "all good".
 */
export function summarizeProviders(list: readonly ProviderStatus[]): { state: ProviderState; line: string } {
  if (list.length === 0) return { state: "unknown", line: "No provider status available." };
  const worst = list.reduce((a, b) => (RANK[b.state] > RANK[a.state] ? b : a));
  const names = (s: ProviderState) => list.filter((p) => p.state === s).map((p) => p.name).join(", ");
  if (worst.state === "outage") return { state: "outage", line: `Reported outage: ${names("outage")}.` };
  if (worst.state === "degraded") return { state: "degraded", line: `Reporting issues: ${names("degraded")}.` };
  if (worst.state === "unknown") {
    return { state: "unknown", line: `No issues reported where we could check. Check directly: ${names("unknown")}.` };
  }
  return { state: "operational", line: "Every provider we can check reports no issues." };
}

export async function fetchProviderStatuses(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<ProviderStatus[]> {
  return Promise.all(
    PROVIDER_SOURCES.map(async (src): Promise<ProviderStatus> => {
      const base = { id: src.id, name: src.name, role: src.role, page: src.page };
      if (!src.json) return { ...base, state: "unknown", description: null };
      try {
        const res = await fetchImpl(src.json, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { Accept: "application/json" },
          next: { revalidate: 60 },
        } as RequestInit);
        if (!res.ok) return { ...base, state: "unknown", description: null };
        return { ...base, ...parseStatuspage(await res.json()) };
      } catch {
        return { ...base, state: "unknown", description: null };
      }
    }),
  );
}
