"use client";

import { CheckoutButton } from "@/components/checkout-button";
import { OsShell } from "@/components/os-shell";
import { ShellPanel } from "@/components/shell-primitives";
import { company, getPaidPlans, pricing } from "@/lib/company";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

type BillingAccount = {
  user: { email: string | null };
  business: { name: string; billingStatus: string; billingPlan: string | null } | null;
  billing: {
    configured: boolean;
    status: string;
    planId: string | null;
    plan: { name: string; price: number; period: string };
    legalEntity: string;
    hasSubscription: boolean;
  };
};

function statusCopy(status: string) {
  switch (status) {
    case "active":
      return "Your subscription is active.";
    case "pilot":
      return "You are on the design partner program.";
    case "past_due":
      return "Payment failed — update billing to keep your line live.";
    case "canceled":
      return "Subscription canceled.";
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
  const email = session?.user?.email ?? account?.user.email ?? "";
  const paidPlans = getPaidPlans();

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
                  {status === "pilot"
                    ? pricing.pilot.name
                    : status === "active" || status === "past_due"
                      ? account?.billing.plan.name ?? "Orvius"
                      : "No plan"}
                </p>
                <p className="account-plan-price">
                  {status === "active" || status === "past_due"
                    ? `$${account?.billing.plan.price}/${account?.billing.plan.period}`
                    : status === "pilot"
                      ? pricing.pilot.period
                      : "—"}
                </p>
              </div>
              <p className="mt-4 font-sans text-sm leading-relaxed text-ash">
                {statusCopy(status)}
              </p>
              {account?.business ? (
                <p className="mt-2 font-sans text-xs text-ash">
                  Billed to {account.business.name}
                  {email ? ` · ${email}` : ""}
                </p>
              ) : null}
            </>
          )}
        </ShellPanel>

        <ShellPanel title="Subscribe">
          {loading ? (
            <p className="font-sans text-sm text-ash">Loading…</p>
          ) : status === "active" ? (
            <p className="font-sans text-sm text-live">
              Subscription active. Receipts are sent to your email from Stripe.
            </p>
          ) : account?.billing.configured ? (
            <>
              <p className="font-sans text-sm leading-relaxed text-ash">
                Choose a plan — flat monthly, billed by {company.legalName} via Stripe.
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
            <p className="font-sans text-sm leading-relaxed text-ash">
              Online checkout is not configured yet.{" "}
              <Link href="/pilot" className="pro-section-link">
                Apply for the design partner program
              </Link>{" "}
              and we will send a checkout link after your trial.
            </p>
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
