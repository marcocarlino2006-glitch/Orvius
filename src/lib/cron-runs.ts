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
