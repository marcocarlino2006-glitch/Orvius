import type Stripe from "stripe";
import type { Acquisition } from "@/lib/acquisition";
import { recordAudit } from "@/lib/audit";
import { shopHasLivePlan } from "@/lib/billing-sync";
import { getPrimaryDomain } from "@/lib/domains";
import { logInfo, logWarn } from "@/lib/logger";
import { getPlanById, isPaidPlanId } from "@/lib/pricing-plans";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { sendSms } from "@/lib/twilio-sms";

/*
  Shop sends shop. The referrer is credited one month of its own plan when the
  shop it sent pays its first invoice — not at sign-up, so a referral that never
  pays costs nothing and a credit is never handed out for a card that bounced.
*/

export const REFERRAL_TERMS =
  "When a shop you send pays its first month, Orvius credits you one month of your plan on your next bill.";

export function referralLink(slug: string) {
  return `https://${getPrimaryDomain()}/r/${slug}`;
}

/** Stripe metadata values are capped at 500 characters. */
export function acquisitionMetadata(acq: Acquisition | null): Record<string, string> {
  if (!acq) return {};
  const raw = JSON.stringify(acq);
  return raw.length <= 480 ? { acq: raw } : { acq: JSON.stringify({ ...acq, land: undefined, cmp: undefined }).slice(0, 480) };
}

/** The shop a referral code names, if it may refer. */
export async function findReferrer(slug: string | undefined, client = prisma) {
  if (!slug) return null;
  return client.business.findFirst({
    where: { slug, environment: "production", isActive: true },
    select: { id: true, name: true, slug: true, ownerEmail: true },
  });
}

/** Records where a new shop came from and, when another shop sent it, who. */
export async function attachAcquisition(
  business: { id: string; ownerEmail: string | null },
  acq: Acquisition | null,
  client = prisma,
) {
  if (!acq) return { referred: false };
  const referrer = await findReferrer(acq.ref, client);
  const selfReferral =
    referrer &&
    (referrer.id === business.id ||
      (referrer.ownerEmail && business.ownerEmail && referrer.ownerEmail.toLowerCase() === business.ownerEmail.toLowerCase()));
  const validReferrer = referrer && !selfReferral ? referrer : null;

  await client.business.update({
    where: { id: business.id },
    data: { acquisitionJson: JSON.stringify(acq), referredById: validReferrer?.id ?? null },
  });
  if (!validReferrer) return { referred: false };

  await client.referral.upsert({
    where: { referredId: business.id },
    create: { referrerId: validReferrer.id, referredId: business.id },
    update: {},
  });
  logInfo("referral.attached", { referrerId: validReferrer.id, referredId: business.id, via: acq.via ?? "link" });
  return { referred: true, referrerId: validReferrer.id };
}

type CreditStripe = Pick<Stripe, "customers">;

/**
 * Called on every paid platform invoice. Only the referred shop's first paid
 * invoice does anything; later ones find no pending referral.
 */
export async function creditReferralOnPayment(
  params: { customerId: string | null; amountPaidCents: number },
  deps: { client?: typeof prisma; stripe?: CreditStripe; notify?: typeof sendSms } = {},
) {
  const client = deps.client ?? prisma;
  if (!params.customerId || params.amountPaidCents <= 0) return { status: "skipped" as const };

  const referred = await client.business.findFirst({
    where: { stripeCustomerId: params.customerId },
    select: { id: true, name: true },
  });
  if (!referred) return { status: "skipped" as const };

  const referral = await client.referral.findUnique({
    where: { referredId: referred.id },
    include: {
      referrer: {
        select: {
          id: true,
          name: true,
          ownerPhone: true,
          stripeCustomerId: true,
          stripeSubscriptionId: true,
          billingStatus: true,
          billingPlan: true,
        },
      },
    },
  });
  if (!referral || referral.status !== "pending") return { status: "skipped" as const };

  const referrer = referral.referrer;
  if (!shopHasLivePlan(referrer) || !referrer.stripeCustomerId) {
    await client.referral.updateMany({ where: { id: referral.id, status: "pending" }, data: { status: "void" } });
    return { status: "void" as const };
  }

  // Claim the referral first so a retried webhook cannot credit twice.
  const claimed = await client.referral.updateMany({
    where: { id: referral.id, status: "pending" },
    data: { status: "crediting" },
  });
  if (claimed.count === 0) return { status: "skipped" as const };

  const planId = referrer.billingPlan && isPaidPlanId(referrer.billingPlan) ? referrer.billingPlan : "line";
  const creditCents = getPlanById(planId).price * 100;
  try {
    await (deps.stripe ?? getStripe()).customers.createBalanceTransaction(
      referrer.stripeCustomerId,
      {
        amount: -creditCents,
        currency: "usd",
        description: `Referral credit: ${referred.name}`,
        metadata: { referralId: referral.id, referredBusinessId: referred.id },
      },
      { idempotencyKey: `referral-credit:${referral.id}` },
    );
  } catch (error) {
    await client.referral.update({ where: { id: referral.id }, data: { status: "pending" } });
    logWarn("referral.credit_failed", { referralId: referral.id, error: error instanceof Error ? error.message : "unknown" });
    throw error;
  }

  await client.referral.update({
    where: { id: referral.id },
    data: { status: "credited", creditCents, creditedAt: new Date() },
  });
  const dollars = `$${(creditCents / 100).toFixed(0)}`;
  await recordAudit({
    businessId: referrer.id,
    entityType: "shop",
    entityId: referrer.id,
    action: "referral.credited",
    actor: "system",
    summary: `${referred.name} paid its first month. ${dollars} credited to your next bill.`,
    detail: { referralId: referral.id, referredBusinessId: referred.id, creditCents },
    idempotencyKey: `referral-credit:${referral.id}`,
  });
  if (referrer.ownerPhone) {
    await (deps.notify ?? sendSms)({
      to: referrer.ownerPhone,
      businessId: referrer.id,
      audience: "owner",
      body: `Orvius: ${referred.name} signed up from your link and paid its first month. ${dollars} is credited to your next bill. Thank you.`,
    }).catch(() => null);
  }
  return { status: "credited" as const, creditCents };
}

export async function referralSummary(businessId: string, client = prisma) {
  const rows = await client.referral.findMany({
    where: { referrerId: businessId },
    select: { status: true, creditCents: true },
  });
  return {
    pending: rows.filter((r) => r.status === "pending" || r.status === "crediting").length,
    credited: rows.filter((r) => r.status === "credited").length,
    creditedCents: rows.reduce((sum, r) => sum + (r.status === "credited" ? (r.creditCents ?? 0) : 0), 0),
  };
}
