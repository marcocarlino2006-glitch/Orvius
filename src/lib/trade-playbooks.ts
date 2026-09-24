import { inferTradeFromBusiness, TRADES, type Trade } from "@/lib/trades";

/**
 * Trade playbooks — one shared platform, three trades. A playbook turns what a
 * caller said into the facts the booking loop needs: which service, how long
 * it takes, which skill it needs, how urgent it is, and whether it is a
 * life-safety call that a human must take instead of the calendar.
 */

export type PlaybookService = {
  key: string;
  label: string;
  durationMin: number;
  /** Technician skill key; technicians with no skills listed can take any job. */
  skill: string;
  keywords: RegExp[];
};

export type SafetyRule = {
  key: string;
  label: string;
  /** What the owner is told to do. */
  instruction: string;
  keywords: RegExp[];
};

export type TradePlaybook = {
  trade: Trade;
  services: PlaybookService[];
  fallback: PlaybookService;
  safety: SafetyRule[];
  emergency: RegExp[];
  sameDay: RegExp[];
};

export type RequestUrgency = "emergency" | "same-day" | "this-week" | "flexible";

export type RequestClassification = {
  trade: Trade | null;
  service: { key: string; label: string; durationMin: number; skill: string };
  safety: { key: string; label: string; instruction: string } | null;
  urgency: RequestUrgency | null;
  /** Why the playbook decided what it did — shown in the audit trail. */
  reasons: string[];
};

export const GENERAL_DURATION_MIN = 120;

const HVAC: TradePlaybook = {
  trade: "HVAC",
  services: [
    { key: "no_cooling", label: "No cooling / AC repair", durationMin: 120, skill: "cooling", keywords: [/\b(no|not) (cool|cooling|ac|a\/c)\b/, /\bac\b.*\b(out|down|broken|not working)\b/, /air condition/, /\bcooling\b/] },
    { key: "no_heat", label: "No heat / furnace repair", durationMin: 120, skill: "heating", keywords: [/\bno heat\b/, /furnace/, /heat pump/, /\bheating\b/, /boiler/] },
    { key: "tune_up", label: "Maintenance tune-up", durationMin: 60, skill: "maintenance", keywords: [/tune[- ]?up/, /maintenance/, /\bservice (visit|check)\b/, /filter/] },
    { key: "thermostat", label: "Thermostat issue", durationMin: 60, skill: "controls", keywords: [/thermostat/] },
    { key: "system_quote", label: "New system estimate", durationMin: 90, skill: "sales", keywords: [/new (system|unit|ac|furnace)/, /replace(ment)?/, /quote/, /estimate/] },
  ],
  fallback: { key: "hvac_diagnostic", label: "HVAC diagnostic", durationMin: 120, skill: "general", keywords: [] },
  safety: [
    { key: "gas_smell", label: "Gas smell", instruction: "Tell the caller to leave the home and call the gas utility or 911. Call them back now.", keywords: [/smell(s|ing)? (of )?gas/, /gas (smell|leak)/] },
    { key: "carbon_monoxide", label: "Carbon monoxide alarm", instruction: "Tell the caller to get outside and call 911. Call them back now.", keywords: [/carbon monoxide/, /\bco (alarm|detector)\b/] },
    { key: "burning_unit", label: "Burning smell or smoke from the unit", instruction: "Tell the caller to shut the system off at the breaker. Call them back now.", keywords: [/(burning|smoke|smoking).{0,20}(unit|furnace|system|vent)/, /(unit|furnace).{0,20}(burning|smoke)/] },
  ],
  emergency: [/\bno heat\b.*\b(freez|cold|baby|elderly)/, /water (leaking|pouring) from (the )?(indoor|air handler)/],
  sameDay: [/\bno (heat|cooling|ac|a\/c)\b/, /\basap\b/, /\btoday\b/, /\burgent\b/],
};

const PLUMBING: TradePlaybook = {
  trade: "Plumbing",
  services: [
    { key: "active_leak", label: "Active leak / burst pipe", durationMin: 90, skill: "leaks", keywords: [/burst/, /\bleak(ing)?\b/, /flood/, /water everywhere/] },
    { key: "drain_clog", label: "Clogged drain", durationMin: 60, skill: "drains", keywords: [/clog/, /drain/, /backed up/, /slow (drain|sink|tub)/] },
    { key: "water_heater", label: "Water heater", durationMin: 120, skill: "water_heaters", keywords: [/water heater/, /no hot water/, /tankless/] },
    { key: "toilet", label: "Toilet repair", durationMin: 60, skill: "fixtures", keywords: [/toilet/] },
    { key: "fixture", label: "Faucet / fixture", durationMin: 60, skill: "fixtures", keywords: [/faucet/, /sink/, /shower/, /disposal/] },
    { key: "sewer", label: "Sewer line", durationMin: 180, skill: "sewer", keywords: [/sewer/, /main line/, /sewage/] },
  ],
  fallback: { key: "plumbing_diagnostic", label: "Plumbing diagnostic", durationMin: 90, skill: "general", keywords: [] },
  safety: [
    { key: "gas_smell", label: "Gas smell near a gas appliance", instruction: "Tell the caller to leave the home and call the gas utility or 911. Call them back now.", keywords: [/smell(s|ing)? (of )?gas/, /gas (smell|leak)/] },
    { key: "sewage_backup", label: "Sewage backing up into the home", instruction: "Tell the caller to stop using water and keep people away from it. Call them back now.", keywords: [/sewage (backing|coming) (up|in)/, /raw sewage/] },
  ],
  emergency: [/burst/, /flood/, /water everywhere/, /can'?t (shut|turn) (it |the water )?off/],
  sameDay: [/\bno (hot )?water\b/, /\bleak/, /\basap\b/, /\btoday\b/, /\burgent\b/],
};

const ELECTRICAL: TradePlaybook = {
  trade: "Electrical",
  services: [
    { key: "power_loss", label: "Power loss", durationMin: 90, skill: "troubleshooting", keywords: [/no power/, /power (is )?out/, /lost power/, /half (the|my) (house|home)/] },
    { key: "breaker", label: "Tripping breaker", durationMin: 60, skill: "troubleshooting", keywords: [/breaker/, /tripp/, /fuse/] },
    { key: "outlet", label: "Outlet / switch repair", durationMin: 60, skill: "devices", keywords: [/outlet/, /switch/, /receptacle/, /gfci/] },
    { key: "lighting", label: "Lighting", durationMin: 60, skill: "devices", keywords: [/light/, /flicker/, /fixture/] },
    { key: "panel", label: "Panel upgrade estimate", durationMin: 90, skill: "panels", keywords: [/panel/, /upgrade/, /\bev charger\b/, /new circuit/] },
  ],
  fallback: { key: "electrical_diagnostic", label: "Electrical diagnostic", durationMin: 90, skill: "general", keywords: [] },
  safety: [
    { key: "sparking", label: "Sparking, burning smell, or smoke", instruction: "Tell the caller to shut off the main breaker if it is safe and call 911 if there is fire. Call them back now.", keywords: [/spark/, /burning smell/, /smell(s|ing)? (like )?burning/, /smok(e|ing)/, /electrical fire/] },
    { key: "shock", label: "Someone was shocked", instruction: "If anyone is hurt, the caller should call 911. Call them back now.", keywords: [/(got|was|been) shocked/, /electrocut/] },
    { key: "exposed_wires", label: "Exposed or hot wires", instruction: "Tell the caller to keep everyone away and shut off the breaker. Call them back now.", keywords: [/exposed wire/, /wires? (hanging|exposed|hot)/, /downed (power )?line/] },
  ],
  emergency: [/no power/, /power (is )?out/],
  sameDay: [/breaker/, /\basap\b/, /\btoday\b/, /\burgent\b/],
};

export const TRADE_PLAYBOOKS: Record<Trade, TradePlaybook> = {
  HVAC,
  Plumbing: PLUMBING,
  Electrical: ELECTRICAL,
};

const GENERAL_FALLBACK = {
  key: "general_service",
  label: "Service call",
  durationMin: GENERAL_DURATION_MIN,
  skill: "general",
};

const ALL_SAFETY: SafetyRule[] = TRADES.flatMap((t) => TRADE_PLAYBOOKS[t].safety);

export type ServiceOverride = { name?: string; durationMin?: number; skill?: string };

/**
 * A shop's servicesJson may override a playbook service's duration or skill
 * by name — the shop knows its own work better than the default.
 */
export function parseServiceOverrides(servicesJson: string | null | undefined): ServiceOverride[] {
  if (!servicesJson) return [];
  try {
    const parsed = JSON.parse(servicesJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): ServiceOverride[] => {
      if (typeof entry === "string") return [{ name: entry }];
      if (entry && typeof entry === "object") {
        const e = entry as Record<string, unknown>;
        return [
          {
            name: typeof e.name === "string" ? e.name : undefined,
            durationMin:
              typeof e.durationMin === "number" && e.durationMin >= 15 && e.durationMin <= 600
                ? Math.round(e.durationMin)
                : undefined,
            skill: typeof e.skill === "string" && e.skill.trim() ? e.skill.trim() : undefined,
          },
        ];
      }
      return [];
    });
  } catch {
    return [];
  }
}

export function resolveTrade(business: {
  trade?: string | null;
  servicesJson?: string | null;
  name?: string | null;
}): Trade | null {
  const explicit = TRADES.find((t) => t.toLowerCase() === business.trade?.trim().toLowerCase());
  return explicit ?? inferTradeFromBusiness(business);
}

function matches(text: string, patterns: RegExp[]) {
  return patterns.some((p) => p.test(text));
}

function normalizeUrgency(value: string | null | undefined): RequestUrgency | null {
  const key = value?.toLowerCase().replace(/[\s_]+/g, "-") ?? "";
  if (key.includes("emergency")) return "emergency";
  if (key.includes("same-day") || key === "today" || key === "urgent") return "same-day";
  if (key.includes("week")) return "this-week";
  if (key.includes("flex")) return "flexible";
  return null;
}

/**
 * Classify one request. Safety rules from every trade apply regardless of the
 * shop's trade — a gas smell reported to an electrician is still a gas smell.
 */
export function classifyRequest(input: {
  business: { trade?: string | null; servicesJson?: string | null; name?: string | null };
  serviceType?: string | null;
  notes?: string | null;
  summary?: string | null;
  urgency?: string | null;
}): RequestClassification {
  const trade = resolveTrade(input.business);
  const text = [input.serviceType, input.notes, input.summary]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
  const reasons: string[] = [];
  const playbook = trade ? TRADE_PLAYBOOKS[trade] : null;

  const safetyRules = playbook
    ? [...playbook.safety, ...ALL_SAFETY.filter((r) => !playbook.safety.some((p) => p.key === r.key))]
    : ALL_SAFETY;
  const hazard = safetyRules.find((rule) => matches(text, rule.keywords)) ?? null;
  if (hazard) reasons.push(`Safety: ${hazard.label.toLowerCase()} mentioned`);

  const matched = playbook?.services.find((s) => matches(text, s.keywords)) ?? null;
  const base = matched ?? playbook?.fallback ?? GENERAL_FALLBACK;
  if (matched) reasons.push(`Matched ${trade} service “${matched.label}”`);
  else reasons.push(playbook ? `No specific ${trade} service matched — using ${base.label.toLowerCase()}` : "Trade not set — using a general service call");

  const overrides = parseServiceOverrides(input.business.servicesJson);
  const override = overrides.find(
    (o) => o.name && (o.name.toLowerCase() === base.label.toLowerCase() || o.name.toLowerCase() === base.key),
  );
  const durationMin = override?.durationMin ?? base.durationMin;
  const skill = override?.skill ?? base.skill;
  if (override?.durationMin) reasons.push(`Shop sets ${base.label} at ${durationMin} min`);

  let urgency = normalizeUrgency(input.urgency);
  if (hazard) {
    urgency = "emergency";
  } else if (playbook && matches(text, playbook.emergency) && urgency !== "emergency") {
    urgency = "emergency";
    reasons.push("Emergency signal in the caller’s words");
  } else if (!urgency && playbook && matches(text, playbook.sameDay)) {
    urgency = "same-day";
    reasons.push("Same-day signal in the caller’s words");
  }

  return {
    trade,
    service: { key: base.key, label: base.label, durationMin, skill },
    safety: hazard ? { key: hazard.key, label: hazard.label, instruction: hazard.instruction } : null,
    urgency,
    reasons,
  };
}

/** Skill keys a shop's technicians can be tagged with, for its trade. */
export function skillOptions(trade: Trade | null): { key: string; label: string }[] {
  const playbooks = trade ? [TRADE_PLAYBOOKS[trade]] : TRADES.map((t) => TRADE_PLAYBOOKS[t]);
  const seen = new Map<string, string>();
  for (const pb of playbooks) {
    for (const s of pb.services) if (!seen.has(s.skill)) seen.set(s.skill, s.skill.replace(/_/g, " "));
  }
  return [...seen].map(([key, label]) => ({ key, label: label.charAt(0).toUpperCase() + label.slice(1) }));
}
