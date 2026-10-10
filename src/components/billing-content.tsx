"use client";

import { BillingPortalButton } from "@/components/billing-portal-button";
import { CheckoutButton } from "@/components/checkout-button";
import { ConnectPayoutsPanel } from "@/components/connect-payouts-panel";
import { DepositSettingsPanel } from "@/components/deposit-settings-panel";
import { SalesTaxPanel } from "@/components/sales-tax-panel";
import { MoneyBackDone, MoneyBackPanel } from "@/components/money-back-panel";
import { ShellLoading, ShellPanel } from "@/components/shell-primitives";
import {
  company,
  getFeaturedPlan,
  getPaidPlans,
  pricing,
  type PaidPlanId,
} from "@/lib/company";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { fetchAccount } from "@/lib/account-client";
import { callUsageLine, type CallUsage } from "@/lib/call-usage";
import { MONEY_BACK_DAYS } from "@/lib/money-back";
import { OVERAGE_CENTS_PER_CALL } from "@/lib/pricing-plans";

type BillingChecklistItem = {
  id: string;
  label: string;
  detail: string;
  ok: boolean;
};

type BillingReadiness = {
  checkoutReady: boolean;
  fullyReady: boolean;
  missing: string[];
  nextSteps: string[];
  checklist?: BillingChecklistItem[];
};

type BillingAccount = {
  user: { email: string | null };
  founder?: boolean;
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
    usage?: CallUsage | null;
    valueLine?: string | null;
  };
};

function statusCopy(status: string, entitled: boolean, pilotEndsAt: string | null) {
  if (!entitled && (status === "pilot" || status === "none")) {
    return "Your shop access ended — pay with card to reopen.";
  }
  switch (status) {
    case "active":
      return "Your subscription is active.";
    case "pilot": {
      if (pilotEndsAt) {
        const ends = new Date(pilotEndsAt);
        if (!Number.isNaN(ends.getTime())) {
          return `Your shop access is active through ${ends.toLocaleDateString()}.`;
        }
      }
      return "Your shop access is active.";
    }
    case "past_due":
      return "Payment failed — update billing to keep your line live.";
    case "canceled":
      return "Subscription canceled. Pay with card to reopen.";
    default:
      return "No active subscription yet — pay with card below.";
  }
}

export function BillingContent() {
  const { data: session } = useSession();
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refundedCents, setRefundedCents] = useState<number | null>(null);

  async function loadAccount() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetchAccount();
      if (!res.ok) {
        setLoadState("error");
        setLoadError("Could not load billing. Refresh and try again.");
        return;
      }
      const data = (await res.json()) as BillingAccount;
      setAccount(data);
      setLoadState("ready");
    } catch {
      setLoadState("error");
      setLoadError("Could not load billing. Refresh and try again.");
    }
  }

  useEffect(() => {
    void loadAccount();
  }, []);

  useEffect(() => {
    if (loadState !== "ready" || !account) return;
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    const el = document.getElementById(hash);
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [loadState, account]);

  const status = account?.billing.status ?? "none";
  const entitled = account?.billing.entitled ?? status === "active";
  const pilotEndsAt =
    account?.billing.pilotEndsAt ?? account?.business?.pilotEndsAt ?? null;
  const email = session?.user?.email ?? account?.user.email ?? "";
  const paidPlans = getPaidPlans();
  const featuredPlan = getFeaturedPlan();
  const featuredId = (featuredPlan.id === "line" || featuredPlan.id === "pro" || featuredPlan.id === "fleet"
    ? featuredPlan.id
    : "pro") as PaidPlanId;
  const otherPlans = paidPlans.filter((plan) => plan.id !== featuredId);
  const checkoutReady = account?.billing.configured ?? false;
  const founder = account?.founder ?? false;
  const loading = loadState === "loading";
  const locked = !entitled;
  const hasStripeCustomer = Boolean(account?.business?.stripeCustomerId);

  return (
    <>
      {loadState === "error" ? (
        <div className="billing-settings">
          <ShellPanel title="Couldn’t load" dense>
            <p className="font-sans text-sm text-ash">{loadError}</p>
            <button
              type="button"
              className="btn btn-secondary text-sm mt-4"
              onClick={() => void loadAccount()}
            >
              Retry
            </button>
          </ShellPanel>
        </div>
      ) : (
        <div className="billing-settings">
          {refundedCents != null ? <MoneyBackDone cents={refundedCents} /> : null}
          {loading ? (
            <ShellLoading />
          ) : (
            <section className="billing-summary" aria-label="Your plan">
              <div className="sc-plan">
                <div>
                  <p className="sc-plan-kicker">Plan</p>
                  <p className="sc-plan-name">
                    {locked
                      ? "Locked"
                      : status === "pilot"
                        ? pricing.pilot.name
                        : status === "active" || status === "past_due"
                          ? `${account?.billing.plan.name ?? "Orvius"} · $${account?.billing.plan.price} ${account?.billing.plan.period}`
                          : "No plan"}
                  </p>
                  <p className="sc-plan-detail">{statusCopy(status, entitled, pilotEndsAt)}</p>
                </div>
                {(status === "active" || status === "past_due") && hasStripeCustomer ? (
                  <BillingPortalButton
                    label={status === "past_due" ? "Fix payment" : "Manage"}
                    buttonClassName={status === "past_due" ? "sc-btn sc-btn--primary" : "sc-btn"}
                  />
                ) : null}
              </div>
              {account?.billing.usage ? (
                <div className={`billing-usage billing-usage--${account.billing.usage.tone} font-sans`}>
                  <p className="billing-usage-line">{callUsageLine(account.billing.usage)}</p>
                  <div
                    className="billing-usage-meter"
                    role="meter"
                    aria-label="Included calls used this month"
                    aria-valuemin={0}
                    aria-valuemax={account.billing.usage.included}
                    aria-valuenow={Math.min(account.billing.usage.used, account.billing.usage.included)}
                  >
                    <span style={{ width: `${Math.round(account.billing.usage.fraction * 100)}%` }} />
                  </div>
                  <p className="billing-usage-foot">
                    {account.billing.usage.overCalls > 0
                      ? `${account.billing.usage.overCalls.toLocaleString("en-US")} × ${OVERAGE_CENTS_PER_CALL}¢ = $${(account.billing.usage.overageCents / 100).toFixed(2)} so far. Calls never stop at the limit.`
                      : `Past the allowance every call is still answered, at ${OVERAGE_CENTS_PER_CALL}¢ each. Resets on the 1st.`}
                  </p>
                </div>
              ) : null}
              {account?.billing.valueLine ? <p className="billing-value-line font-sans">{account.billing.valueLine}</p> : null}
              {status === "active" && hasStripeCustomer ? <MoneyBackPanel
                  onRefunded={(cents) => {
                    setRefundedCents(cents);
                    void loadAccount();
                  }}
                /> : null}
            </section>
          )}

          {loading || status === "active" || (status === "past_due" && hasStripeCustomer) ? null : (
          <ShellPanel title="Pay" dense>
            {checkoutReady ? (
              <>
                <div className="account-billing-pay-hero font-sans">
                  <p className="account-billing-pay-kicker">
                    {locked ? "Pay to reopen" : "Pay with card"}
                  </p>
                  <p className="account-billing-plan-name">{featuredPlan.name}</p>
                  <p className="account-billing-pay-price">
                    ${featuredPlan.price}
                    <span>/mo</span>
                  </p>
                  <p className="account-billing-plan-detail">
                    {featuredPlan.tagline}. One tap opens Stripe Checkout. Cancel anytime, and your first {MONEY_BACK_DAYS} days are money back.
                  </p>
                  <CheckoutButton
                    planId={featuredId}
                    label={`Pay with card · $${featuredPlan.price}/mo`}
                    variant="primary"
                    email={email}
                    className="account-billing-pay-cta"
                  />
                </div>
                {otherPlans.length > 0 ? (
                  <details className="account-billing-other mt-5 font-sans">
                    <summary>Other plans</summary>
                    <ul className="account-billing-plans mt-4 space-y-4">
                      {otherPlans.map((plan) => (
                        <li key={plan.id} className="account-billing-plan">
                          <div className="account-billing-plan-copy">
                            <p className="account-billing-plan-name">{plan.name}</p>
                            <p className="account-billing-plan-price">
                              ${plan.price}/mo
                            </p>
                            <p className="account-billing-plan-detail">{plan.tagline}</p>
                          </div>
                          <CheckoutButton
                            planId={plan.id}
                            label={`Pay · $${plan.price}/mo`}
                            variant="secondary"
                            email={email}
                          />
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            ) : (
              <>
                <p className="font-sans text-sm leading-relaxed text-ash">
                  {founder
                    ? "Pay with card unlocks when the Stripe launch gates in Settings → Internal are green."
                    : "Card checkout isn’t open yet. Your shop access stays active — we’ll notify you before billing begins. Need to pay now?"}{" "}
                  {!founder ? (
                    <a
                      href={`mailto:${company.contactEmail}?subject=Orvius%20billing`}
                      className="underline underline-offset-2"
                    >
                      {company.contactEmail}
                    </a>
                  ) : null}
                  {!founder ? "." : null}
                </p>
              </>
            )}
          </ShellPanel>
          )}

          <div id="payouts">
            <p className="billing-split-note font-sans">
              Everything above is your Orvius plan. Below is separate: money your customers pay you, which settles to your own bank.
            </p>
            <ConnectPayoutsPanel />
          </div>

          <DepositSettingsPanel />

          <SalesTaxPanel />

          <p className="billing-legal font-sans">
            Receipts come from Stripe. <Link href="/terms">Terms</Link> · <Link href="/refunds">Refunds</Link> ·{" "}
            <Link href="/privacy">Privacy</Link> · <a href={`mailto:${company.contactEmail}`}>{company.contactEmail}</a>
          </p>
        </div>
      )}
    </>
  );
}
