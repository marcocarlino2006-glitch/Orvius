/**
 * P8 — customer or tech no-show after the window.
 * Past due alone is “at risk”; a confirmed miss needs a phone call.
 */

const CUSTOMER_GRACE_MS = 20 * 60_000;
const TECH_EN_ROUTE_STALE_MS = 45 * 60_000;

export function jobIsCustomerNoShow(job: {
  scheduledAt?: Date | string | null;
  status?: string | null;
  customerConfirmedAt?: Date | string | null;
  onSiteAt?: Date | string | null;
  completedAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (job.completedAt || job.onSiteAt) return false;
  const status = (job.status ?? "").toLowerCase();
  if (status !== "scheduled" && status !== "confirmed") return false;
  if (!job.customerConfirmedAt) return false;
  const scheduled = toDate(job.scheduledAt);
  if (!scheduled) return false;
  const now = job.now ?? new Date();
  return scheduled.getTime() + CUSTOMER_GRACE_MS < now.getTime();
}

export function jobIsTechNoShow(job: {
  scheduledAt?: Date | string | null;
  status?: string | null;
  technicianId?: string | null;
  customerConfirmedAt?: Date | string | null;
  dispatchedAt?: Date | string | null;
  onSiteAt?: Date | string | null;
  completedAt?: Date | string | null;
  now?: Date;
}): boolean {
  if (job.completedAt || job.onSiteAt) return false;
  if (!job.technicianId) return false;
  if (jobIsCustomerNoShow(job)) return false;

  const status = (job.status ?? "").toLowerCase();
  const now = job.now ?? new Date();
  const scheduled = toDate(job.scheduledAt);

  if (status === "en_route") {
    const left = toDate(job.dispatchedAt) ?? scheduled;
    if (!left) return false;
    return left.getTime() + TECH_EN_ROUTE_STALE_MS < now.getTime();
  }

  if (status !== "scheduled" && status !== "confirmed") return false;
  if (!scheduled) return false;
  // Tech assigned, window passed, never rolled — call the tech.
  return scheduled.getTime() + CUSTOMER_GRACE_MS < now.getTime();
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const NO_SHOW_GRACE_MS = CUSTOMER_GRACE_MS;
export const TECH_EN_ROUTE_STALE_MS_EXPORT = TECH_EN_ROUTE_STALE_MS;
