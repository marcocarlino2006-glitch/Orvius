import Image from "next/image";
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
    <section className="ov-hero ov-hero--atmosphere ov-hero--center" aria-labelledby="home-hero-heading">
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
            Run your day in Orvius.
          </h1>
          <p className="ov-hero-lead" data-i18n="hero.lead">
            The receptionist answers your calls and brings in the work. Command schedules it, coordinates your people, follows up with customers and shows you what actually happened.
          </p>

          <div className="ov-hero-actions">
            <Link href="/watch" className="ov-btn ov-btn--solid ov-hero-cta-primary" data-i18n="hero.watch">
              Watch it run a shop
            </Link>
            <a
              href={demoLineHref()}
              className="ov-btn ov-btn--quiet ov-hero-cta-secondary"
              aria-label={`Call the Orvius night shift line at ${DEMO_LINE_DISPLAY}`}
              data-i18n="hero.cta"
            >
              Call the live line
            </a>
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

        <div className="ov-hero-stage ov-hero-stage--art">
          <Image
            src="/marketing/art/dusk.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 100vw, 76rem"
            className="ov-hero-art"
          />
          <HomeLiveCall />
        </div>
      </div>
    </section>
  );
}
