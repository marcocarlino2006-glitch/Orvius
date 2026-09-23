/**
 * P4 — hang-up mid-capture.
 * Partial leads need a callback to finish intake, not a booking qualify CTA.
 * Optionally SMS the caller once so they can finish by reply.
 */

import { sendCustomerSms } from "@/lib/customer-sms";
import { leadIsNotAJob } from "@/lib/lead-not-a-job";
import { leadWantsHuman } from "@/lib/lead-wants-human";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

const PARTIAL_STAMP =
  /hung up mid-call|hang[ -]?up mid|partial capture|incomplete capture|caller hung up/i;

export const PARTIAL_FOLLOWUP_STAMP = "[partial-followup-sms]";

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

/**
 * One SMS after a mid-call hang-up — asks the caller to finish intake by reply.
 * Idempotent via notes stamp. Does not invent a booking link.
 */
export async function sendPartialCaptureFollowUpSms(leadId: string): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      business: { select: { id: true, name: true } },
    },
  });
  if (!lead?.businessId || !lead.business) {
    return { sent: false, reason: "not_found" };
  }
  if (!leadIsPartialCapture(lead)) {
    return { sent: false, reason: "not_partial" };
  }
  // SMS threads are ongoing chat — "we got cut off" is call hang-up language only.
  if (lead.source === "sms") {
    return { sent: false, reason: "sms_channel" };
  }
  if ((lead.notes ?? "").includes(PARTIAL_FOLLOWUP_STAMP)) {
    return { sent: false, reason: "already_sent" };
  }
  const to = lead.phone?.trim();
  if (!to) return { sent: false, reason: "no_phone" };

  const shop = lead.business.name;
  const body = withSmsOptOutFooter(
    `${shop}: we got cut off. Reply with the address and what you need, or call us back — we'll finish the request.`,
  );

  try {
    const result = await sendCustomerSms({
      businessId: lead.businessId,
      to,
      body,
    });
    if (!result.sent) return result;

    const notes = [lead.notes?.trim(), PARTIAL_FOLLOWUP_STAMP]
      .filter(Boolean)
      .join("\n");
    await prisma.lead.update({
      where: { id: leadId },
      data: { notes },
    });
    logInfo("lead.partial_followup_sms_sent", {
      leadId,
      businessId: lead.businessId,
      sid: result.sid,
    });
    return { sent: true };
  } catch (error) {
    logWarn("lead.partial_followup_sms_failed", {
      leadId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}
