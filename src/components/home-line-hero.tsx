import Link from "next/link";
import { HomeLiveCall } from "@/components/home-live-call";
import { StageWorld } from "@/components/stage-world";
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
 * Product canvas hero: one claim, one lead, two clear actions, live night-shift
 * call as the HVAC example workflow — StageWorld stays behind the console.
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
            After-hours service calls become qualified jobs.
          </h1>

          <p className="ov-hero-lead font-sans" data-i18n="hero.lead">
            Orvius answers missed and after-hours calls for HVAC, plumbing,
            electrical, and other trades. It understands the request, captures
            the customer&apos;s details, checks urgency and service area, books
            or escalates the job, alerts the team, and tracks the opportunity
            toward completed and paid work.
          </p>

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
              Book a live call audit
            </Link>
          </div>

          <a
            href={demoLineHref()}
            className="ov-hero-liveline"
            aria-label={`Dial the night shift live line ${DEMO_LINE_DISPLAY}`}
          >
            <span className="ov-hero-liveline-label">
              <span className="ov-hero-pulse" aria-hidden />
              <span data-i18n="hero.liveline">Night shift · live line</span>
            </span>
            <LiveLineDigits display={DEMO_LINE_DISPLAY} />
          </a>
        </div>

        <div className="ov-hero-stage">
          <StageWorld />
          <HomeLiveCall />
        </div>
      </div>
    </section>
  );
}
