import * as Sentry from "@sentry/nextjs";

/**
 * Fail-soft observability — no-ops until SENTRY_DSN / NEXT_PUBLIC_SENTRY_DSN is set.
 * PERFECT-STANDARDS H21: code wiring is CODE_DONE; live DSN stays FOUNDER_GATE.
 */
const dsn =
  process.env.SENTRY_DSN?.trim() ||
  process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() ||
  "";

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    enabled: true,
  });
}
