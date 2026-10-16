import { recordAudit } from "@/lib/audit";
import { formatCentsExact } from "@/lib/money";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notification-queue";
import { raiseReconciliation } from "@/lib/system-of-record";
import { OWNER_METHODS, isCollected, refundedOf } from "@/lib/payment-math";
import { prisma } from "@/lib/prisma";

export type RefundInput = {
  /** Metadata Orvius put on the payment intent when it created the Checkout session. */
  metadata: Record<string, string> | null | undefined;
  /** Stripe's cumulative amount refunded on the charge, not this one refund. */
  amountRefundedCents: number;
  fullyRefunded: boolean;
  chargeId: string;
  /** The refunded charge's PaymentIntent and Checkout session, which say which payment it was. */
  paymentIntentId?: string | null;
  sessionId?: string | null;
  /** The connected account the signed refund event came from. */
  account?: string | null;
};

export type RefundOutcome =
  | { applied: "deposit" | "invoice"; id: string; full: boolean; changed: boolean; adjustment?: boolean }
  | { applied: null; reason: "not_ours" | "not_found" | "already_refunded" | "duplicate_charge" | "unmatched_payment" };

type Shop = { id: string; name: string; ownerPhone: string | null; ownerEmail: string | null; stripeConnectAccountId: string | null };

/**
 * A refund issued in Stripe reaches the payment or deposit it was for as a
 * fact: the original receipt stays, the cumulative refund is recorded beside
 * it, and totals show gross, refunded and kept. Stripe sends the running
 * total, so recording the highest one seen makes replays and late, smaller
 * events change nothing. A refund never makes a customer owe again: a bill
 * that read paid stays paid, and whether to ask for the money again is the
 * owner's decision in Command. Nothing changes unless the signed event came
 * from the shop's own connected account.
 */
export async function applyChargeRefund(input: RefundInput): Promise<RefundOutcome> {
  const meta = input.metadata ?? {};
  const businessId = meta.businessId;
  if (!businessId) return { applied: null, reason: "not_ours" };
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: { id: true, name: true, ownerPhone: true, ownerEmail: true, stripeConnectAccountId: true },
  });
  if (!shop || !input.account || !shop.stripeConnectAccountId || shop.stripeConnectAccountId !== input.account) {
    logWarn("billing.refund_unattributable", { chargeId: input.chargeId, account: input.account ?? null });
    return { applied: null, reason: "not_ours" };
  }

  if (meta.kind === "booking_deposit" && meta.depositId) return refundDeposit(input, shop, meta.depositId);
  if ((meta.kind === "invoice_pay" || meta.kind === "estimate_pay") && meta.invoiceId) return refundInvoice(input, shop, meta.invoiceId);

  logWarn("billing.refund_unmatched", { chargeId: input.chargeId, kind: meta.kind ?? null });
  return { applied: null, reason: "not_ours" };
}

/** Raise the recorded refund to Stripe's running total, never lower it. Returns whether it moved. */
async function raiseRefund(table: "payment" | "deposit", id: string, cents: number): Promise<boolean> {
  const where = { id, refundedCents: { lt: cents } };
  const data = { refundedCents: cents };
  const done = table === "payment" ? await prisma.payment.updateMany({ where, data }) : await prisma.deposit.updateMany({ where, data });
  return done.count > 0;
}

async function refundDeposit(input: RefundInput, shop: Shop, depositId: string): Promise<RefundOutcome> {
  const deposit = await prisma.deposit.findFirst({ where: { id: depositId, businessId: shop.id } });
  if (!deposit) {
    await flagUnappliedRefund(input, shop, { type: "deposit", id: depositId }, "record_missing");
    return { applied: null, reason: "not_found" };
  }
  if (input.paymentIntentId && deposit.stripePaymentIntentId && input.paymentIntentId !== deposit.stripePaymentIntentId) {
    return { applied: null, reason: "duplicate_charge" };
  }
  if (deposit.status === "refunded" && refundedOf(deposit) >= deposit.amountCents) return { applied: null, reason: "already_refunded" };
  if (deposit.status !== "paid") {
    await flagUnappliedRefund(input, shop, { type: "deposit", id: deposit.id }, "record_unpaid");
    return { applied: null, reason: "not_found" };
  }

  const full = input.fullyRefunded || input.amountRefundedCents >= deposit.amountCents;
  const cents = full ? deposit.amountCents : Math.min(Math.max(0, input.amountRefundedCents), deposit.amountCents);
  if (cents <= refundedOf(deposit)) return { applied: "deposit", id: deposit.id, full, changed: false };

  // Every record below is idempotent and written before the refund is, so a failed write is retried, not lost.
  const amount = formatCentsExact(cents);
  await recordAudit({
    businessId: shop.id,
    entityType: deposit.jobId ? "job" : "shop",
    entityId: deposit.jobId ?? shop.id,
    jobId: deposit.jobId ?? undefined,
    action: full ? "deposit.refunded" : "deposit.partially_refunded",
    summary: full ? `Deposit refunded in Stripe (${amount})` : `Deposit partly refunded in Stripe (${amount} of ${formatCentsExact(deposit.amountCents)} so far)`,
    detail: { depositId: deposit.id, chargeId: input.chargeId, amountRefundedCents: cents },
    leadId: deposit.leadId ?? undefined,
    idempotencyKey: `refund:${input.chargeId}:${cents}`,
  });

  /*
    The job's bill was priced with this deposit taken off. If the customer
    already has that bill (sent, signed or paid toward), it stays as they have
    it; whether they now owe the refunded amount is the owner's call.
  */
  let adjustment = false;
  const jobId = deposit.jobId ?? (deposit.leadId ? (await prisma.job.findFirst({ where: { businessId: shop.id, leadId: deposit.leadId }, select: { id: true } }))?.id : null);
  if (jobId) {
    const invoice = await prisma.invoice.findFirst({
      where: { businessId: shop.id, jobId, status: { notIn: ["void", "draft"] } },
      orderBy: { createdAt: "desc" },
      include: { payments: { select: { id: true } } },
    });
    const committed = invoice && (invoice.sentAt || invoice.estimateId || invoice.payments.length || ["paid", "partial"].includes(invoice.status));
    if (invoice && committed) {
      await raiseReconciliation({
        businessId: shop.id,
        kind: "payment",
        entityType: "invoice",
        entityId: invoice.id,
        system: "stripe",
        externalId: input.chargeId,
        expected: { invoiceCents: invoice.amountCents, depositCents: deposit.amountCents },
        observed: { reason: "deposit_refunded_after_billing", depositId: deposit.id, chargeId: input.chargeId, amountCents: cents },
      });
      adjustment = true;
    }
  }
  const changed = await raiseRefund("deposit", deposit.id, cents);
  if (full) await prisma.deposit.updateMany({ where: { id: deposit.id, status: "paid" }, data: { status: "refunded" } });
  return { applied: "deposit", id: deposit.id, full, changed, adjustment };
}

async function refundInvoice(input: RefundInput, shop: Shop, invoiceId: string): Promise<RefundOutcome> {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, businessId: shop.id }, include: { payments: true } });
  if (!invoice) {
    await flagUnappliedRefund(input, shop, { type: "invoice", id: invoiceId }, "record_missing");
    return { applied: null, reason: "not_found" };
  }
  const target = refundedPayment(invoice.payments, input.sessionId);
  if (!target) {
    // A charge with no payment row is a duplicate Orvius refunded itself; without a session it's ambiguous.
    if (input.sessionId) return { applied: null, reason: "duplicate_charge" };
    if (invoice.status === "refunded") return { applied: null, reason: "already_refunded" };
    logWarn("billing.refund_payment_ambiguous", { chargeId: input.chargeId, invoiceId: invoice.id });
    await flagUnappliedRefund(input, shop, { type: "invoice", id: invoice.id }, "payment_unmatched");
    return { applied: null, reason: "unmatched_payment" };
  }
  if (refundedOf(target) >= target.amountCents) return { applied: null, reason: "already_refunded" };

  const full = input.fullyRefunded || input.amountRefundedCents >= target.amountCents;
  const cents = full ? target.amountCents : Math.min(Math.max(0, input.amountRefundedCents), target.amountCents);
  if (cents <= refundedOf(target)) return { applied: "invoice", id: invoice.id, full, changed: false };

  /*
    Only a bill whose every collected payment has now gone back reads
    "refunded", and it owes nothing. Otherwise the bill keeps its status and
    the customer is not asked again; the owner decides in Command.
  */
  const after = invoice.payments.map((p) => (p.id === target.id ? { ...p, refundedCents: cents } : p));
  const anyKept = after.some((p) => isCollected(p.status) && refundedOf(p) < p.amountCents);
  const settled = invoice.status === "paid" || invoice.status === "partial";
  let adjustment = false;
  if (settled && full && anyKept) {
    await raiseReconciliation({
      businessId: shop.id,
      kind: "payment",
      entityType: "invoice",
      entityId: invoice.id,
      system: "stripe",
      externalId: input.chargeId,
      expected: { invoiceCents: invoice.amountCents, status: invoice.status },
      observed: { reason: "refund_on_settled_bill", paymentId: target.id, chargeId: input.chargeId, amountCents: cents },
    });
    adjustment = true;
  }

  const amount = formatCentsExact(cents);
  await recordAudit({
    businessId: shop.id,
    entityType: invoice.jobId ? "job" : "shop",
    entityId: invoice.jobId ?? shop.id,
    jobId: invoice.jobId ?? undefined,
    action: full ? "invoice.refunded" : "invoice.partially_refunded",
    summary: full
      ? `Card payment refunded in Stripe (${amount})`
      : `Card payment partly refunded in Stripe (${amount} of ${formatCentsExact(target.amountCents)} so far)`,
    detail: { invoiceId: invoice.id, paymentId: target.id, chargeId: input.chargeId, amountRefundedCents: cents },
    idempotencyKey: `refund:${input.chargeId}:${cents}`,
  });
  const changed = await raiseRefund("payment", target.id, cents);
  if (settled && !anyKept) {
    await prisma.$transaction([
      prisma.payment.updateMany({ where: { invoiceId: invoice.id, id: { in: after.filter((p) => isCollected(p.status)).map((p) => p.id) } }, data: { status: "refunded" } }),
      prisma.invoice.update({ where: { id: invoice.id }, data: { status: "refunded" } }),
    ]);
  }
  return { applied: "invoice", id: invoice.id, full, changed, adjustment };
}

/** The card payment a refund was for: its session's row, or the only card-like row when the session is unknown. */
function refundedPayment<P extends { id: string; method: string | null; status: string }>(payments: P[], sessionId?: string | null): P | null {
  if (sessionId) return payments.find((p) => p.method === `stripe:${sessionId}`) ?? null;
  const owner = new Set<string>([...OWNER_METHODS, "customer_attested", "customer_said"]);
  const card = payments.filter((p) => !owner.has((p.method ?? "").toLowerCase()) && (isCollected(p.status) || p.status === "refunded"));
  return card.length === 1 ? card[0]! : null;
}

/**
 * A refund from the shop's own account that Orvius can't put on one record
 * stays open until a person matches it: one reconciliation exception per
 * charge and amount, and one owner alert. A failed write throws, so the
 * webhook is retried rather than marked processed.
 */
async function flagUnappliedRefund(input: RefundInput, shop: Shop, record: { type: "invoice" | "deposit"; id: string }, why: "record_missing" | "record_unpaid" | "payment_unmatched") {
  const amount = formatCentsExact(input.amountRefundedCents);
  await raiseReconciliation({
    businessId: shop.id,
    kind: "payment",
    entityType: record.type,
    entityId: record.id,
    system: "stripe",
    externalId: input.chargeId,
    expected: { refundOn: record.type },
    observed: {
      reason: why === "record_missing" ? "refund_record_missing" : why === "record_unpaid" ? "refund_record_unpaid" : "refund_unmatched",
      chargeId: input.chargeId,
      paymentIntentId: input.paymentIntentId ?? null,
      amountCents: input.amountRefundedCents,
      full: input.fullyRefunded,
    },
  });
  await enqueueOwnerAlert({
    businessId: shop.id,
    dedupeKey: `refund-unapplied:${input.chargeId}:${input.amountRefundedCents}`,
    businessName: shop.name,
    message:
      why === "record_missing"
        ? `Stripe refunded ${amount} (charge ${input.chargeId}) for a ${record.type} Orvius no longer has. Nothing was changed. Check it in Command under Exceptions.`
        : why === "record_unpaid"
          ? `Stripe refunded ${amount} (charge ${input.chargeId}) on a ${record.type} Orvius never recorded as paid. Nothing was changed. Check it in Command under Exceptions.`
        : `Stripe refunded ${amount} (charge ${input.chargeId}) on a bill with more than one card payment, and Orvius can't tell which. Nothing was changed. Match it in Command under Exceptions.`,
    ownerPhone: shop.ownerPhone,
    ownerEmail: shop.ownerEmail,
  });
}
