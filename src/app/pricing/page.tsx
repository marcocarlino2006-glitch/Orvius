import Link from "next/link";
import type { Metadata } from "next";
import { HomeCallDemo } from "@/components/home-call-demo";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { demoLineHref } from "@/lib/demo-line";
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
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title={`From $${getLowestPaidPrice("year")} per month. Flat.`}
            subline="Monthly or annual — pick the plan that matches your shop."
            description="Line for missed calls. Pro for lead-to-job. Fleet for 6+ trucks."
          />
          {!selfServeReady ? (
            <p className="mt-4 max-w-2xl font-sans text-sm text-ash">
              Public self-serve opens only when signup, billing, telephony and
              support gates are verified. Until then, book a{" "}
              <Link href="/pilot" className="underline underline-offset-2">
                call audit
              </Link>{" "}
              and we&apos;ll verify the setup with you. We do not advertise a
              free trial or collect payment outside verified Stripe checkout.
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
