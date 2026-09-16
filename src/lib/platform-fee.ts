/*
  Orvius takes its cut as a Stripe `application_fee_amount` on direct charges
  made on the shop's own connected account — not as a destination charge on the
  platform account.

  That distinction is the whole economics of this file. On a destination charge
  the platform is the merchant of record, so Stripe's processing fee (2.9% + 30c)
  comes out of *our* side while we collect a 2% application fee: every
  transaction would lose money. On a direct charge the shop is the merchant, the
  shop pays processing exactly as it would with any other card processor, and the
  application fee arrives whole. It also puts chargeback liability and the
  money-transmission question where they belong, on the shop's own account.
*/

/** Stripe rejects card charges under 50c outright. */
export const STRIPE_MIN_CHARGE_CENTS = 50;

const DEFAULT_PLATFORM_FEE_BPS = 200;

/*
  A fee above 10% would mean a misconfigured env var rather than a pricing
  decision, and the shop would eat it silently on every job. Clamping here is
  also what keeps the fee safely under the charge: Stripe fails a payment whose
  application fee equals its amount, and at 10% it cannot come close.
*/
const MAX_PLATFORM_FEE_BPS = 1000;

/** Orvius take rate in basis points. 200 bps = 2% of the charge. */
export function getPlatformFeeBps() {
  const raw = process.env.ORVIUS_PLATFORM_FEE_BPS?.trim();
  if (!raw) return DEFAULT_PLATFORM_FEE_BPS;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_PLATFORM_FEE_BPS;

  return Math.min(Math.round(parsed), MAX_PLATFORM_FEE_BPS);
}

/** Orvius' cut of one charge, in cents. Stripe wants a whole number. */
export function calculatePlatformFeeCents(amountCents: number) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;

  const amount = Math.floor(amountCents);
  return Math.round((amount * getPlatformFeeBps()) / 10_000);
}

/** What the shop keeps from one charge, before Stripe's own processing fee. */
export function shopNetCents(amountCents: number) {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0;
  const amount = Math.floor(amountCents);
  return amount - calculatePlatformFeeCents(amount);
}

/** Take rate as a percentage string for owner-facing copy, e.g. "2%". */
export function formatPlatformFeeRate() {
  const pct = getPlatformFeeBps() / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

export function isChargeableAmount(amountCents: number) {
  return (
    Number.isFinite(amountCents) &&
    Math.floor(amountCents) >= STRIPE_MIN_CHARGE_CENTS
  );
}
