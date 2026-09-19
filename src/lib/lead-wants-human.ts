/**
 * P2 — caller asked for a human.
 * Detectable from lead notes/service text so the board can answer with Call.
 */

const HUMAN_REQUEST =
  /(?:asked|ask(?:ing)?) for (?:a )?(?:person|human|someone|the owner|a manager)|talk to (someone|a person|a human|the owner|a manager|an? (?:real )?person)|speak to (someone|a person|a human|the owner|a manager)|(?:real|live) person|human please|want(?:s|ed)? (?:a )?callback|just a callback|call(?: me)? back|callback only|needs? (?:a )?callback|transfer (?:me )?to (?:someone|a person|the owner)/i;

export function leadWantsHuman(lead: {
  notes?: string | null;
  serviceType?: string | null;
}): boolean {
  const blob = `${lead.notes ?? ""} ${lead.serviceType ?? ""}`.trim();
  if (!blob) return false;
  return HUMAN_REQUEST.test(blob);
}
