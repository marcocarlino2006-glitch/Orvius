import { MktSection, MktSectionHeader } from "@/components/mkt-section";

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
  {
    who: "Caller",
    line: "1842 Oak Street. 512-555-0123.",
    muted: true,
  },
  {
    who: "Orvius",
    line: "Treating this as an emergency. I'm notifying the owner now.",
  },
  {
    who: "Orvius",
    line: "Booked for today. On the dispatch board — waiting for assign.",
  },
] as const;

export function HomeCallStory() {
  return (
    <MktSection tone="inset" aria-labelledby="tier1-story-heading">
      <MktSectionHeader
        kicker="Hear it"
        title="After hours. Owner on a job. Line still answered."
        lead="Representative emergency call — qualify, alert, book, board. Call the live line to hear the same loop."
        titleId="tier1-story-heading"
      />

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
          Qualified · owner notified · booked · on the board
        </p>
      </div>
    </MktSection>
  );
}
