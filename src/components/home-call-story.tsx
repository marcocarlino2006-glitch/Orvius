import { MktSection } from "@/components/mkt-section";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Institution close — one sentence of inevitability, then the line.
 * No second transcript. The hero console already carries the proof.
 */
export function HomeCallStory() {
  return (
    <MktSection
      tone="inset"
      aria-labelledby="home-proof-heading"
      className="mkt-proof-section mkt-proof-section--company mkt-proof-section--quiet mkt-proof-section--close"
    >
      <div className="mkt-close-block">
        <h2 id="home-proof-heading" className="mkt-proof-title mkt-proof-title--display">
          Call the product.
        </h2>
        <p className="mkt-proof-lead font-sans">
          Same intake the console shows — propose, alert, confirm.
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
