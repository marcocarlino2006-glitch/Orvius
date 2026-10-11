import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { requirePermission } from "@/lib/tenant";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { ensurePortalConfiguration } from "@/lib/billing-portal";
import { logError, logWarn } from "@/lib/logger";

/*
  "cancel" and "switch" open Stripe straight on that step, so an owner who
  already chose on the pause-or-cancel panel isn't dropped on a menu. If the
  portal is not set up for the step, the plain portal still opens.
*/
function flowFor(flow: unknown, subscription: string | null): Stripe.BillingPortal.SessionCreateParams.FlowData | undefined {
  if (!subscription) return undefined;
  if (flow === "cancel") return { type: "subscription_cancel", subscription_cancel: { subscription } };
  if (flow === "switch") return { type: "subscription_update", subscription_update: { subscription } };
  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePermission("billing.manage", { entitled: false });
    if ("error" in authResult) return authResult.error;
    const { business } = authResult;

    if (!business?.stripeCustomerId) {
      return NextResponse.json(
        {
          error:
            "No Stripe customer on file yet. Pay with card on Billing first, or contact support.",
        },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { flow?: unknown };
    const stripe = getStripe();
    const configuration = await ensurePortalConfiguration(stripe);
    const base = {
      customer: business.stripeCustomerId,
      return_url: `${getAppBaseUrl()}/dashboard/billing`,
      ...(configuration ? { configuration } : {}),
    };
    const flow_data = flowFor(body.flow, business.stripeSubscriptionId);
    if (flow_data) {
      try {
        const session = await stripe.billingPortal.sessions.create({ ...base, flow_data });
        return NextResponse.json({ url: session.url });
      } catch (error) {
        logWarn("billing.portal_flow_failed", { flow: flow_data.type, error: error instanceof Error ? error.message : String(error) });
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create(base);
    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    logError("billing.portal_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Stripe didn't open your billing page. Nothing was changed. Try again, or email support and we'll cancel or update it for you." },
      { status: 502 },
    );
  }
}
