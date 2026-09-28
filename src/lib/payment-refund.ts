import { recordAudit } from "@/lib/audit";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export type RefundInput = {
  /** Metadata Orvius put on the payment intent when it created the Checkout session. */
  metadata: Record<string, string> | null | undefined;
  amountRefundedCents: number;
  fullyRefunded: boolean;
  chargeId: string;
};

export type RefundOutcome =
  | { applied: "deposit" | "invoice"; id: string; full: boolean }
  | { applied: null; reason: "not_ours" | "not_found" | "already_refunded" };

/**
 * A refund issued in Stripe has to reach Orvius's records, or a refunded
 * deposit keeps reading "paid" and counts as money in. Only a full refund
 * changes the status; a partial one is recorded on the timeline for the owner.
 */
export async function applyChargeRefund(input: RefundInput): Promise<RefundOutcome> {
  const meta = input.metadata ?? {};
  const businessId = meta.businessId;
  if (!businessId) return { applied: null, reason: "not_ours" };
  const amount = `$${(input.amountRefundedCents / 100).toFixed(2)}`;

  if (meta.kind === "booking_deposit" && meta.depositId) {
    const deposit = await prisma.deposit.findFirst({ where: { id: meta.depositId, businessId } });
    if (!deposit) return { applied: null, reason: "not_found" };
    if (deposit.status === "refunded") return { applied: null, reason: "already_refunded" };
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
    const invoice = await prisma.invoice.findFirst({ where: { id: meta.invoiceId, businessId } });
    if (!invoice) return { applied: null, reason: "not_found" };
    if (invoice.status === "refunded") return { applied: null, reason: "already_refunded" };
    if (input.fullyRefunded) {
      await prisma.$transaction([
        prisma.invoice.updateMany({ where: { id: invoice.id, status: "paid" }, data: { status: "refunded" } }),
        prisma.payment.updateMany({ where: { invoiceId: invoice.id, status: { not: "refunded" } }, data: { status: "refunded" } }),
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
