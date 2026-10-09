import type { ValueVerdict } from "@/lib/value-check";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const rate = (value: number | null) => (value == null ? "—" : `${value}%`);

export type Revenue = {
  /** Monthly recurring revenue at each paying shop's plan list price. */
  mrrCents: number;
  byPlan: Array<{ planId: string; shops: number; mrrCents: number }>;
  /** Last 30 days of calls at the measured cost per call, plus each shop's fixed monthly costs. */
  costCents: number | null;
  /** (MRR − cost) / MRR, 0–100; null until calls report a cost and someone pays. */
  grossMarginPct: number | null;
};

export function revenueLines(revenue: Revenue | undefined): string[] {
  if (!revenue) return [];
  const plans = revenue.byPlan.map((p) => `${p.planId} ${p.shops}`).join(" · ") || "none";
  return [
    `Monthly recurring revenue: ${money(revenue.mrrCents)} at list price (ARR ${money(revenue.mrrCents * 12)}) · shops by plan: ${plans}`,
    revenue.costCents == null
      ? "Gross margin: not measurable until calls report a cost"
      : `Gross margin, 30 days: ${rate(revenue.grossMarginPct)} (${money(revenue.costCents)} of calls, texts, numbers and card fees against ${money(revenue.mrrCents)})`,
  ];
}

export function valueLines(atRisk: ValueVerdict[]): string[] {
  if (!atRisk.length) return ["Shops getting less than they pay for: none"];
  return [
    `Shops getting less than they pay for, 30 days: ${atRisk.length}`,
    ...atRisk.slice(0, 10).map((v) => `  - ${v.name}: ${v.reason}`),
    ...(atRisk.length > 10 ? [`  - and ${atRisk.length - 10} more on the board`] : []),
  ];
}
