/**
 * Founder vs shop-owner gate.
 * Fail closed for UI instruments: empty allowlist ⇒ not founder.
 * Prefer ORVIUS_FOUNDER_EMAILS; fall back to ORVIUS_AUTH_ALLOWED_EMAILS.
 */
export function founderEmailSet(): Set<string> {
  const raw =
    process.env.ORVIUS_FOUNDER_EMAILS?.trim() ||
    process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.trim() ||
    "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isFounderEmail(email?: string | null): boolean {
  if (!email) return false;
  const allowed = founderEmailSet();
  if (allowed.size === 0) return false;
  return allowed.has(email.trim().toLowerCase());
}
