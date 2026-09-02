import Link from "next/link";
import {
  DEMO_LINE_DISPLAY,
  demoLineHref,
} from "@/lib/demo-line";
import { company } from "@/lib/company";

/** Full-bleed command atmosphere — product plane, not a floating card. */
function HomeHeroStage() {
  return (
    <div className="home-bleed-stage" aria-hidden>
      <div className="home-bleed-stage-wash" />
      <div className="home-bleed-stage-board">
        <div className="home-bleed-stage-rail">
          <span />
          <span />
          <span />
        </div>
        <div className="home-bleed-stage-rows">
          <div className="home-bleed-stage-row home-bleed-stage-row-hot">
            <i />
            <em>Emergency · AC down</em>
            <b>Booked</b>
          </div>
          <div className="home-bleed-stage-row">
            <i />
            <em>After-hours lead</em>
            <b>Qualified</b>
          </div>
          <div className="home-bleed-stage-row">
            <i />
            <em>Owner alert sent</em>
            <b>SMS</b>
          </div>
          <div className="home-bleed-stage-row">
            <i />
            <em>On the board</em>
            <b>Dispatch</b>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HomeLineHero() {
  return (
    <section
      className="home-hero-bleed"
      aria-labelledby="home-hero-heading"
    >
      <HomeHeroStage />

      <div className="editorial-wrap home-hero-content">
        <p className="home-hero-brand-line type-wordmark">{company.productName}</p>

        <h1 id="home-hero-heading" className="home-hero-outcome type-headline">
          Turn missed calls into booked jobs.
        </h1>

        <p className="home-hero-support font-sans">
          Orvius answers after-hours and overflow calls, qualifies the customer,
          books the appointment, and alerts the owner while the crew is working.
        </p>

        <a href={demoLineHref()} className="home-hero-phone type-phone">
          {DEMO_LINE_DISPLAY}
        </a>

        <div className="home-hero-actions font-sans">
          <Link href="/pilot" className="inst-btn inst-btn-primary">
            Book a live call audit
          </Link>
          <a href={demoLineHref()} className="inst-btn inst-btn-ghost">
            Try the live line
          </a>
        </div>
      </div>
    </section>
  );
}
