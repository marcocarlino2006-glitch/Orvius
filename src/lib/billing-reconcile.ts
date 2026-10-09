import type Stripe from "stripe";
import { mapStripeStatusToBilling, resolveBillingPlan } from "@/lib/billing-sync";
import { founderRecipients } from "@/lib/company-scoreboard";
import { isEmailConfigured, sendOwnerEmail } from "@/lib/email";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";

/*
  Stripe is what customers are charged; the database is what they get. Webhooks
  keep the two in step, and a missed or out-of-order webhook lets them drift
  without anyone noticing: a shop paying for a line that is locked, a shop on a
  cancelled card still getting service, or a card charged for a shop that no
  longer exists. This compares both sides every day and says exactly where.
*/

export type SubscriptionFact = {
  id: string;
  customerId: string;
  status: Stripe.Subscription.Status;
  planId: string | null;
};

export type ShopBillingFact = {
  id: string;
  name: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  billingStatus: string | null;
  billingPlan: string | null;
};

export type BillingMismatchKind =
  | "charged_without_shop"
  | "charged_twice"
  | "status_drift"
  | "plan_drift"
  | "link_drift"
  | "service_without_payment";

export type BillingMismatch = {
  kind: BillingMismatchKind;
  shopId: string | null;
  subscriptionId: string | null;
  detail: string;
};

/** Stripe statuses that mean the card is being, or about to be, charged. */
const CHARGING: ReadonlySet<Stripe.Subscription.Status> = new Set(["active", "trialing", "past_due"]);

export function reconcileBilling(subs: SubscriptionFact[], shops: ShopBillingFact[]): BillingMismatch[] {
  const out: BillingMismatch[] = [];
  const bySub = new Map(shops.filter((s) => s.stripeSubscriptionId).map((s) => [s.stripeSubscriptionId!, s]));
  const byCustomer = new Map(shops.filter((s) => s.stripeCustomerId).map((s) => [s.stripeCustomerId!, s]));
  const charging = subs.filter((s) => CHARGING.has(s.status));

  const perCustomer = new Map<string, SubscriptionFact[]>();
  for (const sub of charging) perCustomer.set(sub.customerId, [...(perCustomer.get(sub.customerId) ?? []), sub]);
  for (const [customerId, list] of perCustomer) {
    if (list.length < 2) continue;
    const shop = byCustomer.get(customerId) ?? null;
    out.push({
      kind: "charged_twice",
      shopId: shop?.id ?? null,
      subscriptionId: list.map((s) => s.id).join(","),
      detail: `${shop?.name ?? `Customer ${customerId}`} has ${list.length} Orvius subscriptions being charged. Cancel the extra and refund it.`,
    });
  }

  for (const sub of charging) {
    const shop = bySub.get(sub.id) ?? byCustomer.get(sub.customerId) ?? null;
    if (!shop) {
      out.push({
        kind: "charged_without_shop",
        shopId: null,
        subscriptionId: sub.id,
        detail: `Subscription ${sub.id} (${sub.status}) is charging customer ${sub.customerId}, but no shop is linked to it. Link it or cancel and refund.`,
      });
      continue;
    }
    if (shop.stripeSubscriptionId !== sub.id) {
      if ((perCustomer.get(sub.customerId)?.length ?? 0) < 2) {
        out.push({
          kind: "link_drift",
          shopId: shop.id,
          subscriptionId: sub.id,
          detail: `${shop.name} is being charged on ${sub.id}, but its record points at ${shop.stripeSubscriptionId ?? "no subscription"}.`,
        });
      }
      continue;
    }
    const expected = mapStripeStatusToBilling(sub.status);
    if (shop.billingStatus !== expected) {
      out.push({
        kind: "status_drift",
        shopId: shop.id,
        subscriptionId: sub.id,
        detail: `${shop.name} is ${sub.status} in Stripe but ${shop.billingStatus ?? "unset"} in Orvius${
          expected === "active" ? ", so a paying shop may be locked out" : ""
        }.`,
      });
    }
    if (sub.planId && shop.billingPlan !== sub.planId) {
      out.push({
        kind: "plan_drift",
        shopId: shop.id,
        subscriptionId: sub.id,
        detail: `${shop.name} pays for ${sub.planId} but Orvius gives it ${shop.billingPlan ?? "no plan"}.`,
      });
    }
  }

  const subById = new Map(subs.map((s) => [s.id, s]));
  for (const shop of shops) {
    if (!shop.stripeSubscriptionId || (shop.billingStatus !== "active" && shop.billingStatus !== "past_due")) continue;
    const sub = subById.get(shop.stripeSubscriptionId);
    if (sub && CHARGING.has(sub.status)) continue;
    out.push({
      kind: "service_without_payment",
      shopId: shop.id,
      subscriptionId: shop.stripeSubscriptionId,
      detail: `${shop.name} has a live plan in Orvius, but its subscription is ${sub ? sub.status : "missing"} in Stripe.`,
    });
  }

  return out;
}

function toFact(sub: Stripe.Subscription): SubscriptionFact {
  return {
    id: sub.id,
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    status: sub.status,
    planId: resolveBillingPlan(sub),
  };
}

export async function loadBillingFacts(stripe: Pick<Stripe, "subscriptions">) {
  const shops = await prisma.business.findMany({
    where: { environment: "production", OR: [{ stripeCustomerId: { not: null } }, { stripeSubscriptionId: { not: null } }] },
    select: { id: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true, billingStatus: true, billingPlan: true },
  });
  const known = new Set(shops.flatMap((s) => [s.stripeCustomerId, s.stripeSubscriptionId]).filter(Boolean));
  const subs: SubscriptionFact[] = [];
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    const fact = toFact(sub);
    // Only Orvius plans: a price we sell, or a customer we know.
    if (fact.planId || known.has(fact.id) || known.has(fact.customerId)) subs.push(fact);
  }
  return { subs, shops };
}

export async function runBillingReconcile(now = new Date()) {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return { checked: false as const, reason: "stripe not configured" };
  const { subs, shops } = await loadBillingFacts(getStripe());
  const mismatches = reconcileBilling(subs, shops);
  logInfo("billing.reconciled", { subscriptions: subs.length, shops: shops.length, mismatches: mismatches.length });
  if (!mismatches.length) return { checked: true as const, subscriptions: subs.length, shops: shops.length, mismatches };

  logError("billing.reconcile_mismatch", { count: mismatches.length, kinds: mismatches.map((m) => m.kind) });
  const recipients = founderRecipients();
  if (isEmailConfigured() && recipients.length) {
    const day = now.toISOString().slice(0, 10);
    const claimed = await prisma.webhookEvent
      .create({ data: { source: "orvius", externalId: day, eventType: "billing-reconcile", status: "completed" } })
      .then(() => true)
      .catch(() => false);
    if (claimed) {
      const text = [
        `Stripe and Orvius disagree on ${mismatches.length} thing${mismatches.length === 1 ? "" : "s"}:`,
        "",
        ...mismatches.map((m) => `- ${m.detail}`),
      ].join("\n");
      for (const to of recipients) {
        await sendOwnerEmail({ to, subject: `Billing check: ${mismatches.length} to fix`, text });
      }
    }
  }
  return { checked: true as const, subscriptions: subs.length, shops: shops.length, mismatches };
}
