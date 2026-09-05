import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { company } from "@/lib/company";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Revolutionary thesis, SpaceX restraint.
 * Brand first. Category claim. Wedge as proof. One CTA.
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

        <p className="mkt-hero-category font-sans">{company.categoryClaim}</p>

        <h1 id="home-hero-heading" className="mkt-hero-title">
          The shop that
          <br />
          never sleeps.
        </h1>

        <p className="mkt-hero-lead font-sans">
          {company.proofLine} After-hours demand answered, booked, and run —
          you stay in command.
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
