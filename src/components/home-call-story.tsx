import Link from "next/link";
import { MktSection, MktSectionHeader } from "@/components/mkt-section";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { summitCaseStudy } from "@/lib/trust";

const transcript = [
  { who: "Orvius", line: "Thanks for calling Summit HVAC. How can I help?" },
  { who: "Caller", line: "My AC stopped cooling. Can someone come today?", muted: true },
  { who: "Orvius", line: "I can help. What's the address and a callback number?" },
  { who: "Caller", line: "1842 Oak Street. 512-555-0123.", muted: true },
  { who: "Orvius", line: "Treating this as an emergency. I'm notifying the owner now." },
  { who: "Orvius", line: "Booked for today. On the dispatch board — waiting for assign." },
] as const;

const timeline = [
  { t: "0:08", label: "Answered", detail: "Line picked up" },
  { t: "0:42", label: "Qualified", detail: "Emergency · address" },
  { t: "1:18", label: "Owner alert", detail: "SMS delivered" },
  { t: "2:01", label: "Booked", detail: "On the board" },
] as const;

const waveBars = [18, 28, 42, 34, 56, 48, 62, 40, 72, 58, 46, 68, 52, 38, 64, 44, 30, 54, 70, 36, 48, 60, 32, 50, 66, 42, 28, 55];

export function HomeCallStory() {
  return (
    <MktSection
      tone="inset"
      aria-labelledby="tier1-story-heading"
      className="mkt-proof-section mkt-mastery-section"
    >
      <div className="mkt-proof-layout mkt-proof-layout--mastery">
        <div className="mkt-proof-copy">
          <p className="mkt-proof-badge font-sans">
            Representative example · not a third-party case study
          </p>
          <MktSectionHeader
            kicker="Proof"
            title="Hear the product. Then measure your own line."
            lead={`${summitCaseStudy.name} is our labeled reference shop. The loop below is representative — call the live line for the real thing, or book an audit on your after-hours traffic.`}
            titleId="tier1-story-heading"
          />
          <div className="mkt-proof-actions font-sans">
            <a href={demoLineHref()} className="mkt-btn mkt-btn-ink mkt-btn-hero">
              Call {DEMO_LINE_DISPLAY}
            </a>
            <Link href="/pilot" className="mkt-btn mkt-btn-ghost mkt-btn-hero">
              Book a live call audit
            </Link>
          </div>
          <p className="mkt-proof-note font-sans">{summitCaseStudy.attribution}</p>
        </div>

        <div className="mkt-call-panel mkt-call-panel--mastery font-sans" role="log" aria-label="Representative call replay">
          <div className="mkt-call-panel-head">
            <div>
              <p className="mkt-call-panel-kicker">Representative call · after hours</p>
              <p className="mkt-call-panel-title">Emergency AC · Summit HVAC</p>
            </div>
            <div className="mkt-call-panel-status">
              <span className="mkt-live-dot" aria-hidden />
              <span>Recording</span>
              <span className="mkt-call-panel-duration">2m 14s</span>
            </div>
          </div>

          <div className="mkt-waveform mkt-waveform--live" aria-hidden>
            {waveBars.map((h, i) => (
              <span
                key={i}
                className={`mkt-waveform-bar ${i > 18 ? "mkt-waveform-bar-played" : ""}`}
                style={{ height: `${h}%`, animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>

          <ol className="mkt-call-timeline mkt-call-timeline--mastery">
            {timeline.map((step) => (
              <li key={step.label}>
                <span className="mkt-call-timeline-t">{step.t}</span>
                <strong>{step.label}</strong>
                <em>{step.detail}</em>
              </li>
            ))}
          </ol>

          <div className="mkt-transcript mkt-transcript-panel">
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

          <div className="mkt-transcript-foot mkt-transcript-foot--mastery">
            <span className="mkt-live-dot" aria-hidden />
            <span>Qualified</span>
            <span aria-hidden>·</span>
            <span>Owner notified</span>
            <span aria-hidden>·</span>
            <span>Booked</span>
            <span aria-hidden>·</span>
            <span>On the board</span>
          </div>
        </div>
      </div>
    </MktSection>
  );
}
