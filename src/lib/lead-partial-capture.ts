/**
 * P4 — hang-up mid-capture.
 * Partial leads need a callback to finish intake, not a booking qualify CTA.
 */

import { leadIsNotAJob } from "@/lib/lead-not-a-job";
import { leadWantsHuman } from "@/lib/lead-wants-human";

const PARTIAL_STAMP =
  /hung up mid-call|hang[ -]?up mid|partial capture|incomplete capture|caller hung up/i;

function hasUsablePhone(phone?: string | null) {
  if (!phone) return false;
  return phone.replace(/\D/g, "").length >= 10;
}

function isBookable(lead: {
  phone?: string | null;
  serviceType?: string | null;
  address?: string | null;
  categoryCode?: string | null;
}) {
  if (lead.categoryCode === "other.non_service") return false;
  if (!hasUsablePhone(lead.phone)) return false;
  const service = lead.serviceType?.trim() ?? "";
  const address = lead.address?.trim() ?? "";
  if (lead.categoryCode && lead.categoryCode !== "other.non_service") {
    return true;
  }
  if (!address) return false;
  if (service.length < 2 && address.length < 4) return false;
  return true;
}

export function leadIsPartialCapture(lead: {
  phone?: string | null;
  name?: string | null;
  serviceType?: string | null;
  address?: string | null;
  notes?: string | null;
  categoryCode?: string | null;
}): boolean {
  if (leadIsNotAJob(lead) || leadWantsHuman(lead)) return false;
  if (isBookable(lead)) return false;
  if (!hasUsablePhone(lead.phone)) return false;

  const blob = `${lead.notes ?? ""} ${lead.serviceType ?? ""}`.trim();
  if (PARTIAL_STAMP.test(blob)) return true;

  const hasService = (lead.serviceType?.trim().length ?? 0) >= 2;
  const hasAddress = (lead.address?.trim().length ?? 0) >= 4;
  const hasName = Boolean(lead.name?.trim());

  // Something was captured, but not enough to book — classic hang-up stub.
  if ((hasName || hasService || hasAddress) && !(hasService && hasAddress)) {
    return true;
  }

  // Phone-only stub after a drop — still needs a callback.
  if (!hasName && !hasService && !hasAddress) {
    return true;
  }

  return false;
}
