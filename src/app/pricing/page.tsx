import Link from "next/link";
import type { Metadata } from "next";
import { CheckoutButton } from "@/components/checkout-button";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { pricing } from "@/lib/company";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius Pro — $299/mo flat for HVAC, plumbing, and electrical shops.",
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="tier1-hero-glow" aria-hidden />
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title={`$${pricing.pro.price} per month. Flat.`}
            subline="Unlimited inbound calls and texts. No per-minute billing. Cancel anytime."
            description="One operating system — front door through dispatch. Built for owner-operators running 2–15 trucks."
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-pricing-plans">
          <article className="tier1-plan">
            <p className="tier1-eyebrow font-sans">Design partner</p>
            <p className="tier1-plan-price font-sans">30 days</p>
            <p className="tier1-section-lead font-sans">
              Personal onboarding. Your line live within days. Infrastructure
              covered during the program.
            </p>
            <ul className="tier1-plan-list font-sans">
              {pricing.pilot.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link href="/pilot" className="inst-btn inst-btn-primary">
              Apply
            </Link>
          </article>

          <article className="tier1-plan tier1-plan-featured">
            <p className="tier1-eyebrow font-sans">Orvius Pro</p>
            <p className="tier1-plan-price font-sans">
              ${pricing.pro.price}
              <span className="tier1-plan-period">/mo</span>
            </p>
            <p className="tier1-section-lead font-sans">
              Production line, inbox, customers, jobs, dispatch, and owner
              alerts — one flat price.
            </p>
            <ul className="tier1-plan-list font-sans">
              {pricing.pro.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <CheckoutButton label="Subscribe" variant="primary" />
          </article>
        </div>
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow">Economics</p>
          <h2 className="tier1-section-title font-sans">
            One booked job covers the month.
          </h2>
          <p className="tier1-section-lead font-sans">
            A single after-hours repair often clears ${pricing.pro.price}. Orvius
            exists so that call is never voicemail.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
