/**
 * Who the founder-only instruments are for.
 *
 * Several things on the board are runbooks rather than product. The post-lock
 * banner names STRIPE_SECRET_KEY and says "Counsel-confirm formation state —
 * never invent". The billing instrument lists the env vars still missing and
 * points at docs/BILLING-SETUP.md. Both were written for one person and both
 * rendered to every signed-in owner, which is how a plumber ends up reading
 * "Do not claim self-serve paid checkout yet" on the page where they pay us.
 *
 * Fail closed. With ORVIUS_FOUNDER_EMAILS unset nobody is the founder, so a
 * shop owner can never see them and the founder reads /admin instead — which
 * exists for exactly this and is already key-protected.
 */
export function isFounderEmail(email: string | null | undefined): boolean {
  const configured = process.env.ORVIUS_FOUNDER_EMAILS?.trim();
  if (!configured || !email) return false;
  return configured
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
