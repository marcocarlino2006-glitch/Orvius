import { getTwilioClient } from "@/lib/twilio-client";
import { normalizePhone } from "@/lib/customer";

export function isSmsReady(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_PHONE_NUMBER?.trim(),
  );
}

/** Fire-and-forget SMS. Returns null when Twilio isn't configured or phone is bad. */
export async function sendSms(params: {
  to: string;
  body: string;
}): Promise<{ sid: string } | null> {
  if (!isSmsReady()) return null;

  const to = normalizePhone(params.to);
  const from = process.env.TWILIO_PHONE_NUMBER!.trim();
  if (!to || !params.body.trim()) return null;

  const client = getTwilioClient();
  const sms = await client.messages.create({
    body: params.body.trim(),
    from,
    to,
  });

  return { sid: sms.sid };
}
