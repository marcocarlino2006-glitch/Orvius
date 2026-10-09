import type Stripe from "stripe";

/*
  Pay over time on the shop's own pay links. A $9,000 system replacement is
  rarely paid by card on the spot; Affirm and Klarna let the homeowner split
  it while the shop is paid in full up front, through the same Stripe account
  the shop already uses. Approval is the lender's call, not ours or the shop's,
  and these methods cost the shop more than a card, so the owner opts in.
*/

export type FinancingMethod = "affirm" | "klarna";

export const FINANCING: Record<FinancingMethod, { label: string; capability: "affirm_payments" | "klarna_payments"; minCents: number; maxCents: number }> = {
  affirm: { label: "Affirm", capability: "affirm_payments", minCents: 5_000, maxCents: 3_000_000 },
  klarna: { label: "Klarna", capability: "klarna_payments", minCents: 3_500, maxCents: 1_000_000 },
};

const METHODS = Object.keys(FINANCING) as FinancingMethod[];

export const FINANCING_COST_NOTE =
  "Stripe charges your shop more for these than for a card, about 6% per sale instead of about 3%, and you're paid the full amount up front. The lender decides who's approved.";

export function financingMethodsFromAccount(account: Pick<Stripe.Account, "capabilities">) {
  return METHODS.filter((m) => account.capabilities?.[FINANCING[m].capability] === "active");
}

function parseMethods(raw: string | null | undefined): FinancingMethod[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is FinancingMethod => (METHODS as string[]).includes(s));
}

type FinancingShop = { financingEnabled?: boolean | null; financingMethods?: string | null };

/** The pay-over-time options a customer sees for this amount: switched on, active at Stripe, and inside the lender's range. */
export function financingFor(shop: FinancingShop, amountCents: number): FinancingMethod[] {
  if (!shop.financingEnabled) return [];
  return parseMethods(shop.financingMethods).filter((m) => amountCents >= FINANCING[m].minCents && amountCents <= FINANCING[m].maxCents);
}

/**
 * Checkout's payment methods. Unset keeps Stripe's defaults; once financing
 * applies, the list is explicit, so it only ever names methods Stripe has
 * already activated on the account (an inactive one would fail the checkout).
 */
export function checkoutPaymentMethods(shop: FinancingShop, amountCents: number): Array<"card" | FinancingMethod> | undefined {
  const methods = financingFor(shop, amountCents);
  return methods.length ? ["card", ...methods] : undefined;
}

export function financingLine(methods: FinancingMethod[]) {
  if (!methods.length) return null;
  const names = methods.map((m) => FINANCING[m].label).join(" or ");
  return `Pay over time with ${names}, if you're approved. Choose it on the payment page.`;
}

export type FinancingStatus = { enabled: boolean; active: FinancingMethod[]; pending: FinancingMethod[] };

export function financingStatus(shop: FinancingShop): FinancingStatus {
  const active = parseMethods(shop.financingMethods);
  return { enabled: Boolean(shop.financingEnabled), active, pending: shop.financingEnabled ? METHODS.filter((m) => !active.includes(m)) : [] };
}

/** Ask Stripe to turn the pay-over-time methods on for the shop's account. */
export function financingCapabilityRequest(): Stripe.AccountUpdateParams {
  return { capabilities: Object.fromEntries(METHODS.map((m) => [FINANCING[m].capability, { requested: true }])) as Stripe.AccountUpdateParams["capabilities"] };
}
