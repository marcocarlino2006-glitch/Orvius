import Link from "next/link";
import type { Metadata } from "next";
import { MarketingShell, ShellPageIntro } from "@/components/marketing-shell";
import { PricingPagePlans } from "@/components/pricing-page-plans";
import { PricingTerms } from "@/components/pricing-terms";
import { demoLineHref } from "@/lib/demo-line";
import { getLowestPaidPrice } from "@/lib/company";
import { getPaidPlans, OVERAGE_CENTS_PER_CALL, perCallCents } from "@/lib/pricing-plans";
import { getPublicLaunchReadiness } from "@/lib/public-launch-readiness";

const entry = getPaidPlans().reduce((low, plan) => (plan.price < low.price ? plan : low));

export const metadata: Metadata = {
  title: "Pricing",
  description:
    `Orvius Line, Pro and Fleet: from $${getLowestPaidPrice("month")} a month, or $${getLowestPaidPrice("year")} a month billed annually. Answered calls included; ${OVERAGE_CENTS_PER_CALL}¢ per call past the allowance.`,
};

export default function PricingPage() {
  const selfServeReady = getPublicLaunchReadiness().ready;

  return (
    <MarketingShell>
      <section className="tier1-hero tier1-hero-compact">
        <div className="editorial-wrap">
          <ShellPageIntro
            label="Pricing"
            title={`Plans from $${getLowestPaidPrice("month")} a month.`}
            subline={`Or $${getLowestPaidPrice("year")} a month when you pay for the year up front, which is two months free.`}
            description={`Each plan includes a set number of answered calls every month. Past that, the line keeps answering and each extra call is ${OVERAGE_CENTS_PER_CALL}¢.`}
            actions={
              <>
                <a href={demoLineHref()} className="ov-btn ov-btn--solid">
                  Call the live line
                </a>
                <Link href="/pilot" className="ov-btn ov-btn--quiet">
                  Book a call audit
                </Link>
              </>
            }
          />
          {!selfServeReady ? (
            <p className="mt-4 max-w-2xl font-sans text-sm text-ash">
              Card signup isn&apos;t open yet. Until it is, book a{" "}
              <Link href="/pilot" className="underline underline-offset-2">
                call audit
              </Link>{" "}
              and we&apos;ll set up your business line with you.
            </p>
          ) : null}
        </div>
      </section>

      <section className="tier1-story">
        <PricingPagePlans selfServeReady={selfServeReady} terms={<PricingTerms />} />
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <h2 className="tier1-section-title type-headline">
            Built to pay back with one additional job.
          </h2>
          <p className="tier1-section-lead font-sans">
            {entry.name} is ${entry.price} a month for {entry.includedCalls} answered calls, about{" "}
            {perCallCents(entry, "month")}¢ each. An answered call reaches you booked, or as a text with
            the caller&apos;s details, and is priced per call, not by the minute. If one more booked job a month earns
            you more than ${entry.price} in gross profit, the plan has paid for itself. Your ticket,
            close rate and margin decide the actual payback.
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
