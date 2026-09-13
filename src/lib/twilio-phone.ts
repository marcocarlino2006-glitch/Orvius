import { getTwilioClient } from "@/lib/twilio-client";
import { getWebhookUrl, isConfigured } from "@/lib/env";

function areaCodeFromPhone(phone: string): number | undefined {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return Number(digits.slice(1, 4));
  }
  if (digits.length >= 10) {
    return Number(digits.slice(0, 3));
  }
  return undefined;
}

export async function purchaseLocalNumber(ownerPhone?: string | null) {
  const client = getTwilioClient();
  const areaCode = ownerPhone ? areaCodeFromPhone(ownerPhone) : undefined;

  const available = await client.availablePhoneNumbers("US").local.list({
    ...(areaCode ? { areaCode } : {}),
    limit: 5,
    smsEnabled: true,
    voiceEnabled: true,
  });

  if (!available.length) {
    throw new Error("No local phone numbers available in Twilio");
  }

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    smsUrl: getWebhookUrl("/api/webhooks/twilio/sms"),
    smsMethod: "POST",
    friendlyName: "Orvius shop line",
    ...voiceFallback(),
  });

  return purchased.phoneNumber;
}

/*
  The net under the AI line.

  `voiceUrl` is not ours to set — the number gets imported into Vapi and Vapi
  owns it. `voiceFallbackUrl` is the hook Twilio reserves for the case where
  that primary URL errors or times out, which is exactly the Vapi outage this
  covers, and it is a separate field so setting it cannot disturb the import.

  Left unset, Twilio's documented behaviour on a failing voice URL is to play
  its own error announcement and hang up. That is what a homeowner with a burst
  pipe was getting at 3am, and the shop was never told the call happened.
*/
function voiceFallback() {
  return {
    voiceFallbackUrl: getWebhookUrl("/api/webhooks/twilio/voice-fallback"),
    voiceFallbackMethod: "POST" as const,
  };
}

export async function releasePhoneNumber(phoneNumber: string) {
  const client = getTwilioClient();
  const numbers = await client.incomingPhoneNumbers.list({
    phoneNumber,
    limit: 1,
  });
  const entry = numbers[0];
  if (entry) {
    await client.incomingPhoneNumbers(entry.sid).remove();
  }
}

export async function configureSmsWebhook(phoneNumber: string) {
  const client = getTwilioClient();
  const numbers = await client.incomingPhoneNumbers.list({ phoneNumber, limit: 1 });
  const entry = numbers[0];
  if (!entry) return;

  /*
    Also repoints the voice fallback, because every line provisioned before it
    existed still has an empty field there. This runs on the repair path, so
    those numbers pick it up without anyone reprovisioning a shop.
  */
  await client.incomingPhoneNumbers(entry.sid).update({
    smsUrl: getWebhookUrl("/api/webhooks/twilio/sms"),
    smsMethod: "POST",
    ...voiceFallback(),
  });
}

export function canProvisionDedicatedLine() {
  return (
    isConfigured("TWILIO_ACCOUNT_SID") &&
    isConfigured("TWILIO_AUTH_TOKEN") &&
    isConfigured("VAPI_API_KEY")
  );
}
