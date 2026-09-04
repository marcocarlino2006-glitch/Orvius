import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { isPaidPlanId } from "@/lib/pricing-plans";
import type Stripe from "stripe";

export function resolveBillingPlan(subscription: Stripe.Subscription): string | null {
  const planId = subscription.metadata.planId?.trim();
  if (planId && isPaidPlanId(planId)) return planId;

  const product = subscription.metadata.product?.trim();
  if (product === "orvius-line") return "line";
  if (product === "orvius-pro") return "pro";
  if (product === "orvius-fleet") return "fleet";

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

/**
 * Sync Stripe subscription → Business billing fields.
 * Returns business id when matched, null when no shop found.
 */
export async function syncSubscriptionToBusiness(
  subscription: Stripe.Subscription,
  customerEmail?: string | null,
): Promise<{ businessId: string } | { unmatched: true }> {
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

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const mapped = mapStripeStatusToBilling(subscription.status);
  const billingStatus =
    mapped === "incomplete" ? "canceled" : mapped;

  await prisma.business.update({
    where: { id: business.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      billingStatus,
      billingPlan: resolveBillingPlan(subscription),
      ownerEmail: business.ownerEmail ?? customerEmail?.toLowerCase() ?? undefined,
    },
  });

  return { businessId: business.id };
}

/** Activate from a Checkout session id (success-page fallback if webhook is slow). */
export async function confirmCheckoutSession(sessionId: string) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["subscription"],
  });

  if (session.mode !== "subscription") {
    return { ok: false as const, error: "Not a subscription checkout" };
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
