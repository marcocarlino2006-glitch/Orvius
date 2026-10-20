/**
 * The one sentence on Command. A decision waiting leads. A tally of zeros
 * never sits on top of real work, and never leads when the line is clear.
 */

export type CommandSentenceInput = {
  loaded: boolean;
  brief: string | null;
  approval: { title: string; needsCheck: boolean } | null;
  item: { title: string; customer: string | null; nextAction: string | null } | null;
  lastSummary: string | null;
};

function isZeroDay(brief: string): boolean {
  return brief === "Today: 0 jobs booked, 0 completed." || brief === "Nothing on the board yet today." || brief === "No jobs on the board today.";
}

function finish(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function fromAction(action: string): string {
  const cut = action.replace(/\s+[—–-]\s+.*$/, "").trim();
  return finish(cut || action);
}

export function commandSentence(input: CommandSentenceInput): string {
  if (!input.loaded) return "Reading the shop…";
  if (input.approval) {
    const title = finish(input.approval.title);
    return input.approval.needsCheck ? `Check this. ${title}` : title || "Orvius is waiting on your OK.";
  }
  if (input.item) {
    if (input.item.nextAction) return fromAction(input.item.nextAction);
    const who = input.item.customer?.trim();
    return who ? `${who}. ${finish(input.item.title)}` : finish(input.item.title);
  }
  if (input.lastSummary) return finish(input.lastSummary);
  const brief = input.brief?.trim() ?? "";
  if (!brief || isZeroDay(brief)) return "The line is clear.";
  return brief;
}
