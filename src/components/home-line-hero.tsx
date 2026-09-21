import { HomeLiveCall } from "@/components/home-live-call";
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
 * The product carries the hero. One claim on the left, an after-hours call
 * running itself on the right — the thing a shop owner is actually buying.
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
      <div className="ov-hero-inner">
        <div className="ov-hero-copy">
          <p className="ov-hero-brand" aria-label="Orvius">
            Orvius
          </p>

          {/* Copy is owned by the i18n dictionary; keep these in sync with it so
              the translator never swaps the text out from under the render. */}
          <h1 id="home-hero-heading" className="ov-hero-title" data-i18n="hero.title">
            After-hours calls become qualified jobs.
          </h1>

          <p className="ov-hero-lead" data-i18n="hero.lead">
            Orvius answers after-hours and overflow calls, captures the request,
            proposes an open service window, and alerts the owner — without
            inventing prices or arrival times.
          </p>

          <div className="ov-hero-actions">
            <a
              href={demoLineHref()}
              className="ov-btn ov-btn--solid"
              data-i18n="hero.cta"
            >
              Call the live line
            </a>
          </div>

          <a
            href={demoLineHref()}
            className="ov-hero-liveline"
            aria-label={`Call the Orvius night shift line at ${DEMO_LINE_DISPLAY}`}
          >
            <span className="ov-hero-liveline-label">
              <span className="ov-hero-pulse" aria-hidden />
              <span data-i18n="hero.nightshift">Orvius answers the night shift</span>
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
