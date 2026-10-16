import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { raiseReconciliation } from "@/lib/system-of-record";
import { OWNER_METHODS, collectedCents } from "@/lib/payment-math";
import { prisma } from "@/lib/prisma";

export type RefundInput = {
  /** Metadata Orvius put on the payment intent when it created the Checkout session. */
  metadata: Record<string, string> | null | undefined;
  amountRefundedCents: number;
  fullyRefunded: boolean;
  chargeId: string;
  /** The refunded charge's PaymentIntent and Checkout session, which say which payment it was. */
  paymentIntentId?: string | null;
  sessionId?: string | null;
  /** The connected account the refund event came from, when Stripe said. */
  account?: string | null;
};

export type RefundOutcome =
  | { applied: "deposit" | "invoice"; id: string; full: boolean }
  | { applied: null; reason: "not_ours" | "not_found" | "already_refunded" | "duplicate_charge" | "unmatched_payment" };

/**
 * A refund issued in Stripe has to reach Orvius's records, or a refunded
 * deposit keeps reading "paid" and counts as money in. Only a full refund
 * changes the status; a partial one is recorded on the timeline for the owner.
 * A refund touches only the payment it was for: cash on the same invoice stays
 * collected, and refunding a second, never-recorded charge changes nothing.
 */
export async function applyChargeRefund(input: RefundInput): Promise<RefundOutcome> {
  const meta = input.metadata ?? {};
  const businessId = meta.businessId;
  if (!businessId) return { applied: null, reason: "not_ours" };
  const amount = `$${(input.amountRefundedCents / 100).toFixed(2)}`;

  if (meta.kind === "booking_deposit" && meta.depositId) {
    const deposit = await prisma.deposit.findFirst({ where: { id: meta.depositId, businessId } });
    if (!deposit) {
      await flagUnappliedRefund(input, businessId, { type: "deposit", id: meta.depositId }, "record_missing");
      return { applied: null, reason: "not_found" };
    }
    if (deposit.status === "refunded") return { applied: null, reason: "already_refunded" };
    if (input.paymentIntentId && deposit.stripePaymentIntentId && input.paymentIntentId !== deposit.stripePaymentIntentId) {
      return { applied: null, reason: "duplicate_charge" };
    }
    if (input.fullyRefunded) {
      await prisma.deposit.updateMany({ where: { id: deposit.id, status: "paid" }, data: { status: "refunded" } });
    }
    await recordAudit({
      businessId,
      entityType: deposit.jobId ? "job" : "shop",
      entityId: deposit.jobId ?? businessId,
      jobId: deposit.jobId ?? undefined,
      action: input.fullyRefunded ? "deposit.refunded" : "deposit.partially_refunded",
      summary: input.fullyRefunded ? `Deposit refunded in Stripe (${amount})` : `Deposit partly refunded in Stripe (${amount})`,
      detail: { depositId: deposit.id, chargeId: input.chargeId, amountRefundedCents: input.amountRefundedCents },
      leadId: deposit.leadId ?? undefined,
      idempotencyKey: `refund:${input.chargeId}:${input.amountRefundedCents}`,
    });
    return { applied: "deposit", id: deposit.id, full: input.fullyRefunded };
  }

  if ((meta.kind === "invoice_pay" || meta.kind === "estimate_pay") && meta.invoiceId) {
    const invoice = await prisma.invoice.findFirst({ where: { id: meta.invoiceId, businessId }, include: { payments: true } });
    if (!invoice) {
      await flagUnappliedRefund(input, businessId, { type: "invoice", id: meta.invoiceId }, "record_missing");
      return { applied: null, reason: "not_found" };
    }
    if (invoice.status === "refunded") return { applied: null, reason: "already_refunded" };
    const target = refundedPayment(invoice.payments, input.sessionId);
    if (!target) {
      // A charge with no payment row is a duplicate Orvius refunded itself; without a session it's ambiguous.
      if (input.sessionId) return { applied: null, reason: "duplicate_charge" };
      logWarn("billing.refund_payment_ambiguous", { chargeId: input.chargeId, invoiceId: invoice.id });
      await flagUnappliedRefund(input, businessId, { type: "invoice", id: invoice.id }, "payment_unmatched");
      return { applied: null, reason: "unmatched_payment" };
    }
    if (input.fullyRefunded && target.status !== "refunded") {
      const remaining = collectedCents(invoice.payments.filter((p) => p.id !== target.id));
      const status =
        invoice.status !== "paid" && invoice.status !== "partial"
          ? invoice.status
          : remaining >= invoice.amountCents
            ? "paid"
            : remaining > 0
              ? "partial"
              : "refunded";
      await prisma.$transaction([
        prisma.payment.update({ where: { id: target.id }, data: { status: "refunded" } }),
        prisma.invoice.update({ where: { id: invoice.id }, data: { status } }),
      ]);
    }
    await recordAudit({
      businessId,
      entityType: invoice.jobId ? "job" : "shop",
      entityId: invoice.jobId ?? businessId,
      jobId: invoice.jobId ?? undefined,
      action: input.fullyRefunded ? "invoice.refunded" : "invoice.partially_refunded",
      summary: input.fullyRefunded ? `Invoice refunded in Stripe (${amount})` : `Invoice partly refunded in Stripe (${amount})`,
      detail: { invoiceId: invoice.id, chargeId: input.chargeId, amountRefundedCents: input.amountRefundedCents },
      idempotencyKey: `refund:${input.chargeId}:${input.amountRefundedCents}`,
    });
    return { applied: "invoice", id: invoice.id, full: input.fullyRefunded };
  }

  logWarn("billing.refund_unmatched", { chargeId: input.chargeId, kind: meta.kind ?? null });
  return { applied: null, reason: "not_ours" };
}

/** The card payment a refund was for: its session's row, or the only card-like row when the session is unknown. */
function refundedPayment<P extends { id: string; method: string | null; status: string }>(payments: P[], sessionId?: string | null): P | null {
  if (sessionId) return payments.find((p) => p.method === `stripe:${sessionId}`) ?? null;
  const owner = new Set<string>([...OWNER_METHODS, "customer_attested", "customer_said"]);
  const card = payments.filter((p) => !owner.has((p.method ?? "").toLowerCase()));
  return card.length === 1 ? card[0]! : null;
}

/**
 * A refund Stripe made that Orvius can't put on one record stays open until
 * a person matches it: one reconciliation exception per charge and amount,
 * and one owner alert. Only the shop whose connected account sent the refund
 * hears about it. A failed write throws, so the webhook is retried rather than
 * marked processed.
 */
async function flagUnappliedRefund(input: RefundInput, businessId: string, record: { type: "invoice" | "deposit"; id: string }, why: "record_missing" | "payment_unmatched") {
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, stripeConnectAccountId: true },
  });
  if (!shop || (input.account && shop.stripeConnectAccountId !== input.account)) {
    logWarn("billing.refund_unattributable", { chargeId: input.chargeId, account: input.account ?? null, why });
    return;
  }
  const amount = `$${(input.amountRefundedCents / 100).toFixed(2)}`;
  await raiseReconciliation({
    businessId,
    kind: "payment",
    entityType: record.type,
    entityId: record.id,
    system: "stripe",
    externalId: input.chargeId,
    expected: { refundOn: record.type },
    observed: {
      reason: why === "record_missing" ? "refund_record_missing" : "refund_unmatched",
      chargeId: input.chargeId,
      paymentIntentId: input.paymentIntentId ?? null,
      amountCents: input.amountRefundedCents,
      full: input.fullyRefunded,
    },
  });
  await enqueueOwnerAlert({
    businessId,
    dedupeKey: `refund-unapplied:${input.chargeId}:${input.amountRefundedCents}`,
    businessName: shop.name,
    message:
      why === "record_missing"
        ? `Stripe refunded ${amount} (charge ${input.chargeId}) for a ${record.type} Orvius no longer has. Nothing was changed. Check it in Command under Exceptions.`
        : `Stripe refunded ${amount} (charge ${input.chargeId}) on a bill with more than one card payment, and Orvius can't tell which. Nothing was changed. Match it in Command under Exceptions.`,
    ownerPhone: shop.ownerPhone,
    ownerEmail: shop.ownerEmail,
  });
}
