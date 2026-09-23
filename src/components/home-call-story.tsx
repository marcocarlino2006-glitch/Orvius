import { MktSection } from "@/components/mkt-section";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Quiet close — dial path only. Hero console already carries the HVAC example
 * (don’t restage the product twice).
 */
export function HomeCallStory() {
  return (
    <MktSection
      tone="inset"
      aria-labelledby="home-proof-heading"
      className="mkt-proof-section mkt-proof-section--company mkt-proof-section--quiet"
    >
      <div className="mkt-close-block">
        <p className="mkt-proof-kicker font-sans">Example · HVAC on the live line</p>
        <h2 id="home-proof-heading" className="mkt-proof-title">
          Call the product. Hear one trade workflow.
        </h2>
        <p className="mkt-proof-lead font-sans">
          The demo is HVAC so you can hear real after-hours intake. Plumbing,
          electrical, and other trades use the same loop — with their own
          language and emergency rules.
        </p>
        <a
          href={demoLineHref()}
          className="mkt-close-line font-sans"
          aria-label={`Call the Orvius night shift line at ${DEMO_LINE_DISPLAY}`}
        >
          {DEMO_LINE_DISPLAY}
        </a>
      </div>
    </MktSection>
  );
}
