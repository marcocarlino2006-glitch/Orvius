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

export function parseAvgTicketDollars(raw: string | number): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 50 || n > 50_000) return null;
  return dollarsToCents(n);
}
