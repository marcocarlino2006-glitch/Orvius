/**
 * What an urgency is worth saying out loud.
 *
 * Every lead carries an urgency and most of them are routine, so a row that
 * prints its urgency unconditionally prints ROUTINE forty-seven times down a
 * list — the row telling you nothing, in caps, next to the row above it doing
 * the same. The rails ask these two questions instead, and stay quiet when the
 * answer is the default.
 */

/**
 * Urgencies that mean "nothing special". Callers arrive with whatever the
 * intake model wrote down, so match loosely rather than against an enum.
 */
const UNREMARKABLE = new Set([
  "routine",
  "flexible",
  "normal",
  "standard",
  "low",
  "none",
]);

/*
  Prefix rather than substring. The rails disagreed about this — the lead row
  tested for equality and the job row for `includes("emergency")` — and the
  intake model does write things like "emergency - no heat". Substring is the
  wrong generalisation, because "non-emergency" contains it.
*/
export function isEmergency(urgency: string | null | undefined) {
  const value = (urgency ?? "").trim().toLowerCase();
  return value === "emergency" || /^emergency[\s\-_]/.test(value);
}

/**
 * The urgency worth printing on a row, or null when it is the default.
 *
 * Emergency is excluded on purpose: a row that is an emergency already says so
 * in its kicker and its left edge, and a third copy in a pill was the reason
 * "EMERGENCY · RETURNING" sat above an EMERGENCY badge.
 */
export function notableUrgency(urgency: string | null | undefined) {
  const value = (urgency ?? "").trim().toLowerCase();
  if (!value || isEmergency(value) || UNREMARKABLE.has(value)) return null;
  return value.replace(/[-_]/g, " ");
}
