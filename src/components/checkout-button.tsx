"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BillingInterval, PaidPlanId } from "@/lib/pricing-plans";

type CheckoutButtonProps = {
  planId: PaidPlanId;
  interval?: BillingInterval;
  label?: string;
  className?: string;
  variant?: "primary" | "secondary";
  email?: string;
};

type PlanBillingStatus = {
  configured: boolean;
  checkoutReady: boolean;
  checkoutReadyAnnual?: boolean;
};

type BillingStatus = {
  configured: boolean;
  checkoutReady: boolean;
  plans: Record<PaidPlanId, PlanBillingStatus>;
};

export function CheckoutButton({
  planId,
  interval = "month",
  label,
  className = "",
  variant = "secondary",
  email: emailProp = "",
}: CheckoutButtonProps) {
  const [email, setEmail] = useState(emailProp);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);

  const buttonLabel = label ?? "Subscribe";

  useEffect(() => {
    if (emailProp) {
      setEmail(emailProp);
      setNeedsEmail(false);
    }
  }, [emailProp]);

  useEffect(() => {
    fetch("/api/billing/checkout")
      .then((res) => res.json())
      .then((data) => {
        const plans = (data.plans ?? []) as Array<{
          id: PaidPlanId;
          checkoutReady: boolean;
          checkoutReadyAnnual?: boolean;
          configured: boolean;
        }>;
        const planMap = Object.fromEntries(
          plans.map((plan) => [
            plan.id,
            {
              configured: plan.configured,
              checkoutReady: plan.checkoutReady,
              checkoutReadyAnnual: plan.checkoutReadyAnnual,
            },
          ]),
        ) as Record<PaidPlanId, PlanBillingStatus>;

        setBilling({
          configured: Boolean(data.configured),
          checkoutReady: Boolean(data.checkoutReady),
          plans: planMap,
        });
      })
      .catch(() => {
        setBilling({
          configured: false,
          checkoutReady: false,
          plans: {} as Record<PaidPlanId, PlanBillingStatus>,
        });
      })
      .finally(() => setBillingLoading(false));
  }, []);

  const planStatus = billing?.plans[planId];
  const planReady =
    interval === "year"
      ? Boolean(planStatus?.checkoutReadyAnnual)
      : Boolean(planStatus?.checkoutReady);

  async function startCheckout(submittedEmail?: string) {
    const checkoutEmail = (submittedEmail ?? email).trim();
    if (!checkoutEmail) {
      setNeedsEmail(true);
      setError("Enter the email on your Orvius account.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: checkoutEmail, planId, interval }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Checkout unavailable");
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      throw new Error("No checkout URL returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setLoading(false);
    }
  }

  if (billingLoading) {
    return (
      <div className={className}>
        <button
          type="button"
          disabled
          className={`inst-btn w-full justify-center opacity-60 ${
            variant === "primary" ? "inst-btn-primary" : "inst-btn-ghost"
          }`}
        >
          Loading…
        </button>
      </div>
    );
  }

  if (!planReady) {
    const annualMissing = interval === "year" && planStatus?.checkoutReady;
    return (
      <div className={className}>
        <Link href="/pilot" className="inst-btn inst-btn-primary w-full justify-center">
          Apply for design partner
        </Link>
        <p className="mt-3 font-sans text-sm text-ash">
          {annualMissing
            ? "Annual billing isn’t configured yet for this plan. Switch to monthly or start the free program."
            : "Self-serve checkout for this plan is not live yet. Start with the free 30-day program — we will send a checkout link when billing is ready."}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {needsEmail && !emailProp ? (
        <div className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            inputMode="email"
            className="input"
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => startCheckout()}
            className={`inst-btn w-full justify-center ${
              variant === "primary" ? "inst-btn-primary" : "inst-btn-ghost"
            } ${loading ? "opacity-70" : ""}`}
          >
            {loading ? "Redirecting..." : buttonLabel}
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={() => startCheckout()}
          className={`inst-btn w-full justify-center ${
            variant === "primary" ? "inst-btn-primary" : "inst-btn-ghost"
          } ${loading ? "opacity-70" : ""}`}
        >
          {loading ? "Redirecting..." : buttonLabel}
        </button>
      )}

      {error ? (
        <p className="mt-3 font-sans text-sm text-flare-dim">
          {error}{" "}
          <Link href="/pilot" className="underline underline-offset-2">
            Apply for pilot
          </Link>
        </p>
      ) : null}
    </div>
  );
}
