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
