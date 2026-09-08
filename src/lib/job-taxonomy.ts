import { type Trade } from "@/lib/trades";

/**
 * Canonical demand taxonomy.
 *
 * Every call the product answers is a fact about what homes in a metro need,
 * what shops charge for it, and how fast an answer wins the job. That fact is
 * only worth something if it lands on a stable key: `serviceType` arrives from
 * the voice agent as free text ("AC not cooling", "ac out", "a/c broken"), and
 * three spellings of one job cannot be counted together.
 *
 * These codes are that key. Treat them as append-only — renaming one silently
 * splits its own history in half, and history is the whole point.
 */
export type DemandCategoryCode = (typeof DEMAND_CATEGORIES)[number]["code"];

type DemandCategory = {
  code: string;
  /** Which trade's rules this belongs to. "Other" is trade-independent. */
  trade: Trade | "Other";
  label: string;
  /**
   * Lowercase substrings. Matched against text padded with spaces, so a
   * pattern may carry its own boundaries (" ac ") when a bare one would
   * over-match ("ac" inside "back").
   */
  patterns: string[];
};

/**
 * Order is load-bearing: the first match inside a trade wins, so narrow
 * categories are listed before the broad ones they would otherwise fall into.
 * "Water heater leaking" is a water heater job, not a generic leak.
 */
export const DEMAND_CATEGORIES = [
  /* ── Not a service request. Checked first so noise never scores a trade. ── */
  {
    code: "other.non_service",
    trade: "Other",
    label: "Not a service request",
    patterns: [
      "wrong number",
      "sales call",
      "solicit",
      "telemarket",
      "robocall",
      "spam",
      "looking for a job",
      "job application",
      "hiring",
      "resume",
      // What actually rings a contractor's line all day besides customers.
      "advertis",
      "marketing",
      "seo",
      "google listing",
      "business listing",
      "website design",
      "lower your rate",
      "merchant services",
      "insurance quote",
    ],
  },

  /* ── HVAC ── */
  {
    code: "hvac.system_replace",
    trade: "HVAC",
    label: "System replacement or new install",
    patterns: [
      "new system",
      "system replace",
      "replace my ac",
      "replace the ac",
      "replace furnace",
      "new furnace",
      "new ac unit",
      "new air condition",
      "install a heat pump",
      "mini split",
      "quote on a system",
      "estimate on a new",
    ],
  },
  {
    code: "hvac.maintenance",
    trade: "HVAC",
    label: "Maintenance or tune-up",
    patterns: [
      "tune up",
      "tune-up",
      "maintenance",
      "annual service",
      "seasonal check",
      "filter change",
      "clean the coil",
    ],
  },
  {
    code: "hvac.no_cool",
    trade: "HVAC",
    label: "No cooling",
    patterns: [
      "not cooling",
      "no cool",
      "no cold air",
      "ac is out",
      " ac out",
      "ac not working",
      "ac stopped",
      "ac broke",
      "air conditioner not",
      "blowing warm",
      "blowing hot",
      "house is hot",
    ],
  },
  {
    code: "hvac.no_heat",
    trade: "HVAC",
    label: "No heat",
    patterns: [
      "no heat",
      "not heating",
      "heat is out",
      "furnace not",
      "furnace is out",
      "furnace stopped",
      "blowing cold",
      "house is cold",
      "heater not working",
    ],
  },
  {
    code: "hvac.thermostat",
    trade: "HVAC",
    label: "Thermostat",
    patterns: ["thermostat", "nest", "smart stat"],
  },
  {
    code: "hvac.airflow",
    trade: "HVAC",
    label: "Airflow or ductwork",
    patterns: [
      "airflow",
      "air flow",
      "weak air",
      "duct",
      "vent not blowing",
      "one room is",
    ],
  },
  {
    code: "hvac.condensate",
    trade: "HVAC",
    label: "Unit leaking water",
    patterns: [
      "condensate",
      "drain pan",
      "unit is leaking",
      "ac leaking",
      "water around the furnace",
      "leaking from the air handler",
    ],
  },
  {
    code: "hvac.diagnostic",
    trade: "HVAC",
    label: "Noise or smell diagnostic",
    patterns: [
      "making a noise",
      "strange noise",
      "rattling",
      "squealing",
      "burning smell from the vent",
      "smells like",
    ],
  },

  /* ── Plumbing ── */
  {
    code: "plumb.water_heater",
    trade: "Plumbing",
    label: "Water heater",
    patterns: ["water heater", "hot water tank", "tankless", "no hot water"],
  },
  {
    code: "plumb.sewer",
    trade: "Plumbing",
    label: "Sewer or main line",
    patterns: [
      "sewer",
      "main line",
      "septic",
      "backing up into",
      "sewage",
      "smells like sewage",
    ],
  },
  {
    code: "plumb.drain_clog",
    trade: "Plumbing",
    label: "Clogged drain",
    patterns: [
      "clog",
      "clogged",
      "drain is slow",
      "slow drain",
      "backed up sink",
      "snake the drain",
      "garbage disposal",
    ],
  },
  {
    code: "plumb.toilet",
    trade: "Plumbing",
    label: "Toilet",
    patterns: ["toilet", "running water in the bathroom", "flush"],
  },
  {
    code: "plumb.no_water",
    trade: "Plumbing",
    label: "No water or low pressure",
    patterns: [
      "no water",
      "low pressure",
      "low water pressure",
      "water shut off",
      "well pump",
    ],
  },
  {
    code: "plumb.leak",
    trade: "Plumbing",
    label: "Leak or burst pipe",
    patterns: [
      "leak",
      "leaking",
      "burst pipe",
      "pipe broke",
      "flooding",
      "water everywhere",
      "dripping under",
    ],
  },
  {
    code: "plumb.fixture",
    trade: "Plumbing",
    label: "Fixture install or repair",
    patterns: [
      "faucet",
      "shower head",
      "sink install",
      "install a dishwasher",
      "hose bib",
      "spigot",
    ],
  },
  {
    code: "plumb.repipe",
    trade: "Plumbing",
    label: "Repipe or remodel",
    patterns: ["repipe", "re-pipe", "rough in", "remodel", "new bathroom"],
  },
  {
    code: "plumb.gas",
    trade: "Plumbing",
    label: "Gas line",
    patterns: ["gas line", "gas smell", "smell gas", "gas leak"],
  },

  /* ── Electrical ── */
  {
    code: "elec.hazard",
    trade: "Electrical",
    label: "Electrical hazard",
    patterns: [
      "sparking",
      "sparks",
      "burning smell",
      "smoke from the outlet",
      "got shocked",
      "shock",
      "exposed wire",
      "melted",
    ],
  },
  {
    code: "elec.panel",
    trade: "Electrical",
    label: "Panel or service upgrade",
    patterns: [
      "panel upgrade",
      "new panel",
      "breaker box",
      "service upgrade",
      "200 amp",
      "100 amp",
      "fuse box",
    ],
  },
  {
    code: "elec.ev_charger",
    trade: "Electrical",
    label: "EV charger install",
    patterns: ["ev charger", "car charger", "tesla charger", "level 2 charger"],
  },
  {
    code: "elec.outage",
    trade: "Electrical",
    label: "Power loss",
    patterns: [
      "no power",
      "lost power",
      "power is out",
      "half the house",
      "part of the house",
      "power outage",
    ],
  },
  {
    code: "elec.breaker",
    trade: "Electrical",
    label: "Breaker tripping",
    patterns: [
      "breaker",
      "keeps tripping",
      "tripping",
      "fuse keeps",
      "gfci",
      "reset button",
    ],
  },
  {
    code: "elec.outlet",
    trade: "Electrical",
    label: "Outlet or switch",
    patterns: ["outlet", "receptacle", "switch not", "light switch", "plug"],
  },
  {
    code: "elec.lighting",
    trade: "Electrical",
    label: "Lighting",
    patterns: [
      "light fixture",
      "flickering",
      "recessed light",
      "can light",
      "ceiling fan",
      "chandelier",
      "lights keep",
    ],
  },
  {
    code: "elec.wiring",
    trade: "Electrical",
    label: "New circuit or wiring",
    patterns: [
      "new circuit",
      "run a wire",
      "rewire",
      "wiring",
      "add a line",
      "generator",
      "sub panel",
    ],
  },
] as const satisfies readonly DemandCategory[];

const BY_TRADE = new Map<Trade | "Other", readonly DemandCategory[]>();
for (const category of DEMAND_CATEGORIES) {
  BY_TRADE.set(category.trade, [
    ...(BY_TRADE.get(category.trade) ?? []),
    category,
  ]);
}

const LABELS = new Map<string, string>(
  DEMAND_CATEGORIES.map((c) => [c.code, c.label]),
);

export const DEMAND_CATEGORY_CODES = DEMAND_CATEGORIES.map((c) => c.code);

/** Human label for a stored code, for owner-facing rollups later. */
export function demandCategoryLabel(code: string | null | undefined) {
  if (!code) return null;
  return LABELS.get(code) ?? null;
}

export function isDemandCategoryCode(value: unknown): value is DemandCategoryCode {
  return typeof value === "string" && LABELS.has(value);
}

function matches(padded: string, category: DemandCategory) {
  return category.patterns.some((pattern) => padded.includes(pattern));
}

/**
 * Best category for one request, or null when nothing matches.
 *
 * Null is deliberate: a wrong code poisons a benchmark, while an empty one is
 * a row a better classifier can revisit. The shop's own trade is a prior, so a
 * plumber's "leak" resolves inside plumbing instead of racing HVAC for it.
 */
export function classifyDemand(input: {
  text: string | null | undefined;
  trade?: Trade | null;
}): DemandCategoryCode | null {
  const raw = (input.text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!raw) return null;
  const padded = ` ${raw} `;

  // Noise first — a sales call that mentions a furnace is still a sales call.
  const nonService = BY_TRADE.get("Other") ?? [];
  for (const category of nonService) {
    if (matches(padded, category)) return category.code as DemandCategoryCode;
  }

  if (input.trade) {
    for (const category of BY_TRADE.get(input.trade) ?? []) {
      if (matches(padded, category)) return category.code as DemandCategoryCode;
    }
  }

  // No trade hint, or the shop's trade did not recognise it — the caller may
  // have reached a plumber about a breaker, and that is still worth recording.
  for (const category of DEMAND_CATEGORIES) {
    if (category.trade === "Other" || category.trade === input.trade) continue;
    if (matches(padded, category)) return category.code as DemandCategoryCode;
  }

  return null;
}
