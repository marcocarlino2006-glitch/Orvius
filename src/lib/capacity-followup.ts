/**
 * When auto-book finds no open window, tell the customer honestly and
 * surface capacity on the owner alert — no fake confirm link.
 */

import type { AutoBookSkipReason } from "@/lib/auto-job";
import { sendCustomerSms } from "@/lib/customer-sms";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

export const CAPACITY_FOLLOWUP_STAMP = "[capacity-followup-sms]";

export async function notifyCapacityUnavailable(params: {
  leadId: string;
  skipReason?: AutoBookSkipReason;
}): Promise<{ sent: boolean; reason?: string }> {
  if (params.skipReason !== "capacity_unavailable") {
    return { sent: false, reason: "not_capacity" };
  }

  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    include: {
      business: { select: { id: true, name: true } },
    },
  });
  if (!lead?.businessId || !lead.business) {
    return { sent: false, reason: "not_found" };
  }
  if ((lead.notes ?? "").includes(CAPACITY_FOLLOWUP_STAMP)) {
    return { sent: false, reason: "already_sent" };
  }
  const to = lead.phone?.trim();
  if (!to) return { sent: false, reason: "no_phone" };

  const shop = lead.business.name;
  const body = withSmsOptOutFooter(
    `${shop}: we have your request. No open service window right now — the shop will call to schedule. Nothing is locked yet.`,
  );

  try {
    const result = await sendCustomerSms({
      businessId: lead.businessId,
      to,
      body,
    });
    if (!result.sent) return result;

    const notes = [lead.notes?.trim(), CAPACITY_FOLLOWUP_STAMP]
      .filter(Boolean)
      .join("\n");
    await prisma.lead.update({
      where: { id: params.leadId },
      data: { notes },
    });
    logInfo("lead.capacity_followup_sms_sent", {
      leadId: params.leadId,
      businessId: lead.businessId,
      sid: result.sid,
    });
    return { sent: true };
  } catch (error) {
    logWarn("lead.capacity_followup_sms_failed", {
      leadId: params.leadId,
      error: error instanceof Error ? error.message : "send failed",
    });
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
    };
  }
}
