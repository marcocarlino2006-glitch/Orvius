import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { company } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import {
  getAppBaseUrl,
  getBillingReadiness,
  getStripe,
  isStripeCheckoutConfigured,
  isStripeConfigured,
  isStripePlanConfigured,
  requireStripePriceIdForPlan,
} from "@/lib/stripe";
import {
  getPaidPlans,
  getPlanById,
  isPlanCheckoutReady,
  type PaidPlanId,
} from "@/lib/pricing-plans";
import { forbiddenResponse } from "@/lib/tenant";
import { z } from "zod";

const checkoutSchema = z.object({
  email: z.string().email(),
  businessId: z.string().optional(),
  planId: z.enum(["line", "pro", "fleet"]).default("pro"),
});

export async function POST(request: NextRequest) {
  try {
    const body = checkoutSchema.parse(await request.json());

    if (!isPlanCheckoutReady(body.planId)) {
      const readiness = getBillingReadiness();
      return NextResponse.json(
        {
          error:
            "Billing is not configured yet for this plan. Apply for the pilot and we will send a checkout link after your trial.",
          billing: readiness,
        },
        { status: 503 },
      );
    }

    const authSession = await auth();
    const sessionEmail = authSession?.user?.email?.toLowerCase();

    if (!sessionEmail) {
      return NextResponse.json({ error: "Sign in to subscribe" }, { status: 401 });
    }

    if (sessionEmail !== body.email.toLowerCase()) {
      return forbiddenResponse();
    }

    const plan = getPlanById(body.planId);
    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();

    const business = body.businessId
      ? await prisma.business.findFirst({
          where: { id: body.businessId, ownerEmail: sessionEmail },
        })
      : await prisma.business.findFirst({
          where: { ownerEmail: sessionEmail },
          orderBy: { createdAt: "asc" },
        });

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(business?.stripeCustomerId
        ? { customer: business.stripeCustomerId }
        : { customer_email: body.email }),
      line_items: [
        {
          price: requireStripePriceIdForPlan(body.planId),
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing?canceled=1`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      subscription_data: {
        metadata: {
          product: plan.stripeProductKey ?? `orvius-${body.planId}`,
          planId: body.planId,
          businessId: business?.id ?? "",
        },
      },
      metadata: {
        product: plan.stripeProductKey ?? `orvius-${body.planId}`,
        planId: body.planId,
        businessId: business?.id ?? "",
        legalEntity: company.legalName,
      },
    });

    return NextResponse.json({
      ok: true,
      url: checkoutSession.url,
      plan: plan.name,
      planId: body.planId,
      amount: plan.price,
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Checkout failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  const readiness = getBillingReadiness();
  const plans = getPaidPlans().map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    tagline: plan.tagline,
    featured: plan.featured ?? false,
    checkoutReady: isPlanCheckoutReady(plan.id as PaidPlanId),
    configured: isStripePlanConfigured(plan.id as PaidPlanId),
  }));

  return NextResponse.json({
    configured: isStripeConfigured(),
    checkoutReady: isStripeCheckoutConfigured(),
    readiness,
    plans,
    currency: "usd",
    legalEntity: company.legalName,
  });
}
