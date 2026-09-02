import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

export function HomeLineHero() {
  return (
    <section className="mkt-hero" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-signal" aria-hidden />

      <div className="editorial-wrap mkt-hero-inner">
        <div className="mkt-hero-copy">
          <p className="mkt-kicker mkt-kicker-signal">
            <span className="mkt-live-dot" aria-hidden />
            Live line · call now
          </p>

          <h1 id="home-hero-heading" className="mkt-hero-title">
            Turn missed calls into booked jobs.
          </h1>

          <p className="mkt-hero-lead font-sans">
            After-hours and overflow — qualified, booked, owner alerted while your crew works.
          </p>

          <a href={demoLineHref()} className="mkt-phone mkt-phone-signal">
            {DEMO_LINE_DISPLAY}
          </a>

          <div className="mkt-hero-actions font-sans">
            <Link href="/pilot" className="mkt-btn mkt-btn-signal">
              Book a live call audit
            </Link>
          </div>
        </div>

        <HomeProductPreview />
      </div>
    </section>
  );
}
