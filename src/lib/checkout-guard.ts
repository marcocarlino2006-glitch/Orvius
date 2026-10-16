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
import { raiseReconciliation } from "@/lib/system-of-record";
import { performOnce, STRIPE_REPLAY_WINDOW_MS } from "@/lib/provider-effect";

/*
  Shared rules for a customer paying a shop by card through Checkout: one open
  session per bill, money counted only once it has actually cleared, and a
  second payment on a bill that is already settled held for the owner.
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
  businessId?: string;
  entity?: { type: string; id: string };
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
      /* The session is recorded before Stripe is called, so a lost reply or a failed remember() is recovered from Stripe's record, never by opening a second one blindly. */
      return performOnce({
        provider: "stripe",
        operation: "checkout session",
        correlationKey: `checkout:${params.scope}:${params.amountCents}:${prior ?? "first"}`,
        businessId: params.businessId ?? null,
        entity: params.entity ?? null,
        kind: "payment",
        replayWindowMs: STRIPE_REPLAY_WINDOW_MS,
        perform: params.create,
        idOf: (session) => session.id,
        retrieve: (id) => getStripe().checkout.sessions.retrieve(id, { stripeAccount: params.stripeAccount }),
        finalize: params.remember,
      });
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
 * A card payment landed on a bill that was already settled, usually an older
 * checkout link paid late. Whether it is a mistake, a tip or the next visit
 * paid early is the shop's call, so nothing is refunded on our own: the
 * payment is held as an open reconciliation exception with its session and
 * amount, and the owner is told it is waiting on them.
 */
export async function holdLatePayment(params: {
  session: Pick<Stripe.Checkout.Session, "id" | "payment_intent" | "amount_total">;
  businessId: string;
  entityType: "invoice" | "deposit";
  entityId: string;
  what: string;
}): Promise<{ exceptionId: string }> {
  const amount = params.session.amount_total ?? 0;
  const paymentIntent = sessionPaymentIntentId(params.session);
  const exceptionId = await raiseReconciliation({
    businessId: params.businessId,
    kind: "payment",
    entityType: params.entityType,
    entityId: params.entityId,
    system: "stripe",
    externalId: params.session.id,
    expected: { settled: true, extraPaymentCents: 0 },
    observed: { sessionId: params.session.id, paymentIntent, amountCents: amount, reason: "late_session_payment" },
  });
  await recordAudit({
    businessId: params.businessId,
    entityType: "shop",
    entityId: params.businessId,
    action: "payment.late_held",
    actor: "system",
    summary: `A card payment of ${formatCentsExact(amount)} arrived on the ${params.what} after it was settled. It is held for the owner to refund or apply; nothing was refunded automatically.`,
    idempotencyKey: `late-payment:${params.session.id}`,
    detail: { sessionId: params.session.id, paymentIntent, exceptionId, [`${params.entityType}Id`]: params.entityId },
  }).catch(() => null);
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { name: true, ownerPhone: true, ownerEmail: true },
  });
  if (business) {
    await enqueueOwnerAlert({
      businessId: params.businessId,
      businessName: business.name,
      ownerPhone: business.ownerPhone,
      ownerEmail: business.ownerEmail,
      dedupeKey: `late-payment:${params.session.id}`,
      message: `Orvius: a customer paid the ${params.what} again after it was settled (${formatCentsExact(amount)}). Nothing was refunded automatically. Refund it in Stripe or tell the customer it's credited, then mark it resolved.`,
    }).catch(() => null);
  }
  return { exceptionId };
}
