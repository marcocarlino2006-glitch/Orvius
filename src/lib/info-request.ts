/**
 * A question about the shop — hours, location, what it covers — rather than a
 * service problem. It needs an answer, not a technician, so it is held to a
 * different standard than a booking: no address or problem is "missing".
 *
 * Deliberately narrow: any reported problem, any recognised service category,
 * or an address means it is treated as a service request as before.
 */
const INFO_QUESTION =
  /\b(?:what time|when) (?:are|do|does) (?:you|y'?all|the shop|your (?:shop|office)) (?:open|close)\b|\b(?:business|opening|office|shop|your) hours\b|\bare you (?:guys )?open\b|\b(?:you|y'?all) open (?:on |this |today|tomorrow|now|late|weekends?|saturdays?|sundays?)|\bopen on (?:the )?(?:weekends?|saturdays?|sundays?|holidays?)\b|\bwhere (?:are you|is your (?:shop|office)) located\b|\bwhat(?:'s| is) your address\b|\bdo you (?:guys )?(?:service|serve|cover|come out to|work in)\b|\b(?:horario|a qu[eé] hora abren)\b/i;

export function isInformationOnlyRequest(lead: {
  serviceType?: string | null;
  categoryCode?: string | null;
  address?: string | null;
  notes?: string | null;
  callerWords?: string | null;
}): boolean {
  if (lead.serviceType?.trim()) return false;
  if (lead.address?.trim()) return false;
  if (lead.categoryCode && !lead.categoryCode.startsWith("other.")) return false;
  return INFO_QUESTION.test(`${lead.notes ?? ""}\n${lead.callerWords ?? ""}`);
}
