import Link from "next/link";
import { HomeLiveCall } from "@/components/home-live-call";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * The product carries the hero. One claim on the left, an after-hours call
 * running itself on the right — the thing a shop owner is actually buying.
 */
export function HomeLineHero() {
  return (
    <section className="ov-hero" aria-labelledby="home-hero-heading">
      <div className="ov-hero-inner">
        <div className="ov-hero-copy">
          <p className="ov-hero-eyebrow" data-i18n="hero.eyebrow">
            For HVAC, plumbing &amp; electrical shops
          </p>

          {/* Copy is owned by the i18n dictionary; keep these in sync with it so
              the translator never swaps the text out from under the render. */}
          <h1 id="home-hero-heading" className="ov-hero-title" data-i18n="hero.title">
            Missed calls become booked jobs.
          </h1>

          <p className="ov-hero-lead" data-i18n="hero.lead">
            Orvius answers after-hours and overflow calls, captures the request,
            proposes an open service window, and alerts the owner — without
            inventing prices or arrival times.
          </p>

          <div className="ov-hero-actions">
            <a
              href={demoLineHref()}
              className="ov-btn ov-btn--solid"
              data-i18n="hero.cta"
            >
              Call the live AI
            </a>
            <Link href="/pilot" className="ov-btn ov-btn--quiet">
              Book a call audit
            </Link>
          </div>

          <p className="ov-hero-meta">
            <span className="ov-hero-pulse" aria-hidden />
            Live line
            <span aria-hidden> · {DEMO_LINE_DISPLAY}</span>
          </p>
        </div>

        <div className="ov-hero-stage">
          <HomeLiveCall />
        </div>
      </div>
    </section>
  );
}
