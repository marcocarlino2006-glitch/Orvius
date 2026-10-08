import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/tenant";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { logError } from "@/lib/logger";

export async function POST(_request: NextRequest) {
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

    const stripe = getStripe();
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
      return_url: `${getAppBaseUrl()}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    logError("billing.portal_failed", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Stripe didn't open your billing page. Nothing was changed. Try again, or email support and we'll cancel or update it for you." },
      { status: 502 },
    );
  }
}
