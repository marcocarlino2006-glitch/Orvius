export const SPANISH_LINE = "Para español, hable en español.";

export function hasSpanishLine(greeting: string | null | undefined) {
  return Boolean(greeting?.includes(SPANISH_LINE));
}

/*
  The Spanish line goes before the closing question, so the recording notice
  and "How can I help?" still come last and the caller answers in the
  language they choose.
*/
export function withSpanishLine(greeting: string | null | undefined, shopName: string, on: boolean): string {
  const base = (greeting?.trim() || `Thank you for calling ${shopName}. How can I help you today?`).replace(SPANISH_LINE, "").replace(/\s{2,}/g, " ").trim();
  if (!on) return base;
  const question = base.match(/^(.*[.!])\s+([^.!?]+\?)$/);
  return question ? `${question[1]} ${SPANISH_LINE} ${question[2]}` : `${base} ${SPANISH_LINE}`;
}
