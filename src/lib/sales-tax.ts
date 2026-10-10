/**
 * Sales tax on what a customer owes the shop. Prices on estimates and job
 * lines are before tax; the invoice adds the shop's rate once, stamps it, and
 * the customer pays subtotal + tax. Rates are basis points so 8.25% is exact.
 */
export const MAX_SALES_TAX_BPS = 1500;

export function taxCentsFor(subtotalCents: number, bps: number) {
  if (!bps || subtotalCents <= 0) return 0;
  return Math.round((subtotalCents * bps) / 10_000);
}

export function withSalesTax(subtotalCents: number, bps: number) {
  const taxBps = clampBps(bps);
  const taxCents = taxCentsFor(subtotalCents, taxBps);
  return { subtotalCents, taxBps, taxCents, totalCents: subtotalCents + taxCents };
}

export function clampBps(bps: number | null | undefined) {
  if (!bps || !Number.isFinite(bps)) return 0;
  return Math.min(MAX_SALES_TAX_BPS, Math.max(0, Math.round(bps)));
}

/** "8.25%", "7%". */
export function formatTaxRate(bps: number) {
  return `${(bps / 100).toFixed(3).replace(/\.?0+$/, "")}%`;
}

/** What the owner types ("8.25", "8.25%", "") into basis points; null when it isn't a rate. */
export function parseTaxRate(text: string): number | null {
  const trimmed = text.trim().replace(/%$/, "").trim();
  if (!trimmed) return 0;
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(trimmed)) return null;
  const bps = Math.round(Number(trimmed) * 100);
  return bps <= MAX_SALES_TAX_BPS ? bps : null;
}

/** Orvius's card fee is on the work, never on tax the shop owes the state. */
export function feeBaseCents(invoice: { amountCents: number; taxCents?: number | null }) {
  return Math.max(0, invoice.amountCents - Math.max(0, invoice.taxCents ?? 0));
}
