import { createHash, randomBytes, timingSafeEqual } from "crypto";

const REQUIRED = [
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "VAPI_API_KEY",
] as const;

import { getAppBaseUrl, getApiBaseUrl } from "@/lib/domains";

export function getAppUrl() {
  return getAppBaseUrl();
}

export function getWebhookUrl(path: string) {
  return `${getApiBaseUrl().replace(/\/$/, "")}${path}`;
}

export function isConfigured(key: string) {
  return Boolean(process.env[key]?.trim());
}

export function getConfigStatus() {
  const optional = [
    "VAPI_WEBHOOK_SECRET",
    "ORVIUS_ADMIN_KEY",
    "ORVIUS_FOUNDER_EMAILS",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM",
    "CRON_SECRET",
    "TWILIO_STATUS_CALLBACK_URL",
  ];
  const required = REQUIRED.map((name) => ({
    name,
    configured: isConfigured(name),
    optional: false,
  }));
  const optionalStatus = optional.map((name) => ({
    name,
    configured: isConfigured(name),
    optional: true,
  }));

  return {
    ready: required.every((item) => item.configured),
    appUrl: getAppUrl(),
    webhookUrl: getWebhookUrl("/api/webhooks/vapi"),
    smsWebhookUrl: getWebhookUrl("/api/webhooks/twilio/sms"),
    twilioStatusWebhookUrl: getWebhookUrl("/api/webhooks/twilio/status"),
    twilioPhone: process.env.TWILIO_PHONE_NUMBER?.trim() || null,
    ownerSmsEnabled: process.env.ENABLE_OWNER_SMS === "true",
    items: [...required, ...optionalStatus],
  };
}

export function assertReady() {
  const missing = REQUIRED.filter((key) => !isConfigured(key));
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(", ")}`);
  }
}

export function getAdminKey() {
  return process.env.ORVIUS_ADMIN_KEY?.trim() || null;
}

export function generateAdminKey() {
  return randomBytes(24).toString("hex");
}

import { isUnauthenticatedAccessAllowed } from "@/lib/runtime";

/**
 * Compare a presented secret against the configured one in constant time.
 *
 * Hashed first because timingSafeEqual needs equal lengths, and comparing raw
 * buffers would otherwise give away the length of the key before anything else.
 */
export function secretsMatch(
  presented: string | null | undefined,
  configured: string | null | undefined,
) {
  if (!presented || !configured) return false;
  return timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(configured).digest(),
  );
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  return header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length).trim()
    : null;
}

export function verifyAdminRequest(request: Request) {
  const configured = getAdminKey();
  if (!configured) {
    /* No key set is a local convenience, not a production posture — and a dev
       build pointed at the live database is not local. */
    return isUnauthenticatedAccessAllowed();
  }

  return (
    secretsMatch(getBearerToken(request), configured) ||
    secretsMatch(request.headers.get("x-orvius-admin-key"), configured)
  );
}
