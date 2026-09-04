"use client";

import { BillingPortalButton } from "@/components/billing-portal-button";
import { CheckoutButton } from "@/components/checkout-button";
import { OsShell } from "@/components/os-shell";
import { ShellPanel } from "@/components/shell-primitives";
import { company, getPaidPlans, pricing } from "@/lib/company";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type BillingReadiness = {
  checkoutReady: boolean;
  fullyReady: boolean;
  missing: string[];
  nextSteps: string[];
};

type BillingAccount = {
  user: { email: string | null };
  business: {
    name: string;
    billingStatus: string;
    billingPlan: string | null;
    stripeCustomerId: string | null;
    pilotEndsAt?: string | null;
    createdAt?: string;
  } | null;
  billing: {
    configured: boolean;
    fullyReady: boolean;
    readiness: BillingReadiness;
    status: string;
    planId: string | null;
    plan: { name: string; price: number; period: string };
    legalEntity: string;
    hasSubscription: boolean;
    entitled?: boolean;
    pilotEndsAt?: string | null;
  };
};

function statusCopy(status: string, entitled: boolean, pilotEndsAt: string | null) {
  if (!entitled && (status === "pilot" || status === "none")) {
    return "Pilot ended — subscribe to reopen your shop.";
  }
  switch (status) {
    case "active":
      return "Your subscription is active.";
    case "pilot": {
      if (pilotEndsAt) {
        const ends = new Date(pilotEndsAt);
        if (!Number.isNaN(ends.getTime())) {
          return `Design partner access through ${ends.toLocaleDateString()}. Then subscribe to keep the line.`;
        }
      }
      return "You are on the design partner program (30-day pilot).";
    }
    case "past_due":
      return "Payment failed — update billing to keep your line live.";
    case "canceled":
      return "Subscription canceled. Subscribe again to reopen.";
    default:
      return "No active subscription yet.";
  }
}

export default function DashboardBillingPage() {
  const { data: session } = useSession();
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then(setAccount)
      .finally(() => setLoading(false));
  }, []);

  const status = account?.billing.status ?? "none";
  const entitled = account?.billing.entitled ?? status === "active";
  const pilotEndsAt =
    account?.billing.pilotEndsAt ?? account?.business?.pilotEndsAt ?? null;
  const email = session?.user?.email ?? account?.user.email ?? "";
  const paidPlans = getPaidPlans();
  const checkoutReady = account?.billing.configured ?? false;
  const hasStripeCustomer = Boolean(account?.business?.stripeCustomerId);
  const locked = !entitled && status !== "past_due";
  const needsPay = locked || status === "past_due" || status === "pilot" || status === "none";

  return (
    <OsShell
      title="Billing"
      subtitle="Plan, subscription, and payment for your shop."
    >
      <div className="account-grid">
        <ShellPanel title="Current plan">
          {loading ? (
            <p className="font-sans text-sm text-ash">Loading…</p>
          ) : (
            <>
              <div className="account-plan-badge font-sans">
                <p className="account-plan-name">
                  {locked
                    ? "Locked"
                    : status === "pilot"
                      ? pricing.pilot.name
                      : status === "active" || status === "past_due"
                        ? account?.billing.plan.name ?? "Orvius"
                        : "No plan"}
                </p>
                <p className="account-plan-price">
                  {status === "active" || status === "past_due"
                    ? `$${account?.billing.plan.price}/${account?.billing.plan.period}`
                    : status === "pilot" && entitled
                      ? pricing.pilot.period
                      : locked
                        ? "Subscribe required"
                        : "—"}
                </p>
              </div>
              <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
                {statusCopy(status, entitled, pilotEndsAt)}
              </p>
              {pilotEndsAt && status === "pilot" && entitled ? (
                <p className="mt-2 font-sans text-xs text-ash">
                  Pilot ends {new Date(pilotEndsAt).toLocaleString()}
                </p>
              ) : null}
              {account?.business ? (
                <p className="mt-2 font-sans text-xs text-ash">
                  Billed to {account.business.name}
                  {email ? ` · ${email}` : ""}
                </p>
              ) : null}
              {(status === "active" || status === "past_due") && hasStripeCustomer ? (
                <div className="mt-5">
                  <BillingPortalButton />
                </div>
              ) : null}
            </>
          )}
        </ShellPanel>

        <ShellPanel title={needsPay && !loading ? "Subscribe" : "Subscribe"}>
          {loading ? (
            <p className="font-sans text-sm text-ash">Loading…</p>
          ) : status === "active" ? (
            <p className="font-sans text-sm text-live">
              Subscription active. Receipts are sent to your email from Stripe.
              {hasStripeCustomer ? (
                <span className="mt-4 block">
                  <BillingPortalButton label="Update payment method" />
                </span>
              ) : null}
            </p>
          ) : status === "past_due" && hasStripeCustomer ? (
            <>
              <p className="font-sans text-sm leading-relaxed text-ash">
                Fix your payment method to keep Orvius running.
              </p>
              <div className="mt-5">
                <BillingPortalButton label="Update payment method" />
              </div>
            </>
          ) : checkoutReady ? (
            <>
              <p className="font-sans text-sm leading-relaxed text-ash">
                {locked
                  ? "Choose a plan to unlock your shop — flat monthly, billed by "
                  : "Choose a plan — flat monthly, billed by "}
                {company.legalName} via Stripe.
              </p>
              <ul className="account-billing-plans mt-5 space-y-4">
                {paidPlans.map((plan) => (
                  <li key={plan.id} className="account-billing-plan">
                    <div className="account-billing-plan-copy font-sans">
                      <p className="account-billing-plan-name">{plan.name}</p>
                      <p className="account-billing-plan-price">
                        ${plan.price}/{plan.period}
                      </p>
                      <p className="account-billing-plan-detail">{plan.tagline}</p>
                    </div>
                    <CheckoutButton
                      planId={plan.id}
                      label={`Subscribe · $${plan.price}/mo`}
                      variant={plan.featured ? "primary" : "secondary"}
                      email={email}
                    />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <p className="font-sans text-sm leading-relaxed text-ash">
                Self-serve checkout is blocked until Stripe is configured. This is the
                multi-b cash gate — close it before claiming category leadership.
              </p>
              <div className="billing-unblock mt-5 font-sans">
                <p className="billing-unblock-title">Founder unblock — ordered</p>
                <ol className="billing-unblock-steps">
                  {(account?.billing.readiness?.nextSteps?.length
                    ? account.billing.readiness.nextSteps
                    : [
                        "Add STRIPE_SECRET_KEY on Vercel from Stripe Dashboard → API keys",
                        "Run npm run stripe:setup locally, paste price IDs to Vercel",
                        "Add webhook api.orvius.im/api/billing/webhook + STRIPE_WEBHOOK_SECRET",
                        "Redeploy, then Subscribe on this page",
                      ]
                  ).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
                {account?.billing.readiness?.missing?.length ? (
                  <p className="mt-3 text-xs text-ash">
                    Missing:{" "}
                    {account.billing.readiness.missing.map((m) => (
                      <code key={m} className="mr-1">
                        {m}
                      </code>
                    ))}
                  </p>
                ) : null}
                <p className="mt-3 text-xs text-ash">
                  Full runbook: <code>docs/BILLING-SETUP.md</code> in the repo.
                  Design partners can still{" "}
                  <Link href="/pilot" className="pro-section-link">
                    apply for pilot
                  </Link>
                  .
                </p>
              </div>
            </>
          )}
        </ShellPanel>
      </div>

      <div className="mt-6">
        <ShellPanel title="Legal">
          <ul className="account-legal-links font-sans">
            <li>
              <Link href="/terms">Terms of Service</Link>
            </li>
            <li>
              <Link href="/refunds">Refunds & cancellation</Link>
            </li>
            <li>
              <Link href="/privacy">Privacy Policy</Link>
            </li>
            <li>
              <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
            </li>
          </ul>
        </ShellPanel>
      </div>
    </OsShell>
  );
}
