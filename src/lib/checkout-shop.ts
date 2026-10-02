import type Stripe from "stripe";
import { z } from "zod";
import { linkPaidCheckoutToBusiness, resolvePaidCheckoutActivation } from "@/lib/billing-sync";
import { logInfo, logWarn } from "@/lib/logger";
import { ProvisionBusyError } from "@/lib/provision-attempt";
import { findBusinessForOwner, provisionBusiness } from "@/lib/provision-business";
import { getStripe } from "@/lib/stripe";
import { TRADES } from "@/lib/trades";

/*
  The owner types their shop once, before paying. The details ride on the
  Stripe checkout session, so whichever arrives first — the webhook or the
  owner returning from Stripe — builds the line, and nobody fills a second
  form after paying.
*/

export const shopDraftSchema = z.object({
  name: z.string().trim().min(2, "Shop name must be at least 2 characters").max(120),
  trade: z.enum(TRADES),
  ownerPhone: z.string().trim().min(10, "Enter a valid mobile number for owner alerts").max(32),
  areaCode: z
    .string()
    .regex(/^[2-9]\d{2}$/, "Area code must be three digits")
    .optional(),
  phoneNumber: z
    .string()
    .regex(/^\+1[2-9]\d{9}$/, "Pick a number from the list")
    .optional(),
  timezone: z.string().max(64).optional(),
});

export type ShopDraft = z.infer<typeof shopDraftSchema>;

/** Checkout consent: terms and SMS alerts are agreed on the form, before the card. */
export const consentSchema = z.object({
  acceptedTerms: z.literal(true, { errorMap: () => ({ message: "Agree to the Terms to continue" }) }),
  acceptedSms: z.literal(true, { errorMap: () => ({ message: "Agree to SMS alerts to continue" }) }),
});

export function shopDraftMetadata(draft: ShopDraft, consentAt: Date): Record<string, string> {
  return {
    shop_name: draft.name,
    shop_trade: draft.trade,
    shop_owner_phone: draft.ownerPhone,
    shop_area_code: draft.areaCode ?? "",
    shop_phone_number: draft.phoneNumber ?? "",
    shop_timezone: draft.timezone ?? "",
    shop_consent_at: consentAt.toISOString(),
  };
}

export function shopDraftFromMetadata(metadata: Stripe.Metadata | null | undefined): ShopDraft | null {
  if (!metadata?.shop_name) return null;
  const parsed = shopDraftSchema.safeParse({
    name: metadata.shop_name,
    trade: metadata.shop_trade,
    ownerPhone: metadata.shop_owner_phone,
    areaCode: metadata.shop_area_code || undefined,
    phoneNumber: metadata.shop_phone_number || undefined,
    timezone: metadata.shop_timezone || undefined,
  });
  return parsed.success ? parsed.data : null;
}

/** The checkout isn't a paid plan for this account (yet); nothing was built. */
export class CheckoutNotPaidError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : "Checkout could not be verified");
    this.name = "CheckoutNotPaidError";
  }
}

export type CheckoutShopResult =
  | { status: "created" | "exists"; business: NonNullable<Awaited<ReturnType<typeof findBusinessForOwner>>> }
  | { status: "needs_details" }
  | { status: "busy" };

/**
 * Builds the shop a paid checkout was for. Safe to call from both the webhook
 * and the owner's browser at once: an existing shop is returned as is, and a
 * concurrent build reports busy instead of buying a second number.
 */
export async function provisionFromCheckout(params: {
  sessionId: string;
  email: string;
  /** Typed on the form after paying, for a checkout that carried no details. */
  draft?: ShopDraft;
  stripe?: Pick<Stripe, "checkout" | "subscriptions">;
}): Promise<CheckoutShopResult> {
  const email = params.email.toLowerCase().trim();
  const existing = await findBusinessForOwner(email);
  if (existing) return { status: "exists", business: existing };

  const stripe = params.stripe ?? getStripe();
  let session: Stripe.Checkout.Session;
  let billing: ReturnType<typeof resolvePaidCheckoutActivation>;
  try {
    session = await stripe.checkout.sessions.retrieve(params.sessionId, { expand: ["subscription"] });
    const subRef = session.subscription;
    if (!subRef) throw new Error("Checkout has no subscription");
    const subscription = typeof subRef === "string" ? await stripe.subscriptions.retrieve(subRef) : subRef;
    billing = resolvePaidCheckoutActivation(session, subscription, email);
  } catch (error) {
    throw new CheckoutNotPaidError(error);
  }
  const draft = params.draft ?? shopDraftFromMetadata(session.metadata);
  if (!draft) return { status: "needs_details" };

  try {
    const { business } = await provisionBusiness({
      name: draft.name,
      trade: draft.trade,
      ownerEmail: email,
      ownerPhone: draft.ownerPhone,
      timezone: draft.timezone,
      line: {
        areaCode: draft.areaCode ? Number(draft.areaCode) : null,
        phoneNumber: draft.phoneNumber ?? null,
      },
      billing,
    });
    await linkPaidCheckoutToBusiness(billing, business.id).catch((error: unknown) => {
      logWarn("checkout_shop.link_failed", { error: error instanceof Error ? error.message : "unknown" });
    });
    logInfo("checkout_shop.created", { businessId: business.id, from: params.draft ? "form" : "checkout" });
    return { status: "created", business };
  } catch (error) {
    if (error instanceof ProvisionBusyError) return { status: "busy" };
    const raced = await findBusinessForOwner(email);
    if (raced) return { status: "exists", business: raced };
    throw error;
  }
}
