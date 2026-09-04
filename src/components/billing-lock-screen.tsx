"use client";

import Link from "next/link";
import { BillingPortalButton } from "@/components/billing-portal-button";
import { CheckoutButton } from "@/components/checkout-button";
import { pricing } from "@/lib/pricing-plans";
import type { PayPromptTone } from "@/lib/pay-prompt";

type BillingLockScreenProps = {
  tone: Extract<PayPromptTone, "locked" | "past_due" | "required">;
  headline: string;
  body: string;
  email?: string;
  checkoutReady?: boolean;
  hasStripeCustomer?: boolean;
};

/**
 * Full-page lock when trial ended / canceled / past_due.
 * Not dismissible — the only path is pay (or billing portal).
 */
export function BillingLockScreen({
  tone,
  headline,
  body,
  email = "",
  checkoutReady = false,
  hasStripeCustomer = false,
}: BillingLockScreenProps) {
  const featured = pricing.pro;
  const usePortal = tone === "past_due" && hasStripeCustomer;

  return (
    <div className={`billing-lock billing-lock--${tone}`} role="alertdialog" aria-modal="true">
      <div className="billing-lock-card">
        <p className="billing-lock-kicker font-sans">
          {tone === "past_due" ? "Payment required" : "Subscribe to continue"}
        </p>
        <h1 className="billing-lock-title font-sans">{headline}</h1>
        <p className="billing-lock-body font-sans">{body}</p>

        <div className="billing-lock-price font-sans">
          <span className="billing-lock-price-amt">${featured.price}</span>
          <span className="billing-lock-price-per">/mo · {featured.name}</span>
        </div>

        {usePortal ? (
          <div className="billing-lock-checkout">
            <BillingPortalButton label="Update payment method" />
          </div>
        ) : checkoutReady ? (
          <CheckoutButton
            planId="pro"
            email={email}
            label={`Subscribe · $${featured.price}/mo`}
            variant="primary"
            className="billing-lock-checkout"
          />
        ) : (
          <Link href="/dashboard/billing" className="btn btn-void billing-lock-cta">
            Open billing
          </Link>
        )}

        <div className="billing-lock-links font-sans">
          <Link href="/dashboard/pricing">Compare plans</Link>
          <Link href="/dashboard/billing">Billing details</Link>
        </div>
      </div>
    </div>
  );
}
