/**
 * When a live transfer to the owner doesn't connect, tell the caller and
 * stamp the lead so the board still owns the callback.
 */

import { sendCustomerSms } from "@/lib/customer-sms";
import { logInfo, logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { withSmsOptOutFooter } from "@/lib/sms-keywords";

export const TRANSFER_MISS_STAMP = "Owner missed transfer — callback";
export const TRANSFER_MISS_SMS_STAMP = "[transfer-miss-sms]";

const TRANSFER_MISS_SIGNAL =
  /owner missed transfer|couldn't reach the owner|could not reach the owner|transfer (?:failed|unsuccessful)|no answer on transfer|transferCall.*fail/i;

export function leadLooksLikeTransferMiss(lead: {
  notes?: string | null;
  serviceType?: string | null;
}): boolean {
  const blob = `${lead.notes ?? ""} ${lead.serviceType ?? ""}`;
  return TRANSFER_MISS_SIGNAL.test(blob);
}

export function endedReasonLooksLikeTransferMiss(
  endedReason: string | null | undefined,
): boolean {
  if (!endedReason?.trim()) return false;
  const reason = endedReason.toLowerCase();
  // Successful forwards are not misses.
  if (
    reason.includes("assistant-forwarded-call") &&
    !/fail|error|no.?answer|busy|unreach/i.test(reason)
  ) {
    return false;
  }
  return /transfer.*fail|forward.*fail|destination.*(?:no.?answer|busy|fail)|transfer.*(?:no.?answer|busy|unreach)/i.test(
    reason,
  );
}

/**
 * One SMS after a transfer miss. Idempotent via notes stamp.
 */
export async function notifyTransferMiss(params: {
  leadId: string;
  endedReason?: string | null;
}): Promise<{ sent: boolean; reason?: string; stamped: boolean }> {
  const lead = await prisma.lead.findUnique({
    where: { id: params.leadId },
    include: {
      business: { select: { id: true, name: true } },
    },
  });
  if (!lead?.businessId || !lead.business) {
    return { sent: false, reason: "not_found", stamped: false };
  }

  const looksMiss =
    leadLooksLikeTransferMiss(lead) ||
    endedReasonLooksLikeTransferMiss(params.endedReason);

  if (!looksMiss) {
    return { sent: false, reason: "not_transfer_miss", stamped: false };
  }

  let stamped = false;
  let notes = lead.notes ?? "";
  if (!notes.includes(TRANSFER_MISS_STAMP)) {
    notes = [notes.trim(), TRANSFER_MISS_STAMP].filter(Boolean).join("\n");
    stamped = true;
  }

  const to = lead.phone?.trim();
  if (!to) {
    if (stamped) {
      await prisma.lead.update({
        where: { id: params.leadId },
        data: { notes },
      });
    }
    return { sent: false, reason: "no_phone", stamped };
  }

  if (notes.includes(TRANSFER_MISS_SMS_STAMP)) {
    if (stamped) {
      await prisma.lead.update({
        where: { id: params.leadId },
        data: { notes },
      });
    }
    return { sent: false, reason: "already_sent", stamped };
  }

  const body = withSmsOptOutFooter(
    `${lead.business.name}: we tried to connect you to the owner just now but they didn't pick up. They're being notified and will call you back.`,
  );

  try {
    const result = await sendCustomerSms({
      businessId: lead.businessId,
      to,
      body,
    });
    if (!result.sent) {
      if (stamped) {
        await prisma.lead.update({
          where: { id: params.leadId },
          data: { notes },
        });
      }
      return { ...result, stamped };
    }

    notes = [notes.trim(), TRANSFER_MISS_SMS_STAMP].filter(Boolean).join("\n");
    await prisma.lead.update({
      where: { id: params.leadId },
      data: { notes },
    });
    logInfo("lead.transfer_miss_sms_sent", {
      leadId: params.leadId,
      businessId: lead.businessId,
      sid: result.sid,
    });
    return { sent: true, stamped: true };
  } catch (error) {
    logWarn("lead.transfer_miss_sms_failed", {
      leadId: params.leadId,
      error: error instanceof Error ? error.message : "send failed",
    });
    if (stamped) {
      await prisma.lead.update({
        where: { id: params.leadId },
        data: { notes },
      });
    }
    return {
      sent: false,
      reason: error instanceof Error ? error.message : "send_failed",
      stamped,
    };
  }
}
