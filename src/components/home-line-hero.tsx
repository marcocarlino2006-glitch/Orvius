import Link from "next/link";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * First viewport — Chase/Stripe weight for a trades night OS.
 * Brand mass first. One headline. One lead. One CTA. Live line.
 * Full-bleed void plane; copper signal only.
 */
export function HomeLineHero() {
  return (
    <section
      className="mkt-hero mkt-hero--clean mkt-hero--institution"
      aria-labelledby="home-hero-heading"
    >
      <div className="mkt-hero-atmosphere" aria-hidden />
      <div className="mkt-hero-clean">
        <div className="mkt-hero-brand">
          <OrviusLogo variant="void" size="xl" />
        </div>

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
          The night-shift OS for HVAC, plumbing, and electrical — answers your
          line after hours, books the job, and alerts the shop in seconds.
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
