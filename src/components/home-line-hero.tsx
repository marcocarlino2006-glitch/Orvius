import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Raised bar: SpaceX absolute.
 * Brand. One sentence. One CTA. Product as atmosphere.
 * No category eyebrow. No SaaS theater.
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

        <h1 id="home-hero-heading" className="mkt-hero-title mkt-hero-title--absolute">
          Zero missed
          <br />
          jobs.
        </h1>

        <p className="mkt-hero-lead font-sans">
          After-hours demand is answered, booked, and run.
          You keep the overrides.
        </p>

        <div className="mkt-hero-actions font-sans">
          <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-hero">
            Prove it on your line
          </Link>
          <a href={demoLineHref()} className="mkt-hero-phone">
            Call {DEMO_LINE_DISPLAY}
          </a>
        </div>
      </div>
    </section>
  );
}
