import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";

/** Platform card checkout for estimates — Connect payouts to shops come next. */
export function isEstimateCardPayReady() {
  return Boolean(process.env.STRIPE_SECRET_KEY?.trim());
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

/** Create a one-time Stripe Checkout session for a public estimate. */
export async function createEstimateCheckoutSession(params: {
  estimateId: string;
  businessId: string;
  businessName: string;
  amountCents: number;
  publicToken: string;
  invoiceId: string;
  jobTitle?: string | null;
}) {
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const title = params.jobTitle?.trim() || "Service estimate";

  const session = await stripe.checkout.sessions.create({
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
    metadata: {
      kind: "estimate_pay",
      estimateId: params.estimateId,
      invoiceId: params.invoiceId,
      businessId: params.businessId,
      publicToken: params.publicToken,
    },
    payment_intent_data: {
      metadata: {
        kind: "estimate_pay",
        estimateId: params.estimateId,
        invoiceId: params.invoiceId,
        businessId: params.businessId,
      },
    },
  });

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
