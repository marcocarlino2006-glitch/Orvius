import { HomeCallDemo } from "@/components/home-call-demo";
import { HomeCaseQuote } from "@/components/home-case-quote";
import { HomeChangelog } from "@/components/home-changelog";
import { HomeCompareSection } from "@/components/home-compare-section";
import { HomeExperienceSection } from "@/components/home-experience-section";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeHeroCinema } from "@/components/home-hero-cinema";
import { HomePlatformSection } from "@/components/home-platform-section";
import { HomeProofBar } from "@/components/home-proof-bar";
import { HomeStickyCall } from "@/components/home-sticky-call";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
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
    <>
      <ShellHeader
        plane="void"
        surface="glass"
        position="fixed"
        cta={{ href: "tel:+18446439170", label: "Call demo" }}
      />

      <HomeStickyCall />

      <main className="cursor-page">
        <section className="cursor-hero">
          <div className="editorial-wrap cursor-hero-copy tier-reveal">
            <p className="cursor-trust-kicker font-sans">
              <span className="cursor-live-dot" aria-hidden />
              Live demo · call now
            </p>
            <h1 className="cursor-hero-title font-serif">
              Hear Orvius answer your shop&apos;s phone.
            </h1>
            <p className="cursor-hero-sub font-sans">
              {company.tagline} Call the line below — real AI, real leads, real
              owner SMS in under 60 seconds.
            </p>
            <div className="cursor-live cursor-live-prominent">
              <HomeCallDemo variant="void" size="hero" />
            </div>
            <HomeHeroActions variant="void" />
          </div>

          <div className="cursor-product cursor-product-bleed tier-reveal tier-reveal-delay">
            <HomeHeroCinema />
          </div>
        </section>

        <HomeProofBar />

        <HomeExperienceSection />

        <HomePlatformSection />

        <HomeCompareSection />

        <HomeCaseQuote />

        <RevealOnScroll>
          <HomeChangelog />
        </RevealOnScroll>

        <section className="cursor-close">
          <RevealOnScroll>
            <div className="editorial-wrap cursor-close-inner">
              <p className="cursor-label font-sans">Still deciding?</p>
              <h2 className="cursor-close-title font-serif">
                Call it. Then decide.
              </h2>
              <p className="cursor-close-sub font-sans">
                ${pricing.pro.price}/mo flat · one booked job covers the month
              </p>
              <div className="cursor-close-call">
                <HomeCallDemo variant="void" size="section" showHint={false} />
              </div>
              <HomeHeroActions variant="void" />
            </div>
          </RevealOnScroll>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
