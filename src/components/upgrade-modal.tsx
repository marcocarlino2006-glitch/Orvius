"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { callUsageLine, type CallUsage } from "@/lib/call-usage";
import {
  ANNUAL_DISCOUNT_LABEL,
  annualChargeDollars,
  getPlanById,
  type BillingInterval,
  type PaidPlanId,
} from "@/lib/pricing-plans";

type CheckoutPlan = {
  id: PaidPlanId;
  name: string;
  price: number;
  annualPrice: number | null;
  tagline: string;
  featured: boolean;
  checkoutReady: boolean;
  checkoutReadyAnnual: boolean;
};

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  /** Real answered-call usage for the shop's current cycle, when the account read carries it. */
  usage: CallUsage | null;
  /** Server-computed plan advice, shown verbatim when present. */
  advice: string | null;
};

const dollars = (n: number) => `$${n.toLocaleString("en-US")}`;

function readyFor(plan: CheckoutPlan, interval: BillingInterval) {
  return interval === "year" ? plan.checkoutReadyAnnual : plan.checkoutReady;
}

/** What Stripe will actually ask for on the next screen — never a placeholder number. */
function dueToday(plan: CheckoutPlan, interval: BillingInterval): string {
  if (interval === "year" && plan.annualPrice != null) {
    return `${dollars(annualChargeDollars({ annualPrice: plan.annualPrice }))} due today — a year at ${dollars(plan.annualPrice)}/mo`;
  }
  return `${dollars(plan.price)} due today — then ${dollars(plan.price)}/mo`;
}

export function UpgradeModal({ open, onClose, usage, advice }: UpgradeModalProps) {
  const [plans, setPlans] = useState<CheckoutPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [selectedId, setSelectedId] = useState<PaidPlanId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupClosed, setSignupClosed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    setLoadFailed(false);
    setError(null);
    setSignupClosed(false);
    fetch("/api/billing/checkout", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!live) return;
        const list = (data?.plans ?? []) as CheckoutPlan[];
        if (!list.length) {
          setLoadFailed(true);
          return;
        }
        setPlans(list);
        setSelectedId((prev) =>
          prev && list.some((plan) => plan.id === prev) ? prev : (list.find((plan) => plan.featured)?.id ?? list[0]!.id),
        );
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  // Mount at the shell root, not in the sidebar footer where this component
  // lives: the sticky sidebar is its own stacking context, so the backdrop's
  // z-index only ranked inside the sidebar and main-column cards painted
  // over the modal. Portaled to the shell, the overlay competes with the
  // page directly (and the .os-shell-scoped styles still apply).
  const portalTarget = document.querySelector(".os-shell") ?? document.body;

  const selected = plans.find((plan) => plan.id === selectedId) ?? null;
  const anyReady = plans.some((plan) => plan.checkoutReady || plan.checkoutReadyAnnual);
  const selectedReady = selected ? readyFor(selected, interval) : false;
  const annualNotOpen = Boolean(selected && interval === "year" && !selected.checkoutReadyAnnual && selected.checkoutReady);

  async function startCheckout() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    setSignupClosed(false);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: selected.id, interval }),
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
        code?: string;
        manageUrl?: string;
        setupUrl?: string;
      } | null;

      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = `/signin?mode=signup&callbackUrl=${encodeURIComponent(
            `/dashboard/onboarding?plan=${selected.id}&interval=${interval}`,
          )}`;
          return;
        }
        if (res.status === 409 && data?.code === "already_subscribed" && data.manageUrl) {
          window.location.href = data.manageUrl;
          return;
        }
        if (
          res.status === 409 &&
          (data?.code === "shop_details_needed" || data?.code === "setup_incomplete") &&
          data.setupUrl
        ) {
          window.location.href = data.setupUrl;
          return;
        }
        if (res.status === 403 && data?.code === "self_serve_signup_disabled") {
          setSignupClosed(true);
          throw new Error(data.error ?? "Card signup isn't open yet.");
        }
        throw new Error(data?.error ?? "Checkout unavailable");
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error("No checkout page came back — open Billing and try there.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      className="upg-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="upg-card" role="dialog" aria-modal="true" aria-labelledby="upg-title">
        <div className="upg-head">
          <div>
            <h2 id="upg-title" className="upg-title">
              Upgrade
            </h2>
            <p className="upg-sub">
              Every plan answers, books and texts you. The difference is how many calls are included.
            </p>
          </div>
          <button ref={closeRef} type="button" className="upg-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {usage ? (
          <div className="upg-usage">
            <div className="upg-meter" data-tone={usage.tone} aria-hidden>
              <span style={{ width: `${Math.max(2, Math.round(usage.fraction * 100))}%` }} />
            </div>
            <p className="upg-usage-line">{callUsageLine(usage)}</p>
            {advice ? <p className="upg-advice">{advice}</p> : null}
          </div>
        ) : null}

        <div className="upg-toggle" role="radiogroup" aria-label="Billing period">
          <button
            type="button"
            role="radio"
            aria-checked={interval === "month"}
            className={interval === "month" ? "is-on" : undefined}
            onClick={() => setInterval("month")}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={interval === "year"}
            className={interval === "year" ? "is-on" : undefined}
            onClick={() => setInterval("year")}
          >
            Annual <span className="upg-save">{ANNUAL_DISCOUNT_LABEL}</span>
          </button>
        </div>

        {loading ? (
          <p className="upg-note">Loading plans…</p>
        ) : loadFailed ? (
          <p className="upg-note">
            Plans didn&apos;t load.{" "}
            <Link href="/dashboard?settings=billing" onClick={onClose} className="upg-textlink">
              Open Billing instead
            </Link>
            .
          </p>
        ) : (
          <div className="upg-plans" role="radiogroup" aria-label="Plans">
            {plans.map((plan) => {
              const on = plan.id === selectedId;
              const highlights = getPlanById(plan.id).highlights;
              return (
                <button
                  key={plan.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={`upg-plan${on ? " is-on" : ""}`}
                  onClick={() => setSelectedId(plan.id)}
                >
                  <span className="upg-plan-top">
                    <span className="upg-plan-name">{plan.name}</span>
                    {plan.featured ? <span className="upg-badge">Most popular</span> : null}
                    <span className="upg-radio" aria-hidden />
                  </span>
                  <span className="upg-plan-price">
                    {dollars(interval === "year" && plan.annualPrice != null ? plan.annualPrice : plan.price)}
                    <span className="upg-plan-per">/mo</span>
                  </span>
                  <span className="upg-plan-bill">
                    {interval === "year" && plan.annualPrice != null
                      ? `Billed ${dollars(annualChargeDollars({ annualPrice: plan.annualPrice }))} once a year`
                      : "Billed monthly"}
                  </span>
                  <span className="upg-plan-tag">{plan.tagline}</span>
                  <span className="upg-plan-list">
                    {highlights.map((line) => (
                      <span key={line} className="upg-li">
                        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path
                            d="m6.5 12.5 3.5 3.5 7.5-8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {line}
                      </span>
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error ? (
          <p className="upg-error" role="alert">
            {error}
            {signupClosed ? (
              <>
                {" "}
                <Link href="/pilot" onClick={onClose} className="upg-textlink">
                  Book a call audit
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        {!error && annualNotOpen && selected ? (
          <p className="upg-note">Annual checkout isn&apos;t open for {selected.name} yet — monthly works today.</p>
        ) : null}

        <div className="upg-foot">
          {loadFailed ? null : anyReady ? (
            <>
              <p className="upg-due">
                {selected ? `${dueToday(selected, interval)}. ` : ""}
                Stripe shows the final total, including any tax, before it charges you.
              </p>
              <button
                type="button"
                className="upg-cta"
                disabled={!selected || submitting || !selectedReady}
                onClick={() => void startCheckout()}
              >
                {submitting ? "Opening checkout…" : `Upgrade to ${selected?.name ?? "a plan"}`}
              </button>
              <p className="upg-fine">Change or cancel anytime in Settings → Billing.</p>
            </>
          ) : loading ? null : (
            <>
              <p className="upg-due">Card signup isn&apos;t open yet. Book a call audit and we&apos;ll set up your line with you.</p>
              <Link href="/pilot" className="upg-cta" onClick={onClose}>
                Book a call audit
              </Link>
            </>
          )}
        </div>
      </div>
    </div>,
    portalTarget,
  );
}
