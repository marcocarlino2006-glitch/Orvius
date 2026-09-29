import { prisma } from "@/lib/prisma";

/*
  How long callers wait for the receptionist, from the timing Vapi reports on
  every call. A turn is the end of the caller's speech to the receptionist's
  first audio, and Vapi splits it into the stages below, which is what says
  where a slow reply comes from: waiting to be sure the caller finished
  (endpointing), transcription, the model's first token, or the voice's first
  audio. Stored per call so real traffic, not only the sim, measures speed.
*/

export type TurnLatency = {
  turnLatency?: number;
  modelLatency?: number;
  voiceLatency?: number;
  transcriberLatency?: number;
  endpointingLatency?: number;
};

export type CallLatency = {
  turns: number;
  p50: number;
  p90: number;
  /** Median of each stage over the call's turns, in ms. */
  stages: { endpointing: number | null; transcriber: number | null; model: number | null; voice: number | null };
};

const STAGES = [
  ["endpointing", "endpointingLatency"],
  ["transcriber", "transcriberLatency"],
  ["model", "modelLatency"],
  ["voice", "voiceLatency"],
] as const;

export function quantile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!);
}

const positive = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0 && v < 30_000;

export function summarizeTurnLatencies(turns: TurnLatency[] | null | undefined): CallLatency | null {
  const valid = (turns ?? []).filter((t) => positive(t?.turnLatency));
  if (!valid.length) return null;
  const totals = valid.map((t) => t.turnLatency!);
  const stages = Object.fromEntries(
    STAGES.map(([name, key]) => [name, quantile(valid.map((t) => t[key]).filter(positive), 0.5)]),
  ) as CallLatency["stages"];
  return { turns: valid.length, p50: quantile(totals, 0.5)!, p90: quantile(totals, 0.9)!, stages };
}

/** The Vapi end-of-call report keeps timing under artifact.performanceMetrics. */
export function latencyFromReport(message: { artifact?: { performanceMetrics?: { turnLatencies?: TurnLatency[] } } }) {
  return summarizeTurnLatencies(message.artifact?.performanceMetrics?.turnLatencies);
}

export function latencyColumns(latency: CallLatency | null) {
  return latency
    ? { replyP50Ms: latency.p50, replyP90Ms: latency.p90, latencyJson: JSON.stringify({ turns: latency.turns, stages: latency.stages }) }
    : {};
}

/**
 * Speed across real calls since a date: the median call's typical reply, the
 * slow end, and which stage takes the time. Test and demo shops are left out.
 */
export async function voiceLatencyRollup(since: Date) {
  const calls = await prisma.call.findMany({
    where: {
      createdAt: { gte: since },
      replyP50Ms: { not: null },
      business: { environment: "production" },
    },
    select: { replyP50Ms: true, replyP90Ms: true, latencyJson: true },
  });
  const stageValues: Record<keyof CallLatency["stages"], number[]> = { endpointing: [], transcriber: [], model: [], voice: [] };
  let turns = 0;
  for (const call of calls) {
    try {
      const parsed = JSON.parse(call.latencyJson ?? "{}") as { turns?: number; stages?: Partial<CallLatency["stages"]> };
      turns += parsed.turns ?? 0;
      for (const [name] of STAGES) {
        const v = parsed.stages?.[name];
        if (positive(v)) stageValues[name].push(v);
      }
    } catch {
      // A malformed row still counts toward the reply numbers.
    }
  }
  const p50s = calls.map((c) => c.replyP50Ms!).filter(positive);
  const p90s = calls.map((c) => c.replyP90Ms!).filter(positive);
  const stages = Object.fromEntries(STAGES.map(([name]) => [name, quantile(stageValues[name], 0.5)])) as CallLatency["stages"];
  const slowest = (Object.entries(stages) as Array<[keyof CallLatency["stages"], number | null]>)
    .filter((e): e is [keyof CallLatency["stages"], number] => e[1] != null)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    since: since.toISOString(),
    calls: calls.length,
    turns,
    typicalReplyMs: quantile(p50s, 0.5),
    slowReplyMs: quantile(p90s, 0.5),
    stages,
    slowestStage: slowest,
  };
}
