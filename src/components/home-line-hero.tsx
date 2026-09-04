import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { company } from "@/lib/company";

export function HomeLineHero() {
  return (
    <section className="mkt-hero mkt-hero-split mkt-hero--depth" aria-labelledby="home-hero-heading">
      <div className="mkt-hero-wash" aria-hidden />
      <div className="mkt-hero-gridline" aria-hidden />
      <div className="mkt-hero-orb mkt-hero-orb--a" aria-hidden />
      <div className="mkt-hero-orb mkt-hero-orb--b" aria-hidden />

      <div className="editorial-wrap mkt-hero-grid">
        <div className="mkt-hero-copy">
          <div className="mkt-hero-brand">
            <OrviusLogo variant="chalk" size="xl" className="mkt-hero-brand-lockup" />
            <p className="mkt-hero-brand-sub font-sans">
              Answers missed calls. Books the job.
            </p>
          </div>

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
            <Link href="/pilot" className="mkt-btn mkt-btn-ink mkt-btn-hero">
              Book a live call audit
            </Link>
            <a href={demoLineHref()} className="mkt-btn mkt-btn-ghost mkt-btn-hero">
              Call {DEMO_LINE_DISPLAY}
            </a>
          </div>
        </div>

        <div className="mkt-hero-stage">
          <div className="mkt-hero-stage-glow" aria-hidden />
          <HomeProductPreview />
        </div>
      </div>
    </section>
  );
}
