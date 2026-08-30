import { CaseStudySection } from "@/components/case-study-section";
import { HomeChangelog } from "@/components/home-changelog";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeLiveLine } from "@/components/home-live-line";
import { HomeProductStage } from "@/components/home-product-stage";
import { SocialProofSection } from "@/components/social-proof-section";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { TierProofStrip } from "@/components/tier-proof-strip";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Never miss a call again",
  description:
    "Orvius is the operating system for HVAC, plumbing, and electrical shops. Every call answered. Every lead qualified. Every job in one place.",
};

export default function HomePage() {
  return (
    <>
      <ShellHeader
        plane="void"
        surface="glass"
        position="fixed"
        cta={{ href: "/pilot", label: "Get started" }}
      />

      <main className="cursor-page">
        <section className="cursor-hero">
          <div className="editorial-wrap cursor-hero-copy tier-reveal">
            <p className="cursor-trust-kicker font-sans">
              Trusted by service businesses running 2–15 trucks
            </p>
            <h1 className="cursor-hero-title font-serif">
              Never miss a call again.
            </h1>
            <p className="cursor-hero-sub font-sans">{company.tagline}</p>
            <HomeHeroActions variant="void" />
            <div className="cursor-live">
              <HomeLiveLine variant="void" />
              <p className="cursor-live-meta font-sans">
                Live · Summit HVAC · {company.trades.join(" · ")}
              </p>
            </div>
          </div>

          <div className="cursor-product tier-reveal tier-reveal-delay">
            <div className="editorial-wrap">
              <HomeProductStage />
            </div>
          </div>
        </section>

        <CaseStudySection />
        <SocialProofSection />
        <TierProofStrip />
        <HomeChangelog />

        <section className="cursor-close">
          <div className="editorial-wrap cursor-close-inner tier-reveal">
            <h2 className="cursor-close-title font-serif">Try Orvius now.</h2>
            <p className="cursor-close-sub font-sans">
              ${pricing.pro.price}/mo flat · one booked job covers the month
            </p>
            <HomeHeroActions variant="void" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
