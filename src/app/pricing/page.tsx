import Link from "next/link";
import type { Metadata } from "next";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { demoLineHref } from "@/lib/demo-line";
import { getFeaturedPlan, getLowestPaidPrice } from "@/lib/company";

const featured = getFeaturedPlan();

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius plans from $124/mo (annual) — Line, Pro, Fleet, and Multi-shop. Monthly or annual billing.",
};

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title={`From $${getLowestPaidPrice("year")} per month. Flat.`}
            subline="Monthly or annual — pick the plan that matches your shop."
            description="Line for missed calls. Pro for lead-to-job. Fleet for 6+ trucks. Multi-shop for 2+ locations."
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
          <div className="tier1-actions tier1-close-actions">
            <a href={demoLineHref()} className="inst-btn inst-btn-primary">
              Call live demo
            </a>
            <Link href="/pilot" className="inst-btn inst-btn-ghost">
              Design partner program
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
