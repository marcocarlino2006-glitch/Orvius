import { randomBytes } from "crypto";

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
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM",
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

import { isProduction } from "@/lib/runtime";

export function verifyAdminRequest(request: Request) {
  const configured = getAdminKey();
  if (!configured) {
    return !isProduction();
  }

  const header = request.headers.get("authorization");
  const bearer = header?.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : null;
  const apiKey = request.headers.get("x-orvius-admin-key");

  return bearer === configured || apiKey === configured;
}
