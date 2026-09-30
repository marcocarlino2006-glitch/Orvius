import Link from "next/link";
import { HomeLiveCall } from "@/components/home-live-call";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { isPreviewLive } from "@/lib/preview-live";

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
  const previewLive = isPreviewLive();
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
            Every call answered. Every customer booked.
          </h1>
          <p className="ov-hero-lead" data-i18n="hero.lead">
            Orvius is the AI front desk for any business that runs on the phone. It answers the calls you can&apos;t
            take, offers an open time from your schedule, and texts you what happened.
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
            {previewLive ? (
              <Link href="/try" className="ov-btn ov-btn--quiet ov-hero-cta-secondary" data-i18n="hero.try">
                Hear it as your business
              </Link>
            ) : (
              <Link
                href="/signin?mode=signup"
                className="ov-btn ov-btn--quiet ov-hero-cta-secondary"
                data-i18n="hero.start"
              >
                Get started
              </Link>
            )}
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
          <HomeLiveCall />
        </div>
      </div>
    </section>
  );
}
