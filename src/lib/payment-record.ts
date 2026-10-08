import { recordAudit, type AuditActor } from "@/lib/audit";
import { formatCentsExact } from "@/lib/money";
import { collectedCents, PAYMENT_CLAIMED, PAYMENT_RECORDED, type OwnerMethod } from "@/lib/payment-math";
import { prisma } from "@/lib/prisma";

/*
  An issued invoice is not money collected. Only two things count as collected:
  a card payment the processor confirmed, and cash or a check that someone on
  the shop's side says they have in hand. A customer saying "I paid" is a
  claim: it is kept, the owner is told, and nothing counts until the owner
  confirms the money arrived.
*/

export {
  claimedCents,
  COLLECTED_STATUSES,
  collectedCents,
  collectedHow,
  isCollected,
  OWNER_METHODS,
  PAYMENT_CLAIMED,
  PAYMENT_RECORDED,
  type OwnerMethod,
  type PaymentRow,
} from "@/lib/payment-math";

/** A customer says they paid outside the card checkout. Kept as a claim; the invoice stays open. */
export async function recordCustomerClaim(params: { businessId: string; invoiceId: string; amountCents: number; jobId?: string | null }) {
  const existing = await prisma.payment.findFirst({
    where: { invoiceId: params.invoiceId, status: PAYMENT_CLAIMED },
    select: { id: true },
  });
  if (existing) return { created: false };
  await prisma.payment.create({
    data: {
      businessId: params.businessId,
      invoiceId: params.invoiceId,
      amountCents: params.amountCents,
      status: PAYMENT_CLAIMED,
      method: "customer_said",
    },
  });
  await recordAudit({
    businessId: params.businessId,
    entityType: params.jobId ? "job" : "shop",
    entityId: params.jobId ?? params.businessId,
    jobId: params.jobId ?? undefined,
    action: "payment.claimed",
    actor: "customer",
    summary: `Customer says they paid ${formatCentsExact(params.amountCents)} outside card checkout — not counted until you confirm`,
  });
  return { created: true };
}

async function settleIfCovered(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
  if (!invoice) return false;
  if (collectedCents(invoice.payments) >= invoice.amountCents && invoice.status !== "paid") {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "paid", paidAt: new Date() } });
    return true;
  }
  return invoice.status === "paid";
}

/** The owner or a teammate has the money in hand. */
export async function recordShopPayment(params: {
  businessId: string;
  invoiceId: string;
  jobId: string;
  method: OwnerMethod;
  amountCents?: number;
  actor: AuditActor;
  actorEmail?: string;
}) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: params.invoiceId, businessId: params.businessId },
    include: { payments: true },
  });
  if (!invoice) return { ok: false as const, error: "That bill isn't on this account." };
  const balance = Math.max(0, invoice.amountCents - collectedCents(invoice.payments));
  if (balance === 0) return { ok: false as const, error: "This bill is already paid in full." };
  const owed = params.amountCents ? Math.min(params.amountCents, balance) : balance;
  await prisma.$transaction([
    prisma.payment.updateMany({ where: { invoiceId: invoice.id, status: PAYMENT_CLAIMED }, data: { status: "superseded" } }),
    prisma.payment.create({
      data: { businessId: params.businessId, invoiceId: invoice.id, amountCents: owed, status: PAYMENT_RECORDED, method: params.method },
    }),
  ]);
  const paid = await settleIfCovered(invoice.id);
  if (!paid) await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "partial" } });
  await recordAudit({
    businessId: params.businessId,
    entityType: "job",
    entityId: params.jobId,
    jobId: params.jobId,
    action: "payment.recorded",
    actor: params.actor,
    actorEmail: params.actorEmail,
    summary: `${formatCentsExact(owed)} collected by ${params.method}`,
  });
  return { ok: true as const, paid, amountCents: owed };
}

/** The owner confirms a customer's "I paid" — the money did arrive. */
export async function confirmCustomerClaim(params: {
  businessId: string;
  invoiceId: string;
  jobId: string;
  actor: AuditActor;
  actorEmail?: string;
}) {
  const claim = await prisma.payment.findFirst({
    where: { invoiceId: params.invoiceId, businessId: params.businessId, status: PAYMENT_CLAIMED },
  });
  if (!claim) return { ok: false as const, error: "There's no customer payment waiting to be confirmed." };
  await prisma.payment.update({ where: { id: claim.id }, data: { status: PAYMENT_RECORDED } });
  const paid = await settleIfCovered(params.invoiceId);
  await recordAudit({
    businessId: params.businessId,
    entityType: "job",
    entityId: params.jobId,
    jobId: params.jobId,
    action: "payment.confirmed",
    actor: params.actor,
    actorEmail: params.actorEmail,
    summary: `Confirmed the customer's ${formatCentsExact(claim.amountCents)} payment arrived`,
  });
  return { ok: true as const, paid };
}

/** The money never showed up; the claim is dropped and the bill stays open. */
export async function rejectCustomerClaim(params: { businessId: string; invoiceId: string; jobId: string; actor: AuditActor; actorEmail?: string }) {
  const moved = await prisma.payment.updateMany({
    where: { invoiceId: params.invoiceId, businessId: params.businessId, status: PAYMENT_CLAIMED },
    data: { status: "rejected" },
  });
  if (moved.count) {
    await recordAudit({
      businessId: params.businessId,
      entityType: "job",
      entityId: params.jobId,
      jobId: params.jobId,
      action: "payment.claim_rejected",
      actor: params.actor,
      actorEmail: params.actorEmail,
      summary: "Customer said they paid, but the money hasn't arrived — bill left open",
    });
  }
  return { ok: true as const };
}
