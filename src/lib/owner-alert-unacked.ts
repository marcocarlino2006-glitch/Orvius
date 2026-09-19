/**
 * P5 — owner was alerted but has not worked the lead.
 * Delivery succeeded; silence is the failure mode.
 */

export function ownerAlertUnackedWaitMs(afterHours: boolean) {
  return (afterHours ? 30 : 120) * 60_000;
}

export function isOwnerAlertUnacked(params: {
  alertedAt: Date | string;
  firstContactedAt?: Date | string | null;
  now?: Date;
  afterHours?: boolean;
}): boolean {
  if (params.firstContactedAt) return false;
  const alertedAt =
    params.alertedAt instanceof Date
      ? params.alertedAt
      : new Date(params.alertedAt);
  if (Number.isNaN(alertedAt.getTime())) return false;
  const now = params.now ?? new Date();
  const wait = ownerAlertUnackedWaitMs(Boolean(params.afterHours));
  return now.getTime() - alertedAt.getTime() >= wait;
}
