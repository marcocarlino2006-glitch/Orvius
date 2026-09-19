/**
 * Shared Sentry init tags — environment + release when Vercel provides them.
 * DSN paste stays founder; this only makes reports groupable once a DSN exists.
 * beforeSend scrubs phones/emails so a pasted DSN does not leak shop PII.
 */

import type { ErrorEvent } from "@sentry/core";

const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function scrubString(value: string): string {
  return value
    .replace(EMAIL_RE, "[email]")
    .replace(PHONE_RE, "[phone]");
}

function scrubUnknown(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((v) => scrubUnknown(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (
        key.includes("phone") ||
        key.includes("email") ||
        key.includes("transcript") ||
        key.includes("authorization") ||
        key.includes("cookie")
      ) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = scrubUnknown(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function sentryBeforeSend(event: ErrorEvent): ErrorEvent | null {
  if (typeof event.message === "string") {
    event.message = scrubString(event.message);
  }

  if (event.extra) {
    event.extra = scrubUnknown(event.extra) as typeof event.extra;
  }

  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (value && typeof value.value === "string") {
        value.value = scrubString(value.value);
      }
    }
  }

  if (event.request) {
    if (event.request.headers) {
      const headers = { ...event.request.headers };
      for (const [k, v] of Object.entries(headers)) {
        if (/authorization|cookie|x-api/i.test(k)) {
          headers[k] = "[redacted]";
        } else if (typeof v === "string") {
          headers[k] = scrubString(v);
        }
      }
      event.request.headers = headers;
    }
    if (event.request.data !== undefined) {
      event.request.data = scrubUnknown(event.request.data);
    }
    if (event.request.query_string !== undefined) {
      event.request.query_string = scrubUnknown(
        event.request.query_string,
      ) as typeof event.request.query_string;
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    for (const crumb of event.breadcrumbs) {
      if (typeof crumb.message === "string") {
        crumb.message = scrubString(crumb.message);
      }
      if (crumb.data) {
        crumb.data = scrubUnknown(crumb.data) as typeof crumb.data;
      }
    }
  }

  return event;
}

export function sentryRuntimeOptions(): {
  environment: string;
  release?: string;
  beforeSend: (event: ErrorEvent) => ErrorEvent | null;
} {
  const environment =
    process.env.SENTRY_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV ||
    "development";
  const release =
    process.env.SENTRY_RELEASE?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    undefined;

  return {
    environment,
    ...(release ? { release } : {}),
    beforeSend(event: ErrorEvent) {
      return sentryBeforeSend(event);
    },
  };
}
