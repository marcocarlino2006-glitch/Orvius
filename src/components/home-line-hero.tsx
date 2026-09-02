import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { company } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="mkt-hero mkt-hero-editorial" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-wash" aria-hidden />

      <div className="editorial-wrap">
        <div className="mkt-hero-stack">
          <p className="mkt-eyebrow font-sans">
            <span className="mkt-live-dot" aria-hidden />
            Live demo line
          </p>

          <h1 id="home-hero-heading" className="mkt-hero-title">
            Turn missed calls into booked jobs.
          </h1>

          <p className="mkt-hero-lead font-sans">
            Orvius is the AI operating system for {company.trades.join(", ").toLowerCase()} shops.
            After-hours and overflow calls get answered, qualified, booked, and pushed to the owner —
            while your crew stays on the tools.
          </p>

          <div className="mkt-hero-actions font-sans">
            <Link href="/pilot" className="mkt-btn mkt-btn-ink">
              Book a live call audit
            </Link>
            <a href={demoLineHref()} className="mkt-btn mkt-btn-ghost">
              Call {DEMO_LINE_DISPLAY}
            </a>
          </div>
        </div>

        <HomeProductPreview />
      </div>
    </section>
  );
}
