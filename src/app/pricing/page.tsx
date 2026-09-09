import Link from "next/link";
import type { Metadata } from "next";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { isAnyPlanCheckoutReady } from "@/lib/billing-readiness";
import { demoLineHref } from "@/lib/demo-line";
import { getFeaturedPlan, getLowestPaidPrice } from "@/lib/company";

const featured = getFeaturedPlan();

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius plans from $124/mo (annual) — Line, Pro, Fleet, and Multi-shop. Monthly or annual billing.",
};

export default function PricingPage() {
  const checkoutReady = isAnyPlanCheckoutReady();

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
          {!checkoutReady ? (
            <p className="mt-4 max-w-2xl font-sans text-sm text-ash">
              Self-serve checkout unlocks when Stripe is live. Until then, start
              as a{" "}
              <Link href="/pilot" className="underline underline-offset-2">
                design partner pilot
              </Link>{" "}
              — we set the line up with you. Subscribe buttons route to the pilot
              until billing is green.
            </p>
          ) : null}
          <div className="tier1-hero-call">
            <HomeCallDemo variant="void" size="section" />
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
            Built to pay back with one additional job.
          </h2>
          <p className="tier1-section-lead font-sans">
            If your gross profit on an additional booked job exceeds ${featured.price},
            that job can cover a month of the featured plan. Your ticket,
            close rate, and margin determine the actual payback.
          </p>
          <div className="tier1-actions tier1-close-actions">
            <a href={demoLineHref()} className="inst-btn inst-btn-primary">
              Call the live AI
            </a>
            <Link href="/pilot" className="inst-btn inst-btn-ghost">
              Book a call audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
