import type { Trade } from "@/lib/trades";
import type { RequestUrgency } from "@/lib/trade-playbooks";

/*
  What "Orvius supports plumbing" means, written down. A trade is a set of
  named workflows, each with the calls that prove it, the hazards that go to a
  person, and the work that is plainly not covered. `scripts/launch-verification.test.mjs`
  runs every line of this through the real classifier, scheduler, technician
  match, owner alert and escalation code; a trade launches only when all of it
  passes. Everything else stays on the interest list.
*/

export type ScopeCall = { says: string; urgency?: RequestUrgency };

export type ScopeWorkflow = {
  key: string;
  label: string;
  /** Playbook service keys this workflow books as. */
  services: string[];
  /** Demand categories the request is recorded under (Command, reports, Network). */
  categories: string[];
  calls: ScopeCall[];
};

export type ScopeHazard = { safety: string; says: string };

export type NotCovered = { key: string; label: string; keywords: RegExp[]; says: string };

export type TradeScope = {
  trade: Trade;
  /** Who the launch promise is for. */
  customers: string;
  workflows: ScopeWorkflow[];
  hazards: ScopeHazard[];
  notCovered: NotCovered[];
};

const RESIDENTIAL = "Homes and small residential properties: service, repair and estimates";

const NEW_CONSTRUCTION: NotCovered = {
  key: "new_construction",
  label: "New construction and remodel work",
  keywords: [/new construction/, /\bnew build\b/, /rough[- ]?in/, /(bathroom|kitchen|basement) remodel/, /\baddition\b/],
  says: "We're building a new house and need a bid on the rough-in",
};

export const TRADE_SCOPES: TradeScope[] = [
  {
    trade: "HVAC",
    customers: RESIDENTIAL,
    workflows: [
      {
        key: "no_cooling",
        label: "AC not cooling",
        services: ["no_cooling"],
        categories: ["hvac.no_cool"],
        calls: [
          { says: "My AC is running but it's not cooling, it's 84 in the house", urgency: "same-day" },
          { says: "Air conditioner blowing warm air upstairs, can someone come this week" },
        ],
      },
      {
        key: "no_heat",
        label: "No heat (furnace, heat pump, boiler)",
        services: ["no_heat"],
        categories: ["hvac.no_heat"],
        calls: [
          { says: "We have no heat, the furnace won't turn on", urgency: "same-day" },
          { says: "No heat and my elderly mother is here, the house is freezing", urgency: "emergency" },
        ],
      },
      {
        key: "tune_up",
        label: "Maintenance tune-up",
        services: ["tune_up"],
        categories: ["hvac.maintenance"],
        calls: [{ says: "I'd like to schedule a tune-up for my system before summer" }],
      },
      {
        key: "thermostat",
        label: "Thermostat problem",
        services: ["thermostat"],
        categories: ["hvac.thermostat"],
        calls: [{ says: "My thermostat screen is blank and nothing happens" }],
      },
      {
        key: "system_estimate",
        label: "Replacement estimate",
        services: ["system_quote"],
        categories: ["hvac.system_replace"],
        calls: [{ says: "Our unit is 20 years old, I want a quote on a new system" }],
      },
    ],
    hazards: [
      { safety: "gas_smell", says: "I smell gas near the furnace" },
      { safety: "carbon_monoxide", says: "The carbon monoxide alarm keeps going off" },
      { safety: "burning_unit", says: "There's smoke coming from the furnace" },
    ],
    notCovered: [
      {
        key: "commercial_equipment",
        label: "Commercial equipment (rooftop units, chillers, walk-in coolers)",
        keywords: [/rooftop unit/, /\brtu\b/, /chiller/, /walk[- ]?in (cooler|freezer)/, /commercial refrigerat/],
        says: "The rooftop unit on our restaurant stopped working",
      },
      NEW_CONSTRUCTION,
    ],
  },
  {
    trade: "Plumbing",
    customers: RESIDENTIAL,
    workflows: [
      {
        key: "leak",
        label: "Leak or burst pipe",
        services: ["active_leak"],
        categories: ["plumb.leak"],
        calls: [
          { says: "A pipe burst in the basement and there's water everywhere", urgency: "emergency" },
          { says: "There's a slow leak under the kitchen sink cabinet", urgency: "same-day" },
        ],
      },
      {
        key: "drain_clog",
        label: "Clogged drain",
        services: ["drain_clog"],
        categories: ["plumb.drain_clog"],
        calls: [{ says: "My shower drain is clogged and won't go down" }],
      },
      {
        key: "water_heater",
        label: "Water heater repair or replacement",
        services: ["water_heater"],
        categories: ["plumb.water_heater"],
        calls: [{ says: "We have no hot water since this morning", urgency: "same-day" }],
      },
      {
        key: "toilet",
        label: "Toilet repair",
        services: ["toilet"],
        categories: ["plumb.toilet"],
        calls: [{ says: "The toilet keeps running and won't stop" }],
      },
      {
        key: "fixture",
        label: "Faucet, shower and disposal repair",
        services: ["fixture"],
        categories: ["plumb.fixture"],
        calls: [{ says: "My kitchen faucet is dripping and I want it replaced" }],
      },
      {
        key: "sewer",
        label: "Sewer or main line",
        services: ["sewer"],
        categories: ["plumb.sewer"],
        calls: [{ says: "I think the main sewer line is clogged, every drain in the house is slow" }],
      },
    ],
    hazards: [
      { safety: "gas_smell", says: "I smell gas by the water heater" },
      { safety: "water_on_electrical", says: "Water is leaking onto the electrical panel" },
      { safety: "sewage_backup", says: "Raw sewage is coming up in the basement" },
    ],
    notCovered: [
      {
        key: "well_septic",
        label: "Well pumps and septic systems",
        keywords: [/well pump/, /\bseptic\b/, /\bwell water\b/],
        says: "Our well pump stopped and we have no water",
      },
      {
        key: "gas_line",
        label: "Gas line installs",
        keywords: [/gas line/, /gas pipe/],
        says: "I need a gas line run to the new stove",
      },
      {
        key: "fire_backflow",
        label: "Fire sprinklers and backflow certification",
        keywords: [/fire sprinkler/, /backflow (test|certif)/],
        says: "We need our annual backflow test certification",
      },
      {
        key: "commercial",
        label: "Commercial kitchens and grease traps",
        keywords: [/grease trap/, /commercial kitchen/],
        says: "The grease trap at our restaurant is backing up",
      },
      NEW_CONSTRUCTION,
    ],
  },
  {
    trade: "Electrical",
    customers: RESIDENTIAL,
    workflows: [
      {
        key: "power_loss",
        label: "Power out in part or all of the home",
        services: ["power_loss"],
        categories: ["elec.outage"],
        calls: [{ says: "Half the house has no power but the neighbors are fine", urgency: "emergency" }],
      },
      {
        key: "breaker",
        label: "Breaker keeps tripping",
        services: ["breaker"],
        categories: ["elec.breaker"],
        calls: [{ says: "The kitchen breaker keeps tripping every time I run the microwave", urgency: "same-day" }],
      },
      {
        key: "outlet",
        label: "Dead outlet or switch",
        services: ["outlet"],
        categories: ["elec.outlet"],
        calls: [{ says: "Two outlets in the bedroom stopped working" }],
      },
      {
        key: "lighting",
        label: "Lighting repair or install",
        services: ["lighting"],
        categories: ["elec.lighting"],
        calls: [{ says: "The lights in the living room flicker all the time" }],
      },
      {
        key: "panel_ev",
        label: "Panel upgrade or EV charger estimate",
        services: ["panel"],
        categories: ["elec.panel", "elec.ev_charger"],
        calls: [
          { says: "I want a quote to upgrade my panel to 200 amp" },
          { says: "Can you install an EV charger in my garage" },
        ],
      },
    ],
    hazards: [
      { safety: "sparking", says: "The outlet is sparking when I plug things in" },
      { safety: "shock", says: "My son got shocked touching the light switch" },
      { safety: "exposed_wires", says: "There's a downed power line in the yard" },
    ],
    notCovered: [
      {
        key: "solar",
        label: "Solar panels and home batteries",
        keywords: [/solar/, /powerwall/, /battery (backup|storage)/],
        says: "I want solar panels put on the roof",
      },
      {
        key: "generator",
        label: "Standby generators",
        keywords: [/generator/, /generac/],
        says: "Our standby generator won't start",
      },
      {
        key: "low_voltage",
        label: "Low-voltage work (cameras, network cabling)",
        keywords: [/security cameras?/, /network cabl/, /\bcat ?[56]e?\b/, /low[- ]voltage/],
        says: "I need security cameras wired around the house",
      },
      {
        key: "commercial",
        label: "Commercial and three-phase work",
        keywords: [/three[- ]phase/, /\bwarehouse\b/, /commercial (building|space|property)/],
        says: "We need three-phase power run in our warehouse",
      },
      NEW_CONSTRUCTION,
    ],
  },
  /*
    Candidates held to the same checks. They have playbooks and safety rules,
    but no demand categories yet, so their requests are not recorded or
    qualified the way the board, reports and Network need.
  */
  {
    trade: "Garage doors",
    customers: RESIDENTIAL,
    workflows: [
      { key: "spring", label: "Broken spring", services: ["broken_spring"], categories: [], calls: [{ says: "I heard a loud bang and now the garage spring is broken" }] },
      { key: "opener", label: "Opener repair", services: ["opener"], categories: [], calls: [{ says: "The garage door opener motor just hums" }] },
    ],
    hazards: [{ safety: "door_injury", says: "My son is pinned under the garage door" }],
    notCovered: [],
  },
  {
    trade: "Appliance repair",
    customers: RESIDENTIAL,
    workflows: [
      { key: "refrigerator", label: "Refrigerator repair", services: ["refrigerator"], categories: [], calls: [{ says: "The fridge stopped cooling overnight", urgency: "same-day" }] },
      { key: "laundry", label: "Washer or dryer repair", services: ["laundry"], categories: [], calls: [{ says: "The dryer runs but doesn't heat" }] },
    ],
    hazards: [{ safety: "appliance_fire", says: "The oven is sparking" }],
    notCovered: [],
  },
  {
    trade: "Roofing",
    customers: RESIDENTIAL,
    workflows: [
      { key: "roof_leak", label: "Roof leak", services: ["roof_leak"], categories: [], calls: [{ says: "Water is dripping through the ceiling from the roof", urgency: "emergency" }] },
      { key: "storm", label: "Storm damage inspection", services: ["storm_damage"], categories: [], calls: [{ says: "The hail storm took off some shingles" }] },
    ],
    hazards: [{ safety: "roof_collapse", says: "A tree branch came through the roof" }],
    notCovered: [],
  },
  {
    trade: "Locksmith",
    customers: RESIDENTIAL,
    workflows: [
      { key: "lockout", label: "Home lockout", services: ["lockout_home"], categories: [], calls: [{ says: "I locked myself out of the house", urgency: "emergency" }] },
      { key: "rekey", label: "Rekey or lock change", services: ["rekey"], categories: [], calls: [{ says: "I just bought the house and want to rekey the locks" }] },
    ],
    hazards: [{ safety: "locked_in_car", says: "My baby is locked inside the car" }],
    notCovered: [],
  },
  {
    trade: "Pest control",
    customers: RESIDENTIAL,
    workflows: [
      { key: "rodents", label: "Rodents", services: ["rodents"], categories: [], calls: [{ says: "We have mice in the kitchen" }] },
      { key: "termites", label: "Termite inspection", services: ["termites"], categories: [], calls: [{ says: "I think we have termites in the deck" }] },
    ],
    hazards: [{ safety: "allergic_sting", says: "My husband is allergic and got stung, his arm is swelling" }],
    notCovered: [],
  },
  {
    trade: "Cleaning",
    customers: RESIDENTIAL,
    workflows: [
      { key: "deep_clean", label: "Deep clean", services: ["deep_clean"], categories: [], calls: [{ says: "I'd like a deep clean of the whole house" }] },
    ],
    hazards: [],
    notCovered: [],
  },
  {
    trade: "Moving",
    customers: RESIDENTIAL,
    workflows: [
      { key: "local_move", label: "Local move", services: ["local_move"], categories: [], calls: [{ says: "We're moving across town next month" }] },
    ],
    hazards: [],
    notCovered: [],
  },
];

export function tradeScope(trade: string | null | undefined): TradeScope | null {
  return TRADE_SCOPES.find((s) => s.trade === trade) ?? null;
}

/**
 * Work a shop's trade plainly does not cover at launch. Read from what the
 * caller asked for, not the whole transcript, so "my solar panels are fine,
 * the breaker trips" still books as a breaker call.
 */
export function outsideScope(trade: string | null | undefined, request: string | null | undefined): NotCovered | null {
  const scope = tradeScope(trade);
  const text = request?.toLowerCase().trim();
  if (!scope || !text) return null;
  return scope.notCovered.find((n) => n.keywords.some((k) => k.test(text))) ?? null;
}

/** Prompt lines: what the receptionist books for this trade, and what goes to the owner instead. */
export function scopePromptBlock(trade: string | null | undefined): string {
  const scope = tradeScope(trade);
  if (!scope || !scope.notCovered.length) return "";
  return `

WORK THIS SHOP BOOKS THROUGH YOU
${scope.workflows.map((w) => `- ${w.label}`).join("\n")}
NOT BOOKED BY YOU — take name, number, address and what they need, say the owner will call them back about it, and do not offer a time:
${scope.notCovered.map((n) => `- ${n.label}`).join("\n")}`;
}
