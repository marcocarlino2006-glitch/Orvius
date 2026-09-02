import { MktSection, MktSectionHeader } from "@/components/mkt-section";
import { demoLineHref } from "@/lib/demo-line";

const transcript = [
  { who: "Orvius", line: "Summit HVAC — how can I help?" },
  { who: "Caller", line: "AC stopped. Need someone today.", muted: true },
  { who: "Orvius", line: "Address and callback number?" },
  { who: "Caller", line: "1842 Oak St · 512-555-0123.", muted: true },
  { who: "Orvius", line: "Emergency — notifying owner now." },
  { who: "Orvius", line: "Booked today. On dispatch — awaiting assign." },
] as const;

export function HomeCallStory() {
  return (
    <MktSection tone="light" aria-labelledby="tier1-story-heading">
      <div className="mkt-story-split">
        <MktSectionHeader
          kicker="Proof"
          title="One emergency call. Fully handled."
          lead="Call the live line — same loop, your ears."
          titleId="tier1-story-heading"
        />
        <a href={demoLineHref()} className="mkt-btn mkt-btn-signal mkt-btn-sm mkt-story-cta">
          Try the live line
        </a>
      </div>

      <div className="mkt-transcript font-sans" role="log" aria-label="Call transcript">
        <div className="mkt-transcript-head">
          <span>Inbound · after hours</span>
          <span>2m 14s</span>
        </div>
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
        <p className="mkt-transcript-foot">
          <span className="mkt-live-dot" aria-hidden />
          Qualified · owner notified · booked · on board
        </p>
      </div>
    </MktSection>
  );
}
