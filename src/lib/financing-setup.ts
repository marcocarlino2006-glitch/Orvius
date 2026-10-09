import type Stripe from "stripe";
import { financingCapabilityRequest, financingMethodsFromAccount, financingStatus } from "@/lib/financing";
import { prisma } from "@/lib/prisma";
import { getConnectStatus } from "@/lib/stripe-connect";

export type FinancingStripe = { accounts: { update(id: string, params: Stripe.AccountUpdateParams): Promise<Pick<Stripe.Account, "capabilities">> } };

type Shop = Parameters<typeof getConnectStatus>[0] & { id: string };

export class FinancingRefused extends Error {}

/**
 * Switch pay-over-time on or off for a shop. Turning it on asks Stripe to
 * activate Affirm and Klarna on the shop's account; customers only see them
 * once Stripe says they're active, which arrives on the account webhook.
 */
export async function setShopFinancing(shop: Shop, enabled: boolean, stripe: FinancingStripe) {
  if (!enabled) {
    const updated = await prisma.business.update({ where: { id: shop.id }, data: { financingEnabled: false }, select: { financingEnabled: true, financingMethods: true } });
    return financingStatus(updated);
  }
  const connect = getConnectStatus(shop);
  if (!connect.canAcceptPayments || !connect.accountId) throw new FinancingRefused("Connect payouts first. Pay over time runs on the same Stripe account as card payments.");
  const account = await stripe.accounts.update(connect.accountId, financingCapabilityRequest());
  const updated = await prisma.business.update({
    where: { id: shop.id },
    data: { financingEnabled: true, financingMethods: financingMethodsFromAccount(account).join(",") || null },
    select: { financingEnabled: true, financingMethods: true },
  });
  return financingStatus(updated);
}
