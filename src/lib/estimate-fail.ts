/**
 * P11 — estimate card path died or the sent estimate went cold unpaid.
 */

export function estimateFailWaitMs(afterHours: boolean): number {
  return afterHours ? 2 * 60 * 60_000 : 24 * 60 * 60_000;
}

export function estimateNeedsOwnerFollowUp(input: {
  status: string;
  sentAt?: Date | string | null;
  createdAt?: Date | string | null;
  now?: Date;
  afterHours?: boolean;
}): boolean {
  const status = input.status.toLowerCase();
  if (status === "draft" || status === "paid" || status === "void") {
    return false;
  }
  if (status === "payment_failed") return true;

  if (status !== "sent" && status !== "accepted") return false;

  const now = input.now ?? new Date();
  const anchor = toDate(input.sentAt) ?? toDate(input.createdAt);
  if (!anchor) return false;
  return (
    anchor.getTime() + estimateFailWaitMs(Boolean(input.afterHours)) <
    now.getTime()
  );
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
