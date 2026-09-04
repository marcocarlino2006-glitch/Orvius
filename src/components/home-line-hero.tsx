import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * First viewport = one composition.
 * Brand is the hero signal. Command board is the full-bleed plane.
 * No cream orbs, no floating product card, no promo chips.
 */
export function HomeLineHero() {
  return (
    <section className="mkt-hero mkt-hero--command" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-plane" aria-hidden>
        <HomeProductPreview />
      </div>
      <div className="mkt-hero-veil" aria-hidden />
      <div className="mkt-hero-scan" aria-hidden />

      <div className="editorial-wrap mkt-hero-content">
        <OrviusLogo variant="chalk" size="xl" className="mkt-hero-brand-lockup" />

        <h1 id="home-hero-heading" className="mkt-hero-title">
          Turn missed calls into booked jobs.
        </h1>

        <p className="mkt-hero-lead font-sans">
          Orvius answers after-hours and overflow calls, qualifies, books, and alerts
          the owner — while your crew stays on the tools.
        </p>

        <div className="mkt-hero-actions font-sans">
          <Link href="/pilot" className="mkt-btn mkt-btn-copper mkt-btn-hero">
            Book a live call audit
          </Link>
          <a href={demoLineHref()} className="mkt-btn mkt-btn-ghost-light mkt-btn-hero">
            Call {DEMO_LINE_DISPLAY}
          </a>
        </div>
      </div>
    </section>
  );
}
