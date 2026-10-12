import { prisma } from "@/lib/prisma";
import { clampBps, withSalesTax } from "@/lib/sales-tax";

export async function shopTaxBps(businessId: string) {
  const shop = await prisma.business.findUnique({ where: { id: businessId }, select: { salesTaxBps: true } });
  return clampBps(shop?.salesTaxBps);
}

/** The invoice columns for a bill priced at `subtotalCents` today. */
export async function pricedInvoice(businessId: string, subtotalCents: number) {
  const priced = withSalesTax(subtotalCents, await shopTaxBps(businessId));
  return {
    amountCents: priced.totalCents,
    subtotalCents: priced.subtotalCents,
    taxCents: priced.taxCents,
    taxBps: priced.taxBps,
  };
}

/** Booking deposits already paid toward a job, matched by the job or the lead it came from. */
export async function paidDepositCents(businessId: string, jobId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, businessId }, select: { leadId: true } });
  const deposits = await prisma.deposit.findMany({
    where: { businessId, status: "paid", OR: [{ jobId }, ...(job?.leadId ? [{ leadId: job.leadId }] : [])] },
    select: { amountCents: true },
  });
  return deposits.reduce((sum, d) => sum + d.amountCents, 0);
}

/**
 * Invoice columns for a job's bill: the work plus tax, less any deposit the
 * customer already paid. Every path that prices a job's invoice goes through
 * here, or the deposit "applied to your final bill" is charged a second time.
 */
export async function pricedJobInvoice(businessId: string, jobId: string | null | undefined, subtotalCents: number) {
  const priced = await pricedInvoice(businessId, subtotalCents);
  if (!jobId) return priced;
  const credit = await paidDepositCents(businessId, jobId);
  return { ...priced, amountCents: Math.max(0, priced.amountCents - credit) };
}
