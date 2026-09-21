import { MktSection } from "@/components/mkt-section";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";

/**
 * Cursor feature beat: short claim, product path is the number.
 * No second transcript competing with the hero canvas.
 */
export function HomeCallStory() {
  return (
    <MktSection
      tone="inset"
      aria-labelledby="home-proof-heading"
      className="mkt-proof-section mkt-proof-section--company mkt-proof-section--cursor"
    >
      <div className="mkt-cursor-feature">
        <div className="mkt-cursor-feature-copy">
          <h2 id="home-proof-heading" className="mkt-cursor-feature-title">
            Call the product. Hear the night shift.
          </h2>
          <p className="mkt-cursor-feature-lead font-sans">
            Same intake the console runs — propose a window, alert the owner,
            confirm by text.
          </p>
          <a href={demoLineHref()} className="mkt-cursor-feature-link font-sans">
            {DEMO_LINE_DISPLAY}
            <span aria-hidden> →</span>
          </a>
        </div>
      </div>
    </MktSection>
  );
}
