export function isProduction() {
  return (
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production"
  );
}

/**
 * True when this process writes to a throwaway local database.
 *
 * Several routes accept unauthenticated requests outside production so the
 * dogfooding scripts can post to them without a Twilio signature or a Vapi
 * secret. That affordance is keyed to NODE_ENV, which describes how the code
 * was built and not what it is about to write to — a dev server pointed at the
 * Turso URL is a development process making production changes, and every one
 * of those routes would have taken it. src/lib/prisma.ts picks its adapter off
 * DATABASE_URL alone, so this is the same question the client itself asks.
 */
export function isLocalDatabase() {
  const url = process.env.DATABASE_URL?.trim() ?? "";
  if (!url) return false;
  if (url.startsWith("file:")) return true;
  return /(^|@|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);
}

/** Whether an unauthenticated request may be served: local build, local data. */
export function isUnauthenticatedAccessAllowed() {
  return !isProduction() && isLocalDatabase();
}
