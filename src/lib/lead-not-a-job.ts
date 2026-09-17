/**
 * P3 — not a real job for this shop (spam, sales, OOA, wrong trade).
 */

const NOT_A_JOB =
  /not a job|out of (?:service )?area|outside (?:our )?area|wrong trade|spam\s*\/\s*sales|sales call|robocall|wrong number/i;

export function leadIsNotAJob(lead: {
  categoryCode?: string | null;
  notes?: string | null;
  serviceType?: string | null;
}): boolean {
  if (lead.categoryCode === "other.non_service") return true;
  const blob = `${lead.notes ?? ""} ${lead.serviceType ?? ""}`.trim();
  if (!blob) return false;
  return NOT_A_JOB.test(blob);
}
