import { withLease } from "@/lib/provision-attempt";
import { isOwnerDemoWorkspaceId } from "@/lib/demo-fence";
import { pageFounderForShop } from "@/lib/platform-pager";
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

/**
 * One open checkout per bill and amount. Two taps on "Pay", two tabs, or a
 * retry after a timeout used to each open a Stripe session, and a customer
 * could pay both. The bill's lease serializes the decision across servers;
 * the idempotency key covers a Stripe call that succeeded but whose answer,
 * or our write of it, was lost — the retry gets the same session back.
 * Keyed to the session it replaces, so an expired or re-priced one gets a
 * fresh session instead of Stripe replaying the dead one.
 */
export async function reserveCheckout(params: {
  scope: string;
  stripeAccount: string;
  amountCents: number;
  currentSessionId: () => Promise<string | null | undefined>;
  create: (idempotencyKey: string) => Promise<Stripe.Checkout.Session>;
  remember: (session: Stripe.Checkout.Session) => Promise<unknown>;
}): Promise<Stripe.Checkout.Session> {
  return withLease(
    `checkout:${params.scope}`,
    async () => {
      const prior = (await params.currentSessionId()) ?? null;
      const reused = await reuseOpenCheckoutSession({ sessionId: prior, stripeAccount: params.stripeAccount, amountCents: params.amountCents });
      if (reused) return reused;
      const session = await params.create(`checkout:${params.scope}:${params.amountCents}:${prior ?? "first"}`);
      await params.remember(session);
      return session;
    },
    { leaseMs: 45_000, waitMs: 30_000, forget: true },
  );
}

/**
 * Real money landed on a shop that is now a demo — a checkout opened before
 * the fence, paid after it. The payment stays on the record (a customer was
 * charged; hiding it would be worse), but nothing follows from it: no
 * refund, receipt, payout credit or sync goes out from a demo. Orvius ops is
 * paged and the trail says what is held, so a person reconciles it.
 */
export async function holdDemoPayment(params: {
  businessId: string;
  entityType: "invoice" | "deposit";
  entityId: string;
  sessionId: string;
  amountCents: number | null;
  held: "follow_ups" | "duplicate_refund";
}): Promise<boolean> {
  if (!(await isOwnerDemoWorkspaceId(params.businessId))) return false;
  const amount = params.amountCents != null ? formatCentsExact(params.amountCents) : "A payment";
  const what = params.held === "duplicate_refund" ? "a second charge on a settled bill — its refund is held" : "receipts, payout credit and sync are held";
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: "payment.held_in_demo",
    actor: "system",
    summary: `${amount} was paid on this demo shop's ${params.entityType} (${params.sessionId}). It is recorded; ${what} until Orvius reviews it.`,
    detail: { sessionId: params.sessionId, held: params.held, [`${params.entityType}Id`]: params.entityId },
    idempotencyKey: `payment-held-demo:${params.sessionId}`,
  }).catch(() => null);
  await pageFounderForShop(
    params.businessId,
    `demo_payment:${params.sessionId}`,
    `Orvius: ${amount} was paid on demo shop ${params.businessId} (${params.entityType} ${params.entityId}, session ${params.sessionId}). Recorded, follow-ups held. Reconcile by hand.`,
  ).catch(() => null);
  logError("payment.held_in_demo", { businessId: params.businessId, sessionId: params.sessionId, held: params.held });
  return true;
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
