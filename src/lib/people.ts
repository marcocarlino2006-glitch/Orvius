/** "maria.lopez@shop.com" → "Maria". Team members sign in with an email and have no other name on file. */
export function personName(email: string | null | undefined): string {
  const local = email?.split("@")[0]?.trim() ?? "";
  const first = local.split(/[._+-]/).find((part) => /^[a-z]{2,}$/i.test(part));
  if (!first) return local || "Someone";
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

/** What to call a teammate in a picker: the first name, or the email when two people share it. */
export function teammateLabel(email: string, everyone: ReadonlyArray<{ email: string }>): string {
  const name = personName(email);
  return everyone.filter((p) => personName(p.email) === name).length > 1 ? email : name;
}

/** The person who did something, as the viewer reads it. */
export function actorName(email: string | null | undefined, viewerEmail: string | null | undefined): string {
  if (email && viewerEmail && email.toLowerCase() === viewerEmail.toLowerCase()) return "You";
  return personName(email);
}
