import { NextResponse } from "next/server";
import { syncSubscriptionToBusiness } from "@/lib/billing-sync";
import { fulfillEstimateCheckoutSession } from "@/lib/estimate-pay";
import { getStripe } from "@/lib/stripe";
import type Stripe from "stripe";

export const runtime = "nodejs";

function resolveInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const legacy = (invoice as { subscription?: string | { id: string } | null })
    .subscription;
  if (typeof legacy === "string" && legacy) return legacy;
  if (legacy && typeof legacy === "object" && "id" in legacy) return legacy.id;

  const parent = (
    invoice as {
      parent?: {
        subscription_details?: {
          subscription?: string | Stripe.Subscription | null;
        } | null;
      } | null;
    }
  ).parent;
  const sub = parent?.subscription_details?.subscription;
  if (typeof sub === "string" && sub) return sub;
  if (sub && typeof sub === "object" && "id" in sub) return sub.id;
  return null;
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

        if (session.mode === "payment" && session.metadata?.kind === "estimate_pay") {
          await fulfillEstimateCheckoutSession(session);
          break;
        }

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
              businessId:
                session.metadata.businessId ??
                subscription.metadata.businessId ??
                "",
              planId:
                session.metadata.planId ?? subscription.metadata.planId ?? "pro",
              product:
                session.metadata.product ??
                subscription.metadata.product ??
                "orvius-pro",
            },
          });
        }

        const refreshed = await stripe.subscriptions.retrieve(subscription.id);
        const result = await syncSubscriptionToBusiness(
          refreshed,
          session.customer_email ?? session.customer_details?.email,
        );
        if ("unmatched" in result) {
          console.error(
            "[billing.webhook] checkout.session.completed unmatched",
            session.id,
            session.customer_email,
          );
        }
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
        const result = await syncSubscriptionToBusiness(subscription, email);
        if ("unmatched" in result) {
          console.error(
            "[billing.webhook] subscription event unmatched",
            event.type,
            subscription.id,
          );
        }
        break;
      }
      case "invoice.payment_failed":
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = resolveInvoiceSubscriptionId(invoice);
        if (!subId) break;
        const subscription = await stripe.subscriptions.retrieve(subId);
        await syncSubscriptionToBusiness(
          subscription,
          invoice.customer_email,
        );
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
