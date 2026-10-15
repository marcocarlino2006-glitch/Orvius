import { withLease } from "@/lib/provision-attempt";
import type { Business, Invoice } from "@prisma/client";
import type Stripe from "stripe";

import { recordAudit } from "@/lib/audit";
import { normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { formatCentsExact } from "@/lib/money";
import { logWarn } from "@/lib/logger";
import { creditNetworkSender } from "@/lib/orvius-network";
import { calculateNetworkFeeCents, calculatePlatformFeeCents, isChargeableAmount } from "@/lib/platform-fee";
import { checkoutPaymentMethods } from "@/lib/financing";
import { checkoutSessionPaid, holdDemoPayment, refundDuplicateCheckout, reserveCheckout } from "@/lib/checkout-guard";
import { collectedCents } from "@/lib/payment-math";
import { claimWebhookEvent, completeWebhookEvent } from "@/lib/webhook-events";
import { assertLiveActionAllowed } from "@/lib/demo-fence";
import { prisma } from "@/lib/prisma";
import { paidDepositCents, shopTaxBps } from "@/lib/invoice-tax";
import { feeBaseCents, withSalesTax } from "@/lib/sales-tax";
import { mintPublicToken } from "@/lib/public-tokens";
import { nextIntentVersion } from "@/lib/sms-intent";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";
import { sendSms } from "@/lib/twilio-sms";

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

/** What is still owed on an invoice once cash, checks and earlier card payments are taken off. */
export function invoiceOpenBalanceCents(invoice: { amountCents: number; payments?: Array<{ amountCents: number; status: string }> | null }) {
  return Math.max(0, invoice.amountCents - collectedCents(invoice.payments));
}

/** The work share of a part payment; Orvius' fee is never charged on sales tax. */
function workShareCents(amountCents: number, invoice: { amountCents: number; taxCents?: number | null }) {
  const tax = Math.max(0, invoice.taxCents ?? 0);
  if (!tax || invoice.amountCents <= 0) return amountCents;
  return Math.max(0, amountCents - Math.round((tax * amountCents) / invoice.amountCents));
}

/**
 * What the customer still owes on a job: the final bill plus the shop's sales
 * tax, less any booking deposit already paid. `totalCents` is the work before
 * tax. Asking for the deposit twice is the fastest way to a chargeback.
 */
export async function balanceDueForJob(params: {
  businessId: string;
  jobId: string;
  totalCents: number;
}) {
  const depositPaidCents = await paidDepositCents(params.businessId, params.jobId);
  const priced = withSalesTax(params.totalCents, await shopTaxBps(params.businessId));
  return {
    totalCents: params.totalCents,
    taxBps: priced.taxBps,
    taxCents: priced.taxCents,
    depositPaidCents,
    balanceCents: Math.max(0, priced.totalCents - depositPaidCents),
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
  // Two completions of one job (owner tap and tech app, two servers) read "no invoice" together; one creates it.
  return withLease(`invoice-job:${params.businessId}:${params.jobId}`, () => upsertJobInvoiceHeld(params), { forget: true });
}

async function upsertJobInvoiceHeld(params: {
  businessId: string;
  jobId: string;
  totalCents: number;
}): Promise<{ invoice: Invoice; created: boolean; depositPaidCents: number }> {
  const { balanceCents, depositPaidCents, taxBps, taxCents } = await balanceDueForJob(params);
  const priced = { amountCents: balanceCents, subtotalCents: params.totalCents, taxCents, taxBps };

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
        ...priced,
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
      ...priced,
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
  /** Who asked for this send; each send is its own version, linked to the one before. */
  authorizedBy?: string;
}) {
  if (!params.invoice.publicToken) {
    return { sent: false as const, reason: "no_token" as const };
  }
  const payments = await prisma.payment.findMany({ where: { invoiceId: params.invoice.id }, select: { amountCents: true, status: true } });
  const balance = invoiceOpenBalanceCents({ amountCents: params.invoice.amountCents, payments });
  const result = await sendCustomerSms({
    businessId: params.business.id,
    to: params.toPhone,
    body: withSmsOptOutFooter(
      `${params.business.name}: thanks for choosing us. Your balance is ` +
        `${formatCentsExact(balance)}. Pay securely here: ` +
        invoicePayUrl(params.invoice.publicToken),
    ),
    intent: {
      eventType: "invoice.pay_link",
      eventId: params.invoice.id,
      authorizedBy: params.authorizedBy ?? null,
      ...(await nextIntentVersion({ businessId: params.business.id, eventType: "invoice.pay_link", eventId: params.invoice.id, to: normalizePhone(params.toPhone) ?? params.toPhone })),
    },
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
      payments: { select: { amountCents: true, status: true } },
      business: {
        select: {
          id: true,
          name: true,
          phone: true,
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
          stripeConnectPayoutsEnabled: true,
          stripeConnectDetailsSubmitted: true,
          financingEnabled: true,
          financingMethods: true,
        },
      },
    },
  });
}

/** Whether a job's customer came through the Orvius Network, which sets its fee. */
export async function isNetworkJob(jobId: string | null | undefined) {
  if (!jobId) return false;
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { lead: { select: { source: true } } } });
  return job?.lead?.source === "network";
}

export async function createInvoiceCheckoutSession(params: {
  invoice: Pick<Invoice, "id" | "amountCents" | "publicToken"> & {
    jobId?: string | null;
    taxCents?: number | null;
    openCheckoutSessionId?: string | null;
    payments?: Array<{ amountCents: number; status: string }> | null;
  };
  business: Pick<Business, "id" | "name"> & ConnectableShop & Partial<Pick<Business, "financingEnabled" | "financingMethods">>;
  jobTitle?: string | null;
}) {
  await assertLiveActionAllowed(params.business.id, "Card checkout");
  const connect = getConnectStatus(params.business);
  if (!connect.canAcceptPayments || !connect.accountId) {
    throw new Error("Shop is not cleared to accept card payments");
  }
  if (!params.invoice.publicToken) throw new Error("Invoice has no public token");
  const payments =
    params.invoice.payments ??
    (await prisma.payment.findMany({ where: { invoiceId: params.invoice.id }, select: { amountCents: true, status: true } }));
  const balanceCents = invoiceOpenBalanceCents({ amountCents: params.invoice.amountCents, payments });
  if (!isChargeableAmount(balanceCents)) {
    throw new Error(`Invoice balance below Stripe minimum: ${balanceCents}`);
  }

  const token = params.invoice.publicToken;
  const baseUrl = getAppBaseUrl();
  const network = await isNetworkJob(params.invoice.jobId);
  const workCents = workShareCents(balanceCents, params.invoice);
  const applicationFeeCents = network ? calculateNetworkFeeCents(workCents) : calculatePlatformFeeCents(workCents);
  const metadata = {
    kind: "invoice_pay",
    invoiceId: params.invoice.id,
    businessId: params.business.id,
    publicToken: token,
    applicationFeeCents: String(applicationFeeCents),
    ...(network ? { network: "1" } : {}),
  };

  const paymentMethods = checkoutPaymentMethods(params.business, balanceCents);
  const accountId = connect.accountId;
  return reserveCheckout({
    scope: `invoice:${params.invoice.id}`,
    stripeAccount: accountId,
    amountCents: balanceCents,
    currentSessionId: async () =>
      (await prisma.invoice.findUnique({ where: { id: params.invoice.id }, select: { openCheckoutSessionId: true } }))?.openCheckoutSessionId,
    remember: (session) => prisma.invoice.update({ where: { id: params.invoice.id }, data: { openCheckoutSessionId: session.id } }),
    create: (idempotencyKey) => getStripe().checkout.sessions.create(
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
              name: `${params.business.name} — ${params.jobTitle?.trim() || "Service invoice"}`,
            },
          },
        },
      ],
      success_url: `${baseUrl}/i/${token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/i/${token}?canceled=1`,
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

/**
 * Mark an invoice paid from its Checkout session. The webhook and the
 * customer's redirect race on every payment, so both land here and the second
 * one is a no-op.
 */
export async function fulfillInvoiceCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string }> {
  if (session.metadata?.kind !== "invoice_pay") return { ok: false, reason: "not_invoice_pay" };
  if (!checkoutSessionPaid(session)) return { ok: false, reason: "not_paid" };
  const invoiceId = session.metadata.invoiceId;
  const businessId = session.metadata.businessId;
  if (!invoiceId || !businessId) return { ok: false, reason: "missing_metadata" };
  const chargedFee = Number(session.metadata.applicationFeeCents);
  return applyCardPaymentToInvoice({
    session,
    invoiceId,
    businessId,
    network: session.metadata.network === "1",
    chargedFeeCents: Number.isInteger(chargedFee) && chargedFee >= 0 ? chargedFee : null,
  });
}

/**
 * Record one cleared card payment against an invoice, exactly once per
 * session. The invoice is paid only when the money in covers it; anything
 * less leaves it part-paid with the rest still owed. A payment on an invoice
 * that was already settled is refunded rather than kept.
 */
export async function applyCardPaymentToInvoice(params: {
  session: Pick<Stripe.Checkout.Session, "id" | "amount_total" | "payment_intent">;
  invoiceId: string;
  businessId: string;
  network: boolean;
  chargedFeeCents: number | null;
  /** Runs in the same transaction as the first record of this payment. */
  onRecorded?: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>;
}): Promise<{ ok: boolean; reason?: string }> {
  const { session, invoiceId, businessId } = params;
  const method = `stripe:${session.id}`;
  const claim = { source: "stripe-checkout", externalId: session.id, eventType: "invoice_payment", businessId };
  if (!(await claimWebhookEvent(claim)).claimed) return { ok: true, reason: "already_paid" };

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, businessId }, include: { payments: true } });
      if (!invoice) return { kind: "missing" as const };
      if (invoice.payments.some((p) => p.method === method)) return { kind: "replay" as const };
      const before = collectedCents(invoice.payments);
      if (invoice.status === "paid" || before >= invoice.amountCents) return { kind: "duplicate" as const, invoice };

      const amountCents = session.amount_total ?? invoiceOpenBalanceCents(invoice);
      const workCents = workShareCents(amountCents, invoice);
      const fee = params.chargedFeeCents ?? (params.network ? calculateNetworkFeeCents(workCents) : calculatePlatformFeeCents(workCents));
      const full = before + amountCents >= invoice.amountCents;
      await tx.payment.create({
        data: { businessId, invoiceId: invoice.id, amountCents, status: "recorded", method },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: full ? "paid" : "partial",
          ...(full ? { paidAt: new Date(), stripeSessionId: session.id } : {}),
          openCheckoutSessionId: null,
          applicationFeeCents: (invoice.applicationFeeCents ?? 0) + fee,
        },
      });
      await params.onRecorded?.(tx);
      return { kind: "recorded" as const, invoice, amountCents, workCents };
    });

    if (outcome.kind === "missing") {
      await completeWebhookEvent({ ...claim, status: "failed", error: "invoice_not_found" });
      return { ok: false, reason: "invoice_not_found" };
    }
    if (outcome.kind === "replay") {
      await completeWebhookEvent({ ...claim, status: "processed" });
      return { ok: true, reason: "already_paid" };
    }
    if (outcome.kind === "duplicate") {
      const held = await holdDemoPayment({ businessId, entityType: "invoice", entityId: invoiceId, sessionId: session.id, amountCents: session.amount_total, held: "duplicate_refund" });
      if (held) {
        await completeWebhookEvent({ ...claim, status: "processed" });
        return { ok: true, reason: "duplicate_held" };
      }
      await refundDuplicateCheckout({ session, businessId, entityType: "invoice", entityId: invoiceId, what: "invoice" });
      await completeWebhookEvent({ ...claim, status: "processed" });
      return { ok: true, reason: "duplicate_refunded" };
    }

    await completeWebhookEvent({ ...claim, status: "processed" });
    const { invoice, amountCents, workCents } = outcome;
    if (await holdDemoPayment({ businessId, entityType: "invoice", entityId: invoice.id, sessionId: session.id, amountCents, held: "follow_ups" })) {
      return { ok: true, reason: "held_in_demo" };
    }
    await textOwnerPaid({ businessId, jobId: invoice.jobId, amountCents, sessionId: session.id }).catch(() => null);
    if (params.network && invoice.jobId) {
      await creditNetworkSender({ jobId: invoice.jobId, amountCents: workCents }).catch((error) =>
        logWarn("network.credit_failed", {
          invoiceId: invoice.id,
          error: error instanceof Error ? error.message : "unknown",
        }),
      );
    }
    return { ok: true };
  } catch (error) {
    await completeWebhookEvent({
      ...claim,
      status: "failed",
      error: error instanceof Error ? error.message.slice(0, 280) : "unknown",
    }).catch(() => null);
    throw error;
  }
}

/* Runs once per card payment: only the caller that won the session claim gets here. */
async function textOwnerPaid(params: { businessId: string; jobId: string | null; amountCents: number; sessionId: string }) {
  const business = await prisma.business.findUnique({
    where: { id: params.businessId },
    select: { ownerPhone: true },
  });
  if (!business?.ownerPhone) return;
  const job = params.jobId
    ? await prisma.job.findUnique({
        where: { id: params.jobId },
        select: { title: true, customer: { select: { name: true } }, lead: { select: { name: true } } },
      })
    : null;
  const who = job?.customer?.name?.trim() || job?.lead?.name?.trim() || "A customer";
  await sendSms({
    to: business.ownerPhone,
    businessId: params.businessId,
    audience: "owner",
    intent: { eventType: "invoice.paid_owner", eventId: params.sessionId },
    body: `Orvius: ${who} paid ${formatCentsExact(params.amountCents)}${job?.title ? ` for ${job.title}` : ""}. It's on its way to your bank.`,
  });
}

/**
 * A job completed with a final amount — or an accepted estimate — becomes an
 * open invoice at once, so the bill exists while the customer is still
 * standing in the kitchen. The text goes out on its own when the shop can take
 * a card and Autopilot is on, and always when the owner asked for it by
 * texting DONE with the total.
 */
export async function invoiceCompletedJob(
  jobId: string,
  options: { ownerAsked?: boolean } = {},
) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      businessId: true,
      finalAmountCents: true,
      estimate: { select: { amountCents: true, status: true } },
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
  if (!job) return { invoiced: false as const, reason: "no_job" as const };
  /* An accepted estimate is the price the customer already agreed to. */
  const totalCents =
    job.finalAmountCents ??
    (job.estimate?.status === "accepted" ? job.estimate.amountCents : null);
  if (!totalCents) return { invoiced: false as const, reason: "no_amount" as const };

  const { invoice } = await upsertJobInvoice({
    businessId: job.businessId,
    jobId: job.id,
    totalCents,
  });

  const phone = job.lead?.phone ?? job.customer?.phone ?? null;
  const blocked =
    invoice.status === "paid"
      ? "paid"
      : !phone
        ? "no_phone"
        : !getConnectStatus(job.business).canAcceptPayments
          ? "connect_incomplete"
          : !isChargeableAmount(invoice.amountCents)
            ? "nothing_owed"
            : invoice.sentAt && !options.ownerAsked
              ? "already_sent"
              : !job.business.autopilot && !options.ownerAsked
                ? "autopilot_off"
                : null;

  if (blocked || !phone) {
    return { invoiced: true as const, invoice, sms: null, reason: blocked };
  }

  const sms = await sendInvoiceLink({ business: job.business, invoice, toPhone: phone, authorizedBy: options.ownerAsked ? "owner:asked" : "system:autopilot" });
  if (sms.sent) {
    await recordAudit({
      businessId: job.businessId,
      entityType: "job",
      entityId: job.id,
      jobId: job.id,
      ...(options.ownerAsked
        ? { action: "invoice.sent", actor: "owner" as const }
        : { action: "autopilot.invoice_sent", idempotencyKey: `autopilot:invoice:${invoice.id}` }),
      summary: `Texted the ${formatCentsExact(invoice.amountCents)} invoice link`,
    });
  }
  return { invoiced: true as const, invoice, sms, reason: null };
}
