import { prisma } from "@/lib/prisma";

/*
  The sub-daily sweeps run on GitHub's scheduler, which is best-effort: runs
  arrive late, get skipped under load, and stop entirely if the repo goes quiet
  for 60 days. Each sweep stamps when it ran, so lateness is visible to the
  uptime probe and live traffic can make up a missed run.
*/

export const CRON_EVERY_MS = {
  "alert-drain": 5 * 60_000,
  "line-watch": 30 * 60_000,
} as const;
export type CronName = keyof typeof CRON_EVERY_MS;

/** Three missed runs in a row is late, not jitter. */
const LATE_AFTER_RUNS = 3;

export async function markCronRan(name: CronName, now = new Date()) {
  await prisma.cronRun.upsert({
    where: { name },
    create: { name, lastRunAt: now },
    update: { lastRunAt: now },
  });
}

/**
 * Claims a late sweep for this caller only: the stamp moves first, so of many
 * requests noticing the same late sweep at once, exactly one runs it.
 */
export async function claimLateCron(name: CronName, now = new Date()): Promise<boolean> {
  const lateBefore = new Date(now.getTime() - CRON_EVERY_MS[name] * LATE_AFTER_RUNS);
  const row = await prisma.cronRun.findUnique({ where: { name } });
  if (!row) {
    await prisma.cronRun.create({ data: { name, lastRunAt: now, lastClaimAt: now } }).catch(() => null);
    return false;
  }
  if (row.lastRunAt && row.lastRunAt > lateBefore) return false;
  if (row.lastClaimAt && row.lastClaimAt > lateBefore) return false;
  const claimed = await prisma.cronRun.updateMany({
    where: { name, OR: [{ lastClaimAt: null }, { lastClaimAt: { lte: lateBefore } }] },
    data: { lastClaimAt: now },
  });
  return claimed.count === 1;
}

/** Sweeps that have missed three runs; empty when every schedule is keeping time. */
export async function lateCrons(now = new Date()): Promise<CronName[]> {
  const rows = await prisma.cronRun.findMany();
  const last = new Map(rows.map((r) => [r.name, r.lastRunAt]));
  return (Object.keys(CRON_EVERY_MS) as CronName[]).filter((name) => {
    const at = last.get(name);
    return !at || now.getTime() - at.getTime() > CRON_EVERY_MS[name] * LATE_AFTER_RUNS;
  });
}

/*
  The daily sweep is one best-effort Vercel cron: no retries, and two
  invocations can overlap. Each step records its own last success under
  "daily:<step>", so a step that keeps failing or keeps being cut off by the
  deadline is visible by age, and tomorrow's run starts with whatever has gone
  longest without succeeding.
*/
const DAILY_STEP = (step: string) => `daily:${step}`;
const DAILY_LEASE_MS = 55_000;

/** One daily run at a time: a second invocation inside the lease window is refused. */
export async function claimDailyRun(now = new Date()): Promise<boolean> {
  const busyAfter = new Date(now.getTime() - DAILY_LEASE_MS);
  await prisma.cronRun.upsert({ where: { name: "daily" }, create: { name: "daily" }, update: {} });
  const claimed = await prisma.cronRun.updateMany({
    where: { name: "daily", OR: [{ lastClaimAt: null }, { lastClaimAt: { lte: busyAfter } }] },
    data: { lastClaimAt: now },
  });
  return claimed.count === 1;
}

export async function markDailyStep(step: string, now = new Date()) {
  await prisma.cronRun.upsert({
    where: { name: DAILY_STEP(step) },
    create: { name: DAILY_STEP(step), lastRunAt: now },
    update: { lastRunAt: now },
  });
}

/** When each step last succeeded; null for a step that never has. */
export async function dailyStepSuccesses(steps: readonly string[]): Promise<Map<string, Date | null>> {
  const rows = await prisma.cronRun.findMany({ where: { name: { in: steps.map(DAILY_STEP) } } });
  const at = new Map(rows.map((r) => [r.name, r.lastRunAt]));
  return new Map(steps.map((s) => [s, at.get(DAILY_STEP(s)) ?? null]));
}

/** Never-succeeded first, then oldest success first; ties keep the given order. */
export function oldestFirst(steps: readonly string[], successes: Map<string, Date | null>): string[] {
  const age = (s: string) => successes.get(s)?.getTime() ?? -Infinity;
  return steps.map((s, i) => [s, i] as const).sort((a, b) => age(a[0]) - age(b[0]) || a[1] - b[1]).map(([s]) => s);
}
