import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { company } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="mkt-hero mkt-hero-split" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-wash" aria-hidden />

      <div className="editorial-wrap mkt-hero-grid">
        <div className="mkt-hero-copy">
          <p className="mkt-eyebrow font-sans">
            <span className="mkt-live-dot" aria-hidden />
            Live for {company.trades.join(" · ")}
          </p>

          <h1 id="home-hero-heading" className="mkt-hero-title">
            Turn missed calls into booked jobs.
          </h1>

          <p className="mkt-hero-lead font-sans">
            Orvius answers after-hours and overflow calls, qualifies the customer, books the job,
            and alerts the owner — while your crew stays on the tools.
          </p>

          <div className="mkt-hero-actions font-sans">
            <Link href="/pilot" className="mkt-btn mkt-btn-ink mkt-btn-pill">
              Book a live call audit
            </Link>
            <a href={demoLineHref()} className="mkt-btn mkt-btn-ghost mkt-btn-pill">
              Call {DEMO_LINE_DISPLAY}
            </a>
          </div>
        </div>

        <HomeProductPreview />
      </div>
    </section>
  );
}
