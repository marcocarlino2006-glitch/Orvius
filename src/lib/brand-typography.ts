/** Brand typography — condensed industrial wordmark + twin-orbit O. */

export const brandWordmark = "Orvius";

/**
 * Craft scale — Cursor/Linear discipline:
 * brand face = lockups only; UI sans does headlines and body.
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
 * 1) Mark alone — dual-rail O
 * 2) Integrated — mark replaces O → [O]RVIUS
 */
export const logoSizes = {
  sm: { mark: 20, wordmark: "0.95rem", tracking: "0.12em" },
  md: { mark: 26, wordmark: "1.2rem", tracking: "0.13em" },
  lg: { mark: 32, wordmark: "1.45rem", tracking: "0.14em" },
  xl: { mark: 56, wordmark: "2.75rem", tracking: "0.12em" },
} as const;
