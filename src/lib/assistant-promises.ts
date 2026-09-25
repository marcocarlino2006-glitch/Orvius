import { parseTranscript } from "@/lib/transcript";

export type AssistantPromiseKind = "price" | "arrival" | "warranty";

export type AssistantPromise = { kind: AssistantPromiseKind; quote: string };

const PRICE = /\$\s?\d[\d,]*(?:\.\d{2})?|\b\d+\s?(?:dollars|bucks)\b/i;
const ARRIVAL =
  /\b(?:within|in)\s+(?:the\s+)?(?:next\s+)?(?:an?\s+|\d+\s*(?:-|to)?\s*\d*\s*)?(?:hour|hours|minutes|mins)\b|\b(?:be|get)\s+(?:there|out|to you)\s+(?:by|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i;
const WARRANTY = /\b(?:warranty|warrantied|guarantee[ds]?|free of charge|no charge|waive[ds]?)\b/i;
const HEDGE = /\b(?:can(?:no|')t|cannot|won'?t|not able to|unable to|don'?t)\s+(?:\w+\s+){0,3}(?:quote|promise|guarantee|confirm|say)\b/i;

function clip(text: string, max = 70): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * Commitments the receptionist voiced that the shop never approved: dollar
 * figures, arrival windows, warranty or no-charge promises. Lines where it
 * explicitly declines to commit are ignored.
 */
export function detectAssistantPromises(transcript: string | null | undefined): AssistantPromise[] {
  const found: AssistantPromise[] = [];
  const seen = new Set<AssistantPromiseKind>();
  for (const line of parseTranscript(transcript)) {
    if (line.role !== "ai" || HEDGE.test(line.text)) continue;
    for (const [kind, pattern] of [
      ["price", PRICE],
      ["arrival", ARRIVAL],
      ["warranty", WARRANTY],
    ] as const) {
      if (seen.has(kind) || !pattern.test(line.text)) continue;
      seen.add(kind);
      found.push({ kind, quote: clip(line.text) });
    }
  }
  return found;
}

const LABEL: Record<AssistantPromiseKind, string> = {
  price: "a price",
  arrival: "an arrival time",
  warranty: "warranty or no-charge terms",
};

export function describeAssistantPromises(promises: AssistantPromise[]): string | null {
  if (!promises.length) return null;
  const kinds = promises.map((p) => LABEL[p.kind]);
  const list = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0];
  return `Check: receptionist mentioned ${list} — "${promises[0].quote}"`;
}
