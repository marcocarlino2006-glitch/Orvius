import Link from "next/link";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Cursor-craft hero: calm, centered, light. One headline, one lead, one
 * charcoal pill CTA, and a quiet live-line link. No dark product bleed.
 */
export function HomeLineHero() {
  return (
    <section
      className="mkt-hero mkt-hero--clean"
      aria-labelledby="home-hero-heading"
    >
      <div className="mkt-hero-clean">
        <p className="mkt-hero-clean-eyebrow font-sans" data-i18n="hero.eyebrow">
          For HVAC, plumbing &amp; electrical shops
        </p>

        <h1
          id="home-hero-heading"
          className="mkt-hero-clean-title"
          data-i18n="hero.title"
        >
          Missed calls become
          <br />
          booked jobs.
        </h1>

        <p className="mkt-hero-clean-lead font-sans" data-i18n="hero.lead">
          Orvius answers after-hours and overflow calls, captures the request,
          proposes an open service window, and alerts the owner — without
          inventing prices or arrival times.
        </p>

        <div className="mkt-hero-clean-actions font-sans">
          <a
            href={demoLineHref()}
            className="inst-btn inst-btn-primary mkt-hero-clean-cta"
            data-i18n="hero.cta"
          >
            Call the live AI
          </a>
        </div>

        <Link href="/pilot" className="mkt-hero-clean-line font-sans">
          <span className="mkt-hero-live-pulse" aria-hidden />
          Book a live call audit
          <span aria-hidden> · {DEMO_LINE_DISPLAY} →</span>
        </Link>
      </div>
    </section>
  );
}
