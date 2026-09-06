import Link from "next/link";
import { HomeProductPreview } from "@/components/home-product-preview";
import { OrviusLogo } from "@/components/orvius-logo";
import { company } from "@/lib/company";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Institutional presence — brand and category claim lead.
 * Live line is the product artifact under the claim, not a call-center landing page.
 * Command plane is readable depth — never a floating SaaS card.
 */
export function HomeLineHero() {
  const digits = DEMO_LINE_DISPLAY.replace(/\s+/g, " ").split("");

  return (
    <section
      className="mkt-hero mkt-hero--command"
      aria-labelledby="home-hero-heading"
    >
      <div className="mkt-hero-plane" aria-hidden>
        <HomeProductPreview atmosphere />
      </div>
      <div className="mkt-hero-veil" aria-hidden />
      <div className="mkt-hero-grain" aria-hidden />

      <div className="editorial-wrap mkt-hero-content">
        <p className="mkt-hero-entity font-sans">{company.legalName}</p>

        <OrviusLogo
          variant="void"
          size="xl"
          className="mkt-hero-brand-lockup"
        />

        <h1
          id="home-hero-heading"
          className="mkt-hero-title mkt-hero-title--absolute"
        >
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
          className="mkt-hero-live-line"
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
                style={{ animationDelay: `${0.14 + i * 0.028}s` }}
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
    </section>
  );
}
