/**
 * Shared Sentry init tags — environment + release when Vercel provides them.
 * DSN paste stays founder; this only makes reports groupable once a DSN exists.
 */

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
  };
}
