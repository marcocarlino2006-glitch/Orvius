"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { BillingLockScreen } from "@/components/billing-lock-screen";
import { CheckoutButton } from "@/components/checkout-button";
import { pricing } from "@/lib/pricing-plans";
import {
  getPayPromptDecision,
  PAY_PROMPT_SNOOZE_KEY,
  type PayPromptDecision,
} from "@/lib/pay-prompt";
import { fetchAccount } from "@/lib/account-client";

type AccountBillingPayload = {
  business?: {
    createdAt?: string;
    billingStatus?: string;
    billingPlan?: string | null;
    pilotEndsAt?: string | null;
    stripeCustomerId?: string | null;
  } | null;
  billing?: {
    status?: string;
    planId?: string | null;
    configured?: boolean;
    entitled?: boolean;
    pilotEndsAt?: string | null;
    hasSubscription?: boolean;
  };
  user?: { email?: string | null };
};

/**
 * Pay loop: soft modal mid-trial; hard lock screen when trial ended / canceled.
 * Active subscribers never see it. One path — Pro, Pay with card.
 */
export function PayPromptModal() {
  const titleId = useId();
  const [decision, setDecision] = useState<PayPromptDecision | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      try {
        const res = await fetchAccount();
        if (!res.ok) return;
        const data = (await res.json()) as AccountBillingPayload;
        if (cancelled) return;

        const status =
          data.business?.billingStatus ?? data.billing?.status ?? "none";
        const next = getPayPromptDecision({
          billingStatus: status,
          billingPlan: data.business?.billingPlan ?? data.billing?.planId,
          pilotEndsAt: data.business?.pilotEndsAt ?? data.billing?.pilotEndsAt,
          shopCreatedAt: data.business?.createdAt,
          createdAt: data.business?.createdAt,
        });

        setEmail(data.user?.email ?? "");
        setCheckoutReady(Boolean(data.billing?.configured));
        setHasStripeCustomer(Boolean(data.business?.stripeCustomerId));
        setDecision(next);

        if (!next?.show) {
          setOpen(false);
          return;
        }

        // Hard lock always shows — no snooze escape for expired / past_due.
        if (next.hard && (next.tone === "locked" || next.tone === "past_due")) {
          setOpen(true);
          return;
        }

        try {
          const until = Number(localStorage.getItem(PAY_PROMPT_SNOOZE_KEY) ?? "0");
          if (until > Date.now()) {
            setOpen(false);
            return;
          }
        } catch {
          /* ignore */
        }

        setOpen(true);
      } catch {
        /* quiet */
      }
    }

    evaluate();
    const onFocus = () => evaluate();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function snooze() {
    if (!decision || decision.hard) return;
    try {
      localStorage.setItem(
        PAY_PROMPT_SNOOZE_KEY,
        String(Date.now() + decision.snoozeMs),
      );
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open || !decision) return null;

  if (decision.tone === "locked" || decision.tone === "past_due") {
    return (
      <BillingLockScreen
        tone={decision.tone}
        headline={decision.headline}
        body={decision.body}
        email={email}
        checkoutReady={checkoutReady}
        hasStripeCustomer={hasStripeCustomer}
      />
    );
  }

  const featured = pricing.pro;

  return (
    <div
      className="pay-prompt"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="pay-prompt-backdrop"
        aria-label="Dismiss for now"
        onClick={snooze}
      />
      <div className={`pay-prompt-card pay-prompt-card--${decision.tone} pay-prompt-card--instrument`}>
        <p className="pay-prompt-kicker font-sans">Pay</p>
        <h2 id={titleId} className="pay-prompt-title font-sans">
          {decision.headline}
        </h2>
        <p className="pay-prompt-body font-sans">{decision.body}</p>

        <div className="pay-prompt-price font-sans">
          <span className="pay-prompt-price-amt">${featured.price}</span>
          <span className="pay-prompt-price-per">/mo · {featured.name}</span>
        </div>

        <div className="pay-prompt-actions">
          {checkoutReady ? (
            <CheckoutButton
              planId="pro"
              email={email}
              label={`${decision.primaryCta} · $${featured.price}/mo`}
              variant="primary"
              className="pay-prompt-checkout"
            />
          ) : (
            <Link
              href="/dashboard/billing"
              className="btn btn-void pay-prompt-primary"
              onClick={snooze}
            >
              Open billing
            </Link>
          )}
          <div className="pay-prompt-secondary">
            <Link
              href="/dashboard/billing"
              className="btn btn-secondary text-sm"
              onClick={snooze}
            >
              {checkoutReady ? "Other plans on Billing" : "Billing"}
            </Link>
            <button type="button" className="pay-prompt-later font-sans" onClick={snooze}>
              Not now — remind me later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
