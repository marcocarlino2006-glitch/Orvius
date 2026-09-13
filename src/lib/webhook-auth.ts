import twilio from "twilio";
import { getWebhookUrl, secretsMatch } from "@/lib/env";
import { logWarn } from "@/lib/logger";
import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";

/*
  Each of these routes will serve an unsigned request so the dogfooding scripts
  can drive them. The affordance used to be keyed to NODE_ENV alone, which says
  how the code was built rather than what it is about to write to: a dev server
  pointed at the Turso URL took unsigned Twilio posts against live shops. It is
  now keyed to the database as well, and it says so out loud the first time it
  is used, because an affordance nobody can see is indistinguishable from a
  hole nobody remembers.
*/
const announced = new Set<string>();

function announceOnce(event: string, check: string, detail: string) {
  const key = `${event}:${check}`;
  if (announced.has(key)) return;
  announced.add(key);
  logWarn(event, { check, detail });
}

function allowUnsigned(check: string): boolean {
  if (isUnauthenticatedAccessAllowed()) {
    announceOnce(
      "webhook.auth_bypassed",
      check,
      "unsigned request accepted: local build, local database",
    );
    return true;
  }
  announceOnce(
    "webhook.auth_unconfigured",
    check,
    "no credential configured and this is not a local database — refusing",
  );
  return false;
}

export function verifyVapiWebhookSecret(incoming: string | null): boolean {
  const secret = process.env.VAPI_WEBHOOK_SECRET?.trim();
  if (!secret) return allowUnsigned("vapi.secret");
  return secretsMatch(incoming, secret);
}

export function validateTwilioRequest(params: {
  signature: string | null;
  url: string;
  formEntries: Record<string, string>;
}): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!authToken) return allowUnsigned("twilio.auth_token");

  if (!params.signature) return allowUnsigned("twilio.signature");

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
