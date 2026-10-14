/** Bills the customer hasn't finished paying. */
export const OPEN_INVOICE = ["sent", "open", "partial"];

export type CustomerMoneyJob = {
  customerId: string | null;
  invoices: Array<{ amountCents: number; status: string; payments: Array<{ amountCents: number }> }>;
};

/**
 * Lifetime value from a customer's invoices: paid bills count at face, open
 * bills count by balance left, and payments on open bills count as collected.
 * A replaced payment is never money in — only collected-status rows arrive here.
 */
export function summarizeCustomerMoney(jobs: CustomerMoneyJob[]): Map<string, { collected: number; owed: number }> {
  const out = new Map<string, { collected: number; owed: number }>();
  for (const job of jobs) {
    if (!job.customerId) continue;
    const slot = out.get(job.customerId) ?? { collected: 0, owed: 0 };
    let touched = out.has(job.customerId);
    for (const inv of job.invoices) {
      touched = true;
      const got = inv.payments.reduce((s, p) => s + p.amountCents, 0);
      if (inv.status === "paid") slot.collected += Math.max(inv.amountCents, got);
      else slot.collected += got;
      if (OPEN_INVOICE.includes(inv.status)) slot.owed += Math.max(0, inv.amountCents - got);
    }
    if (touched) out.set(job.customerId, slot);
  }
  return out;
}
