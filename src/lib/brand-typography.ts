/** Brand typography — north-star company lockup. */

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
 * 1) Signal-ring mark alone
 * 2) Integrated — ring as O → [◎]RVIUS
 *
 * Tracking tuned for Tesla/Oracle clarity (wide, not sliced).
 */
export const logoSizes = {
  sm: { mark: 20, wordmark: "1.08rem", tracking: "0.15em" },
  md: { mark: 24, wordmark: "1.25rem", tracking: "0.16em" },
  lg: { mark: 28, wordmark: "1.45rem", tracking: "0.17em" },
  xl: { mark: 54, wordmark: "3.05rem", tracking: "0.125em" },
} as const;
