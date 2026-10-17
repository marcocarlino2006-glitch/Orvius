import { collectedCents, refundedOf } from "@/lib/payment-math";

/** Bills the customer hasn't finished paying. */
export const OPEN_INVOICE = ["sent", "open", "partial"];

export type CustomerMoneyJob = {
  customerId: string | null;
  invoices: Array<{ amountCents: number; status: string; payments: Array<{ amountCents: number; status?: string; refundedCents?: number | null }> }>;
};

export type CustomerMoney = { collected: number; owed: number; refunded: number };

/**
 * Lifetime value from a customer's invoices: paid bills count at face, open
 * bills count by balance left, and payments on open bills count as collected.
 * A replaced payment is never money in. Refunded is what went back out on
 * those receipts, shown beside collected, never netted out of what is owed.
 * A row without a status is a collected one.
 */
export function summarizeCustomerMoney(jobs: CustomerMoneyJob[]): Map<string, CustomerMoney> {
  const out = new Map<string, CustomerMoney>();
  for (const job of jobs) {
    if (!job.customerId) continue;
    const slot = out.get(job.customerId) ?? { collected: 0, owed: 0, refunded: 0 };
    let touched = out.has(job.customerId);
    for (const inv of job.invoices) {
      touched = true;
      const got = collectedCents(inv.payments.map((p) => ({ ...p, status: p.status ?? "paid" })));
      slot.refunded += inv.payments.reduce((sum, p) => sum + refundedOf({ ...p, status: p.status ?? "paid" }), 0);
      if (inv.status === "paid") slot.collected += Math.max(inv.amountCents, got);
      else slot.collected += got;
      if (OPEN_INVOICE.includes(inv.status)) slot.owed += Math.max(0, inv.amountCents - got);
    }
    if (touched) out.set(job.customerId, slot);
  }
  return out;
}
