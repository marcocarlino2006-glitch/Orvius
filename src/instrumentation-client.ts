/**
 * Next.js App Router client instrumentation — browser Sentry, when a DSN is set.
 *
 * The init lives here rather than in a `sentry.client.config.ts` because that
 * filename stops being loaded under Turbopack, and a reporting client that
 * silently stops initialising is worse than not having one: the dashboards stay
 * green because nothing is arriving.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || "";

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    enabled: true,
  });
}

/*
  Without this export the SDK instruments the first page load and nothing
  after it, which on an app router product is almost everything — an owner
  moves between Command, Inbox and Dispatch without a document request, so a
  client error on any screen but the one they landed on went unreported. The
  SDK asks for the hook by name at build time and warns when it is absent.
*/
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
