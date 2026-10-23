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

/** A row that once brought money in: collected, or later refunded. Claims and failures never did. */
export const RECEIPT_STATUSES = [...COLLECTED_STATUSES, "refunded"];

export type ReceiptRow = { amountCents: number; status: string; refundedCents?: number | null };

/** What was given back on one receipt. A row marked refunded before refunds were itemised gave back all of it. */
export function refundedOf(row: ReceiptRow): number {
  if (!RECEIPT_STATUSES.includes(row.status)) return 0;
  const recorded = Math.min(Math.max(0, row.refundedCents ?? 0), row.amountCents);
  return row.status === "refunded" ? row.amountCents : recorded;
}

export type MoneyTotals = { grossCents: number; refundedCents: number; netCents: number };

/**
 * The one way Orvius totals money: gross is every receipt as it came in,
 * refunded is what went back out, net is what the shop kept. None of these is
 * what a customer owes; that is the bill less collectedCents.
 */
export function moneyTotals(rows: ReceiptRow[] | undefined | null): MoneyTotals {
  let grossCents = 0;
  let refundedCents = 0;
  for (const row of rows ?? []) {
    if (!RECEIPT_STATUSES.includes(row.status)) continue;
    grossCents += row.amountCents;
    refundedCents += refundedOf(row);
  }
  return { grossCents, refundedCents, netCents: grossCents - refundedCents };
}

/**
 * A card receipt from Stripe test mode: its checkout session id says so
 * ("cs_test_…", stored as "stripe:cs_test_…" on payments). No real money moved.
 */
export function isTestModeReceipt(ref: string | null | undefined): boolean {
  return /^(stripe:)?cs_test_/.test(ref ?? "");
}

export function addTotals(...parts: MoneyTotals[]): MoneyTotals {
  return parts.reduce((a, b) => ({ grossCents: a.grossCents + b.grossCents, refundedCents: a.refundedCents + b.refundedCents, netCents: a.netCents + b.netCents }), { grossCents: 0, refundedCents: 0, netCents: 0 });
}

export function claimedCents(payments: PaymentRow[] | undefined | null): number {
  return (payments ?? []).filter((p) => p.status === PAYMENT_CLAIMED).reduce((sum, p) => sum + p.amountCents, 0);
}

/**
 * What Stripe has already said about a card charge. Days are formatted by the
 * caller. Absent means we have not read a payout yet, so the bill stays on
 * the usual two-business-day line instead of inventing an arrival.
 */
export type BankArrival = {
  /** A paid payout included this charge. */
  inBankOn?: string | null;
  /** The charge is still pending. Funds become available on this day. */
  paysOutOn?: string | null;
  /** Funds are available, and the recent paid payouts do not include this charge. */
  waitingOnPayout?: boolean;
};

/**
 * Where a paid bill sits. A card charge pays out to the shop's bank only
 * when Stripe payouts are on, and only a payout Stripe has paid can say the
 * money is in the bank. Cash, a check, or the customer's word stayed in the
 * shop. Never call either of those "landed."
 */
export function paidBankLine(how: string | null | undefined, payoutsEnabled: boolean, arrival?: BankArrival | null): string {
  const text = how ?? "";
  const card = /card|bank transfer/i.test(text);
  const alsoInShop = /cash|recorded|customer|check/i.test(text);
  if (card && payoutsEnabled) {
    const inBank = arrival?.inBankOn?.trim();
    if (inBank) {
      return alsoInShop
        ? `The card amount is in your bank as of ${inBank}. The rest stayed in the shop.`
        : `In your bank as of ${inBank}.`;
    }
    const paysOut = arrival?.paysOutOn?.trim();
    if (paysOut) {
      return alsoInShop
        ? `The card amount pays out to your bank on ${paysOut}. The rest stayed in the shop.`
        : `Pays out to your bank on ${paysOut}.`;
    }
    if (arrival?.waitingOnPayout) {
      return alsoInShop
        ? "The card amount is waiting on the next payout to your bank. The rest stayed in the shop."
        : "Waiting on the next payout to your bank.";
    }
    return alsoInShop
      ? "The card amount pays out to your bank, usually within two business days. The rest stayed in the shop."
      : "The card payment pays out to your bank, usually within two business days.";
  }
  if (card) {
    return "The card cleared. Payout to your bank waits until payouts are on.";
  }
  if (text) return "Recorded in the shop. This did not go to your bank through the card.";
  return payoutsEnabled
    ? "A card payment pays out to your bank. Anything you recorded stayed in the shop."
    : "A card payment pays out once your bank is connected. Anything you recorded stayed in the shop.";
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
