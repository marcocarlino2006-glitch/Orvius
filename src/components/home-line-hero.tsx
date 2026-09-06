import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Presence bar: the live line IS the product.
 * Brand lockup → phone as artifact → one claim → one prove CTA.
 * No category eyebrow. No SaaS feature stack. No SpaceX cosplay.
 */
export function HomeLineHero() {
  return (
    <section className="mkt-hero mkt-hero--command" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-plane" aria-hidden>
        <HomeProductPreview />
      </div>
      <div className="mkt-hero-veil" aria-hidden />
      <div className="mkt-hero-grain" aria-hidden />

      <div className="editorial-wrap mkt-hero-content">
        <OrviusLogo variant="void" size="xl" className="mkt-hero-brand-lockup" />

        <a
          href={demoLineHref()}
          className="mkt-hero-live-line"
          aria-label={`Call the live Orvius line ${DEMO_LINE_DISPLAY}`}
        >
          <span className="mkt-hero-live-label font-sans">
            <span className="mkt-hero-live-pulse" aria-hidden />
            Live line
          </span>
          <span className="mkt-hero-live-number">{DEMO_LINE_DISPLAY}</span>
        </a>

        <h1 id="home-hero-heading" className="mkt-hero-title mkt-hero-title--absolute">
          The night shift
          <br />
          for the trades.
        </h1>

        <p className="mkt-hero-lead font-sans">
          After-hours and overflow answer, book, and alert — on your board by
          morning. You keep the overrides.
        </p>

        <div className="mkt-hero-actions font-sans">
          <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-hero">
            Prove it on your line
          </Link>
          <a href={demoLineHref()} className="mkt-hero-phone">
            Call it now
          </a>
        </div>
      </div>
    </section>
  );
}
