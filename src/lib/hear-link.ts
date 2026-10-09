import { TRADES } from "@/lib/trades";

/*
  One link per prospect that opens on "hear Orvius answer as <their business>",
  already filled in. Short query keys because these go out by text.
*/

export const HEAR_BASE = "https://orvius.im";

export function matchTrade(raw: string | null | undefined): string | null {
  const t = raw?.trim().toLowerCase();
  if (!t) return null;
  return TRADES.find((x) => x.toLowerCase() === t) ?? (/(hvac|heat|air|cool)/.test(t) ? "HVAC" : /plumb|drain|sewer/.test(t) ? "Plumbing" : /electric/.test(t) ? "Electrical" : null);
}

/** "Cool Breeze HVAC, LLC" reads as "Cool Breeze HVAC" when spoken and texted. */
export function spokenBusinessName(raw: string) {
  return raw.trim().replace(/[,\s]+(l\.?l\.?c|inc|co|corp|ltd|pllc)\.?$/i, "").trim();
}

export function hearLink(input: { business: string; trade?: string | null; city?: string | null; ref?: string | null }, base = HEAR_BASE) {
  const q = new URLSearchParams({ b: spokenBusinessName(input.business).slice(0, 80) });
  const trade = matchTrade(input.trade);
  if (trade) q.set("t", trade);
  if (input.city?.trim()) q.set("c", input.city.trim().slice(0, 80));
  if (input.ref?.trim()) q.set("r", input.ref.trim().slice(0, 40));
  return `${base}/h?${q.toString()}`;
}
