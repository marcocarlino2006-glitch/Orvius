import Link from "next/link";
import type { Metadata } from "next";
import { CheckoutButton } from "@/components/checkout-button";
import { EarlyAccessForm } from "@/components/early-access-form";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingComparison } from "@/components/pricing-comparison";
import { pricing } from "@/lib/company";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius Pro — $299/mo flat for HVAC, plumbing, and electrical shops. Design partner program available.",
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="marketing-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title="One price. Every call answered."
            subline={`$${pricing.pro.price}/mo flat — built for owner-operators, not enterprise rollouts.`}
            description="No per-minute surprises. No bolt-on AI that leaves your CRM empty."
          />
          <div className="marketing-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap">
          <PricingComparison />
        </div>
      </section>

      <section className="marketing-section marketing-section-muted">
        <div className="editorial-wrap marketing-pricing-tiers">
          <article className="marketing-tier">
            <p className="home-platform-kicker font-sans">Design partner</p>
            <h2 className="marketing-tier-price font-sans">30 days</h2>
            <p className="home-platform-lead font-sans">
              Personal onboarding. Your line live within days. We cover
              infrastructure during the program.
            </p>
            <ul className="marketing-tier-list font-sans">
              {pricing.pilot.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link href="/pilot" className="tier-btn tier-btn-primary">
              Apply
            </Link>
          </article>

          <article className="marketing-tier marketing-tier-featured">
            <p className="home-platform-kicker font-sans">Orvius Pro</p>
            <h2 className="marketing-tier-price font-sans">
              ${pricing.pro.price}
              <span className="marketing-tier-period font-sans">/mo</span>
            </h2>
            <p className="home-platform-lead font-sans">
              Flat monthly. Unlimited inbound calls and texts. Cancel anytime.
            </p>
            <ul className="marketing-tier-list font-sans">
              {pricing.pro.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <CheckoutButton label="Subscribe" variant="primary" />
          </article>
        </div>
      </section>

      <section className="marketing-close">
        <div className="editorial-wrap marketing-close-inner">
          <p className="home-platform-kicker font-sans">ROI</p>
          <h2 className="home-platform-title font-sans">
            One booked job pays for the month.
          </h2>
          <p className="home-platform-lead font-sans">
            A single after-hours repair often clears ${pricing.pro.price}. Orvius
            exists so that call never hits voicemail.
          </p>
        </div>
      </section>

      <section className="marketing-section">
        <div className="editorial-wrap marketing-split">
          <div>
            <h2 className="home-platform-title font-sans">Join the program.</h2>
            <p className="home-platform-lead font-sans">
              Limited availability. We onboard each shop directly.
            </p>
          </div>
          <div className="panel-chalk p-6 md:p-8">
            <EarlyAccessForm variant="full" />
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
