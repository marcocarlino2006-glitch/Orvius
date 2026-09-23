import { MktSection } from "@/components/mkt-section";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Quiet close — dial path only. Hero console already carries the proof
 * (Cursor: don’t restage the product twice).
 */
export function HomeCallStory() {
  return (
    <MktSection
      tone="inset"
      aria-labelledby="home-proof-heading"
      className="mkt-proof-section mkt-proof-section--company mkt-proof-section--quiet"
    >
      <div className="mkt-close-block">
        <h2 id="home-proof-heading" className="mkt-proof-title">
          Call the product. Hear the night shift.
        </h2>
        <p className="mkt-proof-lead font-sans">
          Same intake the console shows — propose a window, alert the owner,
          confirm by text.
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
