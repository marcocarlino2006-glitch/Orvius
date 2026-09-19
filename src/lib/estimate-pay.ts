import { calculatePlatformFeeCents, isChargeableAmount } from "@/lib/platform-fee";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

type ConnectableShop = Parameters<typeof getConnectStatus>[0];

/**
 * Card pay needs the shop's own Stripe account, not just ours.
 *
 * This used to be a platform-key check, which meant a customer's card money
 * landed in an Orvius balance and had to be paid out to the shop by hand —
 * both a money-transmission problem and a promise we could not keep at
 * volume. Cards now settle to the shop, so an unonboarded shop has no card
 * path at all and the manual "I paid by cash/check" route carries it.
 */
export function isEstimateCardPayReady(business: ConnectableShop) {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return false;
  return getConnectStatus(business).canAcceptPayments;
}

export async function ensureInvoiceForEstimate(estimate: {
  id: string;
  businessId: string;
  jobId: string | null;
  amountCents: number;
  acceptedAt: Date | null;
  invoice?: { id: string } | null;
}) {
  if (estimate.invoice?.id) return estimate.invoice.id;

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: {
      status: "accepted",
      acceptedAt: estimate.acceptedAt ?? new Date(),
    },
  });

  const created = await prisma.invoice.create({
    data: {
      businessId: estimate.businessId,
      estimateId: estimate.id,
      jobId: estimate.jobId,
      amountCents: estimate.amountCents,
      status: "open",
    },
  });
  return created.id;
}

/**
 * Checkout session for a public estimate, charged on the shop's own account.
 *
 * A direct charge, so the session lives on the connected account and has to be
 * retrieved with the same `stripeAccount` option it was created with.
 */
export async function createEstimateCheckoutSession(params: {
  estimateId: string;
  businessId: string;
  businessName: string;
  amountCents: number;
  publicToken: string;
  invoiceId: string;
  jobTitle?: string | null;
  business: ConnectableShop;
}) {
  const connect = getConnectStatus(params.business);
  if (!connect.canAcceptPayments || !connect.accountId) {
    throw new Error("Shop is not cleared to accept card payments");
  }
  if (!isChargeableAmount(params.amountCents)) {
    throw new Error(`Estimate below Stripe minimum: ${params.amountCents}`);
  }

  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const title = params.jobTitle?.trim() || "Service estimate";
  const applicationFeeCents = calculatePlatformFeeCents(params.amountCents);

  const metadata = {
    kind: "estimate_pay",
    estimateId: params.estimateId,
    invoiceId: params.invoiceId,
    businessId: params.businessId,
    publicToken: params.publicToken,
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: params.amountCents,
            product_data: {
              name: `${params.businessName} — ${title}`,
              description: "Estimate payment via Orvius",
            },
          },
        },
      ],
      success_url: `${baseUrl}/e/${params.publicToken}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/e/${params.publicToken}?canceled=1`,
      metadata,
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        metadata,
      },
    },
    { stripeAccount: connect.accountId },
  );

  return session;
}

/** Mark invoice paid after a successful estimate Checkout session. */
export async function fulfillEstimateCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string }> {
  if (session.metadata?.kind !== "estimate_pay") {
    return { ok: false, reason: "not_estimate_pay" };
  }
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { ok: false, reason: "not_paid" };
  }

  const invoiceId = session.metadata.invoiceId;
  const businessId = session.metadata.businessId;
  const estimateId = session.metadata.estimateId;
  if (!invoiceId || !businessId) {
    return { ok: false, reason: "missing_metadata" };
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, businessId },
    include: { payments: true },
  });
  if (!invoice) return { ok: false, reason: "invoice_not_found" };
  if (invoice.status === "paid") return { ok: true, reason: "already_paid" };

  const amountCents = session.amount_total ?? invoice.amountCents;
  const existingCard = invoice.payments.find(
    (p) => p.method === `stripe:${session.id}`,
  );
  if (existingCard) {
    if (invoice.status !== "paid") {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: "paid" },
      });
    }
    return { ok: true, reason: "already_recorded" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        businessId,
        invoiceId: invoice.id,
        amountCents,
        status: "recorded",
        method: `stripe:${session.id}`,
      },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: "paid" },
    });
    if (estimateId) {
      await tx.estimate.update({
        where: { id: estimateId },
        data: {
          status: "accepted",
          acceptedAt: new Date(),
        },
      });
    }
  });

  return { ok: true };
}

/**
 * Mark an estimate payment_failed when Checkout expires without a charge.
 * Idempotent against paid invoices.
 */
export async function failEstimateCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string }> {
  if (session.metadata?.kind !== "estimate_pay") {
    return { ok: false, reason: "not_estimate_pay" };
  }
  const estimateId = session.metadata.estimateId;
  const invoiceId = session.metadata.invoiceId;
  const businessId = session.metadata.businessId;
  if (!estimateId || !businessId) {
    return { ok: false, reason: "missing_metadata" };
  }

  if (invoiceId) {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      select: { status: true },
    });
    if (invoice?.status === "paid") {
      return { ok: true, reason: "already_paid" };
    }
  }

  const estimate = await prisma.estimate.findFirst({
    where: { id: estimateId, businessId },
  });
  if (!estimate) return { ok: false, reason: "estimate_not_found" };
  if (estimate.status === "payment_failed") {
    return { ok: true, reason: "already_failed" };
  }

  await prisma.estimate.update({
    where: { id: estimate.id },
    data: { status: "payment_failed" },
  });

  return { ok: true };
}
