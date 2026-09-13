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
            title={`From $${getLowestPaidPrice("year")} per month. Fair use included.`}
            subline="Flat SaaS price. Answered minutes and owner SMS capped so the line stays honest."
            description="Line for missed calls. Pro for lead-to-job. Fleet for 6+ trucks. Every plan shows included usage — not fake unlimited."
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

      <section className="tier1-story tier1-story-muted">
        <div className="editorial-wrap">
          <p className="tier1-eyebrow type-eyebrow">Fair use</p>
          <h2 className="tier1-section-title type-headline">
            What &ldquo;included&rdquo; means.
          </h2>
          <p className="tier1-section-lead font-sans max-w-2xl">
            Orvius is not per-minute phone billing. You pay a flat plan. Each plan
            includes answered minutes and owner SMS. If a shop blows past fair
            use, we warn first — then quote overage before anything extra hits
            the card. Soft overage today; hard Stripe meters when volume earns it.
          </p>
          <ul className="tier1-strategy-list font-sans mt-6">
            <li>
              <strong>Line.</strong> 300 answered min · 200 owner SMS / month.
            </li>
            <li>
              <strong>Pro.</strong> 750 answered min · 500 owner SMS / month.
            </li>
            <li>
              <strong>Fleet.</strong> 2,000 answered min · 1,500 owner SMS / month.
            </li>
            <li>
              <strong>Overage (quoted).</strong> About $0.12 / answered min and
              $0.03 / SMS on Line/Pro — lower on Fleet.
            </li>
          </ul>
        </div>
      </section>

      <section className="tier1-close">
        <div className="editorial-wrap tier1-close-inner">
          <p className="tier1-eyebrow type-eyebrow">Economics</p>
          <h2 className="tier1-section-title type-headline">
            One booked job covers the month.
          </h2>
          <p className="tier1-section-lead font-sans">
            A single after-hours repair often clears ${featured.price}. Orvius
            exists so that call hits a live line — not voicemail — when it
            reaches your Orvius number or forward.
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
