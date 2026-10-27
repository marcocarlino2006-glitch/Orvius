/**
 * Explicit local bypass for Google OAuth while building.
 * Never active on any hosted Vercel deploy (production or preview, where real
 * credentials may be present). Self-hosted production (NODE_ENV=production
 * without VERCEL_ENV) is also blocked.
 */
export function isDevAuthBypassEnabled() {
  const flag = process.env.ORVIUS_DEV_AUTH_BYPASS?.trim().toLowerCase();
  if (flag !== "1" && flag !== "true" && flag !== "yes") return false;

  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "development") return false;

  // Self-hosted / ambiguous prod: NODE_ENV=production and not a Vercel env slot
  if (process.env.NODE_ENV === "production" && !process.env.VERCEL_ENV) {
    return false;
  }

  return true;
}

/** Prefer a real shop owner email so dashboard data loads. */
export function getDevAuthEmail() {
  const explicit = process.env.ORVIUS_DEV_AUTH_EMAIL?.trim().toLowerCase();
  if (explicit) return explicit;

  const owner = process.env.ORVIUS_OWNER_EMAIL?.trim().toLowerCase();
  if (owner) return owner;

  const allowed = process.env.ORVIUS_AUTH_ALLOWED_EMAILS?.split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  if (allowed?.[0]) return allowed[0];

  return "dev@orvius.local";
}

export function getDevAuthUser() {
  const email = getDevAuthEmail();
  const local = email.split("@")[0]?.trim();
  return {
    id: `dev:${email}`,
    email,
    // Quiet identity — never paint "Dev builder" into the finished shell
    name: local ? local.replace(/[._-]+/g, " ") : "Owner",
  };
}
