import Link from "next/link";
import { MarketingShell } from "@/components/marketing-shell";
import { HomeLineHero } from "@/components/home-line-hero";
import { HomeStatement } from "@/components/home-statement";
import { HomeCallStory } from "@/components/home-call-story";

export const dynamic = "force-dynamic";

/**
 * Company page — first principles (LOOK P1–P4):
 * Hero → night rules → call story → try now.
 * No stats strip. No Cursor-style showcase. One job per beat.
 */
export default function HomePage() {
  return (
    <MarketingShell premium>
      <HomeLineHero />
      <HomeStatement />
      <HomeCallStory />

      <section className="mkt-trynow" aria-labelledby="home-trynow-heading">
        <div className="ov-trynow-sky" aria-hidden>
          <span className="ov-trynow-sky-bloom" />
        </div>
        <div className="mkt-trynow-inner">
          <p className="mkt-trynow-eyebrow">Hear it yourself</p>
          <h2
            id="home-trynow-heading"
            className="mkt-trynow-title"
            data-i18n="trynow.title"
          >
            Try Orvius now.
          </h2>
          <p className="mkt-trynow-sub font-sans">
            Call the demo line and describe a job the way a customer would. You
            will hear the intake, get the same structured record a shop owner
            sees, and nothing you say is used to invent a price or an arrival
            time.
          </p>
          <div className="mkt-trynow-actions font-sans">
            <a
              href="tel:+18446439170"
              className="ov-btn ov-btn--solid mkt-trynow-cta"
              data-i18n="trynow.cta"
            >
              Call the live line →
            </a>
            <Link
              href="/pilot"
              className="mkt-trynow-call font-sans"
              data-i18n="trynow.call"
            >
              or book a live call audit
            </Link>
          </div>
          <p className="mkt-trynow-meta">
            <span className="ov-hero-pulse" aria-hidden />
            Live line · +1 844 643 9170
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
