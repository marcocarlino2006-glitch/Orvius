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
] as const;

export function HomeCallStory() {
  return (
    <section className="tier1-story" aria-labelledby="tier1-story-heading">
      <div className="editorial-wrap">
        <p className="tier1-eyebrow type-eyebrow">How it works</p>
        <h2 id="tier1-story-heading" className="tier1-section-title type-headline">
          After hours. Owner on a job. Line still answered.
        </h2>
        <p className="tier1-section-lead font-sans">
          Representative call · emergency AC · owner alerted in seconds.
        </p>

        <div className="tier1-transcript font-sans" role="log" aria-label="Call transcript">
          <div className="tier1-transcript-head">
            <span>Inbound · after hours</span>
            <span>2m 14s</span>
          </div>
          {transcript.map((row, index) => (
            <p
              key={index}
              className={`tier1-transcript-line ${
                "muted" in row && row.muted ? "tier1-transcript-line-muted" : ""
              }`}
            >
              <span>{row.who}</span>
              {row.line}
            </p>
          ))}
          <p className="tier1-transcript-foot">
            <span className="live-dot live-dot-green" aria-hidden />
            Qualified · owner notified · lead in inbox
          </p>
        </div>
      </div>
    </section>
  );
}
