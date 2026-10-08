export const TRADES = [
  "HVAC",
  "Plumbing",
  "Electrical",
  "Roofing",
  "Pest control",
  "Cleaning",
  "Moving",
  "Locksmith",
  "Garage doors",
  "Appliance repair",
  "Auto repair",
  "Salon & spa",
  "Dental office",
  "Medical office",
  "Law office",
  "Real estate",
  "Other business",
] as const;
export type Trade = (typeof TRADES)[number];

/*
  Patient calls carry protected health information, and Orvius has no BAA with
  its voice, text and AI vendors. Shops already on these trades keep working;
  no new one can pick them until that exists.
*/
export const HIPAA_TRADES: readonly Trade[] = ["Dental office", "Medical office"];

export function isHipaaTrade(trade: string | null | undefined): boolean {
  return HIPAA_TRADES.includes(trade as Trade);
}

/*
  The launch scope: the trades with their own playbook — safety rules (gas,
  carbon monoxide, sparking, flooding), emergency detection and services —
  not the general template. Shops already on another trade keep working; new
  ones join the waitlist until their trade gets the same depth.
*/
export const LAUNCH_TRADES: readonly Trade[] = ["HVAC", "Plumbing", "Electrical"];

/** The trades a new shop can pick. */
export const OFFERED_TRADES: readonly Trade[] = LAUNCH_TRADES;

export function isLaunchTrade(trade: string | null | undefined): boolean {
  return LAUNCH_TRADES.includes(trade as Trade);
}

export const LAUNCH_SCOPE_LINE = "Heating & cooling, plumbing and electrical";

export const NOT_YET_TRADE =
  "Orvius launches for heating & cooling, plumbing and electrical businesses. Other businesses can join the waitlist and we'll tell you when yours is ready.";

export const HIPAA_TRADE_REFUSAL =
  "Orvius isn't set up for patient calls yet (no HIPAA agreement), so dental and medical offices can't sign up.";

/**
 * Field businesses go to the customer: the call needs a service address and a
 * technician goes out. Office businesses see the customer at their place: the
 * call books an appointment and never asks for a home address.
 */
export type IndustryKind = "field" | "office";

export const INDUSTRY_KIND: Record<Trade, IndustryKind> = {
  HVAC: "field",
  Plumbing: "field",
  Electrical: "field",
  Roofing: "field",
  "Pest control": "field",
  Cleaning: "field",
  Moving: "field",
  Locksmith: "field",
  "Garage doors": "field",
  "Appliance repair": "field",
  "Auto repair": "office",
  "Salon & spa": "office",
  "Dental office": "office",
  "Medical office": "office",
  "Law office": "office",
  "Real estate": "office",
  "Other business": "office",
};

export function isTrade(value: string | null | undefined): value is Trade {
  return Boolean(value) && (TRADES as readonly string[]).includes(value as string);
}

export function industryKind(trade: Trade | null | undefined): IndustryKind {
  return (trade && INDUSTRY_KIND[trade]) || "field";
}

/*
  Word boundaries rather than padded spaces. Two of these used to be written
  as "ac " and " a/c", which is a word boundary spelled as a character that
  only exists between words — so "A/C Doctors" and "Summit AC" matched
  nothing, because the padding they needed was off the end of the name. A shop
  that matches nothing gets no prompt pack, and answers an air-conditioning
  call with the generic script at two in the morning.
*/
const TRADE_KEYWORDS: Record<Trade, RegExp[]> = {
  HVAC: [
    /hvac/,
    /\bac\b/,
    /\ba\/c\b/,
    /air condition/,
    /heat/,
    /furnace/,
    /cooling/,
    /heat pump/,
  ],
  Plumbing: [
    /plumb/,
    /drain/,
    /leak/,
    /water heater/,
    /sewer/,
    /pipe/,
    /toilet/,
    /faucet/,
  ],
  Electrical: [
    /electric/,
    /outlet/,
    /panel/,
    /breaker/,
    /wiring/,
    /light/,
    /power/,
  ],
  Roofing: [/roof/, /shingle/, /gutter/],
  "Pest control": [/\bpest/, /termite/, /extermina/, /rodent/, /bed ?bug/],
  Cleaning: [/\bmaids?\b/, /house ?clean/, /janitorial/, /cleaning (service|company|co\b)/, /carpet clean/],
  Moving: [/\bmovers?\b/, /moving (company|co\b|service)/, /relocation/],
  Locksmith: [/locksmith/, /\block(s|ed)? ?out\b/, /rekey/],
  "Garage doors": [/garage door/, /overhead door/],
  "Appliance repair": [/appliance/],
  "Auto repair": [/\bauto\b/, /automotive/, /mechanic/, /collision/, /body shop/, /\btires?\b/, /brakes?/, /oil change/, /transmission/],
  "Salon & spa": [/salon/, /\bspa\b/, /barber/, /\bnails?\b/, /\bhair\b/, /\blash/, /\bbrow/, /massage/],
  "Dental office": [/dental/, /dentist/, /orthodont/],
  "Medical office": [/clinic/, /medical/, /physician/, /chiropract/, /physical therapy/, /pediatric/, /dermatolog/],
  "Law office": [/\blaw\b/, /attorney/, /lawyer/, /\blegal\b/, /\besq\b/],
  "Real estate": [/real estate/, /realty/, /realtor/],
  "Other business": [],
};

/** Infer primary trade from servicesJson or shop name for prompt packs. */
export function inferTradeFromBusiness(input: {
  servicesJson?: string | null;
  name?: string | null;
}): Trade | null {
  let haystack = (input.name ?? "").toLowerCase();

  if (input.servicesJson) {
    try {
      const services = JSON.parse(input.servicesJson) as Array<string | { name?: string; description?: string }>;
      haystack += ` ${services
        .map((s) => (typeof s === "string" ? s : `${s.name ?? ""} ${s.description ?? ""}`))
        .join(" ")}`.toLowerCase();
    } catch {
      /* ignore */
    }
  }

  let best: Trade | null = null;
  let bestScore = 0;

  for (const trade of TRADES) {
    const score = TRADE_KEYWORDS[trade].filter((kw) => kw.test(haystack)).length;
    if (score > bestScore) {
      bestScore = score;
      best = trade;
    }
  }

  return bestScore > 0 ? best : null;
}

export function tradePromptPack(trade: Trade): string {
  switch (trade) {
    case "HVAC":
      return `TRADE — HVAC
- Common calls: no AC in summer, no heat in winter, weird noises, weak airflow, thermostat issues, maintenance/tune-ups, new system quotes.
- Emergency signals: no cooling when it's hot, no heat when it's cold, burning smell from unit, water leaking from indoor unit.
- Ask: system type if they know (central AC, heat pump, furnace), whether system is running at all, and floor/room affected.
- Never quote equipment prices or promise same-day install.`;
    case "Plumbing":
      return `TRADE — PLUMBING
- Common calls: active leaks, clogged drains, water heater failure, running toilets, low pressure, sewer smell, burst pipe.
- Emergency signals: active leak/flooding, no water, sewer backup, water heater leaking, gas water heater issues.
- Ask: is water still flowing, can they shut off the main, which fixture/room, how long it's been happening.
- Never quote flat rates or promise a fix without diagnosis.`;
    case "Electrical":
      return `TRADE — ELECTRICAL
- Common calls: partial power loss, tripping breakers, dead outlets, flickering lights, panel upgrades, new circuits.
- Emergency signals: burning smell, sparking, shock, full power loss, exposed wires — treat as emergency; mention 911 if immediate danger.
- Ask: whole home vs one room, breaker tripped or not, when it started, any recent work done.
- Never instruct DIY on panel work; always capture address for dispatch.`;
    case "Roofing":
      return `TRADE — ROOFING
- Common calls: active roof leak, storm or hail damage, missing shingles, gutters, inspections, replacement quotes.
- Emergency signals: water coming through the ceiling, a tree or branch through the roof, a sagging ceiling.
- Ask: is water coming in right now, which room, is it after a storm, roof type if they know.
- Never quote a price or promise insurance will cover it. Never tell anyone to go up on the roof.`;
    case "Pest control":
      return `TRADE — PEST CONTROL
- Common calls: ants, roaches, mice and rats, termites, bed bugs, wasps and bees, wildlife, recurring service.
- Emergency signals: a stinging swarm near people, someone allergic who was stung, an animal inside the living space.
- Ask: which pest, where in the home, how long it's been going on, any pets or small children in the home.
- Never recommend a chemical or treatment and never quote a price.`;
    case "Cleaning":
      return `TRADE — CLEANING
- Common calls: recurring home cleaning, deep cleans, move-in or move-out cleans, office cleaning, carpets.
- Ask: type of clean, home size (bedrooms and bathrooms), how often, the date they want, any pets.
- Never quote a price; the team confirms it after the details.`;
    case "Moving":
      return `TRADE — MOVING
- Common calls: local moves, long-distance moves, packing, a few large items, storage.
- Ask: moving from and to (city or ZIP is enough), the move date, home size, stairs or elevator, any very heavy items.
- Never quote a price or guarantee a date; the team confirms both.`;
    case "Locksmith":
      return `TRADE — LOCKSMITH
- Common calls: locked out of a home or car, lost keys, rekeying, lock changes, broken locks.
- Emergency signals: a child or pet locked inside a car or home, someone locked out in extreme heat or cold.
- Ask: home, car or business; the exact address; are they there now.
- If a child or pet is locked in a car in heat, tell them to call 911 first. Never explain how to open a lock.`;
    case "Garage doors":
      return `TRADE — GARAGE DOORS
- Common calls: door won't open or close, broken spring, off track, opener problems, new door quotes.
- Emergency signals: a car trapped inside, a door stuck open overnight, a door that fell.
- Ask: does it move at all, any loud bang earlier (a broken spring), is a car stuck inside.
- Tell callers not to touch the springs or cables. Never quote a price.`;
    case "Appliance repair":
      return `TRADE — APPLIANCE REPAIR
- Common calls: refrigerator not cooling, washer or dryer not working, dishwasher, oven or range, ice maker.
- Emergency signals: a gas smell from a gas range or dryer, sparks or burning from an appliance, water flooding from a washer.
- Ask: which appliance, the brand if they know, what it's doing, how old it is.
- Never quote a price or promise a part is in stock.`;
    case "Auto repair":
      return `INDUSTRY — AUTO REPAIR
- The customer brings the car in. Book a drop-off time; never ask for a home address unless they need a tow.
- Common calls: check engine light, brakes, oil change, tires, strange noises, won't start, inspections, estimates.
- Ask: year, make and model; what it's doing; is it drivable.
- If the car is broken down on a road, tell them to get somewhere safe first. Never quote a price or diagnose over the phone.`;
    case "Salon & spa":
      return `INDUSTRY — SALON & SPA
- The client comes in. Book an appointment; never ask for a home address.
- Common calls: haircuts and color, nails, lashes and brows, facials, massage, waxing, gift cards, rescheduling.
- Ask: which service, preferred day and time, a preferred stylist if they have one, first visit or returning.
- Never quote a price for color or treatments that depend on a consultation.`;
    case "Dental office":
      return `INDUSTRY — DENTAL OFFICE
- The patient comes in. Book an appointment; never ask for a home address.
- Common calls: cleanings, toothache, broken or chipped tooth, new patients, insurance questions, rescheduling.
- Urgent: severe tooth pain, swelling, a knocked-out tooth, bleeding that won't stop. Mark urgent for a same-day callback.
- If they describe trouble breathing or swallowing, or swelling spreading to the eye or neck, tell them to call 911 or go to the emergency room now.
- Ask: new or existing patient, what's going on, their insurance if they want to share it.
- Never give medical advice or say what a treatment costs. Never ask for health details beyond what's needed to book.`;
    case "Medical office":
      return `INDUSTRY — MEDICAL OFFICE
- The patient comes in. Book an appointment; never ask for a home address.
- Common calls: new patient appointments, sick visits, follow-ups, prescription refill requests, rescheduling, insurance questions.
- If they describe chest pain, trouble breathing, stroke signs, severe bleeding, or thoughts of harming themselves, tell them to call 911 now (or 988 for a mental health crisis) before anything else.
- Ask: new or existing patient, the reason for the visit in a few words, preferred day and time.
- Never give medical advice, never say whether something is serious, and never ask for more health details than the booking needs.`;
    case "Law office":
      return `INDUSTRY — LAW OFFICE
- The client comes in or meets by phone or video. Book a consultation; never ask for a home address.
- Common calls: new cases, consultations, existing clients checking in, court dates, document questions.
- Ask: the kind of matter in a few words, new or existing client, how soon they need to talk, any deadline or court date.
- Never give legal advice or say whether they have a case. Never promise the attorney will take it.`;
    case "Real estate":
      return `INDUSTRY — REAL ESTATE
- Common calls: buyers asking about a listing, sellers wanting a valuation, showing requests, renters, existing clients.
- Ask: buying, selling or renting; which property or area; their timeline; the best time to talk.
- Never say a property is available, quote a price the listing doesn't state, or make promises about an offer.`;
    case "Other business":
      return `INDUSTRY — GENERAL
- Book appointments and take messages for the business. Only ask for an address if the business goes to the customer.
- Ask: what they need in a few words, when suits them, the best way to reach them.
- If something sounds like an emergency or someone is in danger, tell them to call 911.
- Never promise a price, a time or a callback window; the team confirms.`;
  }
}
