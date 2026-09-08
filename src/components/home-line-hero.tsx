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
          Never miss
          <br />
          another call.
        </h1>

        <p className="mkt-hero-clean-lead font-sans" data-i18n="hero.lead">
          Orvius answers your after-hours calls, books the job, and alerts you
          in seconds — so no lead ever dies on voicemail.
        </p>

        <div className="mkt-hero-clean-actions font-sans">
          <Link
            href="/pilot"
            className="inst-btn inst-btn-primary mkt-hero-clean-cta"
            data-i18n="hero.cta"
          >
            Prove it on your line
          </Link>
        </div>

        <a href={demoLineHref()} className="mkt-hero-clean-line font-sans">
          <span className="mkt-hero-live-pulse" aria-hidden />
          Live line · {DEMO_LINE_DISPLAY}
          <span aria-hidden> →</span>
        </a>
      </div>
    </section>
  );
}
