import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * SpaceX / Cursor craft: one composition, brand first, no SaaS theater.
 * Full-bleed command plane. Massive quiet type. One primary action.
 */
export function HomeLineHero() {
  return (
    <section className="mkt-hero mkt-hero--command" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-plane" aria-hidden>
        <HomeProductPreview />
      </div>
      <div className="mkt-hero-veil" aria-hidden />

      <div className="editorial-wrap mkt-hero-content">
        <OrviusLogo variant="chalk" size="xl" className="mkt-hero-brand-lockup" />

        <h1 id="home-hero-heading" className="mkt-hero-title">
          Missed calls.
          <br />
          Booked jobs.
        </h1>

        <p className="mkt-hero-lead font-sans">
          After-hours and overflow — answered, qualified, booked, owner alerted.
        </p>

        <div className="mkt-hero-actions font-sans">
          <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-hero">
            Book a live call audit
          </Link>
          <a href={demoLineHref()} className="mkt-hero-phone">
            Call {DEMO_LINE_DISPLAY}
          </a>
        </div>
      </div>
    </section>
  );
}
