export type TranscriptRole = "ai" | "caller" | "unknown";

export type TranscriptLine = {
  speaker: string | null;
  role: TranscriptRole;
  text: string;
};

const AI_SPEAKER = /^(ai|assistant|bot|agent|orvius|receptionist)\b/i;
const CALLER_SPEAKER = /^(user|customer|caller|client)\b/i;

/** Vapi writes `AI:` / `User:`; demo and imported calls use `Orvius:` / `Caller:`. */
export function parseTranscript(transcript: string | null | undefined): TranscriptLine[] {
  if (!transcript) return [];
  return transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon > 0 && colon < 24) {
        const speaker = line.slice(0, colon).trim();
        const role: TranscriptRole = AI_SPEAKER.test(speaker) || /orvius|assistant/i.test(speaker)
          ? "ai"
          : CALLER_SPEAKER.test(speaker)
            ? "caller"
            : "unknown";
        return { speaker, role, text: line.slice(colon + 1).trim() };
      }
      return { speaker: null, role: "unknown" as const, text: line };
    });
}

/**
 * Only what the caller said. The receptionist's own lines are excluded because
 * it recites safety scripts ("if you smell gas, leave the home") on routine calls.
 */
export function callerWords(transcript: string | null | undefined): string {
  return parseTranscript(transcript)
    .filter((line) => line.role === "caller")
    .map((line) => line.text)
    .join(" \n ");
}
