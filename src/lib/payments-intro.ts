/*
  How card payments are introduced to an owner. Pure, so the billing panel, the
  go-live checklist and the tests all show the same numbers.

  The worked example uses Stripe's standard US card rate. A shop's own Stripe
  account can be priced differently, so the copy always says "standard" and
  Stripe shows the shop its actual rate during setup.
*/

export const STRIPE_STANDARD_PERCENT_BPS = 290;
export const STRIPE_STANDARD_FIXED_CENTS = 30;
export const STRIPE_STANDARD_LABEL = "2.9% + 30¢";
export const EXAMPLE_BILL_CENTS = 40_000;

export type PaymentExample = {
  billCents: number;
  stripeCents: number;
  orviusCents: number;
  netCents: number;
};

export function paymentExample(billCents: number, feeBps: number): PaymentExample {
  const bill = Math.max(0, Math.round(billCents));
  const stripeCents = bill ? Math.round((bill * STRIPE_STANDARD_PERCENT_BPS) / 10_000) + STRIPE_STANDARD_FIXED_CENTS : 0;
  const orviusCents = Math.round((bill * Math.max(0, feeBps)) / 10_000);
  return { billCents: bill, stripeCents, orviusCents, netCents: Math.max(0, bill - stripeCents - orviusCents) };
}

export function usd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export const PAYMENT_STEPS = [
  {
    when: "Booked",
    title: "A deposit, if you want one",
    body: "The booking confirmation can carry a deposit link that holds the slot. It stays off until you choose an amount.",
  },
  {
    when: "Done",
    title: "The bill goes out by text",
    body: "Your customer taps the link and pays by card, Apple Pay or Google Pay. Turn on pay over time and big jobs can be split with Affirm or Klarna.",
  },
  {
    when: "Paid",
    title: "Money lands in your bank",
    body: "On Stripe's payout schedule, usually two business days. The job is marked paid only when the money arrives.",
  },
] as const;

export const SETUP_NEEDS = [
  "Your business's legal name and address",
  "Your EIN, or your SSN if you're a sole proprietor",
  "The bank account you want paid into",
] as const;

/** The customer's text, worded exactly like sendInvoiceLink sends it. */
export function exampleBillText(shopName: string, billCents: number): string {
  return `${shopName}: thanks for choosing us. Your balance is ${usd(billCents)}. Pay securely here: orvius.im/i/…`;
}

export type ConnectState = "not_started" | "in_progress" | "verifying" | "ready";

export type PaymentsActivation = {
  state: "live" | "todo";
  detail: string;
  action?: { label: string; href: string };
};

export const PAYMENTS_HREF = "/dashboard/billing#payouts";

/** The go-live checklist row for card payments. Live only once Stripe has cleared charges. */
export function paymentsActivation(state: ConnectState): PaymentsActivation {
  switch (state) {
    case "ready":
      return { state: "live", detail: "Customers pay deposits and bills by card from a text. Money goes to your bank." };
    case "verifying":
      return {
        state: "todo",
        detail: "Stripe has your details and is checking them, usually within minutes. Nothing more for you to do.",
        action: { label: "Check status", href: PAYMENTS_HREF },
      };
    case "in_progress":
      return {
        state: "todo",
        detail: "Stripe still needs a few details. Your progress is saved.",
        action: { label: "Finish setup", href: PAYMENTS_HREF },
      };
    default:
      return {
        state: "todo",
        detail: "Text customers their bill and let them pay by card. Money goes to your bank, not to Orvius. About 5 minutes.",
        action: { label: "Set up payments", href: PAYMENTS_HREF },
      };
  }
}
