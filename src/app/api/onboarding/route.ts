import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAllowedEmails } from "@/lib/auth-allowlist";
import {
  getPaidCheckoutActivation,
  linkPaidCheckoutToBusiness,
} from "@/lib/billing-sync";
import {
  findBusinessForOwner,
  isOnboardingComplete,
  provisionBusiness,
} from "@/lib/provision-business";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { canCreateShopForEmail } from "@/lib/self-serve-signup";
import { getOwnerSetupStatus } from "@/lib/owner-setup-state";
import { TRADES } from "@/lib/trades";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(2, "Shop name must be at least 2 characters"),
  trade: z.enum(TRADES),
  ownerPhone: z
    .string()
    .min(10, "Enter a valid mobile number for owner alerts"),
  greeting: z.string().max(280).optional(),
  timezone: z.string().optional(),
  checkoutSessionId: z.string().min(8, "Paid checkout is required"),
});

export async function GET() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();

  if (!email || !session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await findBusinessForOwner(email);
  const setup = business ? getOwnerSetupStatus(business) : null;

  return NextResponse.json({
    provisioned: Boolean(business),
    complete: setup?.ready ?? false,
    ready: setup?.ready ?? false,
    setup,
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
    limit: 3,
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

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors.map((item) => item.message).join(", ") },
      { status: 400 },
    );
  }

  let billing;
  try {
    billing = await getPaidCheckoutActivation(
      parsed.data.checkoutSessionId,
      email,
    );
  } catch (error) {
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

  try {
    const body = parsed.data;
    const { business } = await provisionBusiness({
      name: body.name,
      trade: body.trade,
      ownerEmail: email,
      ownerPhone: body.ownerPhone,
      greeting: body.greeting,
      timezone: body.timezone,
      billing,
    });

    try {
      await linkPaidCheckoutToBusiness(billing, business.id);
    } catch (error) {
      console.error("Could not attach Stripe metadata after provisioning:", error);
    }

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
