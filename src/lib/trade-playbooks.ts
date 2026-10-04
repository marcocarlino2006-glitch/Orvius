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
    { key: "no_cooling", label: "No cooling / AC repair", durationMin: 120, skill: "cooling", keywords: [/\b(no|not) (cool|cooling|ac|a\/c)\b/, /\bac\b.*\b(out|down|broken|not working)\b/, /air condition/, /\bcooling\b/, /aire acondicionado/, /no enfr[ií]a/] },
    { key: "no_heat", label: "No heat / furnace repair", durationMin: 120, skill: "heating", keywords: [/\bno heat\b/, /furnace/, /heat pump/, /\bheating\b/, /boiler/, /calefacci[oó]n/, /\bcaldera\b/, /\bsin calor\b/] },
    { key: "tune_up", label: "Maintenance tune-up", durationMin: 60, skill: "maintenance", keywords: [/tune[- ]?up/, /maintenance/, /\bservice (visit|check)\b/, /filter/] },
    { key: "thermostat", label: "Thermostat issue", durationMin: 60, skill: "controls", keywords: [/thermostat/] },
    { key: "system_quote", label: "New system estimate", durationMin: 90, skill: "sales", keywords: [/new (system|unit|ac|furnace)/, /replace(ment)?/, /quote/, /estimate/] },
  ],
  fallback: { key: "hvac_diagnostic", label: "HVAC diagnostic", durationMin: 120, skill: "general", keywords: [] },
  safety: [
    { key: "gas_smell", label: "Gas smell", instruction: "Tell the caller to leave the home and call the gas utility or 911. Call them back now.", keywords: [/smell(s|ing|ed)? (like |of )?(natural )?gas/, /gas (smell|leak)/, /(huele|olor) a gas/, /fuga de gas/] },
    { key: "carbon_monoxide", label: "Carbon monoxide alarm", instruction: "Tell the caller to get outside and call 911. Call them back now.", keywords: [/carbon monoxide/, /\bco (alarm|detector)\b/, /mon[oó]xido de carbono/] },
    { key: "burning_unit", label: "Burning smell or smoke from the unit", instruction: "Tell the caller to shut the system off at the breaker. Call them back now.", keywords: [/(burning|smoke|smoking).{0,20}(unit|furnace|system|vent)/, /(unit|furnace).{0,20}(burning|smoke)/] },
  ],
  emergency: [
    /\bno heat\b.*\b(freez|cold|baby|infant|elderly)/,
    /\b(freez|baby|infant|elderly)\w*\b.{0,80}\bno heat\b/,
    /water (leaking|pouring|gushing) from (the )?(indoor|air handler)/,
    /(sin|no (tengo|hay)) calefacci[oó]n.{0,80}(beb[eé]|fr[ií]o|congel|anciano|mayor)/,
    /(beb[eé]|anciano|congel).{0,80}(sin|no (tengo|hay)) calefacci[oó]n/,
    /\b(no (ac|a\/c|cooling)|(ac|a\/c|air conditioner) (died|is dead|is out|quit|stopped))\b.{0,80}\b(baby|infant|elderly|oxygen|heat ?stroke)/,
  ],
  sameDay: [
    /\b(ac|a\/c|air conditioner|air conditioning)\b.{0,20}\b(died|dead|out|quit|stopped|not working|broke)/,
    /\b(9[0-9]|1[01][0-9])\s*(degrees|in here|inside|in the house)\b/,
    /sin aire( acondicionado)?/,
    /\bno (heat|cooling|ac|a\/c)\b/, /\basap\b/, /\btoday\b/, /\burgent\b/, /(sin|no (tengo|hay)) calefacci[oó]n/, /\burgente\b/, /\bhoy\b/],
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
    { key: "gas_smell", label: "Gas smell near a gas appliance", instruction: "Tell the caller to leave the home and call the gas utility or 911. Call them back now.", keywords: [/smell(s|ing|ed)? (like |of )?(natural )?gas/, /gas (smell|leak)/, /(huele|olor) a gas/, /fuga de gas/] },
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
    { key: "sparking", label: "Sparking, burning smell, or smoke", instruction: "Tell the caller to shut off the main breaker if it is safe and call 911 if there is fire. Call them back now.", keywords: [/spark/, /burning smell/, /smell(s|ing)? (like )?burning/, /smok(e|ing)/, /electrical fire/, /chispa/, /\bhumo\b/, /olor a quemado/] },
    { key: "shock", label: "Someone was shocked", instruction: "If anyone is hurt, the caller should call 911. Call them back now.", keywords: [/(got|was|been) shocked/, /electrocut/] },
    { key: "exposed_wires", label: "Exposed or hot wires", instruction: "Tell the caller to keep everyone away and shut off the breaker. Call them back now.", keywords: [/exposed wire/, /wires? (hanging|exposed|hot)/, /downed (power )?line/] },
  ],
  emergency: [/no power/, /power (is )?out/],
  sameDay: [/breaker/, /\basap\b/, /\btoday\b/, /\burgent\b/],
};

const GAS_SMELL: SafetyRule = {
  key: "gas_smell",
  label: "Gas smell",
  instruction: "Tell the caller to leave the home and call the gas utility or 911. Call them back now.",
  keywords: [/smell(s|ing|ed)? (like |of )?(natural )?gas/, /gas (smell|leak)/, /(huele|olor) a gas/, /fuga de gas/],
};

const MEDICAL_EMERGENCY: SafetyRule = {
  key: "medical_emergency",
  label: "Medical emergency described",
  instruction: "The caller was told to call 911. Call them back now to make sure they got help.",
  keywords: [
    /chest pains?/,
    /(can'?t|cannot|trouble|difficulty|hard to) breath/,
    /having a stroke|stroke (signs|symptoms)/,
    /(passed|passing) out|unconscious|not breathing/,
    /suicid|kill myself|(hurt|harm) myself/,
    /dolor (de|en el) pecho/,
    /no (puedo|puede) respirar/,
  ],
};

const general = (key: string, label: string, durationMin: number): PlaybookService => ({
  key,
  label,
  durationMin,
  skill: "general",
  keywords: [],
});

const ROOFING: TradePlaybook = {
  trade: "Roofing",
  services: [
    { key: "roof_leak", label: "Roof leak", durationMin: 90, skill: "repair", keywords: [/leak/, /water (coming|dripping) (in|through)/, /ceiling (stain|drip)/] },
    { key: "storm_damage", label: "Storm damage inspection", durationMin: 90, skill: "inspection", keywords: [/storm/, /hail/, /wind/, /tree (fell|on)/, /missing shingles?/] },
    { key: "gutters", label: "Gutters", durationMin: 60, skill: "gutters", keywords: [/gutter/] },
    { key: "roof_quote", label: "Roof replacement estimate", durationMin: 60, skill: "sales", keywords: [/new roof/, /replace(ment)?/, /quote/, /estimate/] },
  ],
  fallback: general("roof_inspection", "Roof inspection", 60),
  safety: [
    { key: "roof_collapse", label: "Ceiling sagging or something through the roof", instruction: "Tell the caller to keep everyone out of that room. Call them back now.", keywords: [/ceiling (is )?(sagging|falling|caving|collaps)/, /(tree|branch|limb) (through|in) the (roof|ceiling)/] },
  ],
  emergency: [/water (coming|pouring|dripping) (in|through)/, /through the (roof|ceiling)/],
  sameDay: [/\bleak/, /storm/, /\basap\b/, /\btoday\b/, /\burgent\b/],
};

const PEST_CONTROL: TradePlaybook = {
  trade: "Pest control",
  services: [
    { key: "termites", label: "Termite inspection", durationMin: 60, skill: "termites", keywords: [/termite/, /wood (damage|eating)/] },
    { key: "rodents", label: "Rodents", durationMin: 60, skill: "rodents", keywords: [/\bmice\b/, /\bmouse\b/, /\brats?\b/, /rodent/] },
    { key: "bed_bugs", label: "Bed bugs", durationMin: 90, skill: "bed_bugs", keywords: [/bed ?bugs?/] },
    { key: "stinging", label: "Wasps and bees", durationMin: 60, skill: "general", keywords: [/wasp/, /\bbees?\b/, /hornet/, /yellow ?jacket/] },
    { key: "general_pest", label: "General pest treatment", durationMin: 60, skill: "general", keywords: [/\bants?\b/, /roach/, /spider/, /pest/] },
  ],
  fallback: general("pest_inspection", "Pest inspection", 60),
  safety: [
    { key: "allergic_sting", label: "Someone stung with an allergic reaction", instruction: "The caller was told to call 911 if there's swelling or trouble breathing. Call them back now.", keywords: [/(allergic|swelling).{0,30}sting|sting.{0,30}(allergic|swelling)/] },
  ],
  emergency: [/swarm/, /\b(in|inside) the (house|bedroom|living room)\b.{0,30}(snake|raccoon|bat)/],
  sameDay: [/wasp/, /hornet/, /\basap\b/, /\btoday\b/, /\burgent\b/],
};

const CLEANING: TradePlaybook = {
  trade: "Cleaning",
  services: [
    { key: "deep_clean", label: "Deep clean", durationMin: 240, skill: "general", keywords: [/deep clean/, /spring clean/] },
    { key: "move_clean", label: "Move-in or move-out clean", durationMin: 240, skill: "general", keywords: [/move[- ](in|out)/, /moving out/, /end of lease/] },
    { key: "recurring_clean", label: "Recurring cleaning", durationMin: 180, skill: "general", keywords: [/weekly/, /every (other )?week/, /bi-?weekly/, /monthly/, /recurring/] },
    { key: "office_clean", label: "Office cleaning", durationMin: 180, skill: "commercial", keywords: [/office/, /commercial/, /janitorial/] },
  ],
  fallback: general("standard_clean", "Standard cleaning", 180),
  safety: [],
  emergency: [],
  sameDay: [/\btoday\b/, /\basap\b/, /\burgent\b/],
};

const MOVING: TradePlaybook = {
  trade: "Moving",
  services: [
    { key: "local_move", label: "Local move", durationMin: 240, skill: "general", keywords: [/local/, /across town/, /same city/] },
    { key: "long_distance", label: "Long-distance move", durationMin: 480, skill: "long_distance", keywords: [/long[- ]distance/, /out of state/, /cross[- ]country/] },
    { key: "packing", label: "Packing", durationMin: 240, skill: "packing", keywords: [/pack(ing)?\b/] },
    { key: "few_items", label: "A few large items", durationMin: 120, skill: "general", keywords: [/piano/, /couch/, /sofa/, /a few (items|things)/, /single item/] },
  ],
  fallback: general("move_estimate", "Moving estimate", 30),
  safety: [],
  emergency: [],
  sameDay: [/\btoday\b/, /\btomorrow\b/, /\basap\b/, /\burgent\b/],
};

const LOCKSMITH: TradePlaybook = {
  trade: "Locksmith",
  services: [
    { key: "lockout_home", label: "Home lockout", durationMin: 45, skill: "lockout", keywords: [/lock(ed)? (myself )?out/, /can'?t get (in|inside)/, /lost (my )?keys?/] },
    { key: "lockout_car", label: "Car lockout", durationMin: 45, skill: "automotive", keywords: [/(car|truck|vehicle).{0,20}(lock|keys)/, /keys? (in|inside) the (car|truck)/] },
    { key: "rekey", label: "Rekey or lock change", durationMin: 60, skill: "residential", keywords: [/rekey/, /change (the |my )?locks?/, /new locks?/] },
    { key: "commercial_lock", label: "Business locks", durationMin: 90, skill: "commercial", keywords: [/business/, /office/, /store/, /commercial/] },
  ],
  fallback: general("locksmith_visit", "Locksmith visit", 60),
  safety: [
    { key: "locked_in_car", label: "Child or pet locked in a car", instruction: "The caller was told to call 911 first. Call them back now.", keywords: [/(baby|child|kid|toddler|infant|dog|cat|pet).{0,40}(locked|stuck|inside).{0,20}(car|truck|vehicle)/, /(locked|stuck).{0,20}(car|truck|vehicle).{0,40}(baby|child|kid|toddler|infant|dog|cat|pet)/] },
  ],
  emergency: [/lock(ed)? (myself )?out/, /can'?t get (in|inside)/],
  sameDay: [/lost (my )?keys?/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const GARAGE_DOORS: TradePlaybook = {
  trade: "Garage doors",
  services: [
    { key: "broken_spring", label: "Broken spring", durationMin: 90, skill: "springs", keywords: [/spring/, /loud bang/] },
    { key: "off_track", label: "Door off track", durationMin: 90, skill: "repair", keywords: [/off (the )?track/, /crooked/, /cable/] },
    { key: "opener", label: "Opener repair", durationMin: 60, skill: "openers", keywords: [/opener/, /remote/, /keypad/, /motor/] },
    { key: "new_door", label: "New door estimate", durationMin: 60, skill: "sales", keywords: [/new (garage )?door/, /replace(ment)?/, /quote/, /estimate/] },
  ],
  fallback: general("garage_door_repair", "Garage door repair", 90),
  safety: [],
  emergency: [/car (is )?(stuck|trapped)/, /(stuck|won'?t close) open/, /door (fell|came down)/],
  sameDay: [/won'?t (open|close)/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const APPLIANCE_REPAIR: TradePlaybook = {
  trade: "Appliance repair",
  services: [
    { key: "refrigerator", label: "Refrigerator repair", durationMin: 90, skill: "refrigeration", keywords: [/fridge/, /refrigerator/, /freezer/, /ice maker/] },
    { key: "laundry", label: "Washer or dryer repair", durationMin: 90, skill: "laundry", keywords: [/washer/, /washing machine/, /dryer/] },
    { key: "dishwasher", label: "Dishwasher repair", durationMin: 60, skill: "general", keywords: [/dishwasher/] },
    { key: "cooking", label: "Oven or range repair", durationMin: 90, skill: "cooking", keywords: [/oven/, /stove/, /range/, /cooktop/, /microwave/] },
  ],
  fallback: general("appliance_diagnostic", "Appliance diagnostic", 60),
  safety: [
    GAS_SMELL,
    { key: "appliance_fire", label: "Sparks, smoke or burning from an appliance", instruction: "Tell the caller to unplug it or shut off the breaker if it's safe, and call 911 if there is fire. Call them back now.", keywords: [/spark/, /smok(e|ing)/, /(burning|melting) smell/, /on fire/] },
  ],
  emergency: [/(washer|dishwasher).{0,30}(flood|leak|water everywhere)/],
  sameDay: [/(fridge|refrigerator|freezer).{0,30}(not cooling|warm|stopped|died)/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const AUTO_REPAIR: TradePlaybook = {
  trade: "Auto repair",
  services: [
    { key: "check_engine", label: "Check engine light diagnostic", durationMin: 60, skill: "diagnostics", keywords: [/check engine/, /engine light/, /warning light/] },
    { key: "brakes", label: "Brake service", durationMin: 90, skill: "brakes", keywords: [/brake/, /squeal/, /grinding/] },
    { key: "oil_change", label: "Oil change", durationMin: 30, skill: "maintenance", keywords: [/oil change/, /\boil\b/] },
    { key: "tires", label: "Tires", durationMin: 60, skill: "tires", keywords: [/\btires?\b/, /flat/, /alignment/, /rotation/] },
    { key: "no_start", label: "Car won't start", durationMin: 90, skill: "diagnostics", keywords: [/won'?t start/, /dead battery/, /battery/] },
  ],
  fallback: general("auto_inspection", "Vehicle inspection", 60),
  safety: [
    { key: "roadside_danger", label: "Broken down in traffic", instruction: "The caller was told to get somewhere safe and call 911 if they're in danger. Call them back now.", keywords: [/(broke|broken) down (on|in) the (highway|freeway|interstate|road)/, /stuck (on|in) the (highway|freeway|interstate)/] },
  ],
  emergency: [],
  sameDay: [/won'?t start/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const SALON_SPA: TradePlaybook = {
  trade: "Salon & spa",
  services: [
    { key: "haircut", label: "Haircut", durationMin: 45, skill: "hair", keywords: [/haircut/, /\btrim\b/, /\bcut\b/, /blow ?out/] },
    { key: "color", label: "Hair color", durationMin: 120, skill: "color", keywords: [/colou?r/, /highlight/, /balayage/, /\bdye\b/, /roots/] },
    { key: "nails", label: "Nails", durationMin: 60, skill: "nails", keywords: [/nail/, /mani/, /pedi/, /gel/] },
    { key: "lashes_brows", label: "Lashes and brows", durationMin: 60, skill: "lashes", keywords: [/lash/, /brow/, /wax/] },
    { key: "massage_facial", label: "Massage or facial", durationMin: 60, skill: "spa", keywords: [/massage/, /facial/, /\bspa\b/] },
  ],
  fallback: general("salon_appointment", "Appointment", 60),
  safety: [],
  emergency: [],
  sameDay: [/\btoday\b/, /\basap\b/, /\bthis afternoon\b/],
};

const DENTAL_OFFICE: TradePlaybook = {
  trade: "Dental office",
  services: [
    { key: "cleaning", label: "Cleaning and checkup", durationMin: 60, skill: "hygiene", keywords: [/cleaning/, /check ?up/, /exam/] },
    { key: "tooth_pain", label: "Tooth pain visit", durationMin: 45, skill: "general", keywords: [/tooth ?ache/, /tooth (pain|hurts)/, /pain/, /swell/] },
    { key: "broken_tooth", label: "Broken or chipped tooth", durationMin: 45, skill: "general", keywords: [/(broke|broken|chipped|cracked) (a |my )?tooth/, /knocked out/, /crown (fell|came) off/] },
    { key: "new_patient", label: "New patient visit", durationMin: 60, skill: "general", keywords: [/new patient/, /first (visit|appointment)/] },
  ],
  fallback: general("dental_visit", "Dental appointment", 45),
  safety: [
    MEDICAL_EMERGENCY,
    { key: "spreading_swelling", label: "Swelling spreading or trouble swallowing", instruction: "The caller was told to go to the emergency room or call 911. Call them back now.", keywords: [/swell(ing)? .{0,30}(eye|neck|throat)/, /(can'?t|trouble|hard to) swallow/] },
  ],
  emergency: [/knocked out/, /(severe|unbearable|terrible) (tooth )?pain/, /bleeding (won'?t|that won'?t) stop/],
  sameDay: [/tooth ?ache/, /pain/, /swell/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const MEDICAL_OFFICE: TradePlaybook = {
  trade: "Medical office",
  services: [
    { key: "sick_visit", label: "Sick visit", durationMin: 30, skill: "general", keywords: [/sick/, /fever/, /cough/, /sore throat/, /flu/, /\bcold\b/] },
    { key: "physical", label: "Physical or checkup", durationMin: 45, skill: "general", keywords: [/physical/, /check ?up/, /annual/, /wellness/] },
    { key: "follow_up", label: "Follow-up visit", durationMin: 30, skill: "general", keywords: [/follow[- ]?up/, /results/] },
    { key: "refill", label: "Prescription refill request", durationMin: 15, skill: "general", keywords: [/refill/, /prescription/, /medication/] },
    { key: "new_patient", label: "New patient visit", durationMin: 60, skill: "general", keywords: [/new patient/, /first (visit|appointment)/] },
  ],
  fallback: general("office_visit", "Office visit", 30),
  safety: [MEDICAL_EMERGENCY],
  emergency: [],
  sameDay: [/fever/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const LAW_OFFICE: TradePlaybook = {
  trade: "Law office",
  services: [
    { key: "consultation", label: "New client consultation", durationMin: 30, skill: "intake", keywords: [/consult/, /new (case|client)/, /need a lawyer/, /need an attorney/] },
    { key: "existing_client", label: "Existing client callback", durationMin: 15, skill: "general", keywords: [/my (case|attorney|lawyer)/, /existing client/, /update on/] },
    { key: "court_date", label: "Court date or deadline", durationMin: 15, skill: "general", keywords: [/court/, /hearing/, /deadline/, /served/, /summons/] },
  ],
  fallback: general("law_consultation", "Consultation", 30),
  safety: [],
  emergency: [/arrested/, /in (jail|custody)/, /court (is )?(today|tomorrow)/],
  sameDay: [/deadline/, /served/, /\btoday\b/, /\basap\b/, /\burgent\b/],
};

const REAL_ESTATE: TradePlaybook = {
  trade: "Real estate",
  services: [
    { key: "showing", label: "Showing request", durationMin: 30, skill: "general", keywords: [/showing/, /see the (house|home|property|place)/, /tour/, /open house/] },
    { key: "valuation", label: "Home valuation", durationMin: 60, skill: "listing", keywords: [/sell/, /valuation/, /what.{0,20}worth/, /list(ing)? my/] },
    { key: "buyer_consult", label: "Buyer consultation", durationMin: 30, skill: "buyers", keywords: [/buy/, /looking for a (house|home)/, /pre-?approv/] },
    { key: "rental", label: "Rental inquiry", durationMin: 15, skill: "rentals", keywords: [/rent/, /lease/, /apartment/] },
  ],
  fallback: general("agent_callback", "Agent callback", 15),
  safety: [],
  emergency: [],
  sameDay: [/\btoday\b/, /\basap\b/],
};

const OTHER_BUSINESS: TradePlaybook = {
  trade: "Other business",
  services: [],
  fallback: general("appointment", "Appointment", 60),
  safety: [],
  emergency: [],
  sameDay: [/\btoday\b/, /\basap\b/, /\burgent\b/],
};

export const TRADE_PLAYBOOKS: Record<Trade, TradePlaybook> = {
  HVAC,
  Plumbing: PLUMBING,
  Electrical: ELECTRICAL,
  Roofing: ROOFING,
  "Pest control": PEST_CONTROL,
  Cleaning: CLEANING,
  Moving: MOVING,
  Locksmith: LOCKSMITH,
  "Garage doors": GARAGE_DOORS,
  "Appliance repair": APPLIANCE_REPAIR,
  "Auto repair": AUTO_REPAIR,
  "Salon & spa": SALON_SPA,
  "Dental office": DENTAL_OFFICE,
  "Medical office": MEDICAL_OFFICE,
  "Law office": LAW_OFFICE,
  "Real estate": REAL_ESTATE,
  "Other business": OTHER_BUSINESS,
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

export function normalizeUrgency(value: string | null | undefined): RequestUrgency | null {
  const key = value?.toLowerCase().replace(/[\s_]+/g, "-") ?? "";
  if (key.includes("emergency") || key.includes("emergencia")) return "emergency";
  if (
    key.includes("same-day") ||
    /\b(today|urgent|urgente|asap|immediately|right-away|now)\b/.test(key)
  )
    return "same-day";
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
  /** What the caller said on the call, without the receptionist's lines. */
  callerWords?: string | null;
  urgency?: string | null;
}): RequestClassification {
  const trade = resolveTrade(input.business);
  const text = [input.serviceType, input.notes, input.summary, input.callerWords]
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
