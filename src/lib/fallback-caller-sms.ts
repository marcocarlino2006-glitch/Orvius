/**
 * When the primary AI line fails, SMS the caller if we have their From.
 * Complements owner alert — they were never spoken to by the receptionist.
 */

import { sendCustomerSms } from "@/lib/customer-sms";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

export const FALLBACK_CALLER_SMS_STAMP = "[fallback-caller-sms]";

export async function notifyFallbackCaller(params: {
  businessId: string;
  businessName: string;
  leadId: string;
  from: string | null | undefined;
}): Promise<{ sent: boolean; reason?: string }> {
  const to = params.from?.trim();
  if (!to) return { sent: false, reason: "no_from" };

  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    select: { notes: true },
  });
  if (!lead) return { sent: false, reason: "not_found" };
  if ((lead.notes ?? "").includes(FALLBACK_CALLER_SMS_STAMP)) {
    return { sent: false, reason: "already_sent" };
  }

  const body = withSmsOptOutFooter(
    `${params.businessName}: we couldn't take your call live just now. The owner is being notified and will call you back. Reply here if you need to leave more detail.`,
  );

  try {
    const result = await sendCustomerSms({
      businessId: params.businessId,
      to,
      body,
    });
    if (!result.sent) return result;

    const notes = [lead.notes?.trim(), FALLBACK_CALLER_SMS_STAMP]
      .filter(Boolean)
      .join("\n");
    await prisma.lead.update({
      where: { id: params.leadId },
      data: { notes },
    });
    logInfo("voice_fallback.caller_sms_sent", {
      leadId: params.leadId,
      businessId: params.businessId,
      sid: result.sid,
    });
    return { sent: true };
  } catch (error) {
    logWarn("voice_fallback.caller_sms_failed", {
      leadId: params.leadId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}
