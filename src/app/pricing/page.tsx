import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { demoLineHref } from "@/lib/demo-line";
import { getFeaturedPlan, getLowestPaidPrice } from "@/lib/company";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";

const featured = getFeaturedPlan();

export const metadata: Metadata = {
  title: "Pricing",
  description:
    `Orvius plans from $${getLowestPaidPrice("year")}/mo (annual) — Line, Pro, and Fleet. Monthly or annual billing.`,
};

export default function PricingPage() {
  const selfServeReady = getPublicLaunchReadiness().ready;

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title={`From $${getLowestPaidPrice("year")} per month. Flat.`}
            subline="Calls included. Monthly, or annual with two months free."
            description="Line for missed calls. Pro for lead-to-job. Fleet for 6+ trucks."
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/pilot" className="ov-btn ov-btn--quiet">
                  Request a demo
                </Link>
              </>
            }
          />
          {!selfServeReady ? (
            <p className="mt-4 max-w-2xl font-sans text-sm text-ash">
              Card signup opens soon. Until then, book a{" "}
              <Link href="/pilot" className="underline underline-offset-2">
                call audit
              </Link>{" "}
              and we&apos;ll set up your shop line with you.
            </p>
          ) : null}
        </div>
      </section>

      <section className="tier1-story">
        <PricingPagePlans />
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <h2 className="tier1-section-title type-headline">
            Built to pay back with one additional job.
          </h2>
          <p className="tier1-section-lead font-sans">
            If your gross profit on an additional booked job exceeds ${featured.price},
            that job can cover a month of the featured plan. Your ticket,
            close rate, and margin determine the actual payback.
          </p>
          <div className="tier1-actions tier1-close-actions">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call the live line
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
