/**
 * P9 — deposit / card fail path.
 * Pending too long or an explicit failed status needs the owner on the phone.
 */

export function depositFailWaitMs(afterHours: boolean): number {
  return afterHours ? 60 * 60_000 : 4 * 60 * 60_000;
}

export function depositNeedsOwnerFollowUp(input: {
  status: string;
  sentAt?: Date | string | null;
  paidAt?: Date | string | null;
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

  const sentAt = toDate(input.sentAt);
  if (!sentAt) return false;
  const now = input.now ?? new Date();
  const wait = depositFailWaitMs(Boolean(input.afterHours));
  return sentAt.getTime() + wait < now.getTime();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
