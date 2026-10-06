import type { UnitEconomics } from "@/lib/call-cost";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const cents = (value: number) => (Math.abs(value) >= 100 ? money(value) : `${value}¢`);

/** Cost per call against what each plan charges, so price follows cost and not the other way round. */
export function unitCostLines(unit: UnitEconomics | null): string[] {
  if (!unit) return ["Cost per call: no call has reported a cost yet"];
  return [
    `Cost per call: ${cents(unit.costPerCallCents)} (${cents(unit.costPerMinuteCents)}/min, phone leg estimated, ${unit.textsPerCall} texts a call) over ${unit.calls} calls · biggest part: ${unit.biggestStage ?? "—"}`,
    `Overage margin: ${cents(unit.overageMarginCents)} a call${unit.overageMarginCents < 0 ? " — overage is priced below cost" : ""}`,
    `Gross margin if a shop uses every included call (number and card fee included): ${unit.plans.map((p) => `${p.name} ${p.marginAtAllowancePct}%`).join(" · ")}`,
  ];
}
