import { NextRequest, NextResponse } from "next/server";
import { ProvisionBusyError } from "@/lib/provision-attempt";
import { auth } from "@/auth";
import { getAllowedEmails } from "@/lib/auth-allowlist";
import {
  findPaidCheckoutSessionId,
  getPaidCheckoutActivation,
  linkPaidCheckoutToBusiness,
} from "@/lib/billing-sync";
import { logWarn } from "@/lib/logger";
import { isStripeCheckoutConfigured } from "@/lib/stripe";
import {
  isOnboardingComplete,
  provisionBusiness,
} from "@/lib/provision-business";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";
import { clientIp, sharedRateLimit } from "@/lib/rate-limit";
import { canCreateShopForEmail } from "@/lib/self-serve-signup";
import { getOwnerSetupStatus } from "@/lib/owner-setup-state";
import { TRADES } from "@/lib/trades";
import { resolveShopAccess } from "@/lib/workspace-access";
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
  areaCode: z
    .string()
    .regex(/^[2-9]\d{2}$/, "Area code must be three digits")
    .optional(),
  phoneNumber: z
    .string()
    .regex(/^\+1[2-9]\d{9}$/, "Pick a number from the list")
    .optional(),
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
    complete: setup?.ready ?? false,
    ready: setup?.ready ?? false,
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
      line: {
        areaCode: body.areaCode ? Number(body.areaCode) : null,
        phoneNumber: body.phoneNumber ?? null,
      },
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
    if (error instanceof ProvisionBusyError) {
      return NextResponse.json({ error: error.message, code: "provision_in_progress" }, { status: 409 });
    }
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
