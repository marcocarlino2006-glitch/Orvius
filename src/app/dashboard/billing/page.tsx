"use client";

import { BillingPortalButton } from "@/components/billing-portal-button";
import { CheckoutButton } from "@/components/checkout-button";
import { ConnectPayoutsPanel } from "@/components/connect-payouts-panel";
import { DepositSettingsPanel } from "@/components/deposit-settings-panel";
import { OsShell } from "@/components/os-shell";
import { ShellLoading, ShellPanel } from "@/components/shell-primitives";
import { company, getPaidPlans, pricing } from "@/lib/company";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

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
  };
};

function statusCopy(status: string, entitled: boolean, pilotEndsAt: string | null) {
  if (!entitled && (status === "pilot" || status === "none")) {
    return "Your shop access ended — subscribe to reopen.";
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
      return "Subscription canceled. Subscribe again to reopen.";
    default:
      return "No active subscription yet.";
  }
}

export default function DashboardBillingPage() {
  const { data: session } = useSession();
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadAccount() {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/account");
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
  const checkoutReady = account?.billing.configured ?? false;
  const founder = account?.founder ?? false;
  const fullyReady = account?.billing.fullyReady ?? false;
  const readiness = account?.billing.readiness;
  const checklist = readiness?.checklist ?? [];
  const loading = loadState === "loading";
  const locked = !entitled;
  const hasStripeCustomer = Boolean(account?.business?.stripeCustomerId);
  const openCount = checklist.filter((item) => !item.ok).length;

  return (
    <OsShell
      title="Billing"
      subtitle="Plan, checkout, and payouts for your shop."
      statusLabel={account?.business?.name ?? "Shop"}
    >
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
          {founder ? (
            <ShellPanel title="Money setup" dense>
              {loading ? (
                <ShellLoading />
              ) : (
                <div className="billing-money-setup font-sans">
                  <p className="billing-money-setup-lead">
                    {fullyReady
                      ? "Checkout is live. Run one test Subscribe below, then flip to live keys when you’re ready for real cards."
                      : checkoutReady
                        ? "Subscribe can open — finish the open items so webhooks and every plan stay honest."
                        : "One checklist. Paste on Vercel, redeploy, then Subscribe appears for shops."}
                  </p>
                  <ul className="billing-money-checklist" aria-label="Money setup checklist">
                    {(checklist.length
                      ? checklist
                      : [
                          {
                            id: "secret",
                            label: "Stripe secret key",
                            detail: "STRIPE_SECRET_KEY on Vercel",
                            ok: false,
                          },
                          {
                            id: "publishable",
                            label: "Publishable key",
                            detail: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
                            ok: false,
                          },
                          {
                            id: "prices",
                            label: "Plan prices",
                            detail: "Line, Pro, Fleet price IDs",
                            ok: false,
                          },
                          {
                            id: "webhook",
                            label: "Webhook",
                            detail: "STRIPE_WEBHOOK_SECRET",
                            ok: false,
                          },
                        ]
                    ).map((item) => (
                      <li
                        key={item.id}
                        className={`billing-money-check ${item.ok ? "is-ok" : "is-open"}`}
                      >
                        <span className="billing-money-check-mark" aria-hidden>
                          {item.ok ? "✓" : "○"}
                        </span>
                        <span className="billing-money-check-copy">
                          <strong>{item.label}</strong>
                          <span>{item.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {!fullyReady && openCount > 0 ? (
                    <p className="billing-money-setup-foot">
                      {openCount} open · Redeploy after each Vercel paste ·{" "}
                      <code>docs/BILLING-SETUP.md</code>
                    </p>
                  ) : null}
                  {fullyReady ? (
                    <p className="billing-money-setup-foot billing-money-setup-foot--live">
                      All green · Owners see Subscribe · You can take a test card now
                    </p>
                  ) : null}
                </div>
              )}
            </ShellPanel>
          ) : null}

          <ShellPanel title="Current plan" dense>
            {loading ? (
              <ShellLoading />
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
                {account?.business ? (
                  <p className="mt-2 font-sans text-xs text-ash">
                    Billed to {account.business.name}
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

          <ShellPanel title="Subscription" dense>
            {loading ? (
              <ShellLoading />
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
                    ? "Pick a plan to reopen your shop. One tap opens Stripe Checkout — cancel anytime."
                    : "Pick a plan. One tap opens Stripe Checkout — flat monthly, cancel anytime."}
                </p>
                <ul className="account-billing-plans mt-5 space-y-4">
                  {paidPlans.map((plan) => (
                    <li
                      key={plan.id}
                      className={`account-billing-plan${plan.featured ? " account-billing-plan--featured" : ""}`}
                    >
                      <div className="account-billing-plan-copy font-sans">
                        {plan.featured ? (
                          <p className="account-billing-plan-badge">Recommended</p>
                        ) : null}
                        <p className="account-billing-plan-name">{plan.name}</p>
                        <p className="account-billing-plan-price">
                          ${plan.price}/mo
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
                  {founder
                    ? "Subscribe buttons unlock when the Money setup checklist is green. Finish the open items above, redeploy, then refresh."
                    : "Self-serve checkout isn’t open yet. Your shop access stays active — we’ll notify you before billing begins. Need to subscribe now?"}{" "}
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

          <div id="payouts">
            <ConnectPayoutsPanel />
          </div>

          <DepositSettingsPanel />

          <ShellPanel title="Legal" dense>
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
      )}
    </OsShell>
  );
}
