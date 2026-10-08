/*
  An issued invoice is not money collected. Only payments with a collected
  status are money in hand; a customer's "I paid" is a claim until the owner
  confirms it.
*/

export const PAYMENT_CLAIMED = "claimed";
export const PAYMENT_RECORDED = "recorded";
export const OWNER_METHODS = ["cash", "check", "bank", "other"] as const;
export type OwnerMethod = (typeof OWNER_METHODS)[number];

/** The only payment statuses that are money in hand. Claims, rejected claims, failures and refunds are not. */
export const COLLECTED_STATUSES = [PAYMENT_RECORDED, "paid", "succeeded"];

export type PaymentRow = { amountCents: number; status: string; method?: string | null };

export function isCollected(status: string): boolean {
  return COLLECTED_STATUSES.includes(status);
}

/** Money that actually came in. */
export function collectedCents(payments: PaymentRow[] | undefined | null): number {
  return (payments ?? []).filter((p) => isCollected(p.status)).reduce((sum, p) => sum + p.amountCents, 0);
}

export function claimedCents(payments: PaymentRow[] | undefined | null): number {
  return (payments ?? []).filter((p) => p.status === PAYMENT_CLAIMED).reduce((sum, p) => sum + p.amountCents, 0);
}

/** How the money came in, in the owner's words. */
export function collectedHow(payments: PaymentRow[] | undefined | null): string | null {
  const methods = new Set(
    (payments ?? [])
      .filter((p) => isCollected(p.status))
      .map((p) => {
        const m = (p.method ?? "").toLowerCase();
        if (m.startsWith("stripe") || m === "card") return "card (confirmed by the processor)";
        if (m === "bank" || m === "ach") return "bank transfer";
        if (m === "customer_attested" || m === "customer_said") return "customer's word, confirmed by you";
        return m || "recorded payment";
      }),
  );
  return methods.size ? [...methods].join(" and ") : null;
}
