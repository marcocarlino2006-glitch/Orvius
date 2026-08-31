"use client";

type TranscriptCinemaProps = {
  transcript: string;
  variant?: "void" | "chalk";
  className?: string;
};

function parseTranscript(transcript: string) {
  return transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon > 0 && colon < 24) {
        return {
          speaker: line.slice(0, colon).trim(),
          text: line.slice(colon + 1).trim(),
        };
      }
      return { speaker: null, text: line };
    });
}

export function TranscriptCinema({
  transcript,
  variant = "chalk",
  className = "",
}: TranscriptCinemaProps) {
  const lines = parseTranscript(transcript);
  const isVoid = variant === "void";

  return (
    <div className={`transcript-cinema transcript-cinema-${variant} ${className}`}>
      <div className="transcript-cinema-head font-sans">
        <p className="transcript-cinema-kicker">Call transcript</p>
        <span className="transcript-cinema-live">
          <span className="home-os-live-dot" />
          Qualified
        </span>
      </div>
      <div className="transcript-cinema-body">
        {lines.map((line, index) => {
          const isAi =
            line.speaker?.toLowerCase().includes("orvius") ||
            line.speaker?.toLowerCase().includes("assistant");
          return (
            <p
              key={`${index}-${line.text.slice(0, 24)}`}
              className={`transcript-cinema-line font-sans ${
                isAi ? "transcript-cinema-line-ai" : "transcript-cinema-line-caller"
              }`}
            >
              {line.speaker ? (
                <span className="transcript-cinema-speaker">{line.speaker}</span>
              ) : null}
              {line.text}
            </p>
          );
        })}
      </div>
      <div className="transcript-cinema-foot font-sans">
        <span className="home-os-live-dot" />
        Lead captured · owner notified
      </div>
    </div>
  );
}
