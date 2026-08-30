import { CaseStudySection } from "@/components/case-study-section";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeLiveLine } from "@/components/home-live-line";
import { HomeProductStage } from "@/components/home-product-stage";
import { OrviusOsStrip } from "@/components/orvius-os-strip";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { TierProofStrip } from "@/components/tier-proof-strip";
import { company, pricing } from "@/lib/company";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Never miss a call again",
  description:
    "Orvius is the operating system for HVAC, plumbing, and electrical shops. Every call answered. Every lead qualified. Every job in one place.",
  openGraph: {
    title: "Orvius — Never miss a call again",
    description:
      "The operating system for service businesses. Built for owner-operators on the truck — not behind a desk.",
  },
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

      <main className="tier-page">
        <section className="tier-hero">
          <div className="tier-mesh" aria-hidden />
          <div className="tier-grain" aria-hidden />

          <div className="editorial-wrap tier-hero-top tier-reveal">
            <OrviusOsStrip variant="rail" />
            <h1 className="tier-hero-title font-serif">
              Never miss a call again.
            </h1>
            <p className="tier-hero-subline font-sans">{company.tagline}</p>
            <HomeHeroActions variant="void" />
            <div className="tier-hero-live">
              <HomeLiveLine variant="void" />
              <p className="tier-hero-live-meta font-sans">
                Live · Summit HVAC · {company.trades.join(" · ")}
              </p>
            </div>
          </div>

          <div className="tier-cinema tier-reveal tier-reveal-delay">
            <div className="tier-cinema-wrap">
              <HomeProductStage />
            </div>
          </div>
        </section>

        <CaseStudySection />

        <TierProofStrip />

        <section className="tier-close">
          <div className="editorial-wrap tier-close-inner tier-reveal">
            <h2 className="tier-close-title font-serif">
              Never miss a call again.
            </h2>
            <p className="tier-close-lead font-sans">
              ${pricing.pro.price}/mo flat. One booked job covers the month.
            </p>
            <HomeHeroActions variant="void" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
