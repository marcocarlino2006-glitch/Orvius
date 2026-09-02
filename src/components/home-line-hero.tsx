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
            <b>Assign</b>
          </div>
          <div className="home-bleed-stage-row">
            <i />
            <em>After-hours lead</em>
            <b>Inbox</b>
          </div>
          <div className="home-bleed-stage-row">
            <i />
            <em>Job · Oak St</em>
            <b>En route</b>
          </div>
          <div className="home-bleed-stage-row">
            <i />
            <em>Estimate draft</em>
            <b>Money</b>
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
        <p className="home-hero-eyebrow type-eyebrow font-sans">
          Live demo · {company.trades.join(" · ")}
        </p>

        <h1 id="home-hero-heading" className="home-hero-brand type-display">
          {company.productName}
        </h1>

        <p className="home-hero-tagline font-sans">{company.tagline}</p>

        <a href={demoLineHref()} className="home-hero-phone type-phone">
          {DEMO_LINE_DISPLAY}
        </a>

        <div className="home-hero-actions font-sans">
          <a href={demoLineHref()} className="inst-btn inst-btn-primary">
            Call live demo
          </a>
          <Link href="/login" className="inst-btn inst-btn-ghost">
            Start free
          </Link>
        </div>
      </div>
    </section>
  );
}
