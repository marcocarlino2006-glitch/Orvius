import { parseEquipment, serializeEquipment } from "@/lib/customer-record";
import type { Trade } from "@/lib/trades";

/**
 * What a caller said about the machine, turned into something the visit can use.
 * A system is a machine the trade services. A brand is a manufacturer the tech
 * orders from. A model is a token they can type into a parts lookup.
 * Anything else is left off, including a price.
 */

type SystemKind = {
  name: string;
  trade: Trade | "either";
  aliases: string[];
};

type BrandKind = {
  name: string;
  trades: readonly Trade[];
  aliases: string[];
  /** Shown instead of "{brand} parts" when the brand changes the visit. */
  parts: string;
};

const SYSTEMS: SystemKind[] = [
  { name: "Tankless water heater", trade: "Plumbing", aliases: ["tankless water heater", "tankless"] },
  { name: "Tank water heater", trade: "Plumbing", aliases: ["tank water heater", "hot water heater", "water heater"] },
  { name: "Sump pump", trade: "Plumbing", aliases: ["sump pump", "sump"] },
  { name: "Water softener", trade: "Plumbing", aliases: ["water softener", "softener"] },
  { name: "Toilet", trade: "Plumbing", aliases: ["toilet"] },
  { name: "Mini-split", trade: "HVAC", aliases: ["mini split", "mini-split", "ductless"] },
  { name: "Central air", trade: "HVAC", aliases: ["central air", "central ac", "central a/c", "air conditioner", "air conditioning", "ac unit", "a/c"] },
  { name: "Heat pump", trade: "HVAC", aliases: ["heat pump", "heatpump"] },
  { name: "Furnace", trade: "HVAC", aliases: ["furnace"] },
  { name: "Air handler", trade: "HVAC", aliases: ["air handler"] },
  { name: "Thermostat", trade: "HVAC", aliases: ["thermostat"] },
  { name: "Boiler", trade: "either", aliases: ["boiler"] },
  { name: "EV charger", trade: "Electrical", aliases: ["ev charger", "car charger", "wall connector"] },
  { name: "Generator", trade: "Electrical", aliases: ["generator", "standby generator"] },
  { name: "Panel", trade: "Electrical", aliases: ["electrical panel", "breaker panel", "breaker box", "service panel", "panel"] },
];

const BRANDS: BrandKind[] = [
  { name: "American Standard", trades: ["HVAC", "Plumbing"], aliases: ["american standard"], parts: "American Standard parts" },
  { name: "A. O. Smith", trades: ["Plumbing"], aliases: ["a. o. smith", "a.o. smith", "ao smith", "a o smith"], parts: "A. O. Smith parts" },
  { name: "Bradford White", trades: ["Plumbing"], aliases: ["bradford white"], parts: "Bradford White parts" },
  { name: "Cutler-Hammer", trades: ["Electrical"], aliases: ["cutler-hammer", "cutler hammer"], parts: "Cutler-Hammer parts" },
  { name: "Federal Pacific", trades: ["Electrical"], aliases: ["federal pacific", "federal pacific electric", "fpe"], parts: "Federal Pacific. Do not add breakers." },
  { name: "ChargePoint", trades: ["Electrical"], aliases: ["chargepoint", "charge point"], parts: "ChargePoint parts" },
  { name: "Square D", trades: ["Electrical"], aliases: ["square d"], parts: "Square D parts" },
  { name: "Mitsubishi", trades: ["HVAC"], aliases: ["mitsubishi"], parts: "Mitsubishi parts" },
  { name: "Carrier", trades: ["HVAC"], aliases: ["carrier"], parts: "Carrier parts" },
  { name: "Trane", trades: ["HVAC"], aliases: ["trane"], parts: "Trane parts" },
  { name: "Lennox", trades: ["HVAC"], aliases: ["lennox"], parts: "Lennox parts" },
  { name: "Goodman", trades: ["HVAC"], aliases: ["goodman"], parts: "Goodman parts" },
  { name: "Amana", trades: ["HVAC"], aliases: ["amana"], parts: "Amana parts" },
  { name: "Rheem", trades: ["HVAC", "Plumbing"], aliases: ["rheem"], parts: "Rheem parts" },
  { name: "Ruud", trades: ["HVAC", "Plumbing"], aliases: ["ruud"], parts: "Ruud parts" },
  { name: "York", trades: ["HVAC"], aliases: ["york"], parts: "York parts" },
  { name: "Bryant", trades: ["HVAC"], aliases: ["bryant"], parts: "Bryant parts" },
  { name: "Daikin", trades: ["HVAC"], aliases: ["daikin"], parts: "Daikin parts" },
  { name: "Fujitsu", trades: ["HVAC"], aliases: ["fujitsu"], parts: "Fujitsu parts" },
  { name: "Bosch", trades: ["HVAC", "Plumbing"], aliases: ["bosch"], parts: "Bosch parts" },
  { name: "Heil", trades: ["HVAC"], aliases: ["heil"], parts: "Heil parts" },
  { name: "Payne", trades: ["HVAC"], aliases: ["payne"], parts: "Payne parts" },
  { name: "Coleman", trades: ["HVAC"], aliases: ["coleman"], parts: "Coleman parts" },
  { name: "Napoleon", trades: ["HVAC"], aliases: ["napoleon"], parts: "Napoleon parts" },
  { name: "Samsung", trades: ["HVAC"], aliases: ["samsung"], parts: "Samsung parts" },
  { name: "Navien", trades: ["Plumbing"], aliases: ["navien"], parts: "Navien parts" },
  { name: "Rinnai", trades: ["Plumbing"], aliases: ["rinnai"], parts: "Rinnai parts" },
  { name: "Noritz", trades: ["Plumbing"], aliases: ["noritz"], parts: "Noritz parts" },
  { name: "Takagi", trades: ["Plumbing"], aliases: ["takagi"], parts: "Takagi parts" },
  { name: "State", trades: ["Plumbing"], aliases: ["state water heater", "state select", "state industries"], parts: "State parts" },
  { name: "Kenmore", trades: ["Plumbing"], aliases: ["kenmore"], parts: "Kenmore parts" },
  { name: "Whirlpool", trades: ["Plumbing"], aliases: ["whirlpool"], parts: "Whirlpool parts" },
  { name: "Kohler", trades: ["Plumbing"], aliases: ["kohler"], parts: "Kohler parts" },
  { name: "Moen", trades: ["Plumbing"], aliases: ["moen"], parts: "Moen parts" },
  { name: "Delta", trades: ["Plumbing"], aliases: ["delta"], parts: "Delta parts" },
  { name: "Siemens", trades: ["Electrical"], aliases: ["siemens"], parts: "Siemens parts" },
  { name: "Eaton", trades: ["Electrical"], aliases: ["eaton"], parts: "Eaton parts" },
  { name: "Leviton", trades: ["Electrical"], aliases: ["leviton"], parts: "Leviton parts" },
  { name: "Murray", trades: ["Electrical"], aliases: ["murray"], parts: "Murray parts" },
  { name: "Generac", trades: ["Electrical"], aliases: ["generac"], parts: "Generac parts" },
  { name: "Tesla", trades: ["Electrical"], aliases: ["tesla"], parts: "Tesla parts" },
  { name: "GE", trades: ["Plumbing", "Electrical"], aliases: ["ge", "general electric"], parts: "GE parts" },
];

const CAPACITY = /\b(gallon|gal|ton|seer|btu|years?|old)\b/i;

/** A short fact the caller said. A bare dollar amount is dropped, because this field is not a price. */
export function spokenEquipmentFact(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (text.length < 2) return undefined;
  if (/^\$?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:dollars|bucks))?$/i.test(text)) return undefined;
  return text;
}

function haystack(value: string) {
  return ` ${value
    .toLowerCase()
    .replace(/a\/c/g, " a/c ")
    .replace(/heatpump/g, "heat pump")
    .replace(/[^a-z0-9/+.&-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function longestAlias(text: string, aliases: string[]) {
  const hay = haystack(text);
  let best: string | null = null;
  for (const alias of aliases) {
    if (!hay.includes(` ${alias} `)) continue;
    if (!best || alias.length > best.length) best = alias;
  }
  return best;
}

function systemFor(text: string, trade: Trade | null) {
  const matches = SYSTEMS.filter((system) => longestAlias(text, system.aliases) && (trade == null || system.trade === "either" || system.trade === trade));
  matches.sort((a, b) => {
    const left = longestAlias(text, a.aliases)?.length ?? 0;
    const right = longestAlias(text, b.aliases)?.length ?? 0;
    return right - left;
  });
  return matches[0] ?? null;
}

function brandFor(text: string, trade: Trade | null) {
  const matches = BRANDS.filter((brand) => longestAlias(text, brand.aliases) && (trade == null || brand.trades.includes(trade)));
  matches.sort((a, b) => {
    const left = longestAlias(text, a.aliases)?.length ?? 0;
    const right = longestAlias(text, b.aliases)?.length ?? 0;
    return right - left;
  });
  return matches[0] ?? null;
}

/** A model number the caller read. Capacity ("50 gallon") and a price are not one. */
export function modelToken(value: unknown, brandName?: string): string | undefined {
  const text = spokenEquipmentFact(value);
  if (!text || CAPACITY.test(text)) return undefined;
  const rest = brandName ? text.replace(new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ") : text;
  const token = rest.toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "");
  const compact = token.replace(/-/g, "");
  if (compact.length < 5 || compact.length > 20) return undefined;
  if (!/[A-Z]/.test(compact) || !/\d/.test(compact)) return undefined;
  return token;
}

export type ResolvedEquipment = {
  systemType?: string;
  equipmentBrand?: string;
  equipmentModel?: string;
  /** What the tech does with the brand. Absent when the brand is just a name. */
  parts?: string;
};

export function resolveEquipment(
  input: {
    systemType?: unknown;
    equipmentBrand?: unknown;
    equipmentModel?: unknown;
  },
  trade: Trade | null = null,
): ResolvedEquipment {
  const systemText = spokenEquipmentFact(input.systemType) ?? "";
  const brandText = spokenEquipmentFact(input.equipmentBrand) ?? "";
  const system = systemText ? systemFor(systemText, trade) : null;
  const brand = brandFor(brandText, trade) ?? (systemText ? brandFor(systemText, trade) : null);
  const model =
    modelToken(input.equipmentModel, brand?.name) ??
    modelToken(brandText, brand?.name) ??
    modelToken(systemText, brand?.name);
  const resolved: ResolvedEquipment = {};
  if (system) resolved.systemType = system.name;
  if (brand) {
    resolved.equipmentBrand = brand.name;
    resolved.parts = brand.parts;
  }
  if (model && model !== brand?.name.toUpperCase().replace(/[^A-Z0-9-]/g, "")) resolved.equipmentModel = model;
  return resolved;
}

export function equipmentLine(input: {
  systemType?: string | null;
  equipmentBrand?: string | null;
  equipmentModel?: string | null;
}): string | null {
  const parts = [input.systemType, input.equipmentBrand, input.equipmentModel].map((part) => part?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** The three facts as the visit should say them. An empty fact is omitted. */
export function equipmentFacts(input: {
  systemType?: string | null;
  equipmentBrand?: string | null;
  equipmentModel?: string | null;
  onFileModel?: string | null;
}): { system: string | null; parts: string | null; lookup: string | null } {
  const resolved = resolveEquipment(input);
  const system = resolved.systemType ?? null;
  const parts =
    resolved.parts && resolved.parts !== `${resolved.equipmentBrand} parts`
      ? resolved.parts
      : (resolved.equipmentBrand ?? null);
  const model = resolved.equipmentModel ?? null;
  const onFile = !model ? modelToken(input.onFileModel) : undefined;
  const lookup = model ? `Look up ${model}` : onFile ? `On file ${onFile}` : null;
  return { system, parts, lookup };
}

/**
 * Keep this machine on the customer. A later call fills a blank brand or model
 * and never erases one already written down. Returns null when nothing changed.
 */
export function rememberEquipment(raw: string | null | undefined, equipment: ResolvedEquipment): string | null {
  if (!equipment.systemType) return null;
  const rows = parseEquipment(raw);
  const index = rows.findIndex((row) => row.name.toLowerCase() === equipment.systemType!.toLowerCase());
  if (index < 0) {
    if (rows.length >= 20) return null;
    rows.push({
      name: equipment.systemType,
      brand: equipment.equipmentBrand ?? "",
      model: equipment.equipmentModel ?? "",
      notes: equipment.parts && equipment.parts !== `${equipment.equipmentBrand} parts` ? equipment.parts : "",
    });
    return serializeEquipment(rows);
  }
  const row = rows[index]!;
  const next = {
    ...row,
    brand: equipment.equipmentBrand || row.brand,
    model: equipment.equipmentModel || row.model,
    notes: row.notes || (equipment.parts && equipment.parts !== `${equipment.equipmentBrand} parts` ? equipment.parts : ""),
  };
  if (next.brand === row.brand && next.model === row.model && next.notes === row.notes) return null;
  rows[index] = next;
  return serializeEquipment(rows);
}

/** The model already written on this customer for the system this call named. */
export function modelOnFile(raw: string | null | undefined, systemType: string | null | undefined): string | null {
  if (!systemType) return null;
  const row = parseEquipment(raw).find((item) => item.name.toLowerCase() === systemType.toLowerCase());
  return row?.model || null;
}
