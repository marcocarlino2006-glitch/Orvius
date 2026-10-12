import type Stripe from "stripe";

import { recordAudit } from "@/lib/audit";
import { logError, logWarn } from "@/lib/logger";
import { formatCentsExact } from "@/lib/money";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/*
  Shared rules for a customer paying a shop by card through Checkout: one open
  session per bill, money counted only once it has actually cleared, and a
  second payment on a bill that is already settled handed straight back.
*/

/**
 * "complete" only means the customer finished the form. A bank debit
 * completes with the money still days away and may never arrive, so only a
 * cleared payment counts.
 */
export function checkoutSessionPaid(session: Pick<Stripe.Checkout.Session, "payment_status">): boolean {
  return session.payment_status === "paid" || session.payment_status === "no_payment_required";
}

/**
 * The session already open for this bill, if it still charges the right
 * amount. Every press of Pay used to mint a new session, each payable for a
 * day, so a customer with the link in two tabs, or a tech's phone and the
 * customer's, could pay twice. A session for a different amount is expired so
 * only the current price can be paid.
 */
export async function reuseOpenCheckoutSession(params: {
  sessionId: string | null | undefined;
  stripeAccount: string;
  amountCents: number;
}): Promise<Stripe.Checkout.Session | null> {
  if (!params.sessionId) return null;
  const stripe = getStripe();
  try {
    const open = await stripe.checkout.sessions.retrieve(params.sessionId, { stripeAccount: params.stripeAccount });
    if (open.status !== "open") return null;
    if (open.amount_total === params.amountCents && open.url) return open;
    await stripe.checkout.sessions.expire(params.sessionId, {}, { stripeAccount: params.stripeAccount });
  } catch (error) {
    logWarn("checkout.reuse_failed", {
      sessionId: params.sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return null;
}

/** The PaymentIntent behind a session, whether Stripe expanded it or not. */
export function sessionPaymentIntentId(session: Pick<Stripe.Checkout.Session, "payment_intent">): string | null {
  return typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);
}

/**
 * A card payment landed on a bill that was already settled. The customer is
 * refunded in full, fee included, and the owner is told either way, because a
 * refund that fails still leaves a customer charged twice.
 */
export async function refundDuplicateCheckout(params: {
  session: Pick<Stripe.Checkout.Session, "id" | "payment_intent" | "amount_total">;
  businessId: string;
  entityType: "invoice" | "deposit";
  entityId: string;
  what: string;
}): Promise<{ refunded: boolean }> {
  const amount = params.session.amount_total ?? 0;
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { name: true, ownerPhone: true, ownerEmail: true, stripeConnectAccountId: true },
  });
  const paymentIntent = sessionPaymentIntentId(params.session);
  let refunded = false;
  if (business?.stripeConnectAccountId && paymentIntent) {
    try {
      await getStripe().refunds.create(
        {
          payment_intent: paymentIntent,
          reason: "duplicate",
          refund_application_fee: true,
          metadata: { kind: "duplicate_payment", businessId: params.businessId, [`${params.entityType}Id`]: params.entityId },
        },
        { stripeAccount: business.stripeConnectAccountId, idempotencyKey: `duplicate-refund:${params.session.id}` },
      );
      refunded = true;
    } catch (error) {
      logError("checkout.duplicate_refund_failed", {
        businessId: params.businessId,
        sessionId: params.session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: refunded ? "payment.duplicate_refunded" : "payment.duplicate_unrefunded",
    actor: "system",
    summary: refunded
      ? `A second card payment of ${formatCentsExact(amount)} on the ${params.what} was refunded automatically.`
      : `A second card payment of ${formatCentsExact(amount)} on the ${params.what} could not be refunded automatically.`,
    idempotencyKey: `duplicate-payment:${params.session.id}`,
    detail: { sessionId: params.session.id, paymentIntent, [`${params.entityType}Id`]: params.entityId },
  }).catch(() => null);

  if (business) {
    await enqueueOwnerAlert({
      businessId: params.businessId,
      businessName: business.name,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      dedupeKey: `duplicate-payment:${params.session.id}`,
      message: refunded
        ? `Orvius: a customer paid the ${params.what} twice. The extra ${formatCentsExact(amount)} was refunded to their card.`
        : `Orvius: a customer paid the ${params.what} twice. Refund the extra ${formatCentsExact(amount)} in Stripe.`,
    }).catch(() => null);
  }
  return { refunded };
}
