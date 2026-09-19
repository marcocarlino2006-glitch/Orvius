/**
 * Shared Sentry init tags — environment + release when Vercel provides them.
 * DSN paste stays founder; this only makes reports groupable once a DSN exists.
 * beforeSend scrubs phones/emails so a pasted DSN does not leak shop PII.
 */

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

export function sentryBeforeSend<T extends { message?: string; extra?: unknown }>(
  event: T,
): T | null {
  const next = { ...event } as T & {
    message?: string;
    extra?: unknown;
    exception?: { values?: Array<{ value?: string }> };
    request?: { headers?: Record<string, string>; data?: unknown; query_string?: unknown };
    breadcrumbs?: { values?: Array<{ message?: string; data?: unknown }> };
  };

  if (typeof next.message === "string") {
    next.message = scrubString(next.message);
  }

  if (next.extra) next.extra = scrubUnknown(next.extra);

  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((v) =>
        v?.value
          ? { ...v, value: scrubString(v.value) }
          : v,
      ),
    };
  }

  if (next.request) {
    const headers = next.request.headers
      ? Object.fromEntries(
          Object.entries(next.request.headers).map(([k, v]) =>
            /authorization|cookie|x-api/i.test(k)
              ? [k, "[redacted]"]
              : [k, typeof v === "string" ? scrubString(v) : v],
          ),
        )
      : next.request.headers;
    next.request = {
      ...next.request,
      headers,
      data: scrubUnknown(next.request.data),
      query_string: scrubUnknown(next.request.query_string),
    };
  }

  if (next.breadcrumbs?.values) {
    next.breadcrumbs = {
      ...next.breadcrumbs,
      values: next.breadcrumbs.values.map((b) => ({
        ...b,
        message: typeof b.message === "string" ? scrubString(b.message) : b.message,
        data: scrubUnknown(b.data),
      })),
    };
  }

  return next as T;
}

export function sentryRuntimeOptions() {
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
    beforeSend(event: Parameters<typeof sentryBeforeSend>[0]) {
      return sentryBeforeSend(event);
    },
  };
}
