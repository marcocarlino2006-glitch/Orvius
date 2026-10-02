import { OVERAGE_CENTS_PER_CALL, pricingPlans } from "@/lib/pricing-plans";
import { prisma } from "@/lib/prisma";

/*
  What a call actually costs us, so price is set against unit cost instead of
  against competitors' price pages.

  Vapi reports its own charge on every end-of-call report (speech-to-text,
  model, voice, its platform fee). The phone leg is billed by Twilio on our
  numbers and is not in that figure, so it is added as an estimate at Twilio's
  inbound local rate and always labelled as one.
*/

/** Twilio inbound to a US local number, per minute (list price). */
export const PHONE_MICROS_PER_MIN = 8_500;

export type CostBreakdown = { stt?: number; llm?: number; tts?: number; vapi?: number; transport?: number };

type CostReport = { cost?: number | null; costBreakdown?: (CostBreakdown & { total?: number }) | null };

const usdToMicros = (usd: unknown) =>
  typeof usd === "number" && Number.isFinite(usd) && usd >= 0 && usd < 1_000 ? Math.round(usd * 1_000_000) : null;

/** Columns for the Call row, or nothing when the report carries no cost. */
export function costColumns(message: CostReport) {
  const micros = usdToMicros(message.cost ?? message.costBreakdown?.total);
  if (micros == null) return {};
  const parts: Record<string, number> = {};
  for (const key of ["stt", "llm", "tts", "vapi", "transport"] as const) {
    const v = usdToMicros(message.costBreakdown?.[key]);
    if (v != null) parts[key] = v;
  }
  return { costMicros: micros, costJson: Object.keys(parts).length ? JSON.stringify(parts) : null };
}

export type UnitEconomics = {
  calls: number;
  /** Mean all-in cost per call (Vapi reported + phone estimate), in cents with one decimal. */
  costPerCallCents: number;
  costPerMinuteCents: number;
  /** Which part of Vapi's charge is largest, e.g. "llm". */
  biggestStage: string | null;
  overageMarginCents: number;
  plans: Array<{ id: string; name: string; priceCents: number; includedCalls: number; marginAtAllowancePct: number }>;
};

const tenth = (n: number) => Math.round(n * 10) / 10;

/** Pure: unit economics from per-call costs and durations. */
export function unitEconomics(
  calls: Array<{ costMicros: number; durationSec: number | null; costJson: string | null }>,
): UnitEconomics | null {
  if (!calls.length) return null;
  let micros = 0;
  let seconds = 0;
  const stages: Record<string, number> = {};
  for (const call of calls) {
    const sec = Math.max(0, call.durationSec ?? 0);
    seconds += sec;
    micros += call.costMicros + Math.round((sec / 60) * PHONE_MICROS_PER_MIN);
    try {
      for (const [k, v] of Object.entries(JSON.parse(call.costJson ?? "{}") as Record<string, number>)) {
        if (typeof v === "number") stages[k] = (stages[k] ?? 0) + v;
      }
    } catch {
      /* A malformed breakdown still has its total counted above. */
    }
  }
  const perCallCents = micros / calls.length / 10_000;
  const biggestStage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    calls: calls.length,
    costPerCallCents: tenth(perCallCents),
    costPerMinuteCents: seconds ? tenth(micros / (seconds / 60) / 10_000) : 0,
    biggestStage,
    overageMarginCents: tenth(OVERAGE_CENTS_PER_CALL - perCallCents),
    plans: pricingPlans.filter((p) => p.price > 0 && p.includedCalls && !p.contactSales).map((p) => {
      const priceCents = p.price * 100;
      const cost = p.includedCalls! * perCallCents;
      return {
        id: p.id,
        name: p.name,
        priceCents,
        includedCalls: p.includedCalls!,
        marginAtAllowancePct: Math.round(((priceCents - cost) / priceCents) * 100),
      };
    }),
  };
}

/** Real shops' calls since a date that carry a reported cost. */
export async function unitEconomicsSince(since: Date) {
  const calls = await prisma.call.findMany({
    where: { createdAt: { gte: since }, costMicros: { not: null }, business: { environment: "production" } },
    select: { costMicros: true, durationSec: true, costJson: true },
    take: 5_000,
    orderBy: { createdAt: "desc" },
  });
  return unitEconomics(calls.map((c) => ({ ...c, costMicros: c.costMicros! })));
}
