import twilio from "twilio";
import { getLeadInboxUrl } from "@/lib/domains";

export function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials are not configured");
  }

  return twilio(accountSid, authToken);
}

export async function notifyOwner(params: {
  ownerPhone?: string | null;
  ownerEmail?: string | null;
  businessName: string;
  message: string;
  leadId?: string;
}) {
  const { ownerPhone, ownerEmail, businessName, message, leadId } = params;
  const results: { sms?: string; email?: string } = {};

  const smsBody = [
    `[Orvius] ${businessName}`,
    "",
    message,
    leadId ? `\nOpen lead: ${getLeadInboxUrl(leadId)}` : null,
  ]
    .filter((line) => line !== null)
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
    } catch (error) {
      console.error("Failed to send owner SMS:", error);
    }
  }

  if (ownerEmail) {
    console.info(`Owner email notification for ${ownerEmail}: ${message}`);
    results.email = "logged";
  }

  return results;
}
