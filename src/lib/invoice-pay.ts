import type { Business, Invoice } from "@prisma/client";
import type Stripe from "stripe";

import { recordAudit } from "@/lib/audit";
import { sendCustomerSms } from "@/lib/customer-sms";
import { formatCentsExact } from "@/lib/money";
import { calculatePlatformFeeCents, isChargeableAmount } from "@/lib/platform-fee";
import { prisma } from "@/lib/prisma";
import { mintPublicToken } from "@/lib/public-tokens";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";

/*
  The invoice is where a shop's revenue actually changes hands — a deposit is
  $50–150, the finished job is $300–15,000. Card pay here is the same direct
  charge as the deposit: the shop is the merchant, the money settles to its own
  Stripe account, and Orvius takes only the application fee.
*/

type ConnectableShop = Parameters<typeof getConnectStatus>[0];

export function invoicePayUrl(publicToken: string) {
  return `${getAppBaseUrl()}/i/${publicToken}`;
}

/**
 * What the customer still owes on a job: the final bill less any booking
 * deposit already paid. Asking for the deposit twice is the fastest way to a
 * chargeback.
 */
export async function balanceDueForJob(params: {
  businessId: string;
  jobId: string;
  totalCents: number;
}) {
  const job = await prisma.job.findFirst({
    where: { id: params.jobId, businessId: params.businessId },
    select: { leadId: true },
  });
  /* A deposit taken at booking is stamped with the lead, the job, or both. */
  const deposits = await prisma.deposit.findMany({
    where: {
      businessId: params.businessId,
      status: "paid",
      OR: [{ jobId: params.jobId }, ...(job?.leadId ? [{ leadId: job.leadId }] : [])],
    },
    select: { amountCents: true },
  });
  const depositPaidCents = deposits.reduce((sum, d) => sum + d.amountCents, 0);
  return {
    totalCents: params.totalCents,
    depositPaidCents,
    balanceCents: Math.max(0, params.totalCents - depositPaidCents),
  };
}

/**
 * The one open invoice for a job, created or re-priced from the final bill.
 *
 * A job has at most one unpaid invoice, so a double-tap or a corrected total
 * updates the same link the customer may already hold instead of issuing a
 * second one. A paid invoice is never touched.
 */
export async function upsertJobInvoice(params: {
  businessId: string;
  jobId: string;
  totalCents: number;
}): Promise<{ invoice: Invoice; created: boolean; depositPaidCents: number }> {
  const { balanceCents, depositPaidCents } = await balanceDueForJob(params);

  const existing = await prisma.invoice.findFirst({
    where: { businessId: params.businessId, jobId: params.jobId },
    orderBy: { createdAt: "desc" },
  });

  if (existing?.status === "paid") {
    return { invoice: existing, created: false, depositPaidCents };
  }

  if (existing) {
    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: {
        amountCents: balanceCents,
        status: existing.status === "draft" ? "open" : existing.status,
        publicToken: existing.publicToken ?? mintPublicToken(),
      },
    });
    return { invoice, created: false, depositPaidCents };
  }

  const invoice = await prisma.invoice.create({
    data: {
      businessId: params.businessId,
      jobId: params.jobId,
      amountCents: balanceCents,
      status: "open",
      publicToken: mintPublicToken(),
    },
  });
  return { invoice, created: true, depositPaidCents };
}

/** Text the customer their invoice link through the shop-scoped STOP list. */
export async function sendInvoiceLink(params: {
  business: Pick<Business, "id" | "name">;
  invoice: Pick<Invoice, "id" | "amountCents" | "publicToken">;
  toPhone: string;
}) {
  if (!params.invoice.publicToken) {
    return { sent: false as const, reason: "no_token" as const };
  }
  const result = await sendCustomerSms({
    businessId: params.business.id,
    to: params.toPhone,
    body: withSmsOptOutFooter(
      `${params.business.name}: thanks for choosing us. Your balance is ` +
        `${formatCentsExact(params.invoice.amountCents)}. Pay securely here: ` +
        invoicePayUrl(params.invoice.publicToken),
    ),
  });
  if (result.sent) {
    await prisma.invoice.update({
      where: { id: params.invoice.id },
      data: { sentAt: new Date() },
    });
  }
  return result;
}

export async function getInvoiceByToken(token: string) {
  if (!token.trim()) return null;
  return prisma.invoice.findFirst({
    where: { publicToken: token },
    include: {
      job: { select: { title: true, completedAt: true } },
      business: {
        select: {
          id: true,
          name: true,
          phone: true,
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
          stripeConnectPayoutsEnabled: true,
          stripeConnectDetailsSubmitted: true,
        },
      },
    },
  });
}

export async function createInvoiceCheckoutSession(params: {
  invoice: Pick<Invoice, "id" | "amountCents" | "publicToken">;
  business: Pick<Business, "id" | "name"> & ConnectableShop;
  jobTitle?: string | null;
}) {
  const connect = getConnectStatus(params.business);
  if (!connect.canAcceptPayments || !connect.accountId) {
    throw new Error("Shop is not cleared to accept card payments");
  }
  if (!params.invoice.publicToken) throw new Error("Invoice has no public token");
  if (!isChargeableAmount(params.invoice.amountCents)) {
    throw new Error(`Invoice below Stripe minimum: ${params.invoice.amountCents}`);
  }

  const token = params.invoice.publicToken;
  const baseUrl = getAppBaseUrl();
  const metadata = {
    kind: "invoice_pay",
    invoiceId: params.invoice.id,
    businessId: params.business.id,
    publicToken: token,
  };

  return getStripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: params.invoice.amountCents,
            product_data: {
              name: `${params.business.name} — ${params.jobTitle?.trim() || "Service invoice"}`,
            },
          },
        },
      ],
      success_url: `${baseUrl}/i/${token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/i/${token}?canceled=1`,
      metadata,
      payment_intent_data: {
        application_fee_amount: calculatePlatformFeeCents(params.invoice.amountCents),
        metadata,
      },
    },
    { stripeAccount: connect.accountId },
  );
}

/**
 * Mark an invoice paid from its Checkout session. The webhook and the
 * customer's redirect race on every payment, so both land here and the second
 * one is a no-op.
 */
export async function fulfillInvoiceCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string }> {
  if (session.metadata?.kind !== "invoice_pay") return { ok: false, reason: "not_invoice_pay" };
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { ok: false, reason: "not_paid" };
  }
  const invoiceId = session.metadata.invoiceId;
  const businessId = session.metadata.businessId;
  if (!invoiceId || !businessId) return { ok: false, reason: "missing_metadata" };

  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId } });
  if (!invoice) return { ok: false, reason: "invoice_not_found" };
  if (invoice.status === "paid") return { ok: true, reason: "already_paid" };

  const amountCents = session.amount_total ?? invoice.amountCents;
  const claimed = await prisma.invoice.updateMany({
    where: { id: invoice.id, status: { not: "paid" } },
    data: {
      status: "paid",
      paidAt: new Date(),
      stripeSessionId: session.id,
      applicationFeeCents: calculatePlatformFeeCents(amountCents),
    },
  });
  if (claimed.count === 0) return { ok: true, reason: "already_paid" };

  await prisma.payment.create({
    data: {
      businessId,
      invoiceId: invoice.id,
      amountCents,
      status: "recorded",
      method: `stripe:${session.id}`,
    },
  });
  return { ok: true };
}

/**
 * A job completed with a final amount becomes an open invoice at once, so the
 * bill exists while the customer is still standing in the kitchen. The text
 * goes out on its own only when the shop turned Autopilot on and can take a
 * card; otherwise the owner sends it with one tap from the job.
 */
export async function invoiceCompletedJob(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      businessId: true,
      finalAmountCents: true,
      lead: { select: { phone: true } },
      customer: { select: { phone: true } },
      business: {
        select: {
          id: true,
          name: true,
          autopilot: true,
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
          stripeConnectPayoutsEnabled: true,
          stripeConnectDetailsSubmitted: true,
        },
      },
    },
  });
  if (!job?.finalAmountCents) return { invoiced: false as const };

  const { invoice } = await upsertJobInvoice({
    businessId: job.businessId,
    jobId: job.id,
    totalCents: job.finalAmountCents,
  });

  const phone = job.lead?.phone ?? job.customer?.phone ?? null;
  const autoSend =
    job.business.autopilot &&
    Boolean(phone) &&
    invoice.status !== "paid" &&
    !invoice.sentAt &&
    isChargeableAmount(invoice.amountCents) &&
    getConnectStatus(job.business).canAcceptPayments;

  if (!autoSend || !phone) return { invoiced: true as const, invoice, sms: null };

  const sms = await sendInvoiceLink({ business: job.business, invoice, toPhone: phone });
  if (sms.sent) {
    await recordAudit({
      businessId: job.businessId,
      entityType: "job",
      entityId: job.id,
      jobId: job.id,
      action: "autopilot.invoice_sent",
      summary: `Texted the ${formatCentsExact(invoice.amountCents)} invoice link`,
      idempotencyKey: `autopilot:invoice:${invoice.id}`,
    });
  }
  return { invoiced: true as const, invoice, sms };
}
