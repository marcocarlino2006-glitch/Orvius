import twilio from "twilio";
import { getLeadInboxUrl } from "@/lib/domains";
import { sendOwnerEmail, isEmailConfigured } from "@/lib/email";
import { logError, logInfo } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured");
  }

  return twilio(accountSid, authToken);
}

export type ChannelDeliveryStatus = "sent" | "failed" | "skipped" | "duplicate";

export type ChannelResult = {
  status: ChannelDeliveryStatus;
  id?: string;
  error?: string;
};

export type NotifyOwnerResult = {
  sms?: ChannelResult;
  email?: ChannelResult;
  duplicate?: boolean;
};

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

async function acquireDeliverySlot(params: {
  businessId: string;
  leadId?: string;
  channel: "sms" | "email";
  dedupeKey: string;
}): Promise<{ acquired: true; id: string } | { acquired: false }> {
  try {
    const row = await prisma.ownerNotification.create({
      data: {
        businessId: params.businessId,
        leadId: params.leadId ?? null,
        channel: params.channel,
        dedupeKey: params.dedupeKey,
        status: "pending",
      },
      select: { id: true },
    });
    return { acquired: true, id: row.id };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { acquired: false };
    }
    throw error;
  }
}

async function finalizeDelivery(
  id: string,
  status: Exclude<ChannelDeliveryStatus, "duplicate">,
  error?: string,
) {
  try {
    await prisma.ownerNotification.update({
      where: { id },
      data: { status, error: error ?? null },
    });
  } catch (finalizeError) {
    logError("notification.finalize_failed", {
      notificationId: id,
      status,
      error: finalizeError instanceof Error ? finalizeError.message : "unknown",
    });
  }
}

export async function notifyOwner(params: {
  businessId?: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  businessName: string;
  message: string;
  leadId?: string;
  dedupeKey: string;
}): Promise<NotifyOwnerResult> {
  const {
    businessId,
    ownerPhone,
    ownerEmail,
    businessName,
    message,
    leadId,
    dedupeKey,
  } = params;

  const results: NotifyOwnerResult = {};
  let duplicate = false;

  const smsBody = [
    `[Orvius] ${businessName}`,
    "",
    message,
    leadId ? `\nOpen: ${getLeadInboxUrl(leadId)}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const emailBody = [
    `${businessName} — new activity`,
    "",
    message,
    leadId ? `\nOpen in Orvius: ${getLeadInboxUrl(leadId)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (
    process.env.ENABLE_OWNER_SMS === "true" &&
    ownerPhone &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    if (businessId) {
      const slot = await acquireDeliverySlot({
        businessId,
        leadId,
        channel: "sms",
        dedupeKey,
      });

      if (!slot.acquired) {
        results.sms = { status: "duplicate" };
        duplicate = true;
      } else {
        try {
          const client = getTwilioClient();
          const sms = await client.messages.create({
            body: smsBody,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: ownerPhone,
          });
          await finalizeDelivery(slot.id, "sent");
          results.sms = { status: "sent", id: sms.sid };
          logInfo("notification.sms_sent", {
            businessId,
            leadId,
            dedupeKey,
            sid: sms.sid,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "SMS failed";
          await finalizeDelivery(slot.id, "failed", errMsg);
          results.sms = { status: "failed", error: errMsg };
          logError("notification.sms_failed", {
            businessId,
            leadId,
            dedupeKey,
            error: errMsg,
          });
        }
      }
    } else {
      try {
        const client = getTwilioClient();
        const sms = await client.messages.create({
          body: smsBody,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: ownerPhone,
        });
        results.sms = { status: "sent", id: sms.sid };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "SMS failed";
        results.sms = { status: "failed", error: errMsg };
      }
    }
  } else if (ownerPhone && businessId) {
    const slot = await acquireDeliverySlot({
      businessId,
      leadId,
      channel: "sms",
      dedupeKey,
    });
    if (!slot.acquired) {
      results.sms = { status: "duplicate" };
      duplicate = true;
    } else {
      await finalizeDelivery(
        slot.id,
        "skipped",
        "SMS not enabled or platform line missing",
      );
      results.sms = {
        status: "skipped",
        error: "SMS not enabled or platform line missing",
      };
    }
  }

  if (ownerEmail && isEmailConfigured()) {
    if (businessId) {
      const slot = await acquireDeliverySlot({
        businessId,
        leadId,
        channel: "email",
        dedupeKey,
      });

      if (!slot.acquired) {
        results.email = { status: "duplicate" };
        duplicate = true;
      } else {
        try {
          const id = await sendOwnerEmail({
            to: ownerEmail,
            subject: `[Orvius] New lead — ${businessName}`,
            text: emailBody,
          });
          await finalizeDelivery(slot.id, "sent");
          results.email = { status: "sent", id };
          logInfo("notification.email_sent", {
            businessId,
            leadId,
            dedupeKey,
            id,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Email failed";
          await finalizeDelivery(slot.id, "failed", errMsg);
          results.email = { status: "failed", error: errMsg };
          logError("notification.email_failed", {
            businessId,
            leadId,
            dedupeKey,
            error: errMsg,
          });
        }
      }
    } else {
      try {
        const id = await sendOwnerEmail({
          to: ownerEmail,
          subject: `[Orvius] New lead — ${businessName}`,
          text: emailBody,
        });
        results.email = { status: "sent", id };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Email failed";
        results.email = { status: "failed", error: errMsg };
      }
    }
  } else if (ownerEmail && businessId) {
    const slot = await acquireDeliverySlot({
      businessId,
      leadId,
      channel: "email",
      dedupeKey,
    });
    if (!slot.acquired) {
      results.email = { status: "duplicate" };
      duplicate = true;
    } else {
      await finalizeDelivery(slot.id, "skipped", "RESEND_API_KEY not configured");
      results.email = {
        status: "skipped",
        error: "RESEND_API_KEY not configured",
      };
    }
  }

  if (duplicate) {
    results.duplicate = true;
  }

  return results;
}

export function buildLeadAlertDedupeKey(source: {
  vapiCallId?: string | null;
  messageSid?: string | null;
  leadId?: string;
}) {
  if (source.vapiCallId) {
    return `call:${source.vapiCallId}`;
  }
  if (source.messageSid) {
    return `sms:${source.messageSid}`;
  }
  if (source.leadId) {
    return `lead:${source.leadId}`;
  }
  return `alert:${Date.now()}`;
}
