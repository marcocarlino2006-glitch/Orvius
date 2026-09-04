/** Money helpers — estimated value from shop avg ticket. Never invent dollars. */

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export function formatCents(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(centsToDollars(cents));
}

export function estimatedRevenueCents(
  avgTicketCents: number | null | undefined,
  count: number,
): number | null {
  if (avgTicketCents == null || avgTicketCents <= 0 || count <= 0) return null;
  return avgTicketCents * count;
}

/**
 * Recovered demand estimate — only when we have a ticket and a measured lift signal.
 * Prefer jobs/week vs baseline; else after-hours leads that booked a job.
 */
export function recoveredRevenueCents(input: {
  avgTicketCents: number | null | undefined;
  recoveredJobs: number | null | undefined;
}): number | null {
  return estimatedRevenueCents(input.avgTicketCents, input.recoveredJobs ?? 0);
}

export function parseAvgTicketDollars(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 50 || n > 50_000) return null;
  return dollarsToCents(n);
}

/** Signed dollar delta for UI (+$1,200 / −$400). */
export function formatCentsDelta(cents: number | null | undefined): string | null {
  if (cents == null || !Number.isFinite(cents) || cents === 0) return formatCents(cents);
  const abs = formatCents(Math.abs(cents));
  if (!abs) return null;
  return cents > 0 ? `+${abs}` : `−${abs}`;
}
