import { MktSection } from "@/components/mkt-section";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { summitCaseStudy } from "@/lib/trust";

const transcript = [
  { who: "Orvius", line: "Thanks for calling Summit HVAC. How can I help?" },
  {
    who: "Caller",
    line: "My AC stopped cooling. Can someone come today?",
    muted: true,
  },
  {
    who: "Orvius",
    line: "I can help. What's the address and a callback number?",
  },
  { who: "Caller", line: "1842 Oak Street. 512-555-0123.", muted: true },
  {
    who: "Orvius",
    line: "Got it. I'll mark this same-day and check the next open window.",
  },
  {
    who: "Orvius",
    line: "Your proposed window will arrive by text for confirmation. The owner has your request.",
  },
] as const;

/**
 * HVAC example transcript — labeled as one trade workflow, not the whole platform.
 */
export function HomeCallStory() {
  return (
    <MktSection
      tone="inset"
      aria-labelledby="home-proof-heading"
      className="mkt-proof-section mkt-proof-section--company"
    >
      <div className="mkt-proof-layout mkt-proof-layout--company">
        <div className="mkt-proof-copy">
          <p className="mkt-proof-kicker font-sans">Example · HVAC</p>
          <h2 id="home-proof-heading" className="mkt-proof-title">
            Hear one trade workflow on the live line.
          </h2>
          <p className="mkt-proof-lead font-sans">
            The demo shop is HVAC so you can hear real after-hours intake. The
            same loop applies when the line is plumbing, electrical, or another
            trade — with that trade&apos;s language and emergency rules.
          </p>
          <div className="mkt-proof-actions font-sans">
            <a href={demoLineHref()} className="ov-btn ov-btn--solid">
              Call {DEMO_LINE_DISPLAY}
            </a>
          </div>
          <p className="mkt-proof-note font-sans">
            {summitCaseStudy.attribution}
          </p>
        </div>

        <div
          className="mkt-call-panel mkt-call-panel--company font-sans"
          role="log"
          aria-label="Example HVAC call transcript"
        >
          <p className="mkt-call-panel-kicker">
            Example workflow · HVAC · after hours
          </p>
          <p className="mkt-call-panel-title">Emergency AC · Summit HVAC</p>

          <div className="mkt-transcript">
            {transcript.map((row, index) => (
              <p
                key={index}
                className={`mkt-transcript-line ${
                  "muted" in row && row.muted ? "mkt-transcript-line-muted" : ""
                }`}
              >
                <span>{row.who}</span>
                {row.line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </MktSection>
  );
}
