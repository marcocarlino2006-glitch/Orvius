import { OwnerAlertCard } from "@/components/owner-alert-card";

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
    <section className="shop-story" aria-labelledby="shop-story-heading">
      <div className="editorial-wrap shop-story-grid">
        <div className="shop-story-copy">
          <h2 id="shop-story-heading" className="shop-story-title font-sans">
            9:14 PM. Owner on a job. Phone still gets answered.
          </h2>
          <p className="shop-story-lead font-sans">
            This is what happened on Summit HVAC&apos;s line last night — not a
            pitch deck, an actual after-hours call.
          </p>

          <div className="shop-transcript font-sans" role="log" aria-label="Call transcript">
            <div className="shop-transcript-head">
              <span>Inbound · after hours</span>
              <span>2m 14s</span>
            </div>
            {transcript.map((row, index) => (
              <p
                key={index}
                className={`shop-transcript-line ${
                  "muted" in row && row.muted ? "shop-transcript-line-muted" : ""
                }`}
              >
                <span>{row.who}</span>
                {row.line}
              </p>
            ))}
            <p className="shop-transcript-foot">
              <span className="live-dot live-dot-green" aria-hidden />
              Qualified · owner SMS sent · lead in inbox
            </p>
          </div>
        </div>

        <div className="shop-story-alert">
          <p className="shop-story-alert-label font-sans">Owner phone · 9:16 PM</p>
          <OwnerAlertCard variant="chalk" className="shop-story-card" />
        </div>
      </div>
    </section>
  );
}
