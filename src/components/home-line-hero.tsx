import Link from "next/link";
import { HomeLiveCall } from "@/components/home-live-call";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/*
  Digits rise in on a stagger — the line comes up as an artifact, not a string.
  Screen readers get the whole number from the link label.
*/
function LiveLineDigits({ display }: { display: string }) {
  let digitIndex = 0;
  return (
    <span className="ov-hero-liveline-number" aria-hidden>
      {Array.from(display).map((char, i) => {
        if (char === " ") {
          return (
            <span key={i} className="ov-hero-liveline-gap">
              {"\u00A0"}
            </span>
          );
        }
        const delay = digitIndex++ * 45;
        return (
          <span
            key={i}
            className="ov-hero-liveline-digit"
            style={{ animationDelay: `${delay}ms` }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Cursor silhouette: claim + two CTAs, then full-width product canvas.
 * Brand lives in the nav — not restated above the headline.
 * Dialable live line stays as the proof Cursor can’t ship.
 */
export function HomeLineHero() {
  return (
    <section className="ov-hero ov-hero--atmosphere" aria-labelledby="home-hero-heading">
      <div className="ov-hero-sky" aria-hidden>
        <span className="ov-hero-sky-plane" />
        <span className="ov-hero-sky-bloom" />
        <span className="ov-hero-sky-bloom-bay" />
        <span className="ov-hero-sky-grid" />
        <span className="ov-hero-sky-horizon" />
        <span className="ov-hero-sky-grain" />
      </div>
      <div className="ov-hero-inner ov-hero-inner--product ov-hero-inner--poster">
        <div className="ov-hero-copy">
          <h1 id="home-hero-heading" className="ov-hero-title" data-i18n="hero.title">
            After-hours calls become qualified jobs.
          </h1>

          <div className="ov-hero-actions">
            <a
              href={demoLineHref()}
              className="ov-btn ov-btn--solid ov-hero-cta-primary"
              aria-label={`Call the Orvius night shift line at ${DEMO_LINE_DISPLAY}`}
              data-i18n="hero.cta"
            >
              Call the live line
            </a>
            <Link
              href="/pilot"
              className="ov-btn ov-btn--quiet ov-hero-cta-secondary"
              data-i18n="hero.demo"
            >
              Request a demo
            </Link>
          </div>

          <a
            href={demoLineHref()}
            className="ov-hero-liveline"
            aria-label={`Dial ${DEMO_LINE_DISPLAY}`}
          >
            <span className="ov-hero-liveline-label">
              <span className="ov-hero-pulse" aria-hidden />
              <span>Live line</span>
            </span>
            <LiveLineDigits display={DEMO_LINE_DISPLAY} />
          </a>
        </div>

        <div className="ov-hero-stage">
          <div className="ov-stage-world" aria-hidden>
            <span className="ov-stage-world-sky" />
            <span className="ov-stage-world-haze" />
            <span className="ov-stage-world-land" />
          </div>
          <HomeLiveCall />
        </div>
      </div>
    </section>
  );
}
