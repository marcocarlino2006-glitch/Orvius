import { HomeCallDemo } from "@/components/home-call-demo";
import { HomeCaseQuote } from "@/components/home-case-quote";
import { HomeCompareSection } from "@/components/home-compare-section";
import { HomeExperienceSection } from "@/components/home-experience-section";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeHeroWidgets } from "@/components/home-hero-widgets";
import { HomePlatformSection } from "@/components/home-platform-section";
import { HomeProofBar } from "@/components/home-proof-bar";
import { PublicLayout } from "@/components/marketing-shell";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Call the live demo — never miss a call again",
  description:
    "Call +1 844 643 9170 and hear Orvius answer, qualify, and alert the owner in under 60 seconds. The operating system for HVAC, plumbing, and electrical shops.",
  openGraph: {
    title: "Call Orvius live — +1 844 643 9170",
    description:
      "Real AI receptionist. Real production. Call now and hear what your customers will hear.",
  },
};

export default function HomePage() {
  return (
    <PublicLayout showStickyCall>
      <section className="cursor-hero cursor-hero-light">
        <div className="editorial-wrap cursor-hero-grid">
          <div className="cursor-hero-copy">
            <p className="cursor-trust-kicker cursor-trust-kicker-light font-sans">
              {company.trades.join(" · ")}
            </p>
            <h1 className="cursor-hero-title cursor-hero-title-light font-sans">
              Every call answered. Every lead captured.
            </h1>
            <p className="cursor-hero-sub cursor-hero-sub-light font-sans">
              Call {company.productName} live at +1 844 643 9170 — it answers in
              under 2 seconds, qualifies the job, and texts the owner while
              you&apos;re still on the ladder.
            </p>
            <div className="cursor-live cursor-live-light">
              <HomeCallDemo variant="light" size="hero" />
            </div>
            <HomeHeroActions variant="light" />
            <p className="cursor-hero-micro font-sans">
              No credit card · 30-day design partner · Cancel anytime
            </p>
          </div>

          <div className="cursor-hero-visual">
            <HomeHeroWidgets />
          </div>
        </div>
      </section>

      <HomeProofBar />

      <HomeExperienceSection />

      <HomePlatformSection />

      <HomeCompareSection />

      <HomeCaseQuote />

      <section className="cursor-close cursor-close-warm">
        <div className="editorial-wrap cursor-close-inner">
          <h2 className="cursor-close-title cursor-close-title-light font-sans">
            Hear it on your own line before you commit.
          </h2>
          <p className="cursor-close-sub cursor-close-sub-light font-sans">
            ${pricing.pro.price}/mo flat · 30-day design partner · no annual lock-in
          </p>
          <div className="cursor-close-call">
            <HomeCallDemo variant="light" size="section" showHint={false} />
          </div>
          <HomeHeroActions variant="light" />
        </div>
      </section>
    </PublicLayout>
  );
}
