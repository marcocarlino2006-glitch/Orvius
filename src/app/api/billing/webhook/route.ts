import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

import { isPaidPlanId } from "@/lib/pricing-plans";

export const runtime = "nodejs";

function resolveBillingPlan(subscription: Stripe.Subscription): string | null {
  const planId = subscription.metadata.planId?.trim();
  if (planId && isPaidPlanId(planId)) return planId;

  const product = subscription.metadata.product?.trim();
  if (product === "orvius-line") return "line";
  if (product === "orvius-pro") return "pro";
  if (product === "orvius-fleet") return "fleet";

  return null;
}

async function syncSubscription(
  subscription: Stripe.Subscription,
  customerEmail?: string | null,
) {
  const businessId = subscription.metadata.businessId?.trim();
  let business = businessId
    ? await prisma.business.findUnique({ where: { id: businessId } })
    : null;

  if (!business && customerEmail) {
    business = await prisma.business.findFirst({
      where: { ownerEmail: customerEmail },
      orderBy: { createdAt: "asc" },
    });
  }

  if (!business) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const billingStatus =
    subscription.status === "active" || subscription.status === "trialing"
      ? "active"
      : subscription.status === "past_due"
        ? "past_due"
        : subscription.status === "canceled" ||
            subscription.status === "unpaid"
          ? "canceled"
          : "pilot";

  await prisma.business.update({
    where: { id: business.id },
    data: {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      billingStatus,
      billingPlan: resolveBillingPlan(subscription),
      ownerEmail: business.ownerEmail ?? customerEmail ?? undefined,
    },
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not configured" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const stripe = getStripe();
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription" || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id,
        );

        if (session.metadata?.businessId || session.metadata?.planId) {
          await stripe.subscriptions.update(subscription.id, {
            metadata: {
              ...subscription.metadata,
              businessId: session.metadata.businessId ?? subscription.metadata.businessId ?? "",
              planId: session.metadata.planId ?? subscription.metadata.planId ?? "pro",
              product: session.metadata.product ?? subscription.metadata.product ?? "orvius-pro",
            },
          });
        }

        await syncSubscription(subscription, session.customer_email);
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customer =
          typeof subscription.customer === "string"
            ? await stripe.customers.retrieve(subscription.customer)
            : subscription.customer;

        const email =
          customer && !("deleted" in customer) ? customer.email : null;
        await syncSubscription(subscription, email);
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
