import Link from "next/link";
import type { Metadata } from "next";
import { CheckoutButton } from "@/components/checkout-button";
import { EarlyAccessForm } from "@/components/early-access-form";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingComparison } from "@/components/pricing-comparison";
import { company, pricing } from "@/lib/company";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius Pro — $299/mo flat for HVAC, plumbing, and electrical shops. Design partner program available.",
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="premium-pricing-hero">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title="One price. Every call answered."
            subline={`$${pricing.pro.price}/mo flat — built for owner-operators, not enterprise rollouts.`}
            description="No per-minute surprises. No bolt-on AI that leaves your CRM empty."
          />
        </div>
      </section>

      <section className="premium-band premium-band-chalk">
        <div className="editorial-wrap">
          <PricingComparison />
        </div>
      </section>

      <section className="premium-band">
        <div className="editorial-wrap premium-pricing-tiers">
          <article className="premium-tier">
            <p className="premium-kicker font-sans">Design partner</p>
            <h2 className="premium-tier-price font-serif">30 days</h2>
            <p className="premium-body font-sans">
              Personal onboarding. Your line live within days. We cover
              infrastructure during the program.
            </p>
            <ul className="premium-tier-list font-sans">
              {pricing.pilot.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link href="/pilot" className="editorial-cta">
              Apply
            </Link>
          </article>

          <article className="premium-tier premium-tier-featured">
            <p className="premium-kicker font-sans">Orvius Pro</p>
            <h2 className="premium-tier-price font-serif">
              ${pricing.pro.price}
              <span className="premium-tier-period font-sans">/mo</span>
            </h2>
            <p className="premium-body font-sans">
              Flat monthly. Unlimited inbound calls and texts. Cancel anytime.
            </p>
            <ul className="premium-tier-list font-sans">
              {pricing.pro.highlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <CheckoutButton label="Subscribe" variant="primary" />
          </article>
        </div>
      </section>

      <section className="premium-close">
        <div className="editorial-wrap premium-close-inner">
          <p className="premium-kicker font-sans">ROI</p>
          <h2 className="premium-close-title font-serif">
            One booked job pays for the month.
          </h2>
          <p className="premium-close-lead font-sans">
            A single after-hours repair often clears ${pricing.pro.price}. Orvius
            exists so that call never hits voicemail.
          </p>
        </div>
      </section>

      <section className="premium-band premium-band-chalk">
        <div className="editorial-wrap editorial-split">
          <div>
            <h2 className="premium-section-title font-serif">Join the program.</h2>
            <p className="premium-body font-sans">
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
