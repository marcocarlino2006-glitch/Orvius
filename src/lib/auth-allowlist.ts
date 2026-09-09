/**
 * The owner allowlist, kept in its own module with no runtime dependencies.
 *
 * Both the NextAuth callbacks and the magic-link issuer need it, and neither
 * can afford to drag the other's imports along: auth.ts is reachable from the
 * edge middleware, so anything it touches transitively has to stay free of
 * node:crypto and Prisma.
 */
export function getAllowedEmails() {
  return (
    process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

export function isEmailAllowed(email: string) {
  const allowed = getAllowedEmails();
  return allowed.length === 0 || allowed.includes(email.trim().toLowerCase());
}
