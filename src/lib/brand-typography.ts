/** Brand typography — clean company wordmark. */

export const brandWordmark = "Orvius";

/**
 * Craft scale — brand face = lockups only; UI sans does headlines/body.
 */
export const typeScale = {
  caption: "0.75rem",
  small: "0.875rem",
  body: "1rem",
  lead: "1.125rem",
  title: "1.25rem",
  headline: "clamp(1.875rem, 3.4vw, 2.75rem)",
  display: "clamp(2.75rem, 5.2vw, 4rem)",
} as const;

/**
 * Two logo lines:
 * 1) Signal-ring O — nested orbitals + aperture node
 * 2) Integrated wordmark — ring as O → [O]RVIUS
 */
export const logoSizes = {
  sm: { mark: 20, wordmark: "1.05rem", tracking: "0.16em" },
  md: { mark: 24, wordmark: "1.22rem", tracking: "0.17em" },
  lg: { mark: 28, wordmark: "1.42rem", tracking: "0.18em" },
  xl: { mark: 52, wordmark: "2.9rem", tracking: "0.13em" },
} as const;
