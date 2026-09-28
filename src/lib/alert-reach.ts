import { prisma } from "@/lib/prisma";

const FAILOVER_SUFFIX = ":sms-failover";
const IN_FLIGHT_OR_SENT = ["pending", "sending", "sent"];

/** One owner alert can be several rows: one per channel, plus an email failover. */
export function alertGroupKey(dedupeKey: string): string {
  return dedupeKey.endsWith(FAILOVER_SUFFIX)
    ? dedupeKey.slice(0, -FAILOVER_SUFFIX.length)
    : dedupeKey;
}

/**
 * Failed rows whose alert has no other channel still trying or sent.
 *
 * An email row that could not send while the text for the same alert went out
 * is a missing backup channel, not an owner who was never told. Only alerts
 * with every channel failed are "not delivering". A text the carrier later
 * rejects is put back on the retry ladder, so its alert returns here if that
 * text finally fails too.
 */
export async function failuresThatReachedNoOne<T extends { dedupeKey: string }>(
  businessId: string,
  failed: T[],
): Promise<T[]> {
  if (failed.length === 0) return failed;
  const groups = [...new Set(failed.map((row) => alertGroupKey(row.dedupeKey)))];
  const siblings = await prisma.ownerNotification.findMany({
    where: {
      businessId,
      dedupeKey: { in: groups.flatMap((key) => [key, `${key}${FAILOVER_SUFFIX}`]) },
      status: { in: IN_FLIGHT_OR_SENT },
    },
    select: { dedupeKey: true },
  });
  const reached = new Set(siblings.map((row) => alertGroupKey(row.dedupeKey)));
  return failed.filter((row) => !reached.has(alertGroupKey(row.dedupeKey)));
}
