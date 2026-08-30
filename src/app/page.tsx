import { CaseStudySection } from "@/components/case-study-section";
import { HomeChangelog } from "@/components/home-changelog";
import { HomeHeroActions } from "@/components/home-hero-actions";
import { HomeLiveLine } from "@/components/home-live-line";
import { HomeProductStage } from "@/components/home-product-stage";
import { OrviusOsStrip } from "@/components/orvius-os-strip";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";
import { company, platformPillars, pricing } from "@/lib/company";
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

      <main className="premium-page">
        <section className="premium-hero">
          <div className="premium-hero-glow" aria-hidden />
          <div className="editorial-wrap premium-hero-inner">
            <div className="premium-hero-copy">
              <OrviusOsStrip variant="rail" />
              <h1 className="premium-hero-title font-serif">
                Never miss a call again.
              </h1>
              <p className="premium-hero-subline font-sans">{company.tagline}</p>
              <p className="premium-hero-lead font-sans">
                Orvius answers, qualifies, and texts you the lead — on the job,
                after hours, at peak season. One saved emergency pays for the
                month.
              </p>
              <HomeHeroActions variant="void" />
              <div className="premium-live">
                <p className="premium-live-label font-sans">Live production line</p>
                <HomeLiveLine variant="void" />
                <p className="premium-live-proof font-sans">
                  {company.trades.join(" · ")} · Summit HVAC in production
                </p>
              </div>
            </div>
          </div>

          <div className="premium-stage">
            <div className="premium-stage-wrap">
              <HomeProductStage />
            </div>
          </div>
        </section>

        <section className="premium-band">
          <div className="editorial-wrap premium-wedge">
            <div className="premium-wedge-item">
              <p className="premium-kicker font-sans">The wedge</p>
              <h2 className="premium-section-title font-serif">
                Voicemail loses jobs.
              </h2>
              <p className="premium-body font-sans">
                Every call qualified — service, urgency, address, callback. Owner
                alert in seconds. The record is written before anyone picks up a
                wrench.
              </p>
            </div>
            <div className="premium-wedge-item">
              <p className="premium-kicker font-sans">The OS</p>
              <h2 className="premium-section-title font-serif">
                Not answering — running the shop.
              </h2>
              <p className="premium-body font-sans">
                Lead becomes customer. Customer becomes job. Job gets a tech.
                Inbox, dispatch, and history in one system — not a group text and
                a notepad.
              </p>
            </div>
          </div>
        </section>

        <CaseStudySection />

        <section className="premium-band premium-band-chalk">
          <div className="editorial-wrap">
            <p className="premium-kicker font-sans">Why Orvius</p>
            <h2 className="premium-section-title font-serif">
              Beats voicemail. Beats bolt-on AI.
            </h2>
            <div className="premium-pillars">
              {platformPillars.map((pillar) => (
                <article key={pillar.title} className="premium-pillar">
                  <h3 className="premium-pillar-title font-serif">{pillar.title}</h3>
                  <p className="premium-pillar-body font-sans">{pillar.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <HomeChangelog />

        <section className="premium-close">
          <div className="editorial-wrap premium-close-inner">
            <p className="premium-kicker font-sans">Get started</p>
            <h2 className="premium-close-title font-serif">
              Never miss a call again.
            </h2>
            <p className="premium-close-lead font-sans">
              ${pricing.pro.price}/mo after your design partner period. One booked
              job covers the month.
            </p>
            <HomeHeroActions variant="void" />
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
