import twilio from "twilio";

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
}) {
  const { ownerPhone, ownerEmail, businessName, message } = params;
  const results: { sms?: string; email?: string } = {};

  if (
    process.env.ENABLE_OWNER_SMS === "true" &&
    ownerPhone &&
    process.env.TWILIO_PHONE_NUMBER
  ) {
    try {
      const client = getTwilioClient();
      const sms = await client.messages.create({
        body: `[Orvius] ${businessName}\n\n${message}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: ownerPhone,
      });
      results.sms = sms.sid;
    } catch (error) {
      console.error("Failed to send owner SMS:", error);
    }
  }

  if (ownerEmail) {
    // Email can be wired to Resend/SendGrid later; log for MVP visibility.
    console.info(`Owner email notification for ${ownerEmail}: ${message}`);
    results.email = "logged";
  }

  return results;
}
