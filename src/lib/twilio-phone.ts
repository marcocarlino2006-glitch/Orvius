import { getTwilioClient } from "@/lib/twilio-client";
import { getWebhookUrl, isConfigured } from "@/lib/env";

type TwilioClient = ReturnType<typeof getTwilioClient>;

export function areaCodeFromPhone(phone: string | null | undefined): number | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return national.length === 10 ? parseAreaCode(national.slice(0, 3)) ?? undefined : undefined;
}

/** North American area codes: three digits, first digit 2–9. */
export function parseAreaCode(value: string | number | null | undefined): number | null {
  const text = String(value ?? "").trim();
  return /^[2-9]\d{2}$/.test(text) ? Number(text) : null;
}

export async function listAvailableNumbers(
  areaCode: number,
  limit = 5,
  client: TwilioClient = getTwilioClient(),
): Promise<string[]> {
  const available = await client.availablePhoneNumbers("US").local.list({
    areaCode,
    limit,
    smsEnabled: true,
    voiceEnabled: true,
  });
  return available.map((entry) => entry.phoneNumber);
}

export type PurchasedLine = {
  phoneNumber: string;
  /** False when the requested area code was sold out and another local number was assigned. */
  areaCodeMatched: boolean;
};

/**
 * Buy the shop's line. This runs after payment, so it must not fail just
 * because one area code is sold out: it tries the exact number the owner
 * picked, then their area code, then their mobile's, then any US local number.
 */
export async function purchaseLocalNumber(
  params: {
    ownerPhone?: string | null;
    areaCode?: number | null;
    phoneNumber?: string | null;
    friendlyName?: string;
  },
  client: TwilioClient = getTwilioClient(),
): Promise<PurchasedLine> {
  const wanted = params.areaCode ?? areaCodeFromPhone(params.ownerPhone) ?? null;
  const buy = async (phoneNumber: string) =>
    (
      await client.incomingPhoneNumbers.create({
        phoneNumber,
        smsUrl: getWebhookUrl("/api/webhooks/twilio/sms"),
        smsMethod: "POST",
        friendlyName: params.friendlyName ?? "Orvius shop line",
        ...voiceFallback(),
      })
    ).phoneNumber;

  if (params.phoneNumber?.trim()) {
    try {
      return { phoneNumber: await buy(params.phoneNumber.trim()), areaCodeMatched: true };
    } catch {
      // Taken between search and purchase; fall through to the same area code.
    }
  }

  const tried = new Set<number>();
  for (const areaCode of [params.areaCode, areaCodeFromPhone(params.ownerPhone)]) {
    if (!areaCode || tried.has(areaCode)) continue;
    tried.add(areaCode);
    for (const candidate of await listAvailableNumbers(areaCode, 3, client)) {
      try {
        return { phoneNumber: await buy(candidate), areaCodeMatched: areaCode === wanted };
      } catch {
        continue;
      }
    }
  }

  const anywhere = await client.availablePhoneNumbers("US").local.list({
    limit: 3,
    smsEnabled: true,
    voiceEnabled: true,
  });
  for (const entry of anywhere) {
    try {
      return { phoneNumber: await buy(entry.phoneNumber), areaCodeMatched: wanted === null };
    } catch {
      continue;
    }
  }

  throw new Error("No local phone numbers available in Twilio");
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

/** A number an earlier run bought under this friendly name, even if that run never heard back. */
export async function findLineByFriendlyName(
  friendlyName: string,
  client: TwilioClient = getTwilioClient(),
): Promise<string | null> {
  const [entry] = await client.incomingPhoneNumbers.list({ friendlyName, limit: 1 });
  return entry?.phoneNumber ?? null;
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
