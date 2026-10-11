import { logInfo, logWarn } from "@/lib/logger";
import { alertPaymentFailed } from "@/lib/owner-nudges";
import { isPaused } from "@/lib/billing-entitlement";
import { resumeShopLine, suspendShopLine } from "@/lib/line-lifecycle";
import { pauseFieldsFromSubscription } from "@/lib/plan-pause";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { isPaidPlanId, planIdForStripePriceId } from "@/lib/pricing-plans";
import type Stripe from "stripe";

/**
 * Which plan a shop is entitled to, read from what it is being billed for.
 *
 * This used to read `metadata.planId` first, and metadata is written by one
 * place only: our own checkout. Stripe's customer portal changes the
 * subscription's price and leaves metadata alone, so every plan change made
 * there used to land as a billing change with no entitlement change:
 *
 *   Line → Fleet  charged the higher price, still gated to Line modules.
 *   Fleet → Line  charged the lower price, kept every Fleet module.
 *
 * One is a refund and a support ticket, the other is revenue leaking for as
 * long as the shop stays. The price is the fact; metadata is a hint, so it is
 * now only the fallback for a subscription created outside checkout — a
 * dashboard comp, a migrated price id — where there is nothing better to read.
 */
export function resolveBillingPlan(subscription: Stripe.Subscription): string | null {
  for (const item of subscription.items?.data ?? []) {
    const price = item.price as Stripe.Price | string | null | undefined;
    const priceId = typeof price === "string" ? price : price?.id;
    if (!priceId) continue;

    const fromPrice = planIdForStripePriceId(priceId);
    if (fromPrice) return fromPrice;
  }

  const planId = subscription.metadata.planId?.trim();
  if (planId && isPaidPlanId(planId)) return planId;

  const product = subscription.metadata.product?.trim();
  if (product === "orvius-line") return "line";
  if (product === "orvius-pro") return "pro";
  if (product === "orvius-fleet") return "fleet";

  return null;
}

/** How often the shop is charged, from its subscription's recurring price. */
export function resolveBillingInterval(subscription: Stripe.Subscription): "month" | "year" | null {
  for (const item of subscription.items?.data ?? []) {
    const price = item.price as Stripe.Price | string | null | undefined;
    if (!price || typeof price === "string") continue;
    const interval = price.recurring?.interval;
    if (interval === "month" || interval === "year") return interval;
  }
  return null;
}

export function mapStripeStatusToBilling(
  status: Stripe.Subscription.Status,
): "active" | "past_due" | "canceled" | "incomplete" {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  if (status === "canceled" || status === "unpaid") return "canceled";
  // incomplete / incomplete_expired / paused — not entitled, not a free pilot revival
  return "incomplete";
}

/** A shop already on a plan changes it in the billing portal; a second checkout would charge twice. */
export function shopHasLivePlan(business: { stripeSubscriptionId: string | null; billingStatus: string | null }) {
  return Boolean(business.stripeSubscriptionId) && (business.billingStatus === "active" || business.billingStatus === "past_due");
}

export type PaidCheckoutActivation = {
  customerId: string;
  subscriptionId: string;
  planId: string;
};

export function resolvePaidCheckoutActivation(
  session: Stripe.Checkout.Session,
  subscription: Stripe.Subscription,
  expectedEmail: string,
): PaidCheckoutActivation {
  if (session.mode !== "subscription") {
    throw new Error("Checkout is not a subscription");
  }

  const checkoutEmail = (
    session.customer_email ??
    session.customer_details?.email ??
    ""
  ).toLowerCase();
  if (!checkoutEmail || checkoutEmail !== expectedEmail.toLowerCase()) {
    throw new Error("Checkout does not belong to this account");
  }

  if (mapStripeStatusToBilling(subscription.status) !== "active") {
    throw new Error("Complete payment before creating your shop line");
  }

  const planId = resolveBillingPlan(subscription);
  if (!planId) {
    throw new Error("Checkout plan could not be verified");
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  return {
    customerId,
    subscriptionId: subscription.id,
    planId,
  };
}

export async function getPaidCheckoutActivation(
  sessionId: string,
  expectedEmail: string,
): Promise<PaidCheckoutActivation> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });
  const subRef = session.subscription;
  if (!subRef) throw new Error("Checkout has no subscription");
  const subscription =
    typeof subRef === "string"
      ? await stripe.subscriptions.retrieve(subRef)
      : subRef;
  return resolvePaidCheckoutActivation(session, subscription, expectedEmail);
}

/**
 * The owner's completed plan checkout, for coming back to setup without the
 * success page's link. getPaidCheckoutActivation still verifies it on use.
 */
export async function findPaidCheckoutSessionId(email: string): Promise<string | null> {
  const stripe = getStripe();
  const sessions = await stripe.checkout.sessions.list({
    customer_details: { email: email.toLowerCase() },
    status: "complete",
    limit: 10,
  });
  return sessions.data.find((s) => s.mode === "subscription" && s.subscription)?.id ?? null;
}

export async function linkPaidCheckoutToBusiness(
  activation: PaidCheckoutActivation,
  businessId: string,
) {
  const stripe = getStripe();
  await stripe.subscriptions.update(activation.subscriptionId, {
    metadata: {
      businessId,
      planId: activation.planId,
      product: `orvius-${activation.planId}`,
    },
  });
}

/**
 * Sync Stripe subscription → Business billing fields.
 * Returns business id when matched, null when no shop found.
 */
export async function syncSubscriptionToBusiness(
  subscription: Stripe.Subscription,
  customerEmail?: string | null,
): Promise<{ businessId: string; ignored?: true } | { unmatched: true }> {
  const businessId = subscription.metadata.businessId?.trim();
  let business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId } })
    : null;

  if (!business && customerEmail) {
    business = await prisma.business.findFirst({
      where: { ownerEmail: customerEmail.toLowerCase() },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!business && subscription.customer) {
    const customerId =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    business = await prisma.business.findFirst({
      where: { stripeCustomerId: customerId },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!business) {
    return { unmatched: true };
  }

  /*
    Only the shop's current subscription may move its billing. A second
    subscription on the same shop (a repeat checkout, a dashboard comp) used
    to overwrite the first, so cancelling the old one in the portal marked a
    paying shop canceled and suspended its line. A different subscription is
    adopted only once it is paying; until then its events are recorded and
    left alone.
  */
  const mapped = mapStripeStatusToBilling(subscription.status);
  if (business.stripeSubscriptionId && business.stripeSubscriptionId !== subscription.id && mapped !== "active") {
    logInfo("billing.other_subscription_ignored", {
      businessId: business.id,
      currentSubscriptionId: business.stripeSubscriptionId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
    return { businessId: business.id, ignored: true as const };
  }

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const billingStatus =
    mapped === "incomplete" ? "canceled" : mapped;

  const now = new Date();
  const previous = business.billingStatus;
  const updated = await prisma.business.update({
    where: { id: business.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      billingStatus,
      billingPlan: resolveBillingPlan(subscription),
      billingInterval: resolveBillingInterval(subscription) ?? business.billingInterval,
      ownerEmail: business.ownerEmail ?? customerEmail?.toLowerCase() ?? undefined,
      pastDueSince: billingStatus === "past_due" ? (business.pastDueSince ?? now) : null,
      canceledAt: billingStatus === "canceled" ? (business.canceledAt ?? now) : null,
      ...pauseFieldsFromSubscription(subscription, business, now),
    },
  });

  if (billingStatus === "past_due" && previous !== "past_due") {
    await alertPaymentFailed(updated).catch((error: unknown) =>
      logWarn("billing.past_due_alert_failed", { businessId: updated.id, error: error instanceof Error ? error.message : "unknown" }),
    );
  }
  if (billingStatus === "canceled" && previous !== "canceled") {
    await suspendShopLine(updated);
  } else if (
    billingStatus === "active" &&
    (previous === "canceled" || updated.lineSuspendedAt) &&
    !updated.lineReleasedAt &&
    !isPaused(updated, now)
  ) {
    await resumeShopLine(updated);
  }

  return { businessId: business.id };
}

/** Activate from a Checkout session id (success-page fallback if webhook is slow). */
export async function confirmCheckoutSession(
  sessionId: string,
  expectedEmail: string,
) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.mode !== "subscription") {
    return { ok: false as const, error: "Not a subscription checkout" };
  }

  const checkoutEmail = (
    session.customer_email ??
    session.customer_details?.email ??
    ""
  ).toLowerCase();
  if (!checkoutEmail || checkoutEmail !== expectedEmail.toLowerCase()) {
    return {
      ok: false as const,
      error: "Checkout does not belong to this account",
    };
  }

  const subRef = session.subscription;
  if (!subRef) {
    return { ok: false as const, error: "No subscription on session yet" };
  }

  const subscription =
    typeof subRef === "string"
      ? await stripe.subscriptions.retrieve(subRef)
      : subRef;

  if (session.metadata?.businessId || session.metadata?.planId) {
    await stripe.subscriptions.update(subscription.id, {
      metadata: {
        ...subscription.metadata,
        businessId:
          session.metadata.businessId ?? subscription.metadata.businessId ?? "",
        planId: session.metadata.planId ?? subscription.metadata.planId ?? "pro",
        product:
          session.metadata.product ?? subscription.metadata.product ?? "orvius-pro",
      },
    });
  }

  const refreshed = await stripe.subscriptions.retrieve(subscription.id);
  const result = await syncSubscriptionToBusiness(
    refreshed,
    session.customer_email ?? session.customer_details?.email,
  );

  if ("unmatched" in result) {
    return {
      ok: false as const,
      error: "Checkout paid but no shop matched — contact support with your receipt",
      sessionStatus: session.status,
      subscriptionStatus: refreshed.status,
    };
  }

  const business = await prisma.business.findUnique({
    where: { id: result.businessId },
    select: {
      id: true,
      name: true,
      billingStatus: true,
      billingPlan: true,
    },
  });

  return {
    ok: true as const,
    business,
    sessionStatus: session.status,
    subscriptionStatus: refreshed.status,
  };
}
