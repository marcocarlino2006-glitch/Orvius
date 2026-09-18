/**
 * Shared Sentry reporting — one DSN gate + consistent tags.
 * Local/preview without DSN stays silent.
 */

import * as Sentry from "@sentry/nextjs";

function clientDsnConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());
}

function serverDsnConfigured() {
  return Boolean(
    process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
  );
}

export function captureClientException(
  error: unknown,
  tags: { surface: string; route?: string },
  extra?: Record<string, unknown>,
) {
  if (!clientDsnConfigured()) return;
  Sentry.captureException(error, { tags, extra });
}

export function captureServerMessage(
  message: string,
  tags: { surface: string; route?: string; reason?: string },
  opts?: { level?: "warning" | "error" | "info"; extra?: Record<string, unknown> },
) {
  if (!serverDsnConfigured()) return;
  Sentry.captureMessage(message, {
    level: opts?.level ?? "warning",
    tags,
    extra: opts?.extra,
  });
}
