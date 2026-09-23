import type { Business, Deposit } from "@prisma/client";
import type Stripe from "stripe";

import { isPriorityUrgency } from "@/lib/auto-job";
import { sendCustomerSms } from "@/lib/customer-sms";
import {
  STRIPE_MIN_CHARGE_CENTS,
  calculatePlatformFeeCents,
  isChargeableAmount,
} from "@/lib/platform-fee";
import { prisma } from "@/lib/prisma";
import { mintPublicToken } from "@/lib/public-tokens";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";

/*
  A deposit is collected at the moment the job is booked rather than after the
  work, because that is the only moment the customer's motivation is at its
  peak: the furnace is out, it is 2am, and they want a commitment that someone
  is coming. Asking a week later competes with the fact that the house is warm
  again.

  Every charge here is a direct charge on the shop's connected account, so the
  Checkout session, its payment intent and its webhooks all live on that
  account and not on the platform.
*/

/** Deposits above this are almost certainly a typo in the settings field. */
export const MAX_DEPOSIT_CENTS = 500_00;

export type DepositSettings = Pick<
  Business,
  "depositEnabled" | "depositAmountCents"
>;

export function isDepositAmountValid(amountCents: number) {
  return (
    Number.isInteger(amountCents) &&
    amountCents >= STRIPE_MIN_CHARGE_CENTS &&
    amountCents <= MAX_DEPOSIT_CENTS
  );
}

/** What this shop asks for at booking, or null when deposits are off. */
export function resolveDepositAmountCents(
  business: DepositSettings,
): number | null {
  if (!business.depositEnabled) return null;
  const amount = business.depositAmountCents;
  if (amount == null || !isDepositAmountValid(amount)) return null;
  return amount;
}

/**
 * Whether a change to a shop's deposit settings leaves them coherent.
 *
 * Deposits on with no amount resolves to null and collects nothing, so the
 * settings screen reads as working while every request fails later — at the
 * point where an owner is already on the phone with a customer. The
 * combination is refused when it is saved instead.
 */
export function validateDepositSettingsChange(params: {
  current: DepositSettings;
  next: { depositEnabled?: boolean; depositAmountCents?: number | null };
}): { ok: true } | { ok: false; error: string } {
  const { current, next } = params;
  if (
    next.depositEnabled === undefined &&
    next.depositAmountCents === undefined
  ) {
    return { ok: true };
  }

  const enabled = next.depositEnabled ?? current.depositEnabled;
  const amountCents =
    next.depositAmountCents !== undefined
      ? next.depositAmountCents
      : current.depositAmountCents;

  if (!enabled) return { ok: true };

  if (amountCents == null) {
    return {
      ok: false,
      error: "Set a deposit amount before turning deposits on.",
    };
  }

  if (!isDepositAmountValid(amountCents)) {
    return {
      ok: false,
      error: `Deposit must be between $${(STRIPE_MIN_CHARGE_CENTS / 100).toFixed(2)} and $${MAX_DEPOSIT_CENTS / 100}.`,
    };
  }

  return { ok: true };
}

/** Whether this shop could take a deposit right now, and why not if it can't. */
export function getDepositReadiness(
  business: DepositSettings & Parameters<typeof getConnectStatus>[0],
):
  | { ready: true; amountCents: number }
  | { ready: false; reason: "connect_incomplete" | "deposits_off" } {
  if (!getConnectStatus(business).canAcceptPayments) {
    return { ready: false, reason: "connect_incomplete" };
  }
  const amountCents = resolveDepositAmountCents(business);
  if (amountCents == null) return { ready: false, reason: "deposits_off" };
  return { ready: true, amountCents };
}

export function depositPayUrl(publicToken: string) {
  return `${getAppBaseUrl()}/d/${publicToken}`;
}

/**
 * Record a deposit request against a lead.
 *
 * Returns the existing pending or paid deposit rather than a second one, so a
 * retried booking or a double-tapped button cannot ask a customer to pay
 * twice for the same call.
 */
export async function createDepositForLead(params: {
  businessId: string;
  leadId: string | null;
  jobId?: string | null;
  amountCents: number;
}): Promise<{ deposit: Deposit; created: boolean }> {
  if (!isDepositAmountValid(params.amountCents)) {
    throw new Error(`Deposit amount out of range: ${params.amountCents}`);
  }

  if (params.leadId) {
    const existing = await prisma.deposit.findFirst({
      where: {
        businessId: params.businessId,
        leadId: params.leadId,
        status: { in: ["pending", "paid"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      if (params.jobId && !existing.jobId) {
        const linked = await prisma.deposit.update({
          where: { id: existing.id },
          data: { jobId: params.jobId },
        });
        return { deposit: linked, created: false };
      }
      return { deposit: existing, created: false };
    }
  }

  const deposit = await prisma.deposit.create({
    data: {
      businessId: params.businessId,
      leadId: params.leadId,
      jobId: params.jobId ?? null,
      amountCents: params.amountCents,
      status: "pending",
      publicToken: mintPublicToken(),
    },
  });

  return { deposit, created: true };
}

/**
 * Text the customer their deposit link.
 *
 * Goes through `sendCustomerSms` so the shop-scoped STOP list applies; a
 * deposit request is still a message to a customer.
 */
export async function sendDepositLink(params: {
  business: Pick<Business, "id" | "name">;
  deposit: Pick<Deposit, "id" | "amountCents" | "publicToken">;
  toPhone: string;
}) {
  if (!params.deposit.publicToken) {
    return { sent: false as const, reason: "no_token" as const };
  }

  const dollars = (params.deposit.amountCents / 100).toFixed(2);
  const result = await sendCustomerSms({
    businessId: params.business.id,
    to: params.toPhone,
    body: withSmsOptOutFooter(
      `${params.business.name}: to lock in your appointment, ` +
        `please pay your $${dollars} deposit here: ` +
        depositPayUrl(params.deposit.publicToken),
    ),
  });

  if (result.sent) {
    await prisma.$transaction([
      prisma.deposit.update({
        where: { id: params.deposit.id },
        data: { sentAt: new Date() },
      }),
      prisma.webhookEvent.create({
        data: {
          source: "deposit-sms",
          externalId: result.sid,
          eventType: "delivery",
          businessId: params.business.id,
          status: "pending",
          payloadJson: JSON.stringify({ depositId: params.deposit.id }),
        },
      }),
    ]);
  }

  return result;
}

export type EnsureBookingDepositResult =
  | {
      ok: true;
      skipped: true;
      reason: "deposits_off" | "connect_incomplete" | "not_priority";
    }
  | {
      ok: true;
      skipped: false;
      deposit: Deposit;
      created: boolean;
      sms: Awaited<ReturnType<typeof sendDepositLink>> | null;
    }
  | {
      ok: false;
      error: "business_not_found" | "lead_not_found" | "job_mismatch";
    };

/**
 * Close booking → money when the shop explicitly opted in.
 *
 * The readiness check is both the consent boundary and the payment-safety
 * boundary. A retry reuses the same active deposit, links it to the booked job,
 * and never texts again while a carrier delivery is still valid. A terminal
 * Twilio failure clears `sentAt`, making the same deposit eligible for retry.
 */
export async function ensureBookingDepositForJob(params: {
  businessId: string;
  leadId: string;
  jobId: string;
  sendSms?: boolean;
}): Promise<EnsureBookingDepositResult> {
  const [business, lead, job] = await Promise.all([
    prisma.business.findUnique({
      where: { id: params.businessId },
      select: {
        id: true,
        name: true,
        depositEnabled: true,
        depositAmountCents: true,
        stripeConnectAccountId: true,
        stripeConnectChargesEnabled: true,
        stripeConnectPayoutsEnabled: true,
        stripeConnectDetailsSubmitted: true,
      },
    }),
    prisma.lead.findFirst({
      where: { id: params.leadId, businessId: params.businessId },
      select: {
        phone: true,
        urgency: true,
        job: { select: { id: true } },
      },
    }),
    prisma.job.findFirst({
      where: { id: params.jobId, businessId: params.businessId },
      select: { id: true, urgency: true },
    }),
  ]);

  if (!business) return { ok: false, error: "business_not_found" };
  if (!lead) return { ok: false, error: "lead_not_found" };
  if (!job || lead.job?.id !== params.jobId) {
    return { ok: false, error: "job_mismatch" };
  }

  const readiness = getDepositReadiness(business);
  if (!readiness.ready) {
    return { ok: true, skipped: true, reason: readiness.reason };
  }

  /*
    Auto-ask only on emergency / same-day. Flexible books should not surprise
    the customer with a card link — owner can still send a deposit manually.
  */
  const urgency = job.urgency ?? lead.urgency;
  if (!isPriorityUrgency(urgency)) {
    return { ok: true, skipped: true, reason: "not_priority" };
  }

  const { deposit, created } = await createDepositForLead({
    businessId: params.businessId,
    leadId: params.leadId,
    jobId: params.jobId,
    amountCents: readiness.amountCents,
  });

  let sms: Awaited<ReturnType<typeof sendDepositLink>> | null = null;
  if (params.sendSms !== false && lead.phone?.trim() && !deposit.sentAt) {
    sms = await sendDepositLink({
      business,
      deposit,
      toPhone: lead.phone,
    });
  }

  return { ok: true, skipped: false, deposit, created, sms };
}

/**
 * Checkout session for a deposit, charged on the shop's own account.
 *
 * `application_fee_amount` is Orvius' entire revenue on this transaction. It
 * is computed once here and echoed into metadata so fulfilment records what
 * was actually charged rather than recomputing it against a rate that may
 * have changed in between.
 */
export async function createDepositCheckoutSession(params: {
  deposit: Pick<Deposit, "id" | "amountCents" | "publicToken">;
  business: Pick<Business, "id" | "name"> &
    Parameters<typeof getConnectStatus>[0];
}) {
  const connect = getConnectStatus(params.business);
  if (!connect.canAcceptPayments || !connect.accountId) {
    throw new Error("Shop is not cleared to accept card payments");
  }
  if (!params.deposit.publicToken) {
    throw new Error("Deposit has no public token");
  }
  if (!isChargeableAmount(params.deposit.amountCents)) {
    throw new Error(
      `Deposit below Stripe minimum: ${params.deposit.amountCents}`,
    );
  }

  const stripe = getStripe();
  const baseUrl = getAppBaseUrl();
  const token = params.deposit.publicToken;
  const applicationFeeCents = calculatePlatformFeeCents(
    params.deposit.amountCents,
  );

  const metadata = {
    kind: "booking_deposit",
    depositId: params.deposit.id,
    businessId: params.business.id,
    publicToken: token,
  };

  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: params.deposit.amountCents,
            product_data: {
              name: `${params.business.name} — appointment deposit`,
              description:
                "Holds your appointment. Applied to your final bill.",
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        metadata,
      },
      success_url: `${baseUrl}/d/${token}?paid=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/d/${token}?canceled=1`,
      metadata,
    },
    { stripeAccount: connect.accountId },
  );

  await prisma.deposit.update({
    where: { id: params.deposit.id },
    data: { stripeSessionId: session.id, applicationFeeCents },
  });

  return session;
}

/**
 * Mark a deposit paid from a completed Checkout session.
 *
 * Idempotent by design: webhooks retry, and the customer's own return from
 * Stripe races the webhook. The unique `stripeSessionId` plus the paid-status
 * short circuit mean whichever arrives second is a no-op.
 */
export async function fulfillDepositCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string; depositId?: string }> {
  if (session.metadata?.kind !== "booking_deposit") {
    return { ok: false, reason: "not_booking_deposit" };
  }
  if (session.payment_status !== "paid" && session.status !== "complete") {
    return { ok: false, reason: "not_paid" };
  }

  const depositId = session.metadata.depositId;
  const businessId = session.metadata.businessId;
  if (!depositId || !businessId) {
    return { ok: false, reason: "missing_metadata" };
  }

  const deposit = await prisma.deposit.findFirst({
    where: { id: depositId, businessId },
  });
  if (!deposit) return { ok: false, reason: "deposit_not_found" };
  if (deposit.status === "paid") {
    return { ok: true, reason: "already_paid", depositId: deposit.id };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  await prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      status: "paid",
      paidAt: new Date(),
      stripeSessionId: session.id,
      stripePaymentIntentId: paymentIntentId,
      applicationFeeCents:
        deposit.applicationFeeCents ??
        calculatePlatformFeeCents(session.amount_total ?? deposit.amountCents),
    },
  });

  return { ok: true, depositId: deposit.id };
}

/**
 * Mark a booking deposit failed when Checkout expires or the card path dies.
 * Idempotent: paid/canceled/refunded rows stay put; already-failed is a no-op.
 */
export async function markDepositFailed(params: {
  depositId: string;
  businessId: string;
  stripeSessionId?: string | null;
}): Promise<{ ok: boolean; reason?: string; depositId?: string }> {
  const deposit = await prisma.deposit.findFirst({
    where: { id: params.depositId, businessId: params.businessId },
  });
  if (!deposit) return { ok: false, reason: "deposit_not_found" };
  if (deposit.status === "paid") {
    return { ok: true, reason: "already_paid", depositId: deposit.id };
  }
  if (deposit.status === "canceled" || deposit.status === "refunded") {
    return { ok: true, reason: "closed", depositId: deposit.id };
  }
  if (deposit.status === "failed") {
    return { ok: true, reason: "already_failed", depositId: deposit.id };
  }

  await prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      status: "failed",
      ...(params.stripeSessionId
        ? { stripeSessionId: params.stripeSessionId }
        : {}),
    },
  });

  return { ok: true, depositId: deposit.id };
}

/**
 * Fail a booking deposit from an expired Checkout session (card never cleared).
 */
export async function failDepositCheckoutSession(
  session: Stripe.Checkout.Session,
): Promise<{ ok: boolean; reason?: string; depositId?: string }> {
  if (session.metadata?.kind !== "booking_deposit") {
    return { ok: false, reason: "not_booking_deposit" };
  }
  const depositId = session.metadata.depositId;
  const businessId = session.metadata.businessId;
  if (!depositId || !businessId) {
    return { ok: false, reason: "missing_metadata" };
  }
  return markDepositFailed({
    depositId,
    businessId,
    stripeSessionId: session.id,
  });
}

/** Look up a deposit for its public pay page. */
export async function getDepositByToken(token: string) {
  if (!token.trim()) return null;
  return prisma.deposit.findFirst({
    where: { publicToken: token },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          phone: true,
          stripeConnectAccountId: true,
          stripeConnectChargesEnabled: true,
          stripeConnectPayoutsEnabled: true,
          stripeConnectDetailsSubmitted: true,
        },
      },
    },
  });
}
