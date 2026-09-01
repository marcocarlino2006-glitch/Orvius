import twilio from "twilio";
import { getLeadInboxUrl } from "@/lib/domains";
import { sendOwnerEmail, isEmailConfigured } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured");
  }

  return twilio(accountSid, authToken);
}

export type NotifyOwnerResult = {
  sms?: string;
  email?: string;
  smsFailed?: boolean;
  emailFailed?: boolean;
  delivered: boolean;
};

async function logNotification(params: {
  businessId: string;
  leadId?: string;
  channel: "sms" | "email";
  status: "sent" | "failed" | "skipped";
  error?: string;
}) {
  try {
    await prisma.ownerNotification.create({
      data: {
        businessId: params.businessId,
        leadId: params.leadId ?? null,
        channel: params.channel,
        status: params.status,
        error: params.error ?? null,
      },
    });
  } catch (error) {
    console.error("Failed to log owner notification:", error);
  }
}

export async function notifyOwner(params: {
  businessId?: string;
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  businessName: string;
  message: string;
  leadId?: string;
}): Promise<NotifyOwnerResult> {
  const { businessId, ownerPhone, ownerEmail, businessName, message, leadId } = params;
  const results: NotifyOwnerResult = { delivered: false };

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
    try {
      const client = getTwilioClient();
      const sms = await client.messages.create({
        body: smsBody,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: ownerPhone,
      });
      results.sms = sms.sid;
      results.delivered = true;
      if (businessId) {
        await logNotification({
          businessId,
          leadId,
          channel: "sms",
          status: "sent",
        });
      }
    } catch (error) {
      results.smsFailed = true;
      const errMsg = error instanceof Error ? error.message : "SMS failed";
      console.error("Failed to send owner SMS:", error);
      if (businessId) {
        await logNotification({
          businessId,
          leadId,
          channel: "sms",
          status: "failed",
          error: errMsg,
        });
      }
    }
  } else if (ownerPhone && businessId) {
    await logNotification({
      businessId,
      leadId,
      channel: "sms",
      status: "skipped",
      error: "SMS not enabled or platform line missing",
    });
  }

  if (ownerEmail && isEmailConfigured()) {
    try {
      const id = await sendOwnerEmail({
        to: ownerEmail,
        subject: `[Orvius] New lead — ${businessName}`,
        text: emailBody,
      });
      results.email = id;
      results.delivered = true;
      if (businessId) {
        await logNotification({
          businessId,
          leadId,
          channel: "email",
          status: "sent",
        });
      }
    } catch (error) {
      results.emailFailed = true;
      const errMsg = error instanceof Error ? error.message : "Email failed";
      console.error("Failed to send owner email:", error);
      if (businessId) {
        await logNotification({
          businessId,
          leadId,
          channel: "email",
          status: "failed",
          error: errMsg,
        });
      }
    }
  } else if (ownerEmail && businessId) {
    await logNotification({
      businessId,
      leadId,
      channel: "email",
      status: "skipped",
      error: "RESEND_API_KEY not configured",
    });
  }

  return results;
}
