const ENABLED_VALUES = new Set(["1", "true", "yes"]);

/** Public signup is an explicit production switch, never an empty-env default. */
export function isSelfServeSignupEnabled() {
  return ENABLED_VALUES.has(
    process.env.ORVIUS_SELF_SERVE_SIGNUP?.trim().toLowerCase() ?? "",
  );
}

/**
 * Existing invite-led onboarding remains available while public signup is
 * closed. An empty allowlist is not an invitation.
 */
export function canCreateShopForEmail(
  email: string | null | undefined,
  isExplicitlyInvited: (normalizedEmail: string) => boolean,
  publicSignupReady: boolean,
) {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return false;
  return publicSignupReady || isExplicitlyInvited(normalized);
}
