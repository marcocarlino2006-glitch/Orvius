import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { demoLineHref, DEMO_LINE_DISPLAY } from "@/lib/demo-line";
import { getFeaturedPlan, getLowestPaidPrice } from "@/lib/company";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";

const featured = getFeaturedPlan();

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Orvius plans from $124/mo (annual) — Line, Pro, and Fleet. Monthly or annual billing.",
};

export default function PricingPage() {
  const selfServeReady = getPublicLaunchReadiness().ready;

  return (
    <MarketingShell>
      <section className="mkt-inner-hero" aria-labelledby="pricing-heading">
        <div className="mkt-inner-hero-copy">
          <p className="mkt-inner-brand">Pricing</p>
          <h1 id="pricing-heading" className="mkt-inner-title">
            From ${getLowestPaidPrice("year")} per month. Flat.
          </h1>
          <p className="mkt-inner-lead font-sans">
            Line for missed calls. Pro for lead-to-job. Fleet for 6+ trucks.
          </p>
          {!selfServeReady ? (
            <p className="mkt-inner-note font-sans">
              Public self-serve opens when signup, billing, and the live line are
              verified. Until then,{" "}
              <Link href="/pilot" className="underline underline-offset-2">
                book a call audit
              </Link>
              .
            </p>
          ) : null}
        </div>
      </section>

      <section className="mkt-pricing-body" aria-label="Plans">
        <PricingPagePlans />
      </section>

      <section
        className="mkt-section mkt-section-inset mkt-proof-section--quiet"
        aria-labelledby="pricing-close-heading"
      >
        <div className="mkt-close-block">
          <h2 id="pricing-close-heading" className="mkt-proof-title">
            Built to pay back with one additional job.
          </h2>
          <p className="mkt-proof-lead font-sans">
            If gross profit on an additional booked job exceeds $
            {featured.price}, that job can cover a month of the featured plan.
          </p>
          <div className="mkt-close-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call {DEMO_LINE_DISPLAY}
            </a>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Book a call audit
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
