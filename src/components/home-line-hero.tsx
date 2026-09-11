import Link from "next/link";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Brand-first hero — Orvius owns the viewport.
 * One claim. One line of proof. CTA pair. Live line as the product artifact.
 * Cool industrial plane + copper signal — not Cursor cream/orange costume.
 */
export function HomeLineHero() {
  return (
    <section
      className="mkt-hero mkt-hero--brand"
      aria-labelledby="home-hero-heading"
    >
      <div className="mkt-hero-brand-atmosphere" aria-hidden />
      <div className="mkt-hero-brand-inner">
        <div className="mkt-hero-brand-lockup">
          <OrviusLogo
            variant="void"
            size="xl"
            className="mkt-hero-brand-logo"
          />
        </div>

        <h1
          id="home-hero-heading"
          className="mkt-hero-brand-title"
          data-i18n="hero.title"
        >
          The night shift that books the job.
        </h1>

        <p className="mkt-hero-brand-lead font-sans" data-i18n="hero.lead">
          After-hours and overflow calls get answered, qualified, booked, and
          pushed to the owner — before the morning truck rolls.
        </p>

        <div className="mkt-hero-brand-actions font-sans">
          <Link
            href="/pilot"
            className="inst-btn inst-btn-primary mkt-hero-brand-cta"
            data-i18n="hero.cta"
          >
            Prove it on your line
          </Link>
          <Link
            href="/demo"
            className="inst-btn inst-btn-ghost mkt-hero-brand-secondary"
            data-i18n="hero.secondary"
          >
            Book a walkthrough
          </Link>
        </div>

        <a
          href={demoLineHref()}
          className="mkt-hero-line-artifact font-sans"
          aria-label={`Call the live Orvius line at ${DEMO_LINE_DISPLAY}`}
        >
          <span className="mkt-hero-line-artifact-meta">
            <span className="mkt-hero-live-pulse" aria-hidden />
            <span data-i18n="hero.liveline">Live line · call it now</span>
          </span>
          <span className="mkt-hero-line-artifact-number">
            {DEMO_LINE_DISPLAY}
          </span>
          <span className="mkt-hero-line-artifact-hint">
            Hear the night shift answer →
          </span>
        </a>
      </div>
    </section>
  );
}
