import { HomeLiveCall } from "@/components/home-live-call";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/*
  The number is the demo, so it is set as an artifact rather than a footnote:
  the digits rise in on a stagger the first time the hero paints, which reads as
  a line coming up rather than a string of text. Screen readers get the whole
  number from the link label instead of one character at a time.
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
 * Cursor silhouette on Orvius night: claim band top-left, product canvas
 * full-width below. Brand + one claim + dialable line — console owns the fold.
 */
export function HomeLineHero() {
  return (
    <section className="ov-hero ov-hero--atmosphere" aria-labelledby="home-hero-heading">
      <div className="ov-hero-sky" aria-hidden>
        <span className="ov-hero-sky-bloom" />
        <span className="ov-hero-sky-bloom-bay" />
        <span className="ov-hero-sky-grid" />
        <span className="ov-hero-sky-horizon" />
      </div>
      <div className="ov-hero-inner ov-hero-inner--product ov-hero-inner--poster">
        <div className="ov-hero-copy">
          <div className="ov-hero-brand" aria-label="Orvius">
            <OrviusLogo variant="void" size="lg" className="ov-hero-brand-logo" />
          </div>

          <h1 id="home-hero-heading" className="ov-hero-title" data-i18n="hero.title">
            After-hours calls become qualified jobs.
          </h1>

          <p className="ov-hero-lead" data-i18n="hero.lead">
            Proposes a window and alerts the owner — no invented prices.
          </p>

          <a
            href={demoLineHref()}
            className="ov-hero-liveline"
            aria-label={`Call the Orvius night shift line at ${DEMO_LINE_DISPLAY}`}
          >
            <span className="ov-hero-liveline-label">
              <span className="ov-hero-pulse" aria-hidden />
              <span data-i18n="hero.nightshift">Call the live line</span>
            </span>
            <LiveLineDigits display={DEMO_LINE_DISPLAY} />
          </a>
        </div>

        <div className="ov-hero-stage">
          <HomeLiveCall />
        </div>
      </div>
    </section>
  );
}
