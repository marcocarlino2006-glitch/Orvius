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
  | "payouts_pending"
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
    if (chargesEnabled && payoutsEnabled) state = "ready";
    else if (chargesEnabled && !payoutsEnabled) state = "payouts_pending";
    else if (detailsSubmitted) state = "verifying";
    else state = "in_progress";
  }

  return {
    accountId,
    chargesEnabled,
    payoutsEnabled,
    detailsSubmitted,
    /*
      Charges without payouts means the customer's card works but money may
      never reach the shop bank — that is not "live" for a multi-b money rail.
      Both Stripe verdicts must clear before we ask for a card.
    */
    canAcceptPayments: Boolean(accountId) && chargesEnabled && payoutsEnabled,
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

/**
 * Persist Stripe's capability verdict for an account.
 *
 * `expectBusinessId` is for callers that already know which shop the account
 * must belong to. The check has to happen before the write: the account id is
 * unique per shop, so persisting a resolution that disagrees with the caller
 * would either steal the id from its real owner or fail on the constraint,
 * and neither tells the caller what went wrong.
 */
export async function syncConnectAccount(
  account: Stripe.Account,
  expectBusinessId?: string,
) {
  const businessId = account.metadata?.businessId?.trim();

  const business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId } })
    : await prisma.business.findFirst({
        where: { stripeConnectAccountId: account.id },
      });

  if (!business) return { unmatched: true as const, accountId: account.id };

  if (expectBusinessId && business.id !== expectBusinessId) {
    return {
      mismatch: true as const,
      accountId: account.id,
      resolvedBusinessId: business.id,
    };
  }

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

  /*
    Scoped to the shop that asked. Stripe resolves the account by its own
    metadata, so without this a mis-keyed id would report another shop's
    payment status on this owner's dashboard — and tell them they can take
    cards when their own account is nowhere near cleared.
  */
  const result = await syncConnectAccount(account, business.id);
  if ("unmatched" in result) return null;
  if ("mismatch" in result) {
    console.error("connect.refresh_owner_mismatch", {
      requested: business.id,
      resolved: result.resolvedBusinessId,
      accountId,
    });
    return null;
  }

  return result.status;
}
