import { pagePlatform } from "@/lib/platform-pager";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/unique-violation";

/*
  Production logs about one error every few days, and with no error tracker
  set up those errors sat in Vercel's logs until someone looked. Each one is
  counted here in a five-minute bucket; the five-minute alert drain pages the
  founder when a handful land close together, which is a break, not noise.
*/

const EVENT = "error-count";
const BUCKET_MS = 5 * 60_000;
const WINDOW_MS = 10 * 60_000;
export const ERROR_BURST_THRESHOLD = 3;

const counting = () => process.env.VERCEL_ENV === "production" || process.env.ORVIUS_COUNT_ERRORS === "1";

/** Never throws and never logs: it runs inside logError. */
export async function countError(event: string, now = new Date()) {
  if (!counting()) return;
  const bucket = new Date(Math.floor(now.getTime() / BUCKET_MS) * BUCKET_MS).toISOString();
  const externalId = `${bucket}|${event.slice(0, 120)}`;
  try {
    await prisma.webhookEvent.create({ data: { source: "orvius", eventType: EVENT, externalId, status: "counted", attempts: 1, createdAt: now } });
  } catch (error) {
    if (!isUniqueViolation(error)) return;
    await prisma.webhookEvent
      .updateMany({ where: { source: "orvius", eventType: EVENT, externalId }, data: { attempts: { increment: 1 } } })
      .catch(() => undefined);
  }
}

/** Errors in the last ten minutes, most frequent first. */
export async function recentErrors(now = new Date()) {
  const rows = await prisma.webhookEvent.findMany({
    where: { source: "orvius", eventType: EVENT, createdAt: { gte: new Date(now.getTime() - WINDOW_MS) } },
    select: { externalId: true, attempts: true },
  });
  const byEvent = new Map<string, number>();
  for (const row of rows) {
    const event = row.externalId.split("|").slice(1).join("|");
    byEvent.set(event, (byEvent.get(event) ?? 0) + row.attempts);
  }
  return [...byEvent.entries()].map(([event, count]) => ({ event, count })).sort((a, b) => b.count - a.count);
}

/** From the five-minute alert drain. The pager already holds a repeat page back for 15 minutes. */
export async function pageOnErrorBurst(now = new Date()) {
  const errors = await recentErrors(now);
  const total = errors.reduce((sum, e) => sum + e.count, 0);
  if (total < ERROR_BURST_THRESHOLD) return { paged: false as const, total };
  const top = errors
    .slice(0, 3)
    .map((e) => `${e.event} ×${e.count}`)
    .join(", ");
  const page = await pagePlatform("error_burst", { summary: `${total} errors in 10 minutes: ${top}`, errors }, now);
  return { paged: page.paged, total };
}
