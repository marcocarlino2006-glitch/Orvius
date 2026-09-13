import type { Business } from "@prisma/client";
import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";

/*
  Express accounts, and direct charges against them.

  The shop is the merchant of record: cards are charged on the shop's own
  connected account, Stripe's processing fee comes out of the shop's side
  exactly as it would with any other processor, and Orvius takes only an
  `application_fee_amount`. Money never lands in an Orvius balance on its way
  to a shop, which is what keeps this out of money-transmission territory, and
  it is also the only arrangement whose arithmetic works — see platform-fee.ts.

  The practical cost of direct charges is that connected-account objects are
  invisible to a plain platform API call. Every retrieve and create for a
  shop's payment has to carry `{ stripeAccount }`, and the webhooks for them
  arrive with `event.account` set rather than on the platform's own stream.
*/

/** Heating, plumbing and air-conditioning contractors. */
const TRADE_MCC = "1711";

export type ConnectOnboardingState =
  | "not_started"
  | "in_progress"
  | "verifying"
  | "ready";

export type ConnectStatus = {
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  /** The single question every payment path asks. */
  canAcceptPayments: boolean;
  state: ConnectOnboardingState;
};

type ConnectFields = Pick<
  Business,
  | "stripeConnectAccountId"
  | "stripeConnectChargesEnabled"
  | "stripeConnectPayoutsEnabled"
  | "stripeConnectDetailsSubmitted"
>;

export function isConnectConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
}

export function getConnectStatus(business: ConnectFields): ConnectStatus {
  const accountId = business.stripeConnectAccountId?.trim() || null;
  const chargesEnabled = Boolean(business.stripeConnectChargesEnabled);
  const payoutsEnabled = Boolean(business.stripeConnectPayoutsEnabled);
  const detailsSubmitted = Boolean(business.stripeConnectDetailsSubmitted);

  let state: ConnectOnboardingState = "not_started";
  if (accountId) {
    if (chargesEnabled) state = "ready";
    else if (detailsSubmitted) state = "verifying";
    else state = "in_progress";
  }

  return {
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    /*
      Only `charges_enabled` is allowed to open the card path. A shop that has
      filled in every field is still not cleared until Stripe says so, and
      charging before then fails at the customer rather than here.
    */
    canAcceptPayments: Boolean(accountId) && chargesEnabled,
    state,
  };
}

/** The Stripe account id for a shop, creating the account on first use. */
export async function ensureConnectAccount(
  business: Pick<Business, "id" | "name" | "ownerEmail" | "slug"> &
    Partial<ConnectFields>,
): Promise<string> {
  const existing = business.stripeConnectAccountId?.trim();
  if (existing) return existing;

  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();

  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: business.ownerEmail ?? undefined,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: business.name,
      mcc: TRADE_MCC,
      url: `${baseUrl}/s/${business.slug}`,
    },
    metadata: { businessId: business.id, product: "orvius" },
  });

  await prisma.business.update({
    where: { id: business.id },
    data: {
      stripeConnectAccountId: account.id,
      stripeConnectChargesEnabled: account.charges_enabled ?? false,
      stripeConnectPayoutsEnabled: account.payouts_enabled ?? false,
      stripeConnectDetailsSubmitted: account.details_submitted ?? false,
      stripeConnectUpdatedAt: new Date(),
    },
  });

  return account.id;
}

/**
 * A one-time Stripe-hosted onboarding URL.
 *
 * These links are single-use and expire in minutes, so one is minted per click
 * rather than stored. `refresh_url` is where Stripe sends an owner whose link
 * went stale, and it has to mint another one instead of showing an error.
 */
export async function createConnectOnboardingLink(params: {
  accountId: string;
  returnPath?: string;
}) {
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const returnPath = params.returnPath ?? "/dashboard/billing";

  const link = await stripe.accountLinks.create({
    account: params.accountId,
    refresh_url: `${baseUrl}/api/connect/refresh`,
    return_url: `${baseUrl}${returnPath}?connect=done`,
    type: "account_onboarding",
  });

  return link.url;
}

/** Express dashboard link, where a shop sees its own payouts and balance. */
export async function createConnectLoginLink(accountId: string) {
  const stripe = getStripe();
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

/** Persist Stripe's capability verdict for an account. */
export async function syncConnectAccount(account: Stripe.Account) {
  const businessId = account.metadata?.businessId?.trim();

  const business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId } })
    : await prisma.business.findFirst({
        where: { stripeConnectAccountId: account.id },
      });

  if (!business) return { unmatched: true as const, accountId: account.id };

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      stripeConnectAccountId: account.id,
      stripeConnectChargesEnabled: account.charges_enabled ?? false,
      stripeConnectPayoutsEnabled: account.payouts_enabled ?? false,
      stripeConnectDetailsSubmitted: account.details_submitted ?? false,
      stripeConnectUpdatedAt: new Date(),
    },
  });

  return { business: updated, status: getConnectStatus(updated) };
}

/**
 * Pull the account fresh from Stripe.
 *
 * Verification can complete while nobody is looking at the dashboard, and a
 * missed `account.updated` would leave a cleared shop unable to take cards
 * with no way to notice. Any read of Connect status can call this to be sure.
 */
export async function refreshConnectAccount(
  business: Pick<Business, "id"> & Partial<ConnectFields>,
) {
  const accountId = business.stripeConnectAccountId?.trim();
  if (!accountId) return null;

  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  const result = await syncConnectAccount(account);
  return "unmatched" in result ? null : result.status;
}
