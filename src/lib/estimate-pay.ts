import { calculateNetworkFeeCents, calculatePlatformFeeCents, isChargeableAmount } from "@/lib/platform-fee";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { checkoutPaymentMethods } from "@/lib/financing";
import { getConnectStatus } from "@/lib/stripe-connect";
import { assertLiveActionAllowed } from "@/lib/demo-fence";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";
import { pricedJobInvoice } from "@/lib/invoice-tax";
import { feeBaseCents } from "@/lib/sales-tax";
import { checkoutSessionPaid, reserveCheckout } from "@/lib/checkout-guard";
import { applyCardPaymentToInvoice, invoiceOpenBalanceCents, isNetworkJob } from "@/lib/invoice-pay";

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
  const select = {
    id: true,
    amountCents: true,
    taxCents: true,
    openCheckoutSessionId: true,
    payments: { select: { amountCents: true, status: true } },
  } as const;
  if (estimate.invoice?.id) {
    return prisma.invoice.findUniqueOrThrow({ where: { id: estimate.invoice.id }, select });
  }

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
      ...(await pricedJobInvoice(estimate.businessId, estimate.jobId, estimate.amountCents)),
      status: "open",
    },
    select,
  });
  return created;
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
  /** The invoice total: the estimate plus any sales tax, less a paid deposit. */
  amountCents: number;
  taxCents?: number;
  publicToken: string;
  invoiceId: string;
  jobId?: string | null;
  openCheckoutSessionId?: string | null;
  payments?: Array<{ amountCents: number; status: string }> | null;
  jobTitle?: string | null;
  business: ConnectableShop & { financingEnabled?: boolean | null; financingMethods?: string | null };
}) {
  await assertLiveActionAllowed(params.businessId, "Card checkout");
  const connect = getConnectStatus(params.business);
  if (!connect.canAcceptPayments || !connect.accountId) {
    throw new Error("Shop is not cleared to accept card payments");
  }
  const balanceCents = invoiceOpenBalanceCents({ amountCents: params.amountCents, payments: params.payments });
  if (!isChargeableAmount(balanceCents)) {
    throw new Error(`Estimate below Stripe minimum: ${balanceCents}`);
  }
  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const title = params.jobTitle?.trim() || "Service estimate";
  const network = await isNetworkJob(params.jobId);
  const workCents = params.amountCents > 0
    ? feeBaseCents({ amountCents: balanceCents, taxCents: Math.round(((params.taxCents ?? 0) * balanceCents) / params.amountCents) })
    : 0;
  const applicationFeeCents = network ? calculateNetworkFeeCents(workCents) : calculatePlatformFeeCents(workCents);

  const metadata = {
    kind: "estimate_pay",
    estimateId: params.estimateId,
    invoiceId: params.invoiceId,
    businessId: params.businessId,
    publicToken: params.publicToken,
    applicationFeeCents: String(applicationFeeCents),
    ...(network ? { network: "1" } : {}),
  };

  const paymentMethods = checkoutPaymentMethods(params.business, balanceCents);
  const accountId = connect.accountId;
  // Estimate and invoice pay the same bill, so they share the invoice's reservation.
  return reserveCheckout({
    scope: `invoice:${params.invoiceId}`,
    stripeAccount: accountId,
    amountCents: balanceCents,
    businessId: params.businessId,
    entity: { type: "invoice", id: params.invoiceId },
    currentSessionId: async () =>
      (await prisma.invoice.findUnique({ where: { id: params.invoiceId }, select: { openCheckoutSessionId: true } }))?.openCheckoutSessionId,
    remember: (session) => prisma.invoice.update({ where: { id: params.invoiceId }, data: { openCheckoutSessionId: session.id } }),
    create: (idempotencyKey) => stripe.checkout.sessions.create(
    {
      mode: "payment",
      ...(paymentMethods ? { payment_method_types: paymentMethods } : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: balanceCents,
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
    { stripeAccount: accountId, idempotencyKey },
  ),
  });
}

/** Record a card payment made from an estimate, through the same exactly-once path as any invoice. */
export async function fulfillEstimateCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string }> {
  if (session.metadata?.kind !== "estimate_pay") {
    return { ok: false, reason: "not_estimate_pay" };
  }
  if (!checkoutSessionPaid(session)) {
    return { ok: false, reason: "not_paid" };
  }

  const invoiceId = session.metadata.invoiceId;
  const businessId = session.metadata.businessId;
  const estimateId = session.metadata.estimateId;
  if (!invoiceId || !businessId) {
    return { ok: false, reason: "missing_metadata" };
  }
  const chargedFee = Number(session.metadata.applicationFeeCents);
  return applyCardPaymentToInvoice({
    session,
    invoiceId,
    businessId,
    network: session.metadata.network === "1",
    chargedFeeCents: Number.isInteger(chargedFee) && chargedFee >= 0 ? chargedFee : null,
    onRecorded: estimateId
      ? (tx) =>
          tx.estimate.updateMany({
            where: { id: estimateId, businessId },
            data: { status: "accepted", acceptedAt: new Date() },
          })
      : undefined,
  });
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
