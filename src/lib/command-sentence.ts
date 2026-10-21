/**
 * The one sentence on Command. A decision waiting leads. A tally of zeros
 * never sits on top of real work, and never leads when the line is clear.
 */
import { spokenText } from "@/lib/spoken-name";

export type CommandSentenceInput = {
  loaded: boolean;
  brief: string | null;
  /** Someone is on the phone right now. That leads, ahead of anything waiting. */
  live: { who: string } | null;
  approval: { title: string; needsCheck: boolean } | null;
  item: {
    title: string;
    customer: string | null;
    nextAction: string | null;
    /** Omitted means the action still leads. False means the visit can speak. */
    needsYou?: boolean;
    when?: string | null;
    tech?: string | null;
    /** The caller spoke Spanish. The sentence says so. */
    spanish?: boolean;
  } | null;
  lastSummary: string | null;
  /** A real shop with nothing on the line yet. Sample and test shops leave this off. */
  lineOff?: boolean;
};

function isZeroDay(brief: string): boolean {
  return brief === "Today: 0 jobs booked, 0 completed." || brief === "Nothing on the board yet today." || brief === "No jobs on the board today.";
}

function finish(text: string): string {
  const trimmed = spokenText(text).trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function fromAction(action: string): string {
  const cut = action.replace(/\s+[—–-]\s+.*$/, "").trim();
  return finish(cut || action);
}

function isMoney(action: string | null): boolean {
  return Boolean(action && /pay|invoice|bill/i.test(action));
}

/** The visit, then the state of it. A wait is said. A clear visit says so. */
function quietLine(item: NonNullable<CommandSentenceInput["item"]>): string {
  const when = item.when!.trim();
  const title = spokenText(item.title).trim().replace(/[.!?]+$/, "");
  const tech = spokenText(item.tech).trim();
  const action = (item.nextAction ?? "").replace(/\s+[—–-]\s+.*$/, "").trim();
  const head = `${when}. ${title}`;
  if (/^waiting on\b/i.test(action)) return finish(`${head}. ${action}`);
  if (/^mark arrived$/i.test(action)) return finish(tech ? `${head}. ${tech} is on the way` : `${head}. On the way`);
  if (/^mark done$/i.test(action)) return finish(tech ? `${head}. ${tech} is there` : `${head}. On site`);
  return finish(tech ? `${head}. ${tech}. You're clear` : `${head}. You're clear`);
}

function inSpanish(text: string, spanish?: boolean): string {
  if (!spanish || /spanish/i.test(text)) return text;
  return `${text.replace(/[.!?]$/, "")}. They called in Spanish.`;
}

export function commandSentence(input: CommandSentenceInput): string {
  if (!input.loaded) return "Reading the shop…";
  if (input.live?.who.trim()) return `${spokenText(input.live.who).trim()} is on the line.`;
  if (input.approval) {
    const title = finish(input.approval.title);
    return input.approval.needsCheck ? `Check this. ${title}` : title || "Orvius is waiting on your OK.";
  }
  if (input.item) {
    const quietVisit = input.item.needsYou === false && Boolean(input.item.when?.trim()) && !isMoney(input.item.nextAction);
    const said = quietVisit
      ? quietLine(input.item)
      : input.item.nextAction
        ? fromAction(input.item.nextAction)
        : spokenText(input.item.customer).trim()
          ? `${spokenText(input.item.customer).trim()}. ${finish(input.item.title)}`
          : finish(input.item.title);
    return inSpanish(said, input.item.spanish);
  }
  if (input.lastSummary) return finish(input.lastSummary);
  const brief = input.brief?.trim() ?? "";
  if (input.lineOff && (!brief || isZeroDay(brief))) return "Connect the line. Orvius answers once it is on.";
  if (!brief || isZeroDay(brief)) return "The line is clear.";
  return brief;
}
