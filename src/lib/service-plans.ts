import type Stripe from "stripe";
import { recordAudit } from "@/lib/audit";
import { isBillingEntitled } from "@/lib/billing-entitlement";
import { linkTouchToCustomer, normalizePhone } from "@/lib/customer";
import { sendCustomerSms } from "@/lib/customer-sms";
import { getAppUrl } from "@/lib/env";
import { isShopDaytime } from "@/lib/lead-follow-up";
import { logWarn } from "@/lib/logger";
import { enqueueOwnerAlert } from "@/lib/notifications";
import { getPlatformFeeBps, isChargeableAmount } from "@/lib/platform-fee";
import { prisma } from "@/lib/prisma";
import { getAppBaseUrl, getStripe } from "@/lib/stripe";
import { getConnectStatus } from "@/lib/stripe-connect";

/**
 * Maintenance plans: the shop sells a monthly or yearly plan, the customer
 * joins from /m/[slug] and pays the shop directly (a subscription on the
 * shop's connected account, Orvius taking its usual application fee), and
 * Orvius texts each member when an included visit comes due.
 */

export const PLAN_INTERVALS = ["month", "year"] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];
export const MAX_ACTIVE_PLANS = 6;
export const MAX_VISITS_PER_YEAR = 12;
/** Text the member this far ahead of the visit. */
export const VISIT_REMINDER_LEAD_MS = 14 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const MEMBER_LIVE = ["active", "past_due"];

export function visitCycleMs(visitsPerYear: number) {
  if (!visitsPerYear || visitsPerYear < 1) return null;
  return Math.round((365 / Math.min(visitsPerYear, MAX_VISITS_PER_YEAR)) * DAY_MS);
}

export function formatPlanPrice(priceCents: number, interval: string) {
  const dollars = priceCents % 100 === 0 ? `$${priceCents / 100}` : `$${(priceCents / 100).toFixed(2)}`;
  return `${dollars}/${interval === "year" ? "yr" : "mo"}`;
}

export type PlanInput = {
  name: string;
  priceCents: number;
  interval: string;
  visitsPerYear?: number;
  perks?: string | null;
};

export function validatePlan(input: PlanInput): { ok: true; plan: Required<Omit<PlanInput, "perks">> & { perks: string | null } } | { ok: false; message: string } {
  const name = input.name?.trim() ?? "";
  if (name.length < 2 || name.length > 60) return { ok: false, message: "Give the plan a short name." };
  if (!PLAN_INTERVALS.includes(input.interval as PlanInterval)) return { ok: false, message: "Pick monthly or yearly." };
  const priceCents = Math.round(Number(input.priceCents));
  if (!Number.isFinite(priceCents) || !isChargeableAmount(priceCents) || priceCents > 1_000_000) {
    return { ok: false, message: "Set a price between $1 and $10,000." };
  }
  const visitsPerYear = Math.round(Number(input.visitsPerYear ?? 0));
  if (!Number.isFinite(visitsPerYear) || visitsPerYear < 0 || visitsPerYear > MAX_VISITS_PER_YEAR) {
    return { ok: false, message: `Included visits must be 0 to ${MAX_VISITS_PER_YEAR} a year.` };
  }
  const perks = input.perks?.trim().slice(0, 400) || null;
  return { ok: true, plan: { name, priceCents, interval: input.interval, visitsPerYear, perks } };
}

export async function listPlans(businessId: string) {
  const [plans, counts] = await Promise.all([
    prisma.servicePlan.findMany({ where: { businessId }, orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    prisma.planMember.groupBy({ by: ["planId", "status"], where: { businessId }, _count: { _all: true } }),
  ]);
  return plans.map((plan) => {
    const mine = counts.filter((c) => c.planId === plan.id);
    const n = (status: string) => mine.find((c) => c.status === status)?._count._all ?? 0;
    return { ...plan, active: n("active"), pastDue: n("past_due"), canceled: n("canceled") };
  });
}

/** Recurring revenue, normalised to a month, from members whose card is current. */
export function monthlyRecurringCents(plans: { priceCents: number; interval: string; active: number }[]) {
  return Math.round(
    plans.reduce((sum, p) => sum + p.active * (p.interval === "year" ? p.priceCents / 12 : p.priceCents), 0),
  );
}

export async function listMembers(businessId: string, take = 200) {
  return prisma.planMember.findMany({
    where: { businessId, status: { not: "pending" } },
    orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    take,
    include: { plan: { select: { name: true, interval: true, priceCents: true } } },
  });
}

const PUBLIC_SHOP_SELECT = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  isActive: true,
  environment: true,
  billingStatus: true,
  pilotEndsAt: true,
  pastDueSince: true,
  createdAt: true,
  vapiPhoneNumber: true,
  twilioPhone: true,
  stripeConnectAccountId: true,
  stripeConnectChargesEnabled: true,
  stripeConnectPayoutsEnabled: true,
  stripeConnectDetailsSubmitted: true,
} as const;

/** The public plans page exists only while the shop is paid up, can take cards, and has a plan to sell. */
export async function publicPlansShop(slug: string) {
  if (!/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  const shop = await prisma.business.findUnique({ where: { slug }, select: PUBLIC_SHOP_SELECT });
  if (!shop || !shop.isActive || shop.environment === "test" || !isBillingEntitled(shop)) return null;
  if (!getConnectStatus(shop).canAcceptPayments) return null;
  const plans = await prisma.servicePlan.findMany({
    where: { businessId: shop.id, isActive: true },
    orderBy: { priceCents: "asc" },
    take: MAX_ACTIVE_PLANS,
    select: { id: true, name: true, priceCents: true, interval: true, visitsPerYear: true, perks: true },
  });
  if (!plans.length) return null;
  return { shop, plans };
}

type CheckoutCreate = (
  params: Stripe.Checkout.SessionCreateParams,
  options: Stripe.RequestOptions,
) => Promise<{ id: string; url: string | null }>;

export type JoinInput = { planId: string; name: string; phone: string; email?: string | null };

export async function createPlanCheckout(
  slug: string,
  input: JoinInput,
  deps: { createSession?: CheckoutCreate } = {},
): Promise<{ ok: true; url: string } | { ok: false; reason: "unavailable" | "invalid"; message: string }> {
  const found = await publicPlansShop(slug);
  if (!found) return { ok: false, reason: "unavailable", message: "This business isn't selling plans online right now." };
  const plan = found.plans.find((p) => p.id === input.planId);
  if (!plan) return { ok: false, reason: "invalid", message: "Pick a plan." };
  const phoneNormalized = normalizePhone(input.phone);
  const name = input.name?.trim() ?? "";
  if (!phoneNormalized || name.length < 2) {
    return { ok: false, reason: "invalid", message: "Add your name and a mobile number." };
  }
  const already = await prisma.planMember.findFirst({
    where: { businessId: found.shop.id, planId: plan.id, phoneNormalized, status: { in: MEMBER_LIVE } },
    select: { id: true },
  });
  if (already) return { ok: false, reason: "invalid", message: "That number is already on this plan." };

  const accountId = getConnectStatus(found.shop).accountId!;
  const email = input.email?.trim() || null;
  const member = await prisma.planMember.create({
    data: { businessId: found.shop.id, planId: plan.id, name, phone: input.phone.trim(), phoneNormalized, email },
  });
  const metadata = { kind: "plan_join", planId: plan.id, businessId: found.shop.id, memberId: member.id };
  const base = getAppBaseUrl();
  const create: CheckoutCreate =
    deps.createSession ?? ((params, options) => getStripe().checkout.sessions.create(params, options));
  try {
    const session = await create(
      {
        mode: "subscription",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: plan.priceCents,
              recurring: { interval: plan.interval as PlanInterval },
              product_data: { name: `${found.shop.name} — ${plan.name}` },
            },
          },
        ],
        ...(email ? { customer_email: email } : {}),
        subscription_data: { application_fee_percent: getPlatformFeeBps() / 100, metadata },
        metadata,
        success_url: `${base}/m/${slug}?joined=1`,
        cancel_url: `${base}/m/${slug}?canceled=1`,
      },
      { stripeAccount: accountId },
    );
    if (!session.url) throw new Error("Checkout returned no URL");
    return { ok: true, url: session.url };
  } catch (error) {
    await prisma.planMember.delete({ where: { id: member.id } }).catch(() => null);
    logWarn("plans.checkout_failed", { businessId: found.shop.id, error: error instanceof Error ? error.message : String(error) });
    return { ok: false, reason: "unavailable", message: "Payments are down for a moment. Try again or call the business." };
  }
}

function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** checkout.session.completed for a plan join, on the shop's connected account. */
export async function activatePlanMember(session: Stripe.Checkout.Session, now = new Date()) {
  if (session.metadata?.kind !== "plan_join") return { ok: false as const, reason: "not_plan_join" };
  const { memberId, businessId } = session.metadata;
  if (!memberId || !businessId) return { ok: false as const, reason: "missing_metadata" };
  const member = await prisma.planMember.findFirst({
    where: { id: memberId, businessId },
    include: { plan: true, business: { select: { name: true, ownerPhone: true, ownerEmail: true } } },
  });
  if (!member) return { ok: false as const, reason: "member_not_found" };
  if (member.status !== "pending") return { ok: true as const, reason: "already_active" };

  const customer = await linkTouchToCustomer({
    businessId,
    phone: member.phone,
    name: member.name,
    email: member.email ?? session.customer_details?.email ?? null,
  }).catch(() => null);
  const customerId = customer?.id ?? null;
  const cycle = visitCycleMs(member.plan.visitsPerYear);
  const claimed = await prisma.planMember.updateMany({
    where: { id: member.id, status: "pending" },
    data: {
      status: "active",
      startedAt: now,
      stripeSubscriptionId: idOf(session.subscription as string | { id: string } | null),
      stripeCustomerId: idOf(session.customer as string | { id: string } | null),
      email: member.email ?? session.customer_details?.email ?? null,
      customerId,
      nextVisitDueAt: cycle ? new Date(now.getTime() + cycle) : null,
    },
  });
  if (!claimed.count) return { ok: true as const, reason: "already_active" };

  await recordAudit({
    businessId,
    entityType: "customer",
    entityId: customerId ?? member.id,
    action: "plan.joined",
    actor: "system",
    summary: `${member.name ?? "A customer"} joined ${member.plan.name} (${formatPlanPrice(member.plan.priceCents, member.plan.interval)})`,
  }).catch(() => null);
  await enqueueOwnerAlert({
    businessId,
    businessName: member.business.name,
    ownerPhone: member.business.ownerPhone,
    ownerEmail: member.business.ownerEmail,
    dedupeKey: `plan-join:${member.id}`,
    message: `New plan member: ${member.name ?? member.phone} joined ${member.plan.name} at ${formatPlanPrice(member.plan.priceCents, member.plan.interval)}.`,
  }).catch(() => null);
  await sendCustomerSms({
    businessId,
    to: member.phone,
    body: `You're on ${member.business.name}'s ${member.plan.name}. ${cycle ? "We'll text you when your next included visit is due." : "Thanks for joining."} Reply STOP to opt out.`,
  }).catch(() => null);
  return { ok: true as const };
}

export async function cancelPendingPlanJoin(session: Stripe.Checkout.Session) {
  if (session.metadata?.kind !== "plan_join" || !session.metadata.memberId) return;
  await prisma.planMember.deleteMany({ where: { id: session.metadata.memberId, status: "pending" } });
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const legacy = (subscription as { current_period_end?: number }).current_period_end;
  const item = subscription.items?.data?.[0] as { current_period_end?: number } | undefined;
  const seconds = legacy ?? item?.current_period_end;
  return seconds ? new Date(seconds * 1000) : null;
}

function memberStatusFor(stripeStatus: string) {
  if (stripeStatus === "active" || stripeStatus === "trialing") return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid" || stripeStatus === "incomplete") return "past_due";
  return "canceled";
}

/** customer.subscription.* on a connected account. Never touches the shop's own Orvius billing. */
export async function syncPlanSubscription(subscription: Stripe.Subscription, now = new Date()) {
  const member = await prisma.planMember.findUnique({ where: { stripeSubscriptionId: subscription.id } });
  if (!member) return { matched: false };
  const status = memberStatusFor(subscription.status);
  await prisma.planMember.update({
    where: { id: member.id },
    data: {
      status,
      currentPeriodEnd: subscriptionPeriodEnd(subscription) ?? member.currentPeriodEnd,
      canceledAt: status === "canceled" ? member.canceledAt ?? now : null,
    },
  });
  return { matched: true, status };
}

/** invoice.paid / invoice.payment_failed on a connected account. */
export async function applyPlanInvoice(subscriptionId: string, paid: boolean) {
  const updated = await prisma.planMember.updateMany({
    where: { stripeSubscriptionId: subscriptionId, status: { in: MEMBER_LIVE } },
    data: { status: paid ? "active" : "past_due" },
  });
  return { matched: updated.count > 0 };
}

type SendFn = typeof sendCustomerSms;

export function visitReminderBody(params: { first: string | null; businessName: string; planName: string; link: string | null }) {
  const hi = params.first ? `Hi ${params.first}, ` : "Hi, ";
  const ask = params.link ? `Book a time here: ${params.link}` : "Reply with a day that works and we'll get you scheduled.";
  return `${hi}it's ${params.businessName}. Your included ${params.planName} visit is coming due. ${ask} Reply STOP to opt out.`;
}

/**
 * The visit-due text. A member whose visit was already done (a completed job
 * in the second half of the cycle) rolls forward instead of being texted; one
 * with a visit already on the books is left alone.
 */
export async function runVisitReminders(options: { now?: Date; budgetMs?: number; send?: SendFn; limit?: number } = {}) {
  const now = options.now ?? new Date();
  const stopAt = Date.now() + (options.budgetMs ?? 20_000);
  const send = options.send ?? sendCustomerSms;
  const tally = { sent: 0, rolled: 0, skipped: 0 };
  const due = await prisma.planMember.findMany({
    where: {
      status: "active",
      visitReminderSentAt: null,
      nextVisitDueAt: { lte: new Date(now.getTime() + VISIT_REMINDER_LEAD_MS) },
      business: { isActive: true, environment: { not: "test" } },
    },
    orderBy: { nextVisitDueAt: "asc" },
    take: options.limit ?? 200,
    include: {
      plan: { select: { name: true, visitsPerYear: true } },
      business: { select: { name: true, slug: true, timezone: true, bookingPageOn: true } },
    },
  });
  for (const member of due) {
    if (Date.now() > stopAt) break;
    if (!isShopDaytime(now, member.business.timezone)) continue;
    const cycle = visitCycleMs(member.plan.visitsPerYear);
    if (!cycle || !member.nextVisitDueAt) {
      tally.skipped += 1;
      continue;
    }
    const jobs = await prisma.job.findMany({
      where: {
        businessId: member.businessId,
        customer: { phoneNormalized: member.phoneNormalized },
        OR: [
          { status: "completed", completedAt: { gte: new Date(member.nextVisitDueAt.getTime() - cycle / 2) } },
          { status: { notIn: ["completed", "cancelled"] }, scheduledAt: { gte: now } },
        ],
      },
      orderBy: { completedAt: "desc" },
      select: { status: true, completedAt: true },
    });
    const done = jobs.find((j) => j.status === "completed" && j.completedAt);
    if (done?.completedAt) {
      await prisma.planMember.update({
        where: { id: member.id },
        data: { nextVisitDueAt: new Date(done.completedAt.getTime() + cycle), visitReminderSentAt: null },
      });
      tally.rolled += 1;
      continue;
    }
    if (jobs.length) {
      tally.skipped += 1;
      continue;
    }
    const claim = await prisma.planMember.updateMany({
      where: { id: member.id, visitReminderSentAt: null },
      data: { visitReminderSentAt: now },
    });
    if (!claim.count) continue;
    const first = member.name?.trim().split(/\s+/)[0] ?? null;
    const link = member.business.bookingPageOn && member.business.slug ? `${getAppUrl()}/b/${member.business.slug}` : null;
    const result = await send({
      businessId: member.businessId,
      to: member.phone,
      body: visitReminderBody({
        first: first && /^[\p{L}'-]{2,}$/u.test(first) ? first : null,
        businessName: member.business.name,
        planName: member.plan.name,
        link,
      }),
    }).catch(() => ({ sent: false as const, reason: "send_failed" }));
    if (result.sent) {
      tally.sent += 1;
    } else {
      if (result.reason !== "customer_opted_out") {
        await prisma.planMember.update({ where: { id: member.id }, data: { visitReminderSentAt: null } });
      }
      tally.skipped += 1;
    }
  }
  return tally;
}

/** After the included visit is done, the owner (or the job completion) marks it and the clock restarts. */
export async function markVisitDone(params: { businessId: string; memberId: string; now?: Date }) {
  const now = params.now ?? new Date();
  const member = await prisma.planMember.findFirst({
    where: { id: params.memberId, businessId: params.businessId },
    include: { plan: { select: { visitsPerYear: true } } },
  });
  if (!member) return null;
  const cycle = visitCycleMs(member.plan.visitsPerYear);
  return prisma.planMember.update({
    where: { id: member.id },
    data: { nextVisitDueAt: cycle ? new Date(now.getTime() + cycle) : null, visitReminderSentAt: null },
  });
}
