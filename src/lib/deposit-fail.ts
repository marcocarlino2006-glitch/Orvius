/**
 * P9/P10 — deposit / card fail path.
 * Failed status, stale unpaid after send, or a hold that never left the shop.
 */

export function depositFailWaitMs(afterHours: boolean): number {
  return afterHours ? 60 * 60_000 : 4 * 60 * 60_000;
}

/** Hold created but link never texted — tighter than post-send stale. */
export function depositUnsentWaitMs(afterHours: boolean): number {
  return afterHours ? 15 * 60_000 : 60 * 60_000;
}

export function depositNeedsOwnerFollowUp(input: {
  status: string;
  sentAt?: Date | string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
  now?: Date;
  afterHours?: boolean;
}): boolean {
  const status = input.status.toLowerCase();
  if (status === "paid" || status === "canceled" || status === "refunded") {
    return false;
  }
  if (input.paidAt) return false;
  if (status === "failed") return true;
  if (status !== "pending") return false;

  const now = input.now ?? new Date();
  const afterHours = Boolean(input.afterHours);
  const sentAt = toDate(input.sentAt);
  if (sentAt) {
    return sentAt.getTime() + depositFailWaitMs(afterHours) < now.getTime();
  }

  const createdAt = toDate(input.createdAt);
  if (!createdAt) return false;
  return createdAt.getTime() + depositUnsentWaitMs(afterHours) < now.getTime();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
