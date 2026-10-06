import { NextRequest, NextResponse } from "next/server";
import { getAllowedEmails } from "@/lib/auth-allowlist";
import { canCreateShopForEmail } from "@/lib/self-serve-signup";
import { auth } from "@/auth";
import { isPrivilegedRequest } from "@/lib/admin-access";
import { company } from "@/lib/company";
import { prisma } from "@/lib/prisma";
import {
  canOfferCheckout,
  getPublicLaunchReadiness,
} from "@/lib/public-launch-readiness";
import {
  getAppBaseUrl,
  getBillingReadiness,
  getStripe,
  checkoutTaxParams,
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
import { shopHasLivePlan } from "@/lib/billing-sync";
import { stripeKeyMode } from "@/lib/stripe-mode";
import { forbiddenResponse } from "@/lib/tenant";
import { z } from "zod";
import { HIPAA_TRADE_REFUSAL, isHipaaTrade } from "@/lib/trades";
import { consentSchema, shopDraftMetadata, shopDraftSchema } from "@/lib/checkout-shop";
import { resolveShopAccess } from "@/lib/workspace-access";
import { ACQUISITION_COOKIE, parseAcquisition } from "@/lib/acquisition";
import { acquisitionMetadata, findReferrer } from "@/lib/referrals";

const checkoutSchema = z.object({
  /** Defaults to the signed-in email; when sent it must match it. */
  email: z.string().email().optional(),
  businessId: z.string().optional(),
  planId: z.enum(["line", "pro", "fleet"]).default("pro"),
  interval: z.enum(["month", "year"]).default("month"),
  /** A new shop's details, so paying is the last step before the line exists. */
  shop: shopDraftSchema.merge(consentSchema).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = checkoutSchema.parse(await request.json());
    if (body.shop && isHipaaTrade(body.shop.trade)) {
      return NextResponse.json({ error: HIPAA_TRADE_REFUSAL, code: "trade_not_offered" }, { status: 400 });
    }

    if (!isPlanCheckoutReady(body.planId, body.interval)) {
      /*
        The visitor gets the sentence; only we get the diagnosis. This branch
        runs before sign-in, so attaching the readiness object published the
        names of every Stripe variable still unset to anyone who posted here.
      */
      return NextResponse.json(
        {
          error:
            "Card checkout isn’t open for this plan yet. Open Billing and pay with a plan that’s ready, or email hello@orvius.im.",
          ...((await isPrivilegedRequest(request))
            ? { billing: getBillingReadiness() }
            : {}),
        },
        { status: 503 },
      );
    }

    const authSession = await auth();
    const sessionEmail = authSession?.user?.email?.toLowerCase();

    if (!sessionEmail) {
      return NextResponse.json({ error: "Sign in to subscribe" }, { status: 401 });
    }

    if (body.email && sessionEmail !== body.email.toLowerCase()) {
      return forbiddenResponse();
    }

    const plan = getPlanById(body.planId);
    const stripe = getStripe();
    const baseUrl = getAppBaseUrl();

    const business = body.businessId
      ? await prisma.business.findFirst({
          where: { id: body.businessId, ownerEmail: sessionEmail },
        })
      : ((await resolveShopAccess(sessionEmail).then((a) => (a?.role === "owner" ? a.business : null))) ??
        (await prisma.business.findFirst({
          where: { ownerEmail: sessionEmail },
          orderBy: { createdAt: "asc" },
        })));

    /*
      A shop that is already paying changes plans in the billing portal. A
      second checkout would open a second subscription and charge twice.
    */
    if (business && shopHasLivePlan(business)) {
      return NextResponse.json(
        {
          error: `${business.name} already has a plan. Change or update it in Settings → Billing.`,
          code: "already_subscribed",
          manageUrl: "/dashboard?settings=billing",
        },
        { status: 409 },
      );
    }

    // Paying must lead to a shop: someone who can't create one yet is not charged.
    if (
      !business &&
      !canCreateShopForEmail(
        sessionEmail,
        (normalized) => getAllowedEmails().includes(normalized),
        getPublicLaunchReadiness().ready,
      )
    ) {
      return NextResponse.json(
        {
          error: "Card signup isn't open yet. Book a call audit at orvius.im/pilot and we'll set up your shop with you.",
          code: "self_serve_signup_disabled",
        },
        { status: 403 },
      );
    }

    const setupPath = `/dashboard/onboarding?plan=${body.planId}&interval=${body.interval}`;
    if (!business && !body.shop) {
      return NextResponse.json(
        { error: "Tell us about your shop first.", code: "shop_details_needed", setupUrl: setupPath },
        { status: 409 },
      );
    }
    const shopMetadata =
      !business && body.shop ? shopDraftMetadata(shopDraftSchema.parse(body.shop), new Date()) : {};
    const acquisition = business ? null : parseAcquisition(request.cookies.get(ACQUISITION_COOKIE)?.value);
    const referralCoupon = process.env.ORVIUS_REFERRAL_COUPON_ID?.trim();
    const referred = Boolean(referralCoupon && acquisition?.ref && (await findReferrer(acquisition.ref)));

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      ...(business?.stripeCustomerId
        ? { customer: business.stripeCustomerId }
        : { customer_email: sessionEmail }),
      line_items: [
        {
          price: requireStripePriceIdForPlan(body.planId, body.interval),
          quantity: 1,
        },
      ],
      success_url: business
        ? `${baseUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`
        : `${baseUrl}/dashboard/onboarding?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: business ? `${baseUrl}/pricing?canceled=1` : `${baseUrl}${setupPath}&canceled=1`,
      // Stripe takes either a fixed discount or a promo-code box, not both.
      ...(referred ? { discounts: [{ coupon: referralCoupon }] } : { allow_promotion_codes: true }),
      ...checkoutTaxParams(Boolean(business?.stripeCustomerId)),
      subscription_data: {
        metadata: {
          product: plan.stripeProductKey ?? `orvius-${body.planId}`,
          planId: body.planId,
          interval: body.interval,
          businessId: business?.id ?? "",
        },
      },
      metadata: {
        product: plan.stripeProductKey ?? `orvius-${body.planId}`,
        planId: body.planId,
        interval: body.interval,
        businessId: business?.id ?? "",
        legalEntity: company.legalName,
        ...shopMetadata,
        ...acquisitionMetadata(acquisition),
      },
    });

    return NextResponse.json({
      ok: true,
      url: checkoutSession.url,
      plan: plan.name,
      planId: body.planId,
      interval: body.interval,
      amount: getPlanById(body.planId).price,
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

export async function GET(request: NextRequest) {
  const session = await auth();
  const publicLaunch = getPublicLaunchReadiness();
  const checkoutVisible = canOfferCheckout(
    session?.user?.email,
    publicLaunch.ready,
  );
  const plans = getPaidPlans().map((plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    annualPrice: plan.annualPrice ?? null,
    tagline: plan.tagline,
    featured: plan.featured ?? false,
    checkoutReady:
      checkoutVisible &&
      isPlanCheckoutReady(plan.id as PaidPlanId, "month"),
    checkoutReadyAnnual:
      checkoutVisible &&
      isPlanCheckoutReady(plan.id as PaidPlanId, "year"),
    configured: isStripePlanConfigured(plan.id as PaidPlanId),
  }));

  /*
    The pricing page needs to know whether it may offer a subscribe button, and
    that is all it reads. `readiness` names the unset variables and the dashboard
    pages to visit, so it stays with the caller who can act on it.
  */
  return NextResponse.json({
    configured: isStripeConfigured(),
    checkoutReady: isStripeCheckoutConfigured(),
    stripeMode: stripeKeyMode(),
    selfServeAvailable: publicLaunch.ready,
    plans,
    currency: "usd",
    legalEntity: company.legalName,
    ...((await isPrivilegedRequest(request))
      ? { readiness: getBillingReadiness() }
      : {}),
  });
}
