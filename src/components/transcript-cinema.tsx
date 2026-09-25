"use client";

import { parseTranscript } from "@/lib/transcript";

type TranscriptCinemaProps = {
  transcript: string;
  variant?: "void" | "chalk";
  className?: string;
};

export function TranscriptCinema({
  transcript,
  variant = "chalk",
  className = "",
}: TranscriptCinemaProps) {
  const lines = parseTranscript(transcript);
  const turns = lines.filter((line) => line.role !== "unknown").length;

  return (
    <div className={`transcript-cinema transcript-cinema-${variant} ${className}`}>
      <div className="transcript-cinema-head font-sans">
        <p className="transcript-cinema-kicker">Call transcript</p>
        {turns ? (
          <span className="transcript-cinema-live">
            {turns} turn{turns === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      <div className="transcript-cinema-body">
        {lines.map((line, index) => (
          <p
            key={`${index}-${line.text.slice(0, 24)}`}
            className={`transcript-cinema-line font-sans ${
              line.role === "ai" ? "transcript-cinema-line-ai" : "transcript-cinema-line-caller"
            }`}
          >
            {line.speaker ? (
              <span className="transcript-cinema-speaker">
                {line.role === "ai" ? "Orvius" : line.role === "caller" ? "Caller" : line.speaker}
              </span>
            ) : null}
            {line.text}
          </p>
        ))}
      </div>
    </div>
  );
}
