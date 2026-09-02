import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import {
  DEMO_LINE_DISPLAY,
  demoLineHref,
} from "@/lib/demo-line";
import { company } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="mkt-hero" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-grid" aria-hidden />

      <div className="editorial-wrap mkt-hero-inner">
        <div className="mkt-hero-copy">
          <p className="mkt-kicker">
            Live demo · {company.trades.join(" · ")}
          </p>

          <h1 id="home-hero-heading" className="mkt-hero-title">
            Turn missed calls into booked jobs.
          </h1>

          <p className="mkt-hero-lead font-sans">
            Orvius answers after-hours and overflow calls, qualifies the customer,
            books the appointment, and alerts the owner while the crew is working.
          </p>

          <div className="mkt-hero-phone-block">
            <span className="mkt-live-pill font-sans">
              <span className="mkt-live-dot" aria-hidden />
              Live line
            </span>
            <a href={demoLineHref()} className="mkt-phone">
              {DEMO_LINE_DISPLAY}
            </a>
          </div>

          <div className="mkt-hero-actions font-sans">
            <Link href="/pilot" className="mkt-btn mkt-btn-primary">
              Book a live call audit
            </Link>
            <a href={demoLineHref()} className="mkt-btn mkt-btn-secondary">
              Try the live line
            </a>
          </div>
        </div>

        <HomeProductPreview />
      </div>
    </section>
  );
}
