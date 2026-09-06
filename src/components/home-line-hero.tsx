import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Cursor craft, Orvius identity.
 * Claim + live line + CTA, then a lit product stage that shows real work density.
 * Desktop: product as edge plane. Mobile: product band under CTAs (no underlay crash).
 */
export function HomeLineHero() {
  const digits = DEMO_LINE_DISPLAY.replace(/\s+/g, " ").split("");

  return (
    <section
      className="mkt-hero mkt-hero--bleed mkt-hero--cursor"
      aria-labelledby="home-hero-heading"
    >
      <div className="mkt-hero-void" aria-hidden />
      <div className="mkt-hero-grid" aria-hidden />
      <div className="mkt-hero-grain" aria-hidden />

      <div className="mkt-hero-product-plane mkt-hero-product-plane--desktop" aria-hidden>
        <div className="mkt-hero-product-veil" />
        <HomeProductPreview stage />
      </div>

      <div className="mkt-hero-stack">
        <div className="mkt-hero-foreground">
          <OrviusLogo
            variant="void"
            size="xl"
            className="mkt-hero-brand-lockup"
          />

          <h1 id="home-hero-heading" className="mkt-hero-title mkt-hero-title--bleed">
            The night shift
            <br />
            for the trades.
          </h1>

          <p className="mkt-hero-lead font-sans">
            After-hours and overflow answer, book, and alert — on your board by
            morning. You keep the overrides.
          </p>

          <a
            href={demoLineHref()}
            className="mkt-hero-live-line mkt-hero-live-line--bleed"
            aria-label={`Call the live Orvius line ${DEMO_LINE_DISPLAY}`}
          >
            <span className="mkt-hero-live-label font-sans">
              <span className="mkt-hero-live-pulse" aria-hidden />
              Live line
            </span>
            <span className="mkt-hero-live-number" aria-hidden>
              {digits.map((ch, i) => (
                <span
                  key={`${ch}-${i}`}
                  className="mkt-hero-live-digit"
                  style={{ animationDelay: `${0.1 + i * 0.02}s` }}
                >
                  {ch === " " ? "\u00A0" : ch}
                </span>
              ))}
            </span>
            <span className="sr-only">{DEMO_LINE_DISPLAY}</span>
          </a>

          <div className="mkt-hero-actions font-sans">
            <Link href="/pilot" className="mkt-btn mkt-btn-chalk mkt-btn-hero">
              Prove it on your line
            </Link>
            <a href={demoLineHref()} className="mkt-hero-phone">
              Call it now
            </a>
          </div>
        </div>

        <div className="mkt-hero-product-band" aria-hidden>
          <div className="mkt-hero-product-frame">
            <HomeProductPreview stage />
          </div>
        </div>
      </div>
    </section>
  );
}
