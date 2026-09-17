/**
 * P7 — caller disputes what the AI wrote.
 * Trust failure: board answers with Call so the owner fixes the record.
 */

import { leadIsNotAJob } from "@/lib/lead-not-a-job";
import { leadWantsHuman } from "@/lib/lead-wants-human";

const DISPUTE =
  /(?:transcript|summary|notes?) (?:is |are )?(?:wrong|incorrect|inaccurate)|wrong (?:address|phone|name|service|urgency)|(?:that(?:'| i)?s|thats) not what i (?:said|meant)|ai (?:got|got it) wrong|caller (?:says|said) wrong|dispute(?:s|d)? (?:the )?(?:transcript|summary|capture)|correction needed|correct the (?:transcript|summary)|misheard|mis-?captured/i;

export function leadHasTranscriptDispute(lead: {
  notes?: string | null;
  serviceType?: string | null;
  address?: string | null;
}): boolean {
  if (leadIsNotAJob(lead) || leadWantsHuman(lead)) return false;
  const blob = `${lead.notes ?? ""} ${lead.serviceType ?? ""} ${lead.address ?? ""}`.trim();
  if (!blob) return false;
  return DISPUTE.test(blob);
}

/** Stamp an owner can write so the board picks the row up. */
export const TRANSCRIPT_DISPUTE_STAMP = "Caller disputes transcript — correction needed";
