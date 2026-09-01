import Link from "next/link";
import type { Metadata } from "next";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPlanCard } from "@/components/pricing-plan-card";
import { getFeaturedPlan, getLowestPaidPrice, pricingPlans } from "@/lib/company";

const featured = getFeaturedPlan();

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius plans from $149/mo — Line, Pro, and Fleet for HVAC, plumbing, and electrical shops.",
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="tier1-hero-glow" aria-hidden />
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title={`From $${getLowestPaidPrice()} per month. Flat.`}
            subline="Pick the plan that matches your shop. No per-minute billing. Cancel anytime."
            description="Line for the front door. Pro for the full workspace. Fleet for shops running 6+ trucks."
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <div className="editorial-wrap tier1-pricing-plans">
          {pricingPlans.map((plan) => (
            <PricingPlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow">Economics</p>
          <h2 className="tier1-section-title font-sans">
            One booked job covers the month.
          </h2>
          <p className="tier1-section-lead font-sans">
            A single after-hours repair often clears ${featured.price}. Orvius
            exists so that call is never voicemail.
          </p>
          <p className="mt-4 font-sans text-sm text-ash">
            Not sure which plan?{" "}
            <Link href="/pilot" className="home-platform-link">
              Start with the free design partner program
            </Link>
            .
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
