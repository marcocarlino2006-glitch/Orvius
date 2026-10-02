import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllowedEmails } from "@/lib/auth-allowlist";
import { findPaidCheckoutSessionId } from "@/lib/billing-sync";
import { CheckoutNotPaidError, provisionFromCheckout, shopDraftSchema } from "@/lib/checkout-shop";
import { logWarn } from "@/lib/logger";
import { isStripeCheckoutConfigured } from "@/lib/stripe";
import { isOnboardingComplete } from "@/lib/provision-business";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { canCreateShopForEmail } from "@/lib/self-serve-signup";
import { getOwnerSetupStatus } from "@/lib/owner-setup-state";
import { resolveShopAccess } from "@/lib/workspace-access";
import { z } from "zod";

/* Details are optional: a checkout that carried them builds the shop from Stripe. */
const createSchema = shopDraftSchema.partial({ name: true, trade: true, ownerPhone: true }).extend({
  checkoutSessionId: z.string().min(8, "Paid checkout is required"),
});

export async function GET(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // The open workspace, owned or shared — an invited dispatcher owns no shop but is not unprovisioned.
  const business = (await resolveShopAccess(email))?.business ?? null;
  const setup = business ? getOwnerSetupStatus(business) : null;
  // A demo shop has no line to set up; it opens straight onto Command.
  const ready = business?.environment === "demo" || (setup?.ready ?? false);

  // Setup asks on open so an owner who paid and left comes back to the form, not "Pay first".
  let checkoutSessionId: string | null = null;
  if (!business && request.nextUrl.searchParams.get("resume") === "1" && isStripeCheckoutConfigured()) {
    checkoutSessionId = await findPaidCheckoutSessionId(email).catch((error: unknown) => {
      logWarn("onboarding.checkout_lookup_failed", { error: error instanceof Error ? error.message : "unknown" });
      return null;
    });
  }

  return NextResponse.json({
    provisioned: Boolean(business),
    complete: ready,
    ready,
    setup,
    checkoutSessionId,
    business: business
      ? {
          id: business.id,
          name: business.name,
          slug: business.slug,
          trade: business.trade,
          address: business.address,
          ownerPhone: business.ownerPhone,
          twilioPhone: business.twilioPhone,
          vapiPhoneNumber: business.vapiPhoneNumber,
          billingStatus: business.billingStatus,
          overflowForwardConfirmedAt:
            business.overflowForwardConfirmedAt?.toISOString() ?? null,
          lineVerifiedAt: business.lineVerifiedAt?.toISOString() ?? null,
        }
      : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invitedEmails = getAllowedEmails();
  const publicSignupReady = getPublicLaunchReadiness().ready;
  if (
    !canCreateShopForEmail(
      email,
      (normalized) => invitedEmails.includes(normalized),
      publicSignupReady,
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

  const limit = await sharedRateLimit({
    key: `onboarding:${clientIp(request)}`,
    limit: 6,
    windowMs: 60 * 60 * 1000,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many setup attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSec) },
      },
    );
  }

  if (await isOnboardingComplete(email)) {
    return NextResponse.json(
      { error: "Your shop is already set up" },
      { status: 409 },
    );
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((item) => item.message).join(", ") },
      { status: 400 },
    );
  }
  const { checkoutSessionId, ...typed } = parsed.data;
  const draft = typed.name || typed.ownerPhone ? shopDraftSchema.safeParse(typed) : null;
  if (draft && !draft.success) {
    return NextResponse.json(
      { error: draft.error.errors.map((item) => item.message).join(", ") },
      { status: 400 },
    );
  }

  try {
    let result;
    try {
      result = await provisionFromCheckout({ sessionId: checkoutSessionId, email, draft: draft?.data });
    } catch (error) {
      if (!(error instanceof CheckoutNotPaidError)) throw error;
      console.error("Paid checkout could not be verified:", error);
      return NextResponse.json(
        {
          error:
            "We couldn't confirm your payment yet. If you just paid, wait a minute and try again — or email hello@orvius.im and we'll finish setup with you.",
          code: "paid_checkout_required",
        },
        { status: 402 },
      );
    }
    if (result.status === "needs_details") {
      return NextResponse.json(
        { error: "Tell us your shop name and mobile to finish.", code: "shop_details_needed" },
        { status: 400 },
      );
    }
    if (result.status === "busy") {
      return NextResponse.json(
        { error: "Your line is being set up. This takes a few seconds.", code: "provision_in_progress" },
        { status: 409 },
      );
    }
    const { business } = result;
    const line = business.vapiPhoneNumber ?? business.twilioPhone;
    const setup = getOwnerSetupStatus(business);

    return NextResponse.json(
      {
        provisioned: true,
        complete: setup.ready,
        ready: setup.ready,
        setup,
        dedicatedLine: true,
        line,
        message: line
          ? `Your dedicated line is ${line}. Callers hear ${business.name}, not the marketing demo.`
          : "Setup complete.",
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          ownerPhone: business.ownerPhone,
          twilioPhone: business.twilioPhone,
          vapiPhoneNumber: business.vapiPhoneNumber,
          billingStatus: business.billingStatus,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Onboarding provision failed:", error);
    const message =
      error instanceof z.ZodError
        ? error.errors.map((e) => e.message).join(", ")
        : error instanceof Error
          ? error.message
          : "Failed to create shop";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
