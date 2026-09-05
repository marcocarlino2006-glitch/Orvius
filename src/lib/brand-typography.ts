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
 * 1) Solid O mark
 * 2) Integrated wordmark — mark as O → [O]RVIUS
 */
export const logoSizes = {
  sm: { mark: 18, wordmark: "1.05rem", tracking: "0.14em" },
  md: { mark: 22, wordmark: "1.2rem", tracking: "0.15em" },
  lg: { mark: 26, wordmark: "1.4rem", tracking: "0.16em" },
  xl: { mark: 48, wordmark: "2.85rem", tracking: "0.12em" },
} as const;
