import Link from "next/link";
import type { Metadata } from "next";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { getFeaturedPlan, getLowestPaidPrice } from "@/lib/company";

const featured = getFeaturedPlan();

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius plans from $149/mo — pick Line, Pro, or Fleet based on what your shop needs.",
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
            subline="Pick the plan that matches your shop — not the other way around."
            description="Line for missed calls. Pro for lead-to-job. Fleet for multi-truck dispatch."
          />
          <div className="tier1-hero-call">
            <HomeCallDemo variant="light" size="section" />
          </div>
        </div>
      </section>

      <section className="tier1-story">
        <PricingPagePlans />
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow type-eyebrow">Economics</p>
          <h2 className="tier1-section-title type-headline">
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
