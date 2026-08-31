import { HomeChangelog } from "@/components/home-changelog";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeHeroCinema } from "@/components/home-hero-cinema";
import { HomeLiveLine } from "@/components/home-live-line";
import { HomePlatformSection } from "@/components/home-platform-section";
import { RevealOnScroll } from "@/components/reveal-on-scroll";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
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
            <p className="cursor-trust-kicker font-sans">Live in production</p>
            <h1 className="cursor-hero-title font-serif">
              Never miss a call again.
            </h1>
            <p className="cursor-hero-sub font-sans">{company.tagline}</p>
            <HomeHeroActions variant="void" />
            <div className="cursor-live">
              <HomeLiveLine variant="void" />
              <p className="cursor-live-meta font-sans">
                Summit HVAC · {company.trades.join(" · ")}
              </p>
            </div>
          </div>

          <div className="cursor-product cursor-product-bleed tier-reveal tier-reveal-delay">
            <HomeHeroCinema />
          </div>
        </section>

        <HomePlatformSection />

        <RevealOnScroll>
          <HomeChangelog />
        </RevealOnScroll>

        <section className="cursor-close">
          <RevealOnScroll>
            <div className="editorial-wrap cursor-close-inner">
              <h2 className="cursor-close-title font-serif">Try Orvius now.</h2>
              <p className="cursor-close-sub font-sans">
                ${pricing.pro.price}/mo flat · one booked job covers the month
              </p>
              <HomeHeroActions variant="void" />
            </div>
          </RevealOnScroll>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
