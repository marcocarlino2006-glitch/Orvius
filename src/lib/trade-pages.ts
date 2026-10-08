import { parseJson, type ServiceOffering } from "@/lib/business";
import { servicesForTrade } from "@/lib/provision-business";
import { tradePromptPack, type Trade } from "@/lib/trades";

/*
  One public page per home-service trade, written from the same trade pack the
  receptionist runs on, so the page describes what the line does and nothing
  it doesn't. Home services only: they are the wedge, and a page per city
  would be the thin, duplicate kind search engines demote.
*/

export const TRADE_PAGES: ReadonlyArray<{ slug: string; trade: Trade; noun: string }> = [
  { slug: "hvac", trade: "HVAC", noun: "HVAC" },
  { slug: "plumbing", trade: "Plumbing", noun: "plumbing" },
  { slug: "electrical", trade: "Electrical", noun: "electrical" },
];

const packLine = (pack: string, label: string) =>
  pack
    .split("\n")
    .find((line) => line.startsWith(`- ${label}:`))
    ?.slice(label.length + 3)
    .replace(/\.$/, "")
    .split(/,\s*|\s+—\s+/)
    .map((s) => s.trim())
    .filter(Boolean) ?? [];

export function tradePage(slug: string) {
  const entry = TRADE_PAGES.find((p) => p.slug === slug);
  if (!entry) return null;
  const pack = tradePromptPack(entry.trade);
  return {
    ...entry,
    article: /^(hvac|[aeiou])/i.test(entry.noun) ? "an" : "a",
    commonCalls: packLine(pack, "Common calls"),
    urgentSignals: packLine(pack, "Emergency signals"),
    services: parseJson<ServiceOffering[]>(servicesForTrade(entry.trade), []).map((s) => s.name),
  };
}
