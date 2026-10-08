import { prisma } from "@/lib/prisma";
import { DEFAULT_ASK_DAILY_LIMIT } from "@/lib/usage-limits";

export type ModelUsageKind = "ask";

/** List price per million tokens, in micros of a dollar. Unknown models are priced as the dearest one we use. */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 3_000_000, output: 15_000_000 },
  "gpt-4o-mini": { input: 150_000, output: 600_000 },
};
const FALLBACK_PRICE = PRICE_PER_MTOK["claude-sonnet-4-5"];
/** When a provider reports no token counts: a full context packet and a capped answer on the dearest model. */
export const UNMETERED_CALL_MICROS = 15_000;


export function askModelDailyLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.ORVIUS_ASK_MODEL_DAILY_LIMIT);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_ASK_DAILY_LIMIT;
}

export const usageDay = (now: Date) => now.toISOString().slice(0, 10);

export function modelCallMicros(model: string, tokens: { input?: number; output?: number } | null): number {
  if (!tokens || (tokens.input == null && tokens.output == null)) return UNMETERED_CALL_MICROS;
  const price = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  return Math.round(((tokens.input ?? 0) * price.input + (tokens.output ?? 0) * price.output) / 1_000_000);
}

/**
 * Take one of today's model calls for this shop, atomically, so a burst of
 * questions cannot all slip under the cap. False when the cap is reached or the
 * meter cannot be written: an unmetered model call is the spend this exists to stop.
 */
export async function claimModelCall(params: { businessId: string; kind: ModelUsageKind; limit: number; now?: Date }): Promise<boolean> {
  if (params.limit <= 0) return false;
  const day = usageDay(params.now ?? new Date());
  try {
    const rows = await prisma.$queryRaw<Array<{ calls: number | bigint }>>`
      INSERT INTO "ModelUsage" ("businessId", "day", "kind", "calls", "micros") VALUES (${params.businessId}, ${day}, ${params.kind}, 1, 0)
      ON CONFLICT("businessId", "day", "kind") DO UPDATE SET "calls" = "ModelUsage"."calls" + 1
      WHERE "ModelUsage"."calls" < ${params.limit}
      RETURNING "calls"`;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function recordModelCost(params: { businessId: string; kind: ModelUsageKind; micros: number; now?: Date }): Promise<void> {
  const day = usageDay(params.now ?? new Date());
  await prisma.modelUsage
    .updateMany({ where: { businessId: params.businessId, day, kind: params.kind }, data: { micros: { increment: Math.max(0, params.micros) } } })
    .catch(() => {});
}

/** Model spend on real shops since a date, in micros. */
export async function productionModelMicrosSince(since: Date): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ micros: number | bigint | null }>>`
    SELECT SUM(u."micros") AS micros FROM "ModelUsage" u
    JOIN "Business" b ON b."id" = u."businessId"
    WHERE u."day" >= ${usageDay(since)} AND b."environment" = 'production'`;
  return Number(rows[0]?.micros ?? 0);
}
