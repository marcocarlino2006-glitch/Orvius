import { prisma } from "@/lib/prisma";

/**
 * Changes whenever a call, lead, job or alert for the shop does. Each part is
 * an indexed max per shop, so it stays cheap enough to check every few seconds.
 */
export async function shopVersion(businessId: string) {
  const where = { businessId };
  const [call, lead, job, alert] = await Promise.all([
    prisma.call.aggregate({ where, _max: { updatedAt: true } }),
    prisma.lead.aggregate({ where, _max: { updatedAt: true } }),
    prisma.job.aggregate({ where, _max: { updatedAt: true } }),
    prisma.ownerNotification.aggregate({ where, _max: { processedAt: true, createdAt: true } }),
  ]);
  return [call._max.updatedAt, lead._max.updatedAt, job._max.updatedAt, alert._max.processedAt, alert._max.createdAt]
    .map((at) => at?.getTime() ?? 0)
    .join(".");
}

/**
 * Command changes with time as well as data (after hours, stuck alerts, the
 * brief's window), so the version rolls over on this bucket even when idle.
 */
export const COMMAND_VERSION_BUCKET_MS = 5 * 60_000;

export function commandVersion(dataVersion: string, now: Date, since: Date | null) {
  return `${dataVersion}:${Math.floor(now.getTime() / COMMAND_VERSION_BUCKET_MS)}:${since?.getTime() ?? 0}`;
}
