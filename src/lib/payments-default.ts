import { recordAudit } from "@/lib/audit";
import { formatCentsTidy } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getConnectStatus } from "@/lib/stripe-connect";
import { sendSms } from "@/lib/twilio-sms";

/*
  Getting paid is the default, not a setting to discover. The first time a
  shop's Stripe account is cleared to take cards, booked customers start
  getting a deposit link and finished jobs their bill — and the owner is told
  in the same moment, with the one-word reply that turns it off. A shop that
  already chose its deposit settings keeps them, and this never runs twice, so
  an owner who said no is never switched back on.
*/

export const DEFAULT_DEPOSIT_CENTS = 50_00;

type OwnerTexts = { toOwner: typeof sendSms };
const liveTexts: OwnerTexts = { toOwner: sendSms };

export function paymentsLiveText(shopName: string, depositCents: number | null) {
  const deposit = depositCents
    ? `Booked customers now get a ${formatCentsTidy(depositCents)} deposit link, and finished jobs get their bill by text. `
    : "Finished jobs now get their bill by text. ";
  return (
    `Orvius: ${shopName} can take card payments. ${deposit}` +
    `Text DONE 450 when a job is finished to bill it. ` +
    (depositCents ? "Reply DEPOSIT OFF to stop deposits, or DEPOSIT 75 to change the amount." : "Reply DEPOSIT 75 to ask for deposits.")
  );
}

/** Switch payments on for a shop whose card path just opened. Safe to call on every Connect sync. */
export async function applyPaymentsDefault(businessId: string, texts: OwnerTexts = liveTexts) {
  const shop = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      ownerPhone: true,
      depositEnabled: true,
      depositAmountCents: true,
      paymentsDefaultedAt: true,
      stripeConnectAccountId: true,
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
      stripeConnectDetailsSubmitted: true,
    },
  });
  if (!shop || shop.paymentsDefaultedAt) return { applied: false as const };
  if (!getConnectStatus(shop).canAcceptPayments) return { applied: false as const };

  const untouched = !shop.depositEnabled && shop.depositAmountCents == null;
  const claimed = await prisma.business.updateMany({
    where: { id: shop.id, paymentsDefaultedAt: null },
    data: {
      paymentsDefaultedAt: new Date(),
      ...(untouched ? { depositEnabled: true, depositAmountCents: DEFAULT_DEPOSIT_CENTS } : {}),
    },
  });
  if (claimed.count === 0) return { applied: false as const };

  const depositCents = untouched
    ? DEFAULT_DEPOSIT_CENTS
    : shop.depositEnabled
      ? shop.depositAmountCents
      : null;

  await recordAudit({
    businessId: shop.id,
    entityType: "shop",
    entityId: shop.id,
    action: "payments.defaulted_on",
    actor: "system",
    summary: untouched
      ? `Card payments went live — deposits switched on at ${formatCentsTidy(DEFAULT_DEPOSIT_CENTS)}`
      : "Card payments went live — the shop's own deposit settings kept",
    idempotencyKey: `payments-default:${shop.id}`,
  });

  if (shop.ownerPhone) {
    await texts
      .toOwner({ to: shop.ownerPhone, body: paymentsLiveText(shop.name, depositCents), businessId: shop.id, audience: "owner" })
      .catch(() => null);
  }
  return { applied: true as const, depositCents };
}
