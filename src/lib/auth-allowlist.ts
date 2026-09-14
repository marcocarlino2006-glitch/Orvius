import { isSelfServeSignupEnabled } from "@/lib/self-serve-signup";

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

/**
 * Dashboard sign-in has two legitimate sources of truth:
 *
 * - the deployment allowlist, for operators and support access;
 * - an active Business.ownerEmail, for the person who actually owns the shop.
 *
 * Keeping the database lookup behind a callback matters. auth.ts is imported by
 * edge middleware, where Prisma cannot be bundled, while the sign-in callback
 * itself runs on the Node auth route and can safely provide the lookup.
 */
export async function isDashboardEmailAuthorized(
  email: string | null | undefined,
  ownsActiveShop: (normalizedEmail: string) => Promise<boolean>,
) {
  const normalizedEmail = email?.trim().toLowerCase();
  if (!normalizedEmail) return false;

  if (isSelfServeSignupEnabled()) return true;
  if (getAllowedEmails().includes(normalizedEmail)) return true;

  try {
    return await ownsActiveShop(normalizedEmail);
  } catch {
    // Authentication must fail closed when the ownership store is unavailable.
    return false;
  }
}
