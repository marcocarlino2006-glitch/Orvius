import twilio from "twilio";
import { getWebhookUrl } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { isProduction } from "@/lib/runtime";

export function verifyVapiWebhookSecret(incoming: string | null): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    if (isProduction()) {
      logWarn("vapi.webhook.secret_missing");
      return false;
    }
    return true;
  }
  return incoming === secret;
}

export function validateTwilioRequest(params: {
  signature: string | null;
  url: string;
  formEntries: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) {
    if (isProduction()) {
      logWarn("twilio.webhook.auth_token_missing");
      return false;
    }
    return true;
  }

  if (!params.signature) {
    return false;
  }

  return twilio.validateRequest(
    authToken,
    params.signature,
    params.url,
    params.formEntries,
  );
}

export function getTwilioSmsWebhookUrl() {
  return getWebhookUrl("/api/webhooks/twilio/sms");
}

export function getTwilioStatusWebhookUrl() {
  return getWebhookUrl("/api/webhooks/twilio/status");
}
